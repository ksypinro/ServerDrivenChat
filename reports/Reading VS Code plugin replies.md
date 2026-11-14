# Only the plugins themselves can surrender replies

ServerDrivenChat cannot read another plugin's chat replies through VS Code itself. Every target except GitHub Copilot draws its chat in a webview owned by its own extension, and no other extension can reach that webview. The only supported way in is an interface the plugin's vendor chooses to run inside the plugin's own process. Measured against that bar on 2026-10-15:

- **Claude Code is the strongest target.** Its documented settings hooks deliver the final reply as `Stop.last_assistant_message` and can POST it straight to a loopback server. Its Mods also run in the VS Code panel, and they expose streamed `turn.step` text, `turn.complete.answer`, turn IDs and session IDs.
- **Codex offers only end-of-turn text.** It comes through the `Stop` hook or the deprecated `notify` program. Its streaming events live on an app-server connection that the extension owns.
- **Stock Cline exports four input-only methods.** It surfaces only a final `outputText` through an opt-in TaskComplete hook. ServerDrivenChat (SDC) therefore still needs its patched native API 1.3 boundary for Cline.
- **Roo Code has a rich event API, but the project is archived.**
- **Kilo Code 7.x and Continue expose nothing usable.**
- **Copilot Chat is the one case where VS Code's own public commands can read replies:** export to a file URI, or copy plus the clipboard. Their argument and file-format contracts are undocumented.

Every route outside the plugins falls into one of three groups:

- **Debug or private interfaces:** DevTools/CDP and extension-host inspection.
- **Reads of internal storage:** on-disk history.
- **Read-only observers that cannot tie a reply to the conversation SDC targeted:** macOS Accessibility, OCR and base-URL proxies.

Finally, reading replies is not the only blocker. The project has already observed Claude `turn.complete` events, carrying an `answer` field and matching turn IDs, inside an existing IDE conversation. Claude stays blocked on **effect-time fencing**: proof that a remote prompt cannot run after SDC loses authority. Codex lacks any supported route to send input into, or attach to, the existing IDE conversation.

## VS Code walls off every webview chat panel

VS Code's extension model gives an extension no lever over a webview it did not create. The webview guide states that **"Webview panels are owned by the extension that creates them"**. Messages pass only between a webview and its owner, through `postMessage`/`onDidReceiveMessage` on a `Webview` object that no other extension can obtain ([VS Code Webview API guide](https://code.visualstudio.com/api/extension-guides/webview); [vscode.d.ts @1.140.0](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L9965-L10026)). The only cross-extension channel the platform defines is `Extension<T>.exports`, the value a plugin chooses to return from `activate()` ([vscode.d.ts L8374](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L8374-L8377)). Cline, Roo, Claude Code and Codex all render chat in webviews; Codex's installed manifest, for example, declares its sidebar views as `"type": "webview"` ([local openai.chatgpt manifest](file:///Users/samin/.vscode/extensions/openai.chatgpt-26.1007.21434-darwin-arm64/package.json)). All extensions in a window share one extension-host process, so one could in principle monkey-patch host internals to intercept other extensions' messages. That is an undocumented in-process hack, and it lands squarely in the project's "private interface" category.

The stable chat APIs cannot read other conversations. `ChatContext.history` contains **"only chat messages for the current participant"** ([vscode.d.ts L19671](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L19671-L19676)). The stable `chat` namespace offers only `createChatParticipant`. The `vscode.lm` and tool APIs run models and tools; they do not read transcripts ([vscode.d.ts L20738](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L20738-L20812)). Using `vscode.lm` to regenerate a reply would mean running a model, which is the replacement runtime that [AGENTS.md](../AGENTS.md) forbids. The command `workbench.action.chat.open` accepts an undocumented `blockOnResponse: true` option. In the 1.140.0 workbench bundle, that option waits until the native response completes or a tool confirmation, question or elicitation is pending. It then returns the `ChatResult` plus confirmation details such as `{type:"confirmation", kind:"toolInvocation", toolId}`. It **does not return the reply text** ([local VS Code 1.140.0 workbench bundle](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js)).

Proposed APIs add no transcript reader either. Stable 1.140.0 and 1.141.0 restrict proposals to a 65-entry product.json allowlist. `GitHub.copilot-chat` holds many entries. `openai.chatgpt` holds only `languageModelProxy` and `chatSessionsProvider`. **No Anthropic, Cline or Roo entry exists** ([local product.json, 1.140.0](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Resources/app/product.json)). The 1.140.0 bundle honors an explicit `--enable-proposed-api publisher.ext` launch flag in stable builds, even though the docs say proposals are Insiders-only ([Using Proposed API](https://code.visualstudio.com/api/advanced-topics/using-proposed-api)). `vsce publish` refuses to publish extensions that use proposals unless the publisher passes bypass flags ([vscode-vsce publish.ts](https://github.com/microsoft/vscode-vsce/blob/04811a94ac8d7cc4d2c2b61c568b065467d39025/src/publish.ts#L366-L375)). Even with proposals enabled, the closest they come to reading another conversation is this:

- `chatSessionsProvider` lets an extension *supply* history for its own session type ([chatSessionsProvider.d.ts](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.chatSessionsProvider.d.ts)).
- `chatParticipantPrivate` exposes the active chat session URI and lifecycle events, but no content ([chatParticipantPrivate.d.ts](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.chatParticipantPrivate.d.ts#L311-L550)).

VS Code's native chat, which now hosts Copilot, is the exception, because VS Code owns that chat model. In the 1.140.0 bundle, `workbench.action.chat.export` called with a URI argument writes the **last-focused widget's full session JSON** to that file with no dialog. `workbench.action.chat.copyAll` and `copyFinalResponse` write Markdown to the clipboard, and an extension can read it back with the stable `env.clipboard.readText()` ([local workbench bundle](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js); [VS Code chat sessions docs](https://code.visualstudio.com/docs/copilot/chat/chat-sessions); [vscode.d.ts L10672](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L10672-L10678)). These are public command IDs with internal argument and format contracts. They cannot target a session by ID, and the copy route overwrites the user's clipboard. Codex contributes an `openai-codex` session type, so its conversations might also appear in the native sessions view, where export would apply. That is untested. The docs also warn that for Codex **"only one application can write to the chat at a time"** ([chat sessions docs](https://code.visualstudio.com/docs/copilot/chat/chat-sessions)). VS Code's Agent Host, introduced in 1.129, runs Claude and Codex harnesses in a VS Code-owned process ([VS Code 1.129 release notes](https://code.visualstudio.com/updates/v1_129)). It creates new conversations rather than reading existing ones, which makes it a forbidden substitute under the 2026-10-11 scope confirmation.

The remaining platform mechanisms either fail to reach chat text or are debug-only:

- **Accessible View (⌥F2) and accessibility signals:** both are UI-only, and no extension API reads their content ([VS Code accessibility docs](https://code.visualstudio.com/docs/configure/accessibility/accessibility)).
- **Output channels:** write-only ([vscode.d.ts L7396](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L7396-L7466)).
- **Shell-integration `execution.read()`:** a stable API that streams raw output from any shell-integrated terminal. That captures tool output, never the assistant's reply ([vscode.d.ts L7983](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L7983-L7996)). The raw-stream `onDidWriteTerminalData` remains proposed, is allowlisted only for Copilot, and is "not intended" for promotion ([terminalDataWriteEvent.d.ts](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.terminalDataWriteEvent.d.ts)).
- **CDP and the Node inspector:** Electron's `--remote-debugging-port` and VS Code's `--inspect-extensions` would expose every webview's DOM and every extension's message handlers. On the installed 1.140.0, the `NodeCliInspectArguments` fuse reads as on (mapped by the documented fuse order) ([Electron command-line switches](https://www.electronjs.org/docs/latest/api/command-line-switches); [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)). Chrome's security team reports **attackers using remote debugging to extract cookies** ([Chrome for Developers](https://developer.chrome.com/blog/remote-debugging-port)). These are debug interfaces that give full control of the editor, and the project's rules exclude them.

## Plugin-owned hooks are the only supported read path

Because the platform offers no reader, every acceptable route depends on what each vendor builds. The surfaces differ sharply in richness and stability.

### Claude Code streams replies to Mods and hands final text to hooks

Claude Code's settings hooks are the simplest supported read path. The extension and the CLI share `~/.claude/settings.json`, including hooks, and the hooks reference states that **hook events fire the same way in IDE extensions** as in the terminal ([Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code); [Hooks reference](https://code.claude.com/docs/en/hooks)).

- **Final text.** `Stop` carries `last_assistant_message`, the final reply text, added in v2.1.47 ([CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)). The docs recommend it over the transcript, because "the transcript file isn't guaranteed to include the final message at Stop time".
- **Identity.** Every event carries `session_id`, `prompt_id` and `transcript_path`.
- **Delivery.** A `"type": "http"` hook POSTs the event JSON to a URL, which can be an SDC loopback endpoint ([Hooks reference](https://code.claude.com/docs/en/hooks)).
- **Gaps.** **`Stop` does not fire on user interrupts**, and API errors fire `StopFailure`, whose `last_assistant_message` holds the error string rather than a reply.

The project has already verified that a classic `UserPromptSubmit` hook runs and blocks prompts in an existing conversation in the official 2.1.296 extension ([evidence/MB05/NATIVE-CLASSIC-HOOKS.md](../evidence/MB05/NATIVE-CLASSIC-HOOKS.md)).

Two hook families matter for streaming and pending state, and both have caveats:

- **`MessageDisplay` (v2.1.152).** It streams line-batched text in the terminal but fires once per message in SDK-style hosts ([Hooks reference](https://code.claude.com/docs/en/hooks)). The same reference says VS Code hosts Claude Code through the SDK-style `canUseTool` callback. Line streaming in the panel is therefore **unverified, and likely absent**.
- **Pending permissions and questions.** These appear only indirectly, through `PermissionRequest`, `Notification` and `Elicitation`. Under VS Code, the `permission_prompt` notification fires **about six seconds after the request**, and before v2.1.233 it did not fire there at all ([Hooks reference](https://code.claude.com/docs/en/hooks); [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)).

Mods are the richest supported observer. These are JavaScript plugins whose hooks run inside the Claude Code process. The docs' "Where mods run" table lists the VS Code chat panel as **hooks run: Yes, drawing: No** ([Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)). Their main capabilities are:

- **`turn.step`** is an async generator that yields `TurnStepTextChunk {kind:'text', index, text}` as the model response streams ([claude-code.d.ts](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts)).
- **`turn.complete`** carries `answer`, `isAborted`, `reason` (`answer | aborted | refusal | error`), `turnId` and `usage`, and it fires even for interrupted turns ([Mods events](https://code.claude.com/docs/en/plugins/mods/events)).
- **Session APIs:** `$.session.id()`, `$.session.messages()` (newest 4,096 entries) and `$.prompt.submit`. Submit "waits until the session is idle and then starts a new turn".
- **Network:** `$.http.fetch`, limited to 30 seconds and 4 MiB per call ([Mods API](https://code.claude.com/docs/en/plugins/mods/api)).

Stability is the cost. The type declarations say **"EARLY ACCESS: this surface may change between releases without notice"**. The public file was generated by 2.1.277, and the reference tells readers to trust the copy their own build generates ([Mods reference](https://code.claude.com/docs/en/plugins/mods/reference)). The installed 2.1.296 build has generated no such copy ([evidence/MB05/README.md](../evidence/MB05/README.md)). Mods run unsandboxed and can approve tool calls. Organization policies such as `allowManagedModsOnly`, `allowManagedHooksOnly` and `disableAllHooks` can silently switch them off ([Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)). No source confirms that `turn.step` chunks reach hooks incrementally in the panel specifically.

Two further Claude routes are allowed but weaker, and several others are excluded:

- **OpenTelemetry.** The panel's own process can export `claude_code.assistant_response` with the text included when `OTEL_LOG_ASSISTANT_RESPONSES=1` is set, tagged `session.id`, `prompt.id` and `app.entrypoint` `claude-vscode`. Logs export in **5-second batches** to an OTLP collector ([Monitoring usage](https://code.claude.com/docs/en/monitoring-usage)). It is a supported passive export, but too batched to serve as a primary channel. Whether the panel honors `OTEL_*` variables set in settings is unverified.
- **Transcripts.** `~/.claude/projects/<project>/<session>.jsonl` has a documented location and purpose, but its line schema is undocumented. The supported readers are the Agent SDK's `listSessions()`/`getSessionMessages()` ([claude-directory](https://code.claude.com/docs/en/claude-directory); [Agent SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions)).
- **Excluded:** `claude -p --output-format stream-json`, Agent SDK `query()` and `--resume` all start or continue a session in a new process ([Headless](https://code.claude.com/docs/en/headless)). The panel itself warns that using a conversation **"in two places at once can mix up its messages"** ([Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)).

### Codex returns final text only; its live stream belongs to the extension

Codex documents a hooks system that is on by default. The CLI and the IDE extension share its configuration layers ([Codex hooks](https://learn.chatgpt.com/docs/hooks); [Codex IDE settings](https://learn.chatgpt.com/docs/developer-settings?surface=ide)).

- **What it gives SDC.** `Stop` carries `turn_id` and `last_assistant_message` (`string | null`). `UserPromptSubmit` marks turn start, and `PermissionRequest` covers approvals.
- **What it lacks.** There is **no `Notification` event, no user-question event, no partial-text hook and no documented HTTP hook type**.
- **Trust.** New or changed hooks are skipped until the user trusts them by hash.
- **Reliability.** No source states that hooks run in `openai.chatgpt` sessions. The app-server that powers the extension does emit `hook/started`/`hook/completed` notifications ([Codex app-server](https://learn.chatgpt.com/docs/app-server)). Issue #21723 reported Start/Stop hooks not running in the VS Code extension and was closed without explanation ([openai/codex#21723](https://github.com/openai/codex/issues/21723)). Open issue #47607 reports that a `Stop` hook trusted mid-task never fired ([openai/codex#47607](https://github.com/openai/codex/issues/47607)).
- **The `notify` fallback.** The legacy `notify` program receives `agent-turn-complete` with `thread-id`, `turn-id`, `client` and `last-assistant-message`. Since PR #12968, `client` comes from the app-server's `clientInfo.name`, specifically so that VS Code completions can be told apart ([openai/codex#12968](https://github.com/openai/codex/pull/12968)). The source labels it "Legacy notify" with a **TODO to remove it** ([legacy_notify.rs](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/legacy_notify.rs)).

Everything SDC would want for streaming and pending state lives on the app-server protocol:

- `item/agentMessage/delta` with `{threadId, turnId, itemId, delta}`
- `turn/completed` with `completed | interrupted | failed`
- `item/commandExecution/requestApproval` and `tool/requestUserInput`

Those events go only to the connection that started or subscribed to a thread ([Codex app-server](https://learn.chatgpt.com/docs/app-server); [AgentMessageDeltaNotification.ts](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/v2/AgentMessageDeltaNotification.ts)). The extension owns that connection. Another process could reach the events only in one of three ways:

- the extension's own pipe;
- the daemon control socket, bound at mode **0600** and described as experimental ([unix_socket.rs](https://github.com/openai/codex/blob/main/codex-rs/app-server-transport/src/transport/unix_socket.rs); [app-server-daemon README](https://github.com/openai/codex/blob/main/codex-rs/app-server-daemon/README.md));
- a separate `codex app-server` that resumes the same thread, becoming a second live owner.

The first two are private channels and the third is a replacement runtime, so all three are excluded. OpenAI itself calls the app-server and its WebSocket transport **"experimental and … not supported for production workloads"** ([Codex app-server](https://learn.chatgpt.com/docs/app-server)).

### Cline, Roo, Kilo and Continue range from input-only to nothing

Stock Cline 4.1.24 exports exactly four methods: `startNewTask`, `sendMessage`, `pressPrimaryButton` and `pressSecondaryButton`. All four return `Promise<void>`, and there are no events, getters, task IDs or cancel method ([cline.d.ts](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/exports/cline.d.ts#L1-L25)). The surface has only shrunk: PR #4158 removed two methods ([PR #4158](https://github.com/cline/cline/pull/4158)). A request for streaming events was closed the same day ([issue #4886](https://github.com/cline/cline/issues/4886)), as was a draft plugin-system PR ([PR #6984](https://github.com/cline/cline/pull/6984)).

The only unpatched output channel is the opt-in TaskComplete hook script. It receives `taskId` and the run's final `outputText`. The 4.x adapter explicitly lists `Notification` among **"Deferred hooks (NOT wired here)"**, so stock Cline never reports that it is waiting for a question or approval ([hooks-adapter.ts](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/sdk/hooks-adapter.ts#L283-L294)). Cline's SDK documents in-process `AgentPlugin` hooks such as `afterModel` and `onEvent` ([Cline SDK plugins](https://docs.cline.bot/sdk/plugins)). Whether the VS Code extension loads user-installed SDK plugins is unverified. This is why SDC's maintained Cline 4.1.2204 with patched native API 1.3, which exposes task-scoped attach and subscribe, remains the correct route ([evidence/MB04/README.md](../evidence/MB04/README.md)).

Roo Code built what SDC wants, then shut down.

- **Events.** Its typed `RooCodeAPI` emits `message` events carrying `taskId` and a full `ClineMessage`, including `partial: true` streaming updates. Because `say()` replaces text rather than appending it, each update carries the cumulative text so far ([api.ts](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/api.ts#L11-L136); [events.ts](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/events.ts#L59-L127)).
- **Pending state.** It emits `taskInteractive`, `taskIdle` and `taskResumable` two seconds after a blocking ask ([Task.ts](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/core/task/Task.ts#L1344-L1382)).
- **Control.** `startNewTask` returns the task ID, `resumeTask(taskId)` reopens a conversation, and `cancelCurrentTask()` cancels.
- **Shutdown.** The repository was **archived on 2026-05-15**, with v3.54.0 as the final release ([Roo README](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/README.md#L64-L69)).
- **Limits even before shutdown.** `sendMessage` and the button methods take no task ID and act on whatever task is current. Button presses go through the webview ([api.ts L287](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/extension/api.ts#L287-L297)). Its optional IPC socket, enabled by an environment variable, has no authentication beyond file permissions ([extension.ts](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/extension.ts#L237-L238)).

Kilo Code 7.x rebuilt the extension on OpenCode.

- **No API.** Its `activate()` returns nothing ([extension.ts](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/kilo-vscode/src/extension.ts#L927-L943)).
- **Private backend.** The extension spawns a private `kilo serve --port 0` protected by a random 32-byte password ([server-manager.ts](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/kilo-vscode/src/services/cli-backend/server-manager.ts#L82-L152)). Attaching to that server would be a private channel, and starting another would be a separate runtime.
- **Breaking change.** The legacy 5.x line kept Roo's API, but it is archived ([kilocode-legacy extension.ts](https://github.com/Kilo-Org/kilocode-legacy/blob/ae046acafd17993bdf12dce0f81d9ac948e17ee8/src/extension.ts#L531)). The same Marketplace ID therefore silently dropped its API.

Continue exports only `registerCustomContextProvider`, which feeds context *into* Continue. The full extension object is exported only when `NODE_ENV === "test"` ([activate.ts](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/vscode/src/activation/activate.ts#L67-L79)).

## Files, screens and proxies observe but cannot bind

### On-disk history is fast for some plugins and unusable as identity for all

Every plugin persists conversations, but no two persist them the same way.

- **Cline** ships a combined A/B VSIX in which a remote PostHog flag picks the legacy or SDK bundle for each window, and the choice can change on reload ([Cline CHANGELOG 4.1.0](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/CHANGELOG.md#L443); [rollout README](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode-rollout/README.md#L51)). The legacy bundle rewrites `ui_messages.json` atomically on every streamed UI update, on a 40 ms default cadence ([message-state.ts](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/core/task/message-state.ts#L239); [latency.ts](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/core/task/latency.ts#L65)). The SDK bundle writes `messages.json` only at `iteration_end`, using a non-atomic `writeFileSync` ([agent-events.ts](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/core/src/services/agent-events.ts#L312); [session-manifest-store.ts](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/core/src/session/stores/session-manifest-store.ts#L220)).
- **Kilo 7** persists final text at `text-end` into a WAL-mode SQLite database ([processor.ts](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/opencode/src/session/processor.ts#L779); [db.ts](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/opencode/src/storage/db.ts#L35)).
- **Continue** saves only after the whole stream finishes ([streamThunkWrapper.tsx](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/gui/src/redux/thunks/streamThunkWrapper.tsx#L27)).
- **VS Code/Copilot** persists live sessions on `onWillSaveState`, behind a storage flush that runs **every 60 seconds** or at shutdown ([chatServiceImpl.ts](https://github.com/microsoft/vscode/blob/1220a0f4e53fb3376fcbc51f11df3f5919ab32fa/src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L394); [storage.ts](https://github.com/microsoft/vscode/blob/1220a0f4e53fb3376fcbc51f11df3f5919ab32fa/src/vs/platform/storage/common/storage.ts#L336)). It changed format twice in ten months, from a database to `.json` files and then to a `.jsonl` mutation log ([commit a4ee266](https://github.com/microsoft/vscode/commit/a4ee2666f0a3bbadcf5f9cceb78f6bff05070faf); [commit 5438d07](https://github.com/microsoft/vscode/commit/5438d07dd307c360160fdf8761fc0119380e493a)).
- **Claude Code** appends complete blocks to its transcript. A reported case saw the final message land **"a couple of seconds"** after `Stop` fired ([issue #74340 mirror](https://claudeissues.com/issue/74340-stop-hook-fires-before-the-final-assistant-message-is-flushed-to-the-transcript)).
- **Codex** drops all text deltas from its rollouts, flushes per completed item, and recompresses cold files to `.jsonl.zst` in the background ([policy.rs](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/rollout/src/policy.rs#L215); [compression.rs](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/rollout/src/compression.rs#L57)).

Files fail on identity more than on latency. Each store is keyed by a plugin-internal ID, and **no store marks which conversation is open in a given window**. A watcher that guesses from the most recent modification time and the working directory breaks in any of these cases: several tasks are active, subagent files are being written, Cline's cohort flips between layouts, or a CLI session shares the directory.

The plumbing is also fragile. Node's `fs.watch` follows inodes and loses atomic-rename targets ([Node fs caveats](https://nodejs.org/docs/latest-v24.x/api/fs.html#caveats)). JSON rewrites can be torn mid-write. SQLite changes land in the `-wal` file first.

These stores also hold plaintext secrets. Claude's docs say **"Transcripts and history are not encrypted at rest"** ([claude-directory](https://code.claude.com/docs/en/claude-directory)), and many Cline and Codex files were mode 0644 on this machine ([local inspection](file:///Users/samin/.cline/data)).

Under the project's rules, every store except Claude's documented transcript is private internal storage, and the SQLite stores are internal databases. Claude's transcripts are acceptable only as a lagging reconciliation source, preferably read through the SDK readers.

### Accessibility and OCR scrape rendered text with no identity

Setting Electron's `AXManualAccessibility` attribute turns on Chromium's accessibility tree. Chromium then composes every frame, including extension webviews, into one tree that macOS Accessibility (AX) clients can read ([Electron accessibility](https://www.electronjs.org/docs/latest/tutorial/accessibility); [Chromium accessibility overview](https://chromium.googlesource.com/chromium/src/+/main/docs/accessibility/overview.md)). Whether this works for VS Code 1.140's webviews is **unverified**, and the route has three structural defects:

- **Permissions and lag.** It needs the user-granted Accessibility (TCC) permission ([Apple forums 649501](https://developer.apple.com/forums/thread/649501)), and Chromium's cache lags the renderer by "a fraction of a second".
- **Virtualization.** Cline's webview uses react-virtuoso, so messages scrolled out of view leave the tree entirely ([local Cline 4.1.23 webview bundle](file:///Users/samin/.vscode/extensions/saoudrizwan.claude-dev-4.1.23/webview-ui/build/assets/index.js)).
- **Fidelity.** It returns rendered text, not Markdown source.

OCR with Vision is worse. It sees only unobscured on-screen pixels, needs the Screen Recording permission, and works on whole words ([Apple Vision docs](https://developer.apple.com/documentation/vision/locating-and-displaying-recognized-text.md)).

Neither route can tell which task is on screen, and both conflict with consumer terms. Anthropic's Consumer Terms bar automated access and scraping except where permitted ([Anthropic Consumer Terms](https://www.anthropic.com/legal/consumer-terms)). OpenAI's terms bar programmatically extracting Output ([OpenAI Terms of Use](https://openai.com/policies/terms-of-use/)). Both routes are diagnostic-only.

### Base-URL proxies see tokens first but cannot tell who asked

Every major assistant documents a configurable model base URL:

- Claude Code: `ANTHROPIC_BASE_URL`
- Codex: `model_providers.<id>.base_url` or `openai_base_url`
- Cline and Roo: OpenAI-compatible endpoints with custom headers
- Continue: `apiBase`
- Copilot: a BYOK Custom Endpoint, which covers only BYOK models; GitHub-hosted plan models cannot be redirected

Sources: [Claude Code LLM gateway](https://code.claude.com/docs/en/llm-gateway.md); [Codex config reference](https://learn.chatgpt.com/docs/config-file/config-reference); [VS Code language models](https://code.visualstudio.com/docs/copilot/customization/language-models).

An unbuffered loopback pass-through sees **token-level output with exact Markdown**, which is better fidelity than any UI route. But mitmproxy-style tools buffer SSE by default ([mitmproxy addons](https://docs.mitmproxy.org/stable/addons-examples)). Claude Code also requires bodies to be forwarded unmodified ([Claude Code gateway protocol](https://code.claude.com/docs/en/llm-gateway-protocol.md)).

What the proxy sees is model output, which is not always the reply the user sees. Cline delivers its final answer as `attempt_completion` tool arguments, not plain text ([local Cline 4.1.23 bundle](file:///Users/samin/.vscode/extensions/saoudrizwan.claude-dev-4.1.23/dist/extension.js)).

Identity on the proxy path varies by plugin:

- **Claude Code** always sends `X-Claude-Code-Session-Id`. The per-prompt `x-claude-code-prompt-id` is sent only when `CLAUDE_CODE_GATEWAY_HINT_HEADERS=1` ([Claude Code gateway protocol](https://code.claude.com/docs/en/llm-gateway-protocol.md)).
- **Codex** sends session and thread headers plus `prompt_cache_key` ([codex client.rs](https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/src/client.rs)).
- **Cline** sends `X-Task-ID` only on its own `cline` provider.

No proxy can tell whether a request came from an SDC prompt or from a local keystroke. It therefore cannot provide causality or fencing.

The credential exposure is significant. If only `ANTHROPIC_BASE_URL` is set, Claude Code **routes the saved claude.ai subscription credential through the proxy** ([Claude Code LLM gateway](https://code.claude.com/docs/en/llm-gateway.md)).

The project's 2026-10-11 Codex research already concluded that static headers and proxy UUIDs do not establish identity ([AGENTS.md](../AGENTS.md)). A proxy is a read-only observer. It falls in the grey zone of the "separate model app-server" ban, so using it would need its own decision record.

## Nineteen routes sorted into four verdicts

The table applies SDC's rules to every route. **Supported** means a documented vendor interface that runs inside the existing plugin process. **Public, internal contract** means a public command ID whose argument or format is undocumented. **Observer** means the route breaks no runtime rule but can never qualify a driver. **Excluded** means a private, debug, internal-storage or replacement-runtime route. Sources are cited in the sections above.

| Route | Reply latency | Conversation identity | Cross-version stability | Security / ToS | SDC verdict |
|---|---|---|---|---|---|
| Claude settings hooks (`Stop`, `SubagentStop`, `StopFailure`; command or HTTP) | End of turn; nothing on interrupt | `session_id`, `prompt_id` | Documented and GA; field since 2.1.47 | User-configured code; policy can disable | **Supported** |
| Claude `MessageDisplay` | Line batches in terminal; probably once per message in panel (unverified) | `turn_id`, `message_id` | Documented since 2.1.152 | Same as hooks | **Supported**, streaming unproven |
| Claude Mods (`turn.step`, `turn.complete`, `session.*`) | Token chunks; panel delivery unverified | `$.session.id()`, `turnId`, `agentId` | "EARLY ACCESS"; types lag builds | Unsandboxed; can approve tools | **Supported**; pin exact build |
| Claude OpenTelemetry `assistant_response` | About 5 s batches | `session.id`, `prompt.id` | Documented | Opt-in text export to collector | **Supported**, weak primary |
| Codex hooks (`Stop`, `UserPromptSubmit`, `PermissionRequest`) | End of turn | `session_id`, `turn_id` (thread equality unverified) | Documented; open IDE/app bugs | Trust by hash | **Supported** in principle; needs acceptance |
| Codex `notify` | End of turn | `thread-id`, `turn-id`, `client` | "Legacy", slated for removal | Spawned program | **Supported**, deprecated |
| Codex app-server events | Token deltas | `threadId`, `turnId`, `itemId` | Experimental, version-specific | 0600 socket or second owner | **Excluded** |
| Roo `exports` event API | Cumulative partials | `taskId` | Frozen; repository archived | IPC socket unauthenticated | **Supported**, unmaintained |
| Stock Cline `exports` and TaskComplete hook | Final `outputText` only | `taskId` (hook only) | API has shrunk over time | Script hook | **Supported**, thin |
| Kilo 7 / Continue `exports` | None | None | n/a | n/a | No route |
| VS Code native chat export/copy and `chat.open` with `blockOnResponse` | On demand, after completion | Last-focused widget only | Undocumented arguments and format | Clipboard clobbering | **Public, internal contract** (Copilot only) |
| Proposed chat APIs | n/a | Session URI only | Can break monthly; cannot be published | Launch flag required | No reader |
| Webview DOM, extension-host patching, CDP, `--inspect-extensions` | Real time | Inferred from DOM | None | Full editor control | **Excluded** |
| Accessible View, signals, Output channels, terminal `execution.read()` | n/a | n/a | n/a | n/a | No reply route |
| On-disk history (all plugins) | 40 ms (legacy Cline) to 60 s or window close (Copilot) | Internal IDs; no "open" marker | Heavy churn | Plaintext, often 0644 | **Excluded** (Claude transcript: reconciliation only) |
| macOS AX / UIA / AT-SPI | Under 1 s (inferred) | None | Breaks per UI release | TCC permission; scraping clauses | **Observer**, diagnostic only |
| Screenshot OCR | Repeated capture | None | Worst | Screen Recording; scraping clauses | **Observer**, diagnostic only |
| Base-URL pass-through proxy | Token level | Claude session header; Codex thread headers; Cline none on third-party providers | Gateway contracts documented | Sees credentials, including subscription OAuth | **Observer**, grey zone; needs a decision record |
| Separate runtimes (`claude -p`, Agent SDK `query()`, `--resume`, `codex exec` or own app-server, `kilo serve`, VS Code Agent Host) | Token level | Their own sessions | Documented | Second opener mixes messages | **Excluded** |

## Reading replies was never the only blocker

The project's own evidence shows that reading is the solved half for Claude. In an existing conversation in Claude Code 2.1.296, an approved observer Mod recorded:

- a session digest that matched the selected native UI session;
- two manual turns, each with matching start and completion turn IDs;
- `turn.complete` fields `answer`, `durationMs`, `isAborted`, `reason`, `turnId` and `usage`.

The project deliberately treats field presence as *not yet* output qualification ([evidence/MB05/README.md](../evidence/MB05/README.md)). Even so, the blocker it recorded is **execution authority**, not visibility:

- **Queuing.** `$.prompt.submit` waits until the session is idle, so a prompt can sit in a queue.
- **Fail-open hooks.** A Mod hook that throws can be skipped. In exact-build diagnostics, a guard and its refusal handler both failing **let the prompt reach the core**.
- **What is required.** The capability request asks for either atomic admission against a session-bound SDC permit, or a revocable native queue with stable request identity ([evidence/MB05/BLOCKER.md](../evidence/MB05/BLOCKER.md)).
- **Progress so far.** A classic `UserPromptSubmit` guard with `onFailure: "block"` passed four refusal cases: explicit refusal, crash, malformed JSON and timeout. In a busy-queue test, it refused a queued offer **183 ms after the blocking turn completed** ([NATIVE-CLASSIC-HOOKS.md](../evidence/MB05/NATIVE-CLASSIC-HOOKS.md); [NATIVE-QUEUE.md](../evidence/MB05/NATIVE-QUEUE.md)).
- **What remains.** Authority changing while input is queued, lease expiry, local takeover, Mod reload and crash recovery are still unqualified.

The other plugins fail on different requirements, and better reply reading would fix none of them.

- **Conversation identity.**
  - Stock Cline's `startNewTask` returns `void`, and its button presses answer "the current ask" with no ask identity.
  - Roo's `sendMessage` and buttons take no task ID, so they race with the user's own selection.
  - Files and proxies carry no marker of which conversation the user has open.
  - Claude is better placed here. The panel's `vscode://anthropic.claude-code/...` URI handler accepts a `session` ID to resume a conversation, which suggests that the `session_id` hooks report names a conversation the panel itself recognizes ([Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)). That equality is not yet verified.
- **Turn completion.**
  - Claude's `Stop` skips interrupts, which only Mods' `isAborted` covers.
  - Stock Cline's hook fires on task completion, not on each turn.
  - Codex's `Stop` is the only completion signal it gives SDC.
- **Pending question and approval state.**
  - Claude has no first-class pending event. SDC must rebuild that state from `PermissionRequest`, a roughly 6-second-delayed `Notification`, and `PreToolUse` on `AskUserQuestion`.
  - Codex has no question hook at all.
  - Stock Cline's `Notification` hook is not wired.
  - Only Roo, through `taskInteractive`, and VS Code's native chat, through the confirmation info from `chat.open`, expose it directly.
- **Input and attachment.** For Codex, SDC's discovery found **no documented way to select or send into an existing IDE conversation** at all ([evidence/MB01/README.md](../evidence/MB01/README.md)). For Kilo 7 and Continue, the same is true by construction.

For every plugin except the patched Cline boundary, the hard requirements are identity, causality and effect-time fencing. Reply text is the easy part.

## One in-session observer per plugin, behind SDC's durable host

The recommended architecture keeps the plugin as the only executor. Each backend gets a small **observer** that runs at the vendor's documented extension point inside the existing plugin process: a Mod and classic hooks for Claude, hook commands for Codex, the patched API for Cline. The observer emits neutral events to the existing local SDC host over authenticated loopback.

- **Connection binding.** The observer authenticates with a short-lived secret bound to host, window, workspace and native session, and the host rejects stale generations. MB-05 already specifies this binding ([evidence/MB05/README.md](../evidence/MB05/README.md)).
- **Durability.** The host keeps ownership of durability through the file-backed SQLite inbox and outbox and the existing bridge. The observer never becomes the transport. A Mod's `$.http.fetch` is buffered and limited to 30 seconds per call, so it cannot replace the host's streaming and recovery path.
- **Event vocabulary.** The driver contract's `subscribe` and `inspect` operations carry a small neutral set: attachment with native session identity and generation; turn start with origin; text delta (emitted only where the source genuinely streams); turn completion with final text and a reason of answer, aborted, error or refusal; and pending input or approval with its resolution.
- **Fidelity labels.** Each event says whether streaming is token-level, line-level or end-of-turn only, and whether pending state is native or reconstructed. This prevents an end-of-turn Codex binding from being presented as equivalent to a streaming Claude binding.
- **Fencing is a separate component.** For Claude it is the classic admission guard consulting live SDC authority. For Cline it is the adapter's `assertAuthority()` check at the effect boundary. Codex has none, so it stays blocked.
- **Health checks.** Claude policy switches can silently disable hooks and Mods. The host should therefore treat a missing `session.start` heartbeat as "unbound" rather than "quiet".
- **Exact-build pins.** Every surface here is version-sensitive, so qualification pins exact builds and repeats acceptance for each new release.
- **Diagnostics stay separate.** File tailing, proxies and AX stay in an opt-in, redacted diagnostics plane that never produces qualification evidence.

| Plugin (versions examined) | Recommended reply route | Streaming | Status and next step |
|---|---|---|---|
| Claude Code (pinned 2.1.296; latest 2.1.300) | SDC-owned Mod (`turn.step`, `turn.complete`, `$.session.id()`) as primary; classic `Stop` HTTP hook as end-of-turn fallback; SDK transcript readers for reconciliation only | Token chunks (panel delivery to verify) | Reading is ready for exact-build acceptance. The driver stays blocked until the changing-authority fence passes. Obtain types generated by the exact build. |
| Codex (`openai.chatgpt` 26.1007/26.51007) | `Stop` plus `UserPromptSubmit` command hooks to loopback; `notify` only as a legacy backup | None, end of turn only | Observation-only after native acceptance on the exact build. The driver stays blocked: no supported input route, attachment, question state or fencing. |
| Cline (maintained 4.1.2204 / API 1.3; stock 4.1.24) | Patched API 1.3 `subscribe`; never fall back to stock hooks or files for qualification | Yes (patched) | Keep the adopted boundary. Stock TaskComplete is a degraded final-text signal only. |
| Roo Code 3.54.0 (archived) | In-process `exports` events, not the IPC socket | Yes (cumulative) | Do not invest. Revisit only a maintained fork (ZooCode, unverified) on a new instruction. |
| Kilo Code 7.8.x | None | n/a | Unsupported. Request a vendor event API; never attach to `kilo serve`. |
| Continue 1.3.40 / 2.1.0 | None | n/a | Unsupported. Request a vendor event API. |
| GitHub Copilot Chat (VS Code 1.140 native) | `workbench.action.chat.open` with `blockOnResponse`, then `workbench.action.chat.export` to a URI | No; snapshot after completion | Experimental only. Undocumented contracts, last-focused-widget identity, and BYOK-only proxy coverage. Needs a scope decision first. |

## Conclusion

Reply readability across these plugins is close to the inverse of what SDC needs to admit a driver. Claude Code exposes more output than SDC requires but has not yet shown it can refuse a stale prompt. Cline exposes almost nothing stock, yet passes because SDC owns the patched boundary where authority is checked. The practical consequence is that further effort on cleverer scraping, file watching or proxying cannot move any backend from blocked to admitted. Those routes add observation, and observation was never the gap. The leverage lies in narrow vendor capability requests. MB-05 has already drafted one for Claude: atomic admission or a revocable queue. Codex needs an equivalent request covering existing-IDE attachment, input and in-session streaming for third parties. Kilo and Continue need any event API at all.

A second implication follows from every supported channel running inside the plugin at its own hook points. **The plugin's exact build becomes SDC's contract.** The relevant surfaces are early-access Mods types that lag shipped builds, Codex hooks with open IDE bugs, a "legacy" `notify` slated for removal, and a Cline storage layout that flips per window on a remote flag. Durable support therefore depends less on picking the right route once than on treating each vendor release as a fresh qualification event.
