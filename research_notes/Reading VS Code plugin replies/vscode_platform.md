# VS Code platform routes for reading another extension's chat replies (VS Code ~1.101–1.141, October 2026)

Evidence base and pins (read this first):
- Primary evidence is the **installed, signed VS Code 1.140.0 stable** used by this project (`~/Applications/ServerDrivenChat VS Code 1.140.app`, product commit `07f806f999227108933c2e30515b26eecc1fda74`) and the ordinary **VS Code 1.141.0 stable** (`/Applications/Visual Studio Code.app`, commit `2a59476c9bfcb90b3ddc372c36762471b7dfad1c`). Both were only read (product.json and the minified workbench bundle); nothing was launched, installed or changed.
- API type definitions were downloaded from `microsoft/vscode` **at the exact 1.140.0 commit** `07f806f`. Line numbers below refer to that commit.
- Findings marked "bundle" come from reading the minified `out/vs/workbench/workbench.desktop.main.js` in the 1.140.0 app. The matching TypeScript source files were **not** individually fetched; any source path named is my best guess and is labeled as such.
- Locally installed third-party extension manifests that were read (read-only): `Anthropic.claude-code@2.1.296`, `openai.chatgpt@26.1007.21434` (Codex), `saoudrizwan.claude-dev@4.1.23` (Cline) in `~/.vscode/extensions`.
- I did not trace behavior across every release from 1.101 to 1.139. Where something is stated for 1.140/1.141 only, it says so.

## 1. Webview isolation: can one extension reach another extension's webview DOM or postMessage traffic?

### Takeaway
No supported route exists. A webview belongs to the extension that created it. Its messages pass only between that webview and its owning extension through `Webview.postMessage`/`onDidReceiveMessage`. No API returns or enumerates another extension's webview. Cline, Roo Code, Claude Code and Codex all render their chat in webviews, so the platform does not let anyone else see their DOM or message traffic. The only ways in are debug or in-process hacks (sections 6 and 7).

### Cited Findings
- The docs describe a webview as "an `iframe` within VS Code that your extension controls", and say webviews "run in isolated contexts that cannot directly access local resources" — [VS Code Webview API guide](https://code.visualstudio.com/api/extension-guides/webview)
- "Webview panels are owned by the extension that creates them". If an extension loses its reference, "it cannot regain access to that webview again". The guide documents no API for reaching another extension's webview — [VS Code Webview API guide](https://code.visualstudio.com/api/extension-guides/webview)
- Scripts inside a webview cannot use the VS Code API directly. They call `acquireVsCodeApi()` once per session, and the docs say "you must keep the VS Code API object private and make sure it is never leaked into the global scope" — [VS Code Webview API guide](https://code.visualstudio.com/api/extension-guides/webview)
- Messaging is defined on the `Webview` object the owner holds. `onDidReceiveMessage: Event<any>` is at line 9993 and `postMessage(message: any): Thenable<boolean>` at line 10026. A webview handle exists only on objects created by or passed to the owning extension (`createWebviewPanel`, `WebviewViewProvider.resolveWebviewView`, custom editors) — [vscode.d.ts @1.140.0 L9965–L10026](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L9965-L10026)
- The target plugins really do render in webviews. Codex `openai.chatgpt@26.1007.21434` contributes views `chatgpt.sidebarView` / `chatgpt.sidebarSecondaryView` with `"type": "webview"` (local manifest, read-only) — [local openai.chatgpt package.json](file:///Users/samin/.vscode/extensions/openai.chatgpt-26.1007.21434-darwin-arm64/package.json)
- Content Security Policy restricts what a webview can load or run. A policy built on `${webview.cspSource}` also "implicitly disables inline scripts and styles" — [VS Code Webview API guide](https://code.visualstudio.com/api/extension-guides/webview)
- The supported cross-extension channel is the other extension's own exported API: `Extension<T>.exports` is "The public API exported by this extension (return value of `activate`)". This works only if the plugin chooses to expose one — [vscode.d.ts @1.140.0 L8374–L8377](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L8374-L8377)

### Inferences
- Under ServerDrivenChat's rules, the only **supported public** way to read a webview plugin's replies is an API the plugin publishes itself: `exports`, a command that returns data, or an MCP/HTTP surface it documents. The VS Code platform adds nothing on top of that. Per-plugin APIs are outside this note.
- All extensions in a local window share one Node extension-host process. An extension could therefore monkey-patch shared extension-host internals to see other extensions' `postMessage` payloads on the host side. That is an undocumented in-process hack, it could break with any release, and it counts as a private interface. I did not verify that it works in 1.140.

### Gaps
- I did not verify whether 1.140 runs webview iframes as out-of-process frames (site isolation). This matters only for the CDP route in section 6.
- I did not check whether any webview plugin intentionally relays transcript content to its extension host and exposes it. Per-plugin research covers this.

## 2. Stable chat APIs: Chat Participant API, `ChatContext.history`, `vscode.lm`, chat tools, and `workbench.action.chat.open`

### Takeaway
No stable API lets an extension read Copilot Chat's replies or another participant's replies. `ChatContext.history` contains only the calling participant's own turns, and `vscode.lm` and the tools APIs run models and tools rather than read transcripts. `workbench.action.chat.open` can submit a query and, with the undocumented `blockOnResponse: true` option, waits for completion. It returns the response's `ChatResult` object (error details and metadata), not the rendered reply text.

### Cited Findings
- `ChatContext.history` is documented as: "All of the chat messages so far in the current chat session. Currently, only chat messages for the current participant are included." — [vscode.d.ts @1.140.0 L19671–L19676](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L19671-L19676)
- The chat guide says "A participant can only access messages where it was mentioned", and "History will not be automatically included in the prompt" — [VS Code Chat Participant API guide](https://code.visualstudio.com/api/extension-guides/ai/chat)
- `ChatResponseTurn.response` keeps only content parts (`ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart`), plus `result: ChatResult`, `participant: string` and `command?` — [vscode.d.ts @1.140.0 L19641–L19660](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L19641-L19660)
- The stable `chat` namespace has only `createChatParticipant(id, handler)`. It has no session enumeration and no transcript reader — [vscode.d.ts @1.140.0 L20116–L20125](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L20116-L20125)
- The stable `lm` namespace has `selectChatModels`, `tools`, `invokeTool` and related functions. These send requests to models and run tools. None returns another participant's output — [vscode.d.ts @1.140.0 L20738–L20812](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L20738-L20812)
- Tool invocation ties to a chat request only through an opaque token: "The _only_ way to get a valid tool invocation token is using the provided `ChatRequest.toolInvocationToken` from a chat request" — [vscode.d.ts @1.140.0 L21076–L21089](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L21076-L21089)
- **Bundle, 1.140.0: what `workbench.action.chat.open` does with its options**
  - If `isPartialQuery` is true, it only calls `setInput(query)`.
  - Otherwise it waits for the view model, switches mode, then calls `setInput(query)` + `acceptInput()`, or `acceptInput(query, {preserveInput:true})`.
  - It attaches the tools listed in `toolIds`.
  - If `blockOnResponse` is set, it waits until the response `isComplete`, or until the response is pending confirmation (a tool approval, confirmation, question carousel or elicitation). It then returns `{...response.result, ...confirmationInfo}`, where `confirmationInfo` is e.g. `{type:"confirmation", kind:"toolInvocation", toolId}`.
  - The returned object is the agent `ChatResult`, not the markdown text.
  - Other options seen in the same handler: `attachHistoryItemChanges`, `attachHistoryItemChangeRanges`, `preserveInput`. The setting `chat.autoReply` changes how question carousels are awaited.
  - The command is also registered per mode as `workbench.action.chat.open<Mode>` (Ask/Agent/Edit).
  - Source: [local VS Code 1.140.0 workbench bundle](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js). The TypeScript source is probably `src/vs/workbench/contrib/chat/browser/actions/chatActions.ts`, not fetched.
- The Chat Participant guide does not document `workbench.action.chat.open` or its argument object — [VS Code Chat Participant API guide](https://code.visualstudio.com/api/extension-guides/ai/chat)

### Inferences
- `executeCommand('workbench.action.chat.open', {query, blockOnResponse:true})` can drive the **native** chat view (Copilot, or whatever agent is the default) and tell when a turn finishes. To get the text, you would then need an export or copy command (section 4). For Copilot, `result.metadata` might carry internal transcript data, but its shape is private to Copilot Chat and I did not verify what it contains.
- None of this reaches webview plugins (Cline, Roo, Claude Code extension, Codex webview). Their chats never pass through VS Code's chat model.
- The argument object is undocumented and not covered by the stable-API compatibility promise. Classification: **public command ID, undocumented and internal argument contract**.
- Using `vscode.lm` to reproduce a reply would mean running a model. AGENTS.md treats that as a forbidden replacement runtime, not as reading the existing conversation.

### Gaps
- I did not inspect Copilot Chat source (`microsoft/vscode-copilot-chat`) to see whether its `ChatResult.metadata` (for example tool-call rounds) contains reply text. A GitHub code search attempt returned nothing usable.
- I did not trace when `blockOnResponse` was added. Its presence is confirmed only in 1.140.0.

## 3. Proposed chat/LM APIs: what they allow and whether a non-Microsoft extension can use them in a released build

### Takeaway
No proposed API in 1.140/1.141 offers a general "read another participant's or vendor's transcript" capability. `chatSessionsProvider` lets an extension *supply* sessions for its own session type. `chatParticipantPrivate` exposes the active chat session URI and dispose events, not content. `chatDebug` lets one provider (Copilot) publish debug events. In stable builds, proposals are enabled only for extensions on a product.json allowlist (65 entries; for example `GitHub.copilot-chat` and `openai.chatgpt`), or when the user launches with `--enable-proposed-api <publisher.ext>`. vsce refuses to publish proposal-using extensions by default. **Anthropic Claude Code and Cline are not on the allowlist.**

### Cited Findings
- **Allowlist, 1.140.0 and 1.141.0 (identical for these entries).**
  - product.json `extensionEnabledApiProposals` has 65 entries.
  - `GitHub.copilot-chat` is allowed (among many others) `chatParticipantPrivate`, `chatParticipantAdditions`, `defaultChatParticipant`, `chatProvider`, `chatSessionsProvider`, `languageModelSystem`, `terminalDataWriteEvent`, `terminalExecuteCommandEvent`, `terminalSelection`, `chatHooks`, `chatDebug`, `dataChannels`, `agentSessionsWorkspace` and `chatInputNotification`.
  - `openai.chatgpt` (Codex) is allowed `['languageModelProxy', 'chatSessionsProvider']`.
  - No `Anthropic.*`, Cline (`saoudrizwan.claude-dev`) or Roo entry exists.
  - Sources: [local product.json, VS Code 1.140.0](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Resources/app/product.json); [local product.json, VS Code 1.141.0](file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/product.json)
- **Installed manifests.** `openai.chatgpt@26.1007.21434` declares `enabledApiProposals: ['chatSessionsProvider','languageModelProxy']` and contributes `chatSessions: [{type:"openai-codex", displayName:"OpenAI Codex"}]`. `Anthropic.claude-code@2.1.296` and `saoudrizwan.claude-dev@4.1.23` declare none — [local ~/.vscode/extensions manifests](file:///Users/samin/.vscode/extensions/)
- **Runtime gate, bundle 1.140.0.** Probable source `src/vs/workbench/services/extensions/common/extensionsProposedApi.ts`, not fetched.
  - The check is `envEnablesProposedApiForAll = !isBuilt || (isExtensionDevelopment && quality !== "stable") || (envEnabledExtensions.size === 0 && Array.isArray(extensionEnabledProposedApi))`.
  - When an extension is in product.json, "product.json (WINS)" over package.json. Extra proposals are kept only in development mode.
  - Otherwise, proposals stay enabled only if the extension ID was given with `--enable-proposed-api`. If not, the log reads "CANNOT USE these API proposals … You MUST start in extension development mode or use the --enable-proposed-api command line flag" and `enabledApiProposals` is cleared.
  - At call time, `checkProposedApiEnabled` throws "Extension '…' CANNOT use API proposal: X".
  - So in **stable**, extension-development mode does not unlock proposals, but an explicit `--enable-proposed-api publisher.ext` does.
  - Source: [local VS Code 1.140.0 workbench bundle](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js)
- **Docs conflict.** The official page says proposed APIs are "only available in Insiders distribution" and "should not be used in published extensions". It describes `enabledApiProposals` in package.json, the `--enable-proposed-api=<ID>` flag, and the `argv.json` `"enable-proposed-api"` list. This **conflicts** with the 1.140.0 stable code above, which honors the explicit flag. Treat the code as authoritative for behavior and the docs as authoritative for policy — [Using Proposed API](https://code.visualstudio.com/api/advanced-topics/using-proposed-api)
- The CLI reference lists `--enable-proposed-api <ext>`: "Enables proposed api features for an extension. Provide the full extension name `publisher.extension`" — [VS Code command-line docs](https://code.visualstudio.com/docs/configure/command-line)
- **Marketplace / vsce.** `vsce publish` throws "Extensions using unallowed proposed API (enabledApiProposals: […]) can't be published to the Marketplace. Use --allow-proposed-apis <APIS...> or --allow-all-proposed-apis to bypass." Bypass flags exist (`--allow-proposed-apis`, `--allow-all-proposed-apis`, deprecated `--no-verify`) — [vscode-vsce publish.ts @04811a9 L366–L375](https://github.com/microsoft/vscode-vsce/blob/04811a94ac8d7cc4d2c2b61c568b065467d39025/src/publish.ts#L366-L375); [vscode-vsce main.ts L242–L245](https://github.com/microsoft/vscode-vsce/blob/04811a94ac8d7cc4d2c2b61c568b065467d39025/src/main.ts#L242-L245)
- A real-world report: a Marketplace publish was rejected for an empty leftover `enabledApiProposals` field (MongoDB VS Code extension 1.9.0, fixed in 1.9.1) — [MongoDB JIRA VSCODE-631](https://jira.mongodb.com/browse/VSCODE-631) (secondary)
- **`chatSessionsProvider`.**
  - `chat.registerChatSessionItemProvider(chatSessionType, provider)` (deprecated) and `chat.createChatSessionItemController(chatSessionType, refreshHandler)`. Using them requires a `chatSessions` contribution in the extension's package.json.
  - `chat.registerChatSessionContentProvider(scheme, provider, defaultChatParticipant, capabilities?)`, where `provideChatSessionContent(resource)` returns a `ChatSession` that "is used to populate the history of the chat UI". `ChatSession.history` is the full history, which the **provider supplies**.
  - `ChatContext.chatSessionContext?` is also added.
  - The direction is provider → VS Code UI. No function lets you read another provider's sessions.
  - Source: [vscode.proposed.chatSessionsProvider.d.ts @1.140.0](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.chatSessionsProvider.d.ts)
- **`chatParticipantPrivate`.**
  - `chat.createDynamicChatParticipant`, `chat.registerChatParticipantDetectionProvider`, `chat.onDidDisposeChatSession: Event<string>`.
  - `window.activeChatPanelSessionResource: Uri | undefined` and `window.onDidChangeActiveChatPanelSessionResource`.
  - `ChatContext.yieldRequested` and `ChatContext.sessionResource?`.
  - `lm.registerLanguageModelProxyProvider`, `chat.updateQuotas`.
  - These give session **identifiers** and lifecycle events, not transcripts.
  - Source: [vscode.proposed.chatParticipantPrivate.d.ts @1.140.0 L311–L550](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.chatParticipantPrivate.d.ts#L311-L550)
- **`defaultChatParticipant`.** Adds `helpTextPrefix/Postfix`, `additionalWelcomeMessage`, and a `titleProvider`/`summarizer` that receive a `ChatContext` (so, the participant's own history) — [vscode.proposed.defaultChatParticipant.d.ts @1.140.0](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.defaultChatParticipant.d.ts)
- **`chatParticipantAdditions`.** `ChatParticipant.onDidPerformAction: Event<ChatUserActionEvent>` (user actions on *its own* responses), an extended `chat.createChatParticipant`, `lm.onDidChangeChatRequestTools` and `lm.fileIsIgnored` — [vscode.proposed.chatParticipantAdditions.d.ts @1.140.0](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.chatParticipantAdditions.d.ts)
- **`languageModelSystem`.** Only adds `LanguageModelChatMessageRole.System = 3` — [vscode.proposed.languageModelSystem.d.ts @1.140.0](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.languageModelSystem.d.ts)
- **`chatProvider`.** Extends language-model *provider* registration, e.g. `targetChatSessionType?`. It concerns supplying models, not reading chats — [vscode.proposed.chatProvider.d.ts @1.140.0](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.chatProvider.d.ts)
- **`languageModelProxy`** (allowlisted for Codex). `lm.isModelProxyAvailable`, `lm.getModelProxy(): Thenable<{uri, key}>`. It returns false unless the "Copilot Chat extension is installed", activated and authenticated. This is a model-execution proxy, not a reader — [vscode.proposed.languageModelProxy.d.ts @1.140.0](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.languageModelProxy.d.ts)
- **`chatDebug`** (allowlisted for Copilot only).
  - `chat.registerChatDebugLogProvider(provider)`: "Only one provider can be registered at a time". The provider can expose historical sessions through `provideAvailableDebugSessionResources`.
  - `chat.onDidReceiveChatDebugEvent` fires for "core-originated debug event[s] (e.g., prompt discovery, skill loading)".
  - Event classes include `ChatDebugUserMessageEvent` and `ChatDebugAgentResponseEvent`.
  - Source: [vscode.proposed.chatDebug.d.ts @1.140.0 L770–L797](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.chatDebug.d.ts#L770-L797)
- The official chat-sessions page calls `chatSessionsProvider` "currently in a proposed state and subject to change", for integrating with the sessions view — [VS Code chat sessions docs](https://code.visualstudio.com/docs/copilot/chat/chat-sessions)

### Inferences
- **Classification.** Using any of these proposals from a ServerDrivenChat extension is a **proposed API** route. On stable it needs a per-user launch flag or `argv.json` edit; it cannot be shipped through the Marketplace without bypassing vsce policy; and it can break in any monthly release.
- Even when enabled, these proposals do not provide a reader for Copilot's or another vendor's transcript. The nearest thing is `window.activeChatPanelSessionResource`, which gives an ID to pair with export (section 4).
- **Codex.** On the allowlist, Codex is a *provider* of `openai-codex` sessions into VS Code's native sessions UI. When such a session is opened in a native chat widget, its history is in VS Code's chat model. The native export/copy commands in section 4 could then capture it (inference, not tested). The Codex sidebar itself is still a webview.
- `chatDebug` could in principle show agent-response events from the Copilot debug provider. It is Copilot-allowlisted, single-provider, and its payload content was not verified.

### Gaps
- I did not check when each proposal was introduced or renamed between 1.101 and 1.139. Codex's `chatSessionsProvider` allowlisting is confirmed only for 1.140.0/1.141.0.
- I did not confirm whether the Marketplace server side (beyond vsce) rejects packages that declare proposals but were uploaded with vsce's bypass flags. Codex evidently ships with proposals because it is allowlisted.
- I did not verify whether `onDidReceiveChatDebugEvent` events carry response text.

## 4. Native chat (Copilot Chat): export/import/copy commands, on-disk storage, external/agent-host sessions

### Takeaway
VS Code's own chat view can be read by any extension through public workbench commands, not through API.
- `workbench.action.chat.export` accepts an optional URI argument. With one, it writes the last-focused chat widget's full session JSON to that file with no dialog.
- `workbench.action.chat.copyAll` and `workbench.action.chat.copyFinalResponse` put Markdown on the clipboard, which an extension can read with the stable `env.clipboard.readText()`.

Session files under `workspaceStorage/<id>/chatSessions/` exist, but reading them is internal-database access. In 1.13x–1.14x, VS Code also discovers external Claude Code, Codex and Copilot CLI sessions and has an "Agent Host" that runs Claude and Codex itself. The Agent Host is a replacement runtime and must not be substituted for existing IDE conversations.

### Cited Findings
- **Bundle 1.140.0: `workbench.action.chat.export`.** Probable source `chatImportExport.ts`, not fetched.
  - Title "Export Chat...", `f1:true`, precondition chat enabled.
  - `run(accessor, outputUri?)`: if no URI is passed it shows a save dialog. Otherwise it takes `chatWidgetService.lastFocusedWidget`, gets the session via `chatService.getSession(widget.viewModel.sessionResource)`, and writes `JSON.stringify(session.toExport(), undefined, 2)` to the URI.
  - `workbench.action.chat.import` accepts `{inputPath, target?: "chatViewPane"}`.
  - Source: [local VS Code 1.140.0 workbench bundle](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js)
- The docs say exporting a chat session "creates a JSON file that contains all prompts and responses from the session", via **Chat: Export Chat...** — [VS Code chat sessions docs](https://code.visualstudio.com/docs/copilot/chat/chat-sessions)
- **Bundle 1.140.0: copy commands.** Probable source `chatCopyActions.ts`, not fetched.
  - `workbench.action.chat.copyAll` (`f1:false`, chat context menu) takes an optional item argument. It resolves the widget by that item's `sessionResource`, or falls back to `lastFocusedWidget`. It concatenates all request and response items as Markdown and calls `clipboardService.writeText`.
  - `workbench.action.chat.copyFinalResponse` needs a response item (argument or focus) and writes `response.getFinalResponse()` to the clipboard.
  - A per-item copy command writes a single item.
  - Source: [local VS Code 1.140.0 workbench bundle](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js)
- The docs describe "Copy All" as copying "the entire chat session in Markdown format" (including thinking and tool calls) and "Copy Final Response" as "just the final Markdown section of the agent's response, after the last tool call" — [VS Code chat sessions docs](https://code.visualstudio.com/docs/copilot/chat/chat-sessions)
- The stable `env.clipboard.readText()` reads the clipboard as text — [vscode.d.ts @1.140.0 L10672–L10678](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L10672-L10678)
- **Bundle 1.140.0: on-disk storage** (`ChatSessionStore`).
  - Storage root is `workspaceStorageHome/<workspaceId>/chatSessions`. For empty windows it is `globalStorageHome/emptyWindowChatSessions`; there is also `transferredChatSessions`.
  - Each session is `<id>.json`, plus `<id>.jsonl` log storage unless `chat.useLogSessionStorage` is `false`.
  - An index is kept in the storage service.
  - Source: [local VS Code 1.140.0 workbench bundle](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js)
- **Bundle 1.140.0: chat session types.** `copilotcli`, `copilot-cloud-agent`, `local`, `openai-codex`, `copilot-growth`, `agent-host-copilotcli`, `agent-host-claude`, `agent-host-codex`. product.json recommends `openai.chatgpt` ("Codex Agent") and Copilot background/cloud agents for the sessions UI — [local VS Code 1.140.0 workbench bundle](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js)
- **External session discovery.**
  - "VS Code can discover local agent sessions created by supported applications outside VS Code" and can "open and continue sessions from Copilot CLI, the GitHub Copilot app, Claude Code, and Codex".
  - Visibility is controlled by `chat.agentSessions.showExternal`, with sessions hidden by default.
  - For Codex, "only one application can write to the chat at a time". While the chat is open elsewhere, VS Code disables sending.
  - The page does not say which component performs discovery or whether it reads each app's local session files.
  - Source: [VS Code chat sessions docs (dated 10/14/2026)](https://code.visualstudio.com/docs/copilot/chat/chat-sessions)
- **Agent Host (1.129).** It is a dedicated process that runs agent harnesses (Copilot, Claude, Codex), opted in with `chat.agentHost.enabled`; Claude can prefer it via `chat.agents.claude.preferAgentHost`. Agents on it get session-management tools to list sessions and read "another session's recent conversation". Messaging another session requires confirmation — [VS Code 1.129 release notes](https://code.visualstudio.com/updates/v1_129)
- Secondary coverage says Claude sessions in the Agent Host use Anthropic's Claude Agent SDK and bill against the developer's API key (1.133, August 2026) — [Visual Studio Magazine, VS Code 1.133](https://visualstudiomagazine.com/articles/2026/08/12/vs-code-1-133-flexes-claude-sessions.aspx) (secondary, not verified against primary notes)

### Inferences
- **`executeCommand('workbench.action.chat.export', uri)`.** This is the most complete VS Code-level way to read a **native** chat transcript, including Copilot Chat replies. It needs no proposed API and touches no private file directly (VS Code writes a file the caller chose).
  - Limits: it exports only the *last-focused* widget, so it cannot target a session by ID; the JSON schema (`toExport()`) is internal and unversioned; it writes to disk; and it covers only sessions rendered in VS Code's chat model, never webview plugins.
  - Classification: **public command, undocumented argument and internal format**.
- **Copy commands plus `clipboard.readText()`.** These work too, but they overwrite the user's clipboard, depend on focus or context, and are UI-driven. That makes them weaker for automation.
- **Reading `chatSessions/*.json(l)` directly** is reading VS Code/Copilot's internal database. AGENTS.md forbids this.
- **External Claude Code/Codex sessions in the native view.** If they appear there, the export/copy commands could read them (not tested). But VS Code's discovery presumably reads those vendors' local session stores. Routing through it would read private vendor storage by proxy. With Codex, it may also contend with the single-writer rule, which risks the "preserve existing IDE conversations" requirement.
- **Agent Host Claude/Codex sessions** are VS Code-run runtimes (Claude Agent SDK / Codex SDK in a VS Code process). Under the 2026-10-11 scope confirmation, they are standalone vendor runtimes and new conversations: a forbidden substitution. They do not read the existing Claude Code or Codex extension conversation.

### Gaps
- I did not confirm whether Copilot Chat exports a public extension API (`exports`) for conversation history.
- I did not confirm whether the "discovered" Claude Code sessions are the same sessions the Claude Code VS Code extension shows, how discovery reads them, or whether it is implemented in core or in Copilot Chat.
- I did not check whether `workbench.action.chat.export` worked the same way in 1.101–1.139 (the argument-URI behavior is confirmed only in 1.140.0).
- No published schema for the exported JSON was found.

## 5. Accessibility routes: Accessible View, screen-reader announcements, accessibility signals

### Takeaway
The Accessible View (⌥F2) can show chat responses and terminal output to the user, but no extension API reads its content. `accessibility.signals.*` play sounds and announcements only. Screen-reader announcements are DOM ARIA output that only OS accessibility clients can observe. This is not a VS Code platform API.

### Cited Findings
- Accessible View: "Open Accessible View" ⌥F2 (Windows Alt+F2, Linux Shift+Alt+F2) lets users "inspect content character by character, line by line". Supported areas listed include chat responses and terminal output — [VS Code accessibility docs](https://code.visualstudio.com/docs/configure/accessibility/accessibility)
- Accessibility signals are sounds and announcements "controlled by the settings `accessibility.signals.*`". The page mentions no extension API for reading Accessible View content — [VS Code accessibility docs](https://code.visualstudio.com/docs/configure/accessibility/accessibility)
- The bundle registers `editor.action.accessibleView` (26 string occurrences in 1.140.0). It is a UI command that opens a view. No return value was observed — [local VS Code 1.140.0 workbench bundle](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js)

### Inferences
- `executeCommand('editor.action.accessibleView')` only displays content. Whether the Accessible View then appears as a readable editor document in `workspace.textDocuments` is unverified, and relying on it would be an undocumented side effect.
- Reading UI text through the macOS Accessibility API (AX) is an OS-level UI-scraping route. It needs TCC Accessibility permission, works on any app, and is not a VS Code route. It would fall in the debug/private class for this project.
- For webview plugins, Accessible View coverage of their chat is up to the plugin. Built-in Accessible View support for chat responses applies to the native chat view.

### Gaps
- I found no source saying whether webview content (Cline, Claude Code) gets Accessible View support.
- I did not check `accessibility.verboseChatProgressUpdates`-style settings or their exact announcement text.

## 6. Developer Tools / Chrome DevTools Protocol / extension-host inspection

### Takeaway
Electron's `--remote-debugging-port` exposes the whole renderer, including webview iframes, over CDP. `--inspect-extensions` exposes the extension host's Node inspector. Either would let a local process read any plugin's DOM or messages, or hook `postMessage`. This is technically feasible on the installed 1.140.0 build: the Node inspect fuse is enabled, and no fuse governs remote debugging. It is a **debug/private interface** that exposes everything, including secrets. It fails AGENTS.md's rule against private interfaces and the project's native-permission and security boundaries.

### Cited Findings
- Electron: `--remote-debugging-port=port` "Enables remote debugging over HTTP on the specified port". `--inspect[=[host:]port]` defaults to `127.0.0.1:9229` — [Electron command-line switches](https://www.electronjs.org/docs/latest/api/command-line-switches)
- Electron fuses: `EnableNodeCliInspectArguments` controls whether `--inspect`-style flags are honored. The docs name no fuse for `--remote-debugging-port`. The fuse wire follows the sentinel `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX`, with one byte per fuse (`0`/`1`/`r`) — [Electron fuses docs](https://www.electronjs.org/docs/latest/tutorial/fuses)
- **Local VS Code 1.140.0 fuse wire** (`Electron Framework` binary): version 1, length 9, wire `101100011`.
  - Mapped onto the documented fuse order: RunAsNode=on, CookieEncryption=off, NodeOptions=on, **NodeCliInspectArguments=on**, EmbeddedAsarIntegrity=off, OnlyLoadAppFromAsar=off, BrowserV8Snapshot=off, GrantFileProtocolExtraPrivileges=on, WasmTrapHandlers=on.
  - The mapping assumes the docs' listing order equals the wire index; the docs defer numbering to `fuses.json5`.
  - Source: [local Electron Framework binary, VS Code 1.140.0](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Frameworks/Electron%20Framework.framework/Electron%20Framework)
- VS Code's CLI reference page does not list `--inspect-extensions`, `--inspect-brk-extensions` or `--remote-debugging-port`. It treats `--user-data-dir`/`--extensions-dir` as advanced options — [VS Code command-line docs](https://code.visualstudio.com/docs/configure/command-line)
- Chrome security context: "we've seen an increase in attackers using Chrome Remote Debugging to extract cookies". From Chrome 136 the switches are ignored for the default Chrome data directory. The article does not mention Electron — [Chrome for Developers blog](https://developer.chrome.com/blog/remote-debugging-port)

### Inferences
- **Feasibility.** Attaching CDP to the workbench renderer and enumerating `vscode-webview://` iframe targets should allow DOM reads and `message`-event hooks in Cline, Claude Code and Codex webviews. `--inspect-extensions=<port>` would allow hooking extension-side `onDidReceiveMessage` handlers. I did not test either in this session.
- **Security implications.**
  - The CDP endpoint grants full control of every window: tokens in webviews, Keychain-backed session cookies via the renderer, and code execution with the user's privileges.
  - A local Node inspector gives arbitrary code execution in the extension host, which holds every extension's secrets and the companion's device tokens.
  - These are debug interfaces, not stable contracts. VS Code would need to be relaunched with the flags. Any other local process could also connect, unless it is bound to loopback and the port is protected; even then, same-user processes can reach it.
- **Classification:** debug/private interface. It is incompatible with ServerDrivenChat's "no private app socket/API" and "preserve native permissions" rules, even though it is local-only.

### Gaps
- I did not verify that VS Code 1.140's main process passes `--remote-debugging-port` through unchanged when launched via the `code` CLI. VS Code's argv parser may require passing it to the Electron binary directly.
- I did not verify site-isolation/OOPIF behavior for webviews, or whether webview iframe targets are listed separately at `/json`.

## 7. Output channels and terminal output

### Takeaway
`OutputChannel` is write-only: no API reads another extension's channel. For terminals, the stable shell-integration API (`window.onDidStartTerminalShellExecution` + `execution.read()`) lets any extension read the raw output of commands run in **any** shell-integrated terminal, including terminals created by Cline or Copilot agents. This captures command output, not chat replies. `onDidWriteTerminalData` (raw stream for all terminals) is proposed, Copilot-allowlisted, and "not intended" for stable.

### Cited Findings
- `window.createOutputChannel(name, …)` returns an `OutputChannel`/`LogOutputChannel`. The interface (L7398ff) offers append/replace/clear/show and no reader — [vscode.d.ts @1.140.0 L7396–L7466, L11526–L11535](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L7396-L7466)
- Stable `TerminalShellExecution.read()`: "Creates a stream of raw data (including escape sequences) that is written to the terminal. This will only include data that was written after `read` was called for the first time". You must call it immediately from `executeCommand` or `window.onDidStartTerminalShellExecution`. `window.terminals`, `onDidStartTerminalShellExecution` and `onDidEndTerminalShellExecution` are global window APIs (L11164, L11205, L11212) — [vscode.d.ts @1.140.0 L7983–L7996](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L7983-L7996)
- Proposed `terminalDataWriteEvent`: `window.onDidWriteTerminalData` gives "access to the raw data stream from the process running within the terminal". The file says: "This API is still proposed but we don't intent on promoting it to stable due to problems around performance" (issue #78502) — [vscode.proposed.terminalDataWriteEvent.d.ts @1.140.0](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.terminalDataWriteEvent.d.ts)
- Proposed and deprecated `terminalExecuteCommandEvent`: `window.onDidExecuteTerminalCommand` with `output` ("plain text shown in the terminal buffer"), deprecated in favor of `onDidStartTerminalShellExecution` — [vscode.proposed.terminalExecuteCommandEvent.d.ts @1.140.0](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.proposed.terminalExecuteCommandEvent.d.ts)
- `terminalDataWriteEvent`, `terminalExecuteCommandEvent` and `terminalSelection` are allowlisted only for `GitHub.copilot-chat` in stable 1.140.0/1.141.0 — [local product.json, VS Code 1.140.0](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Resources/app/product.json)
- The extension-API search did not establish whether `workspace.textDocuments` exposes `output:` scheme documents for other extensions' channels. One search result showed a tool reading output channels by scraping the Output panel DOM instead — [web search summary; e.g. vscode-automation-mcp debug.ts](https://glama.ai/mcp/servers/@Sukarth/vscode-automation-mcp/blob/994918d01967ac21c8957557b5075c5c486e1d10/src/tools/debug.ts) (secondary, not fetched)

### Inferences
- **Terminal route.** It is relevant only when a plugin runs commands in a VS Code terminal with shell integration (e.g. Cline's or Copilot's terminal tools). It reveals tool output, not the assistant's reply text. It is supported public API, but it captures data from terminals the reader does not own, which needs explicit user consent in this project's terms.
- **Output channels.** Plugin debug logs (e.g. Cline output channels) are unreadable through the API. Reading the on-disk log files under VS Code's logs folder would be internal-file access.

### Gaps
- I did not verify whether open Output panel channels appear as `output:` documents in `workspace.textDocuments` in 1.140.
- I did not verify whether shell-integration events fire for terminals created by other extensions with custom pseudoterminals (`Pseudoterminal`). Cline/Claude Code may use their own execution paths.

## 8. Clipboard and plugin-contributed "copy message" commands via `executeCommand`

### Takeaway
`vscode.commands.executeCommand` can run any registered command and returns whatever the handler returns, and `env.clipboard.readText()` is stable. For webview plugins, though, no installed target exposes a "copy last reply" or "export transcript" command. Their copy buttons live inside the webview. For the native chat, VS Code's own `copyAll`/`copyFinalResponse`/`export` commands work (section 4).

### Cited Findings
- Installed `Anthropic.claude-code@2.1.296` has 31 commands. The only transcript-related IDs are `claude-vscode.newConversation`, `reopenClosedSession`, `focusLastMessage`, `markSessionUnread`, `renameSessionTab` and `addSessionTabToGroup`. None copies or exports text — [local Claude Code package.json](file:///Users/samin/.vscode/extensions/)
- Installed `saoudrizwan.claude-dev@4.1.23` (Cline) has 19 commands. The relevant ones are only `cline.historyButtonClicked` (opens the history UI) and git-commit-message commands. Installed `openai.chatgpt@26.1007.21434` (Codex) has 10 commands and none is related to copy, export or history — [local ~/.vscode/extensions manifests](file:///Users/samin/.vscode/extensions/)
- VS Code's native copy commands write to the clipboard service (`workbench.action.chat.copyAll`, `copyFinalResponse`) — [local VS Code 1.140.0 workbench bundle](file:///Users/samin/Applications/ServerDrivenChat%20VS%20Code%201.140.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js)
- `env.clipboard.readText()` is stable API — [vscode.d.ts @1.140.0 L10672–L10678](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vscode-dts/vscode.d.ts#L10672-L10678)

### Inferences
- **Clipboard round-trips** (run a copy command, then `readText()`) are a public-API route only for the native chat. They are lossy (Markdown rendering), race-prone (any other copy wins), and they overwrite the user's clipboard. Restoring the prior clipboard content is possible but not atomic.
- **For Cline, Roo, Claude Code and Codex webviews,** no VS Code command reaches their transcript. The remaining supported option is a vendor-provided API, a documented export, or the plugin's patched API boundary (Cline). Other research notes cover these.

### Gaps
- Roo Code and current Marketplace versions of Cline/Claude Code/Codex newer than those installed were not inspected. Command lists can change per release.
- `vscode.commands.getCommands(true)` was not run in a live host, so hidden or internal commands registered at runtime (not in package.json) were not enumerated.

## 9. Overall classification for ServerDrivenChat (supported public / proposed / debug-private)

### Takeaway
At the VS Code level, the only supported ways to read another extension's chat replies are VS Code's own native-chat commands, which work only for sessions rendered in the native chat view (Copilot and `chatSessionsProvider`-backed sessions such as Codex's `openai-codex`). For webview plugins, nothing short of a vendor API is acceptable. Proposed APIs add no transcript reader and cannot ship through the Marketplace. CDP, inspector, internal storage files and Agent Host substitution are excluded by AGENTS.md.

### Cited Findings
- Route summary (each row's evidence is cited in sections 1–8):

| Route | Reaches webview plugins (Cline/Roo/Claude Code/Codex sidebar)? | Reaches native chat (Copilot, provider sessions)? | Class | Project verdict |
|---|---|---|---|---|
| Webview DOM / `postMessage` of another extension | No API | n/a | none (isolated) | Not available |
| Plugin's own `exports` / documented commands | Only if the plugin offers one | n/a | supported public (vendor-defined) | Acceptable when it exists |
| `ChatContext.history` | No | Own participant's turns only | stable public | Does not read others |
| `vscode.lm` / `lm.tools` / `invokeTool` | No | No (runs models/tools) | stable public | Replacement-runtime risk; not a reader |
| `workbench.action.chat.open` + `blockOnResponse` | No | Returns `ChatResult`/confirmation state, not text | public command, undocumented args | Completion signal only |
| `workbench.action.chat.export` with URI arg | No | Yes, full JSON of last-focused widget | public command, undocumented arg/format | Usable with focus and format caveats |
| `workbench.action.chat.copyAll` / `copyFinalResponse` + `env.clipboard.readText()` | No | Yes, Markdown | public command + stable clipboard API | Usable but clobbers clipboard |
| `chatSessions/*.json(l)` in workspaceStorage | No | Yes | internal storage | Forbidden (internal database) |
| Proposed `chatSessionsProvider` / `chatParticipantPrivate` / `chatDebug` etc. | No | IDs/lifecycle; provider-side history only | proposed (allowlist or `--enable-proposed-api`) | No reader; unshippable |
| External-session discovery / Agent Host Claude/Codex | Different sessions (VS Code-run) | Yes | product feature; Agent Host = separate runtime | Forbidden substitution (new runtime/conversations) |
| Accessible View / signals | No API | No API | UI only | Not available |
| macOS AX scraping | Possibly | Possibly | OS-level UI scraping | Out of scope / private |
| CDP `--remote-debugging-port`, `--inspect-extensions` | Yes (everything) | Yes | debug/private | Forbidden |
| Terminal `execution.read()` | Tool output only | Tool output only | stable public | Not chat replies |
| `onDidWriteTerminalData` | Tool output only | Tool output only | proposed, Copilot-only | Unshippable |
| OutputChannel read | No API | No API | none | Not available |

### Inferences
- For the "Preserve existing IDE conversations" workstream, VS Code offers no platform-level reply-reading route for the Claude Code or Codex **webview** conversations.
- **Codex is a partial exception.** It is allowlisted for `chatSessionsProvider` and contributes the `openai-codex` session type, so Codex conversations may also appear in VS Code's native sessions UI. There, the native export/copy commands could capture them. This needs exact-build testing, and it raises single-writer and private-store concerns.
- **Claude Code** has no proposals and no copy/export commands in 2.1.296. VS Code's Claude integration via the Agent Host is a VS Code-owned runtime, not the existing extension conversation.

### Gaps
- None of these routes was exercised in a live editor in this session. All feasibility statements come from source, bundle, docs or manifests and need native acceptance before any support claim, consistent with AGENTS.md.
