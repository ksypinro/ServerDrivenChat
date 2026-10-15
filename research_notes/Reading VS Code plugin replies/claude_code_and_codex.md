# Reading assistant replies from the official Claude Code (anthropic.claude-code) and Codex (openai.chatgpt) VS Code extensions through supported hook, plugin and event mechanisms

Research date: 2026-10-15. Versions checked that day:

- **Claude Code.** The latest GitHub release is v2.1.300, published 2026-10-14 ([GitHub releases API](https://github.com/anthropics/claude-code/releases)). The VS Code Marketplace lists `anthropic.claude-code` 2.1.300, updated 2026-10-14 ([Marketplace](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code), queried through the public gallery API). The extension's version number equals the Claude Code version it bundles ([VS Code docs](https://code.claude.com/docs/en/vs-code)). This project's own native tests used 2.1.296 ([local evidence](../../evidence/MB05/NATIVE-CLASSIC-HOOKS.md)).
- **Codex.** The Marketplace lists `openai.chatgpt` 26.51007.21434, updated 2026-10-09 ([Marketplace](https://marketplace.visualstudio.com/items?itemName=openai.chatgpt), queried through the public gallery API). The latest openai/codex Rust release is `rust-v0.162.1`, published 2026-10-09 ([GitHub releases API](https://github.com/openai/codex/releases)).

## Claude Code settings hooks (Stop, MessageDisplay, Notification and others): what they expose and whether they fire in the VS Code panel

### Takeaway
Settings hooks are an officially documented mechanism, and the docs say they fire the same way in IDE extensions as in the terminal. They are configured in `~/.claude/settings.json`, which the extension and the CLI share.

- **Final reply:** `Stop` and `SubagentStop` carry the final reply text directly in `last_assistant_message` (since v2.1.47). Docs recommend this field over reading `transcript_path`.
- **Streaming:** `MessageDisplay` (since v2.1.152) delivers assistant text in line-batched increments. In SDK-style hosts it may fire only once per message.
- **Pending state:** `Notification`, `PermissionRequest` and `Elicitation` cover pending permissions and questions.
- **Delivery:** an `"type": "http"` hook can POST each event's JSON straight to a loopback server.

### Cited Findings
- **Events.** Settings hook events as of the current docs:
  - Session: `SessionStart`, `Setup`, `SessionEnd`
  - Per turn: `UserPromptSubmit`, `UserPromptExpansion`, `Stop`, `StopFailure`
  - Tool loop: `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`
  - Subagents and tasks: `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`
  - Other: `Notification`, `MessageDisplay`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `Elicitation`, `ElicitationResult`

  — [Hooks reference](https://code.claude.com/docs/en/hooks)
- **Common input fields** on every event: `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `permission_mode`, `effort`, `hook_event_name`. Subagent hooks also get `agent_id` and `agent_type`. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- **`Stop` input** adds `stop_hook_active`, `last_assistant_message`, `background_tasks` and `session_crons`.
  - Docs: "The `last_assistant_message` field contains the text content of Claude's final response, so hooks can access it without parsing the transcript file."
  - Docs recommend the field over `transcript_path` because "the transcript file isn't guaranteed to include the final message at Stop time on all versions."
  - `Stop` doesn't fire on user interrupts; API errors fire `StopFailure` instead.

  — [Hooks reference](https://code.claude.com/docs/en/hooks)
- **`last_assistant_message` was added in v2.1.47:** "Added `last_assistant_message` field to Stop and SubagentStop hook inputs, providing the final assistant response text so hooks can access it without parsing transcript files." — [Claude Code CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- **`SubagentStop`** adds `agent_id`, `agent_type` and `agent_transcript_path` (stored under `subagents/`), and its `last_assistant_message` holds the subagent's final response. Internal agents such as prompt suggestions and `/btw` also fire `SubagentStop`. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- **`StopFailure`** carries `error` (for example `rate_limit`, `overloaded`, `authentication_failed`, ...), `error_details`, and a `last_assistant_message` that holds the rendered API error string, not Claude's reply. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- **`MessageDisplay`** "Runs while an assistant message streams to the screen... each time a batch of newly completed lines is ready to render, the hook runs once with those lines."
  - Fields: `turn_id`, `message_id` (a UUID, not the API `msg_…` id), `index`, `final`, `delta`.
  - Hooks may return `displayContent`. This is display-only: the transcript and Claude's context keep the original text.
  - "In `claude -p` and Agent SDK runs, it fires once per message, with `final: true` and the full text in `delta`."

  — [Hooks reference](https://code.claude.com/docs/en/hooks)
- **`MessageDisplay` was added in v2.1.152:** "Added a `MessageDisplay` hook event that lets hooks transform or hide assistant message text as it is displayed". — [Claude Code CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- **`Notification`** receives `message`, an optional `title` and `notification_type`.
  - Matchers: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`, `elicitation_url_dialog`, `elicitation_complete`, `elicitation_response`, `agent_needs_input`, `agent_completed`, and `quota_auto_resume_*`.
  - Notification hooks can't block or modify notifications.

  — [Hooks reference](https://code.claude.com/docs/en/hooks)
- **`PermissionRequest`** receives `tool_name` and `tool_input` (without `tool_use_id`), plus `mcp_server` for MCP tools and an optional `permission_suggestions` array. It can return `decision.behavior` allow/deny. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- **Notification timing in VS Code and Desktop.** The hooks docs say VS Code and Claude Desktop host Claude Code through the `canUseTool` callback. In those sessions, `permission_prompt` fires about six seconds after the request and isn't deferred by typing. Before v2.1.233 it didn't fire there at all. — [Hooks reference](https://code.claude.com/docs/en/hooks); the changelog entry "Fixed Notification hooks not firing for permission prompts when running under Claude Desktop or VS Code" is under 2.1.233 in the [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- **`Elicitation` / `ElicitationResult`** hooks were added in v2.1.76 "to intercept and override responses before they're sent back". — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- **Surfaces:** hook events fire the same way in terminal sessions, IDE extensions, the Desktop app and cloud sessions. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- **HTTP hooks:** `"type": "http"` with `url`, optional `headers`, and `allowedEnvVars`. Claude Code POSTs the JSON input as the body. Non-2xx responses and connection failures are non-blocking errors. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- **Async hooks:** `"async": true` runs a command hook in the background without blocking, and its `timeout` isn't enforced. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- **Scopes:**
  - `~/.claude/settings.json` (all projects)
  - `.claude/settings.json` (project, committable)
  - `.claude/settings.local.json` (project, gitignored)
  - managed policy settings
  - plugin `hooks/hooks.json`
  - skill and subagent frontmatter

  `allowManagedHooksOnly` can restrict hooks. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- **The extension shares settings and hooks with the CLI:** "Claude Code settings in `~/.claude/settings.json`: shared between the extension and CLI. Use it for allowed commands, environment variables, hooks, and MCP servers." The panel's Customize section has a Hooks dialog for user, project and local settings; managed and plugin hooks are read-only there. The dialog requires v2.1.269 or later. — [Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)
- **Bundled CLI:** "The extension bundles its own copy of the CLI (command-line interface) for the chat panel." — [Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)
- **Local native observation (project evidence, not vendor docs).** On 2026-10-13/14, a `UserPromptSubmit` classic hook ran in an existing conversation in the official extension 2.1.296 inside isolated VS Code 1.140.0. It blocked prompts, and the native log recorded `prompt.submit: dropped`. — [evidence/MB05/NATIVE-CLASSIC-HOOKS.md](../../evidence/MB05/NATIVE-CLASSIC-HOOKS.md)

### Inferences
- **Lowest-friction supported path for the final reply.** A `Stop` hook of `"type": "http"` in user or project settings could POST `session_id` + `prompt_id` + `last_assistant_message` to the SDC loopback server at end of turn. No transcript parsing and no extra runtime are needed, because the existing extension process runs the hook. `UserPromptSubmit` marks turn start; `Stop` and `StopFailure` mark turn finish. A `Stop` hook that doesn't fire on interrupts means an aborted turn has no `Stop` event, so a separate signal is needed (mods `turn.complete` has `isAborted`).
- **`MessageDisplay` may not stream in the panel.** The hooks reference says the panel hosts Claude Code through `canUseTool`, like an SDK host. Its `MessageDisplay` therefore may behave like the documented SDK mode (once per message, `final: true`) rather than line-batched streaming. Treat partial streaming via `MessageDisplay` in the VS Code panel as **unverified**. Even in the terminal it is line-granular, not token-granular.
- **Pending state is reconstructable only by combining events.** No single settings-hook event exposes a pending permission or question as durable state. It has to be built from `PermissionRequest` (about to prompt), `Notification` (`permission_prompt` / `elicitation_dialog` / `agent_needs_input`), `PreToolUse` on `AskUserQuestion`, and later `PostToolUse` / `PermissionDenied` (resolved). In VS Code, `permission_prompt` notifications are delayed about 6 s by design.

### Gaps
- No official statement that `MessageDisplay` streams incrementally in the VS Code chat panel; the docs only describe terminal versus `-p`/SDK behavior.
- I did not read the full `Elicitation`, `SessionStart` and `SessionEnd` input schemas in this pass; the page text was truncated after 200k characters.
- I did not confirm whether HTTP hooks to `localhost` require any additional allowlisting.

## Claude Code mods (in-process plugin hooks): events for reply text, streaming, session IDs, prompt submission, and support in the VS Code panel

### Takeaway
Mods are documented JavaScript/TypeScript plugins whose hooks run inside the Claude Code process. The docs' "Where mods run" table states that in "The VS Code extension's chat panel", **hooks run: Yes**, but **drawing: No**.

Mods expose more than settings hooks:

- **Turn lifecycle:** `turn.start`, `turn.step` and `turn.complete`. `turn.complete` carries `answer`, `isAborted`, `turnId` and `usage`.
- **Token-level streaming:** `turn.step` is an async-generator stream of `TurnStepChunk`s, including `{kind:'text', index, text}`.
- **Per-row transcript events:** `session.append`.
- **Session APIs:** `$.session.id()`, `$.session.messages()`, `$.prompt.submit` and `$.turn.abort`.
- **Network:** `$.http.fetch`.

The public type declarations are labeled "EARLY ACCESS: this surface may change between releases without notice."

### Cited Findings
- **Where mods run:** "A mod's hooks run in every kind of session that loads the plugin". The table row for "The VS Code extension's chat panel" reads Hooks run = "Yes", What the mod draws appears = "No". Mods are on by default from v2.1.287 (terminal) and v2.1.286 (Desktop). — [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)
- **Capabilities and risk:** "A mod runs with your permissions... It can read and write your files, start processes, and make network requests". It can also "See your session: every prompt you send and every tool call Claude makes" and "submit a prompt as if you had typed it". Mods aren't sandboxed. — [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)
- **Turn events:**
  - `turn.start` gives `e.turnId`.
  - `turn.step` fires when Claude Code is about to send one model request and is written as an async generator: "`yield* next(e)` forwards the response as it streams".
  - `turn.complete` fires when the turn ended, "including a turn the user interrupted, where `e.isAborted` is `true`. `e.answer` is Claude's final text, `e.durationMs` how long it took, and `e.usage` the turn's token totals."
  - A subagent's turn fires `turn.complete` with `e.agentId` set.

  — [React to events with a mod](https://code.claude.com/docs/en/plugins/mods/events)
- **Type declarations:** `TurnStepChunk = TurnStepTextChunk | TurnStepThinkingChunk | TurnStepToolChunk | TurnStepInputChunk | TurnStepStopChunk | TurnStepEngineChunk`, where `TurnStepTextChunk = { kind: 'text'; index: number; text: string }` plus an opaque `ref`. "What leaves the outermost hook is what is shown and recorded."

  `TurnCompleteFields` includes:
  - `answer` ("The assistant's final visible text this turn ("" if none, e.g. thinking-only)")
  - `durationMs`, `isAborted`, `turnId`, `agentId?`, `usage?`
  - `reason`: `'answer' | 'aborted' | 'refusal' | 'error'`

  The header reads: "Written by Claude Code 2.1.277... EARLY ACCESS: this surface may change between releases without notice." — [Public mods declarations, claude-code.d.ts](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts)
- **The reference warns about version drift:** it describes events "as of v2.1.290", and says the GitHub d.ts "can be older than the Claude Code version you have installed. When the two disagree, trust the copy Claude Code writes for your version." — [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference)
- **Session events:**
  - `session.start`, `session.end` (with `e.reason`), `session.compact`, `session.receive`/`session.send`
  - `session.append`: "Once for each row the conversation keeps, such as a prompt, a response block, a tool result, or a notice, before it's stored"
  - `session.attach`/`session.detach`: "Another app connects to or disconnects from the session"
  - `session.measure`

  — [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference)
- **`session.attach`** concerns remote surfaces: "a surface joined the session's roster of attached clients (a phone opened the session; the desktop app connected)". — [claude-code.d.ts](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts)
- **`$.session` methods:** `messages`, `cwd`, `root`, `model`, `turns`, `id`, `repo`, `surfaces`, `usage`, `version`, `compact`, `send`, `append` and `authorize`. `$.session.messages()` "returns the transcript as a list of `{ role, text, toolUses }`", limited to the newest 4,096 entries. — [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference); [Use the mods API](https://code.claude.com/docs/en/plugins/mods/api)
- **Prompt submission:** `$.prompt.submit({ text })` "waits until the session is idle and then starts a new turn. It resolves when that turn starts". `asUser: true` sends it as the user's own words. — [Use the mods API](https://code.claude.com/docs/en/plugins/mods/api)
- **Network access:** `$.http.fetch(url, init)` works over http/https, with a 30 s per-call limit and 4 MiB bodies. A hook's own execution time is limited to 10 s, not counting time inside `next` or mods API calls. — [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference); [Use the mods API](https://code.claude.com/docs/en/plugins/mods/api)
- **Settings-hook events are re-exposed** as `classic.<Event>` (for example `classic.Stop`, whose `e` is the same stdin JSON). — [React to events with a mod](https://code.claude.com/docs/en/plugins/mods/events)
- **No dedicated permission-prompt event.** The event list has no permission-prompt or question event. `tool.check` resolves to `allow`, `ask` or `deny` after rules and settings hooks decide. `ui.render` has an `AskUserQuestion` render site, but drawing doesn't appear in VS Code. — [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference); [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)
- **Policy controls:** `disableAllHooks`, `allowManagedModsOnly`, `allowManagedHooksOnly` and `disableSideloadFlags` can stop mods. Organizations can order mods via `prependPlugins`/`appendPlugins`. — [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference); [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)
- **Installation in VS Code:** plugins (including mods) install through the extension's `/plugins` dialog. "Plugin management in VS Code uses the same CLI commands under the hood. Plugins and marketplaces you configure in the extension are also available in the CLI". — [Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)
- **Recent mod fixes in the changelog:**
  - "Fixed plugin hooks reading an empty `answer` on `turn.complete` for a subagent that hands its report back in auto mode"
  - "Added a `queue` door to the `session.append` mod hook"

  — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

### Inferences
- **Richest supported in-session observer.** For the existing VS Code panel session, a mod is the richest supported option. Without a separate runtime it can stream `kind:'text'` chunks (token/stream-level) and report `turn.complete.answer`, `turnId`, `isAborted` and `$.session.id()` to the SDC loopback server via `$.http.fetch`. A mod observing streaming must pass chunks through unchanged (`yield* next(e)`), and should avoid awaiting network I/O per chunk so it doesn't stall display. That second point is a design inference.
- **Prompt delivery and observation can share one plugin.** `$.prompt.submit` provides a documented in-session prompt path that queues until idle. It still needs the fencing and queue-revocation work already tracked in MB-05.
- **Stability risk is higher than for settings hooks.** The types are "EARLY ACCESS", and the reference lags the d.ts. Pin the exact extension version and regenerate the types per build.

### Gaps
- No vendor statement confirms that `turn.step` text chunks are delivered incrementally to hooks in the VS Code panel specifically, as opposed to the terminal. "Hooks run: Yes" is stated generally.
- No documented mod event exposes "permission prompt now pending" as a first-class state.
- No statement on cross-version compatibility guarantees for mods beyond the EARLY ACCESS notice.

## Claude Code transcript JSONL files (~/.claude/projects/...): official status, incremental writing, format stability

### Takeaway
The location and purpose of `~/.claude/projects/<project>/<session>.jsonl` are officially documented ("Full conversation transcript: every message, tool call, and tool result"). The line schema is not documented as a stable contract.

Writes are asynchronous: docs warn the final message may not be present at `Stop` time. The Agent SDK offers official read helpers (`listSessions()` / `getSessionMessages()`) for these files. Reading the files is passive and needs no runtime, but it is an end-of-message, lagging channel.

### Cited Findings
- **Documented contents:** `projects/<project>/<session>.jsonl` holds the "Full conversation transcript: every message, tool call, and tool result". Subagent transcripts are under `projects/<project>/<session>/subagents/`, and large tool outputs under `tool-results/`. Files are deleted after `cleanupPeriodDays` (default 30). — [Explore the .claude directory](https://code.claude.com/docs/en/claude-directory)
- **No encryption:** "Transcripts and history are not encrypted at rest. OS file permissions are the only protection." Credentials printed by tools are written to the transcript. — [Explore the .claude directory](https://code.claude.com/docs/en/claude-directory)
- **Superseded files:** Claude Code may set aside earlier transcripts as `<session>.orphaned-<timestamp>-<suffix>.jsonl` or `<session>.jsonl.superseded-<timestamp>`. — [Explore the .claude directory](https://code.claude.com/docs/en/claude-directory)
- **Directory encoding:** "Claude Code stores sessions under `~/.claude/projects/<encoded-cwd>/*.jsonl`". Non-alphanumeric characters become `-`, and names over 200 characters are truncated plus a hash. — [Agent SDK: Work with sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- **Official readers:** "Both SDKs expose functions for enumerating sessions on disk and reading their messages: `listSessions()` and `getSessionMessages()` in TypeScript, `list_sessions()` and `get_session_messages()` in Python. Use them to build custom session pickers, cleanup logic, or transcript viewers." — [Agent SDK: Work with sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- **Write lag:** "the transcript file isn't guaranteed to include the final message at Stop time on all versions". — [Hooks reference](https://code.claude.com/docs/en/hooks)
- **Async writes have failed before:** v2.1.91 "Fixed transcript chain breaks on `--resume` that could lose conversation history when async transcript writes fail silently". — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- **Shared history:** "The extension and CLI share the same conversation history." — [Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)
- **Opening a conversation in two processes is unsafe.** If a conversation is open in another Claude Code process, the panel warns "This conversation is still open somewhere else. Using it in two places at once can mix up its messages." — [Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)
- **Session IDs in URIs:** the `vscode://anthropic.claude-code/...` URI handler accepts a `session` parameter: "A session ID to resume instead of starting a new conversation". This ties transcript and session IDs to panel conversations. — [Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)

### Inferences
- **Usable only as a lagging fallback.** File tailing is passive (no process launch, no socket) and has a documented location. With no documented line schema and async/late writes, it should be used only as a fallback for reconciliation or recovery, not as the primary reply channel.
- **Use the SDK readers in preference to parsing JSONL.** `getSessionMessages()` is the most "supported" way to read stored transcripts. Whether importing the SDK's read helpers spawns a Claude Code process is **unverified**; they are documented as session-enumeration helpers, not as `query()`.
- **Resuming the same session elsewhere is not attachment.** `claude --resume` / `-p --resume` on the panel's session ID would open the same conversation in a second process, which the extension warns can "mix up its messages". It is a separate runtime, so it is excluded.

### Gaps
- No official JSONL line schema or stability guarantee was found.
- No documented flush cadence (per message or per block) for the panel's transcript writes.

## Claude Code OpenTelemetry, `--output-format stream-json` and the Agent SDK: which are usable for the existing IDE session and which are separate runtimes

### Takeaway
OpenTelemetry is an in-process, officially supported export. It can include assistant text through a `claude_code.assistant_response` event when `OTEL_LOG_ASSISTANT_RESPONSES=1` is set, and logs export in 5 s batches by default. It would need an OTLP receiver.

`claude -p --output-format stream-json --include-partial-messages` and the Agent SDK `query()` provide true token streaming, but only for a process they start themselves. They are separate runtimes and excluded by SDC's rules.

### Cited Findings
- **Events exported:** `claude_code.user_prompt`, `claude_code.assistant_response`, `claude_code.api_request`, `claude_code.tool_result`, `claude_code.tool_decision`, `claude_code.permission_mode_changed` and others. `claude_code.api_request_body`/`api_response_body` appear only with `OTEL_LOG_RAW_API_BODIES`. — [Monitoring usage (OpenTelemetry)](https://code.claude.com/docs/en/monitoring-usage)
- **Assistant text:** `claude_code.assistant_response` contains text blocks only (no thinking or tool use) and is redacted by default. `OTEL_LOG_ASSISTANT_RESPONSES=1` includes the text; if that variable is unset, `OTEL_LOG_USER_PROMPTS` controls it instead. — [Monitoring usage](https://code.claude.com/docs/en/monitoring-usage)
- **Identity attributes:** `session.id` and `prompt.id` (a UUID tying the events of one prompt together), plus `message.uuid` for transcript correlation. — [Monitoring usage](https://code.claude.com/docs/en/monitoring-usage)
- **Export intervals:** logs 5000 ms (`OTEL_LOGS_EXPORT_INTERVAL`), metrics 60000 ms. Sessions report `app.entrypoint` `claude-vscode` for the extension. — [Monitoring usage](https://code.claude.com/docs/en/monitoring-usage)
- **Passing environment variables to the panel's process:** the extension has an `environmentVariables` setting "for the Claude process", and `~/.claude/settings.json` (env, hooks, MCP) is shared with the CLI. — [Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)
- **Streaming with `-p`:** "Use `--output-format stream-json` with `--verbose` and `--include-partial-messages` to receive tokens as they're generated". This belongs to a `claude -p` run, which is "the Agent SDK via the CLI". — [Run Claude Code programmatically](https://code.claude.com/docs/en/headless)
- **Agent SDK sessions:** the Agent SDK resumes or forks sessions by ID in a new `query()` call. — [Agent SDK: Work with sessions](https://code.claude.com/docs/en/agent-sdk/sessions)

### Inferences
- **OTel works with the existing session but is a weak primary channel.** It is a supported, passive export from the existing panel process (no new runtime). It requires opt-in env vars and an OTLP collector endpoint, is batched (about 5 s), has no streaming deltas, and is designed for observability rather than control. Whether the panel honors `OTEL_*` from `settings.json` env was not verified; the docs suggest checking for `claude_code.session.count`.
- **`stream-json`, `-p`, Agent SDK `query()`, `--resume` and `--continue` are all prohibited.** Each starts or continues a session in a new Claude Code process: a replacement runtime and/or a concurrent second opener of the same transcript.

### Gaps
- No confirmation that the OTel exporter is active in the VS Code panel process with settings-level env. I did not read the rest of the monitoring page (past 100k characters).

## Codex hooks (hooks.json / config.toml): events, Stop `last_assistant_message`, and whether hooks run in VS Code extension sessions

### Takeaway
Codex has a documented hooks system, on by default (`[features] hooks`; `codex_hooks` is a deprecated alias). Its events include `Stop`, carrying `turn_id` and `last_assistant_message` (`string | null`), and `PermissionRequest`. There is no `Notification` event, no user-question event, and no streaming/partial-text hook. Non-managed hooks are skipped until trusted by hash.

The hooks docs talk about the CLI. However, the app-server (which powers the VS Code extension) emits `hook/started`/`hook/completed` notifications, and the IDE and CLI share configuration layers, so hooks are expected to run in extension sessions. Several GitHub issues show reliability gaps in app and extension surfaces.

### Cited Findings
- **Common fields:** `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`. `turn_id` appears on turn-scoped hooks. — [Codex hooks](https://learn.chatgpt.com/docs/hooks) (redirected from developers.openai.com/codex/hooks)
- **Events and fields:**
  - `SessionStart` (`source`)
  - `SessionEnd` (`reason`, main thread only)
  - `SubagentStart`
  - `UserPromptSubmit` (`turn_id`, `prompt`)
  - `PreToolUse`
  - `PermissionRequest` (`turn_id`, `tool_name`, `tool_input`)
  - `PostToolUse` (`tool_response`)
  - `PreCompact` / `PostCompact`
  - `SubagentStop` (`last_assistant_message`, `agent_transcript_path`)
  - `Stop` (`turn_id`, `stop_hook_active`, `last_assistant_message`, described as "Latest assistant message text, if available")
  - `Interrupt` (main thread only)

  No `Notification` event is listed. — [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- **Config locations:** `~/.codex/hooks.json`, `<repo>/.codex/hooks.json`, inline `[hooks]` in `config.toml`, plugin-bundled hooks and enterprise `requirements.toml`. "Use `hooks` as the feature key. `codex_hooks` still works as a deprecated alias." — [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- **Trust:** "Codex records trust against the hook's current hash, so new or changed hooks are marked for review and skipped until trusted". — [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- **Timeouts:** hooks are synchronous by default, with a 600 s default timeout (`SessionEnd`/`Interrupt`: 1 s default, 3 s max). `async: true` is supported. — [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- **Surfaces:** the hooks page doesn't name supported surfaces; it references `/hooks` in the CLI and a "connected client" for `SessionEnd`. — [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- **Shared configuration:** "The CLI and IDE extension share these configuration layers". IDE-only `chatgpt.*` keys don't go in `config.toml`. — [Codex developer settings (IDE)](https://learn.chatgpt.com/docs/developer-settings?surface=ide)
- **Hook notifications from the app-server:** `hook/started` and `hook/completed` carry `{ threadId, turnId?, run }` and are "sent when a synchronous lifecycle hook starts and when its final run summary is available". They "aren't emitted for asynchronous hooks". — [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- **Issue #21723** (VS Code extension 26.506.21252, opened 2026-05-08, closed by reporter 2026-05-09 without explanation): Start/Stop hooks "do not show up nor run". No maintainer reply; flagged as a possible duplicate of "Hooks no longer run after Codex Desktop update". — [openai/codex#21723](https://github.com/openai/codex/issues/21723)
- **Issue #47607** (open, 2026-09-23; Windows desktop app 26.915.4065.0, backend 0.155.0-alpha.9.2): a project `Stop` hook trusted during a running task didn't fire. It asks whether "project Stop definitions and trust [are] loaded at session start, turn start, or dynamically". No maintainer response. — [openai/codex#47607](https://github.com/openai/codex/issues/47607)
- **Other hook issues:**
  - Hooks fail in Codex Desktop with internal error `ApiIdParam` — [openai/codex#33992](https://github.com/openai/codex/issues/33992)
  - `Stop` hook stdin JSON malformed on Windows with non-ASCII assistant text — [openai/codex#23784](https://github.com/openai/codex/issues/23784)
  - Repo-local `config.toml` hooks not firing in interactive sessions — [openai/codex#17532](https://github.com/openai/codex/issues/17532)

### Inferences
- **End-of-turn reply, but no streaming or questions.** A `Stop` hook (command type; no HTTP hook type is documented for Codex) could forward `session_id`/`turn_id`/`last_assistant_message` to SDC at end of turn in the existing extension session. There is no partial-text hook, and pending questions (`request_user_input`) have no hook.
- **Reliability needs exact-build acceptance.** Activation timing (whether a newly trusted hook takes effect in an already-open thread) is undocumented, and there are open bugs on app surfaces. Treat Codex hooks as "supported in principle, unproven in the VS Code panel" until native acceptance on the exact `openai.chatgpt` build.
- **`session_id` likely equals the thread id.** Codex hook `session_id` is likely the app-server thread id, and `transcript_path` likely the rollout file. Both are **unverified**.

### Gaps
- No official statement that hooks run in `openai.chatgpt` extension sessions.
- No documented reload semantics.
- No documented HTTP hook type.

## Codex `notify` config: payload and applicability to IDE sessions

### Takeaway
`notify` runs an external program at end of turn with one JSON argument. The argument contains `type: "agent-turn-complete"`, `thread-id`, `turn-id`, `cwd`, an optional `client`, `input-messages` and `last-assistant-message`.

Source shows `client` is set from the app-server's `initialize.clientInfo.name`, explicitly so that completions from "app-server clients such as VS Code" can be told apart. `notify` therefore applies to extension turns. However, the source calls it "Legacy notify" with a TODO to remove it.

### Cited Findings
- **Documented payload:** "The script receives a single JSON argument". Fields: `type` ("currently `agent-turn-complete`"), `thread-id`, `turn-id`, `cwd`, `input-messages` and `last-assistant-message`. — [Codex advanced config](https://learn.chatgpt.com/docs/config-file/config-advanced)
- **Source struct and deprecation:** in `codex-rs/hooks/src/legacy_notify.rs`, `UserNotification::AgentTurnComplete { thread_id, turn_id, cwd, client: Option<String>, input_messages, last_assistant_message: Option<String> }` is serialized kebab-case with `tag = "type"`. The process is spawned with stdin/stdout/stderr null. The file says: "// TODO: Remove this hook and its environment plumbing when legacy `notify` support is removed." — [openai/codex legacy_notify.rs](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/legacy_notify.rs)
- **PR #12968, merged 2026-02-27:** "added an optional top-level `client` field... set the field to `codex-tui` for TUI turns... captured `initialize.clientInfo.name` in the app server and applied it to subsequent turns before dispatching hooks". The motivation was to distinguish "completions coming from app-server clients such as VS Code or Xcode". — [openai/codex#12968](https://github.com/openai/codex/pull/12968)
- **The extension's client name:** the app-server docs' example `initialize` uses `clientInfo.name` `"codex_vscode"`, and say app-server is what powers "the Codex VS Code extension". — [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- **`tui.notifications` is a separate, TUI-only mechanism.** It can filter `agent-turn-complete` and `approval-requested`. — [Codex advanced config](https://learn.chatgpt.com/docs/config-file/config-advanced)

### Inferences
- **IDE turns probably arrive with `client` = `codex_vscode`.** Notify for extension-originated turns probably carries `client: "codex_vscode"`; this is **unverified** on the current 26.51007 build.
- **End-of-turn only.** `notify` carries no partial text, approvals or questions.
- **Deprecation risk:** prefer the `Stop` hook over `notify` for new work, given the "legacy" naming and TODO.

### Gaps
- No live capture confirming that `notify` fires for VS Code extension turns on 26.51007.21434.

## Codex app-server protocol and rollout/session files: streaming events, attachability to the extension's session, format stability

### Takeaway
The app-server JSON-RPC protocol carries everything SDC would want for the extension's own UI:

- streaming `item/agentMessage/delta` `{threadId, turnId, itemId, delta}`
- `turn/started` and `turn/completed`
- `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `tool/requestUserInput`
- `thread/status/changed`

These go only to the connection that started or subscribed to the thread. The extension is that client, and the docs don't say how it connects.

Attaching another process would require one of three things:

- the extension's own pipe (private)
- the 0600 app-server daemon "control socket" (private and experimental)
- starting a separate `codex app-server` (a separate runtime)

All three are excluded. Rollout JSONL files are on-disk persistence with no official line schema. The app-server can compress them (`rollout/compress`), which is a risk for passive readers.

### Cited Findings
- **Powers the extension:** "Codex app-server is the interface Codex uses to power rich clients (for example, the Codex VS Code extension)." — [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- **Not for automation:** "If you are automating jobs or running Codex in CI, use the Codex SDK instead." — [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- **Experimental status:** "The app-server command and WebSocket transport are experimental and aren't supported for production workloads." — [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- **Transports:** stdio (default) and WebSocket `--listen ws://` (experimental/unsupported). Unix socket: "Unix socket (`--listen unix://` or `--listen unix://PATH`): WebSocket connections over Codex's default app-server control socket or a custom Unix socket path". — [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- **Subscriptions are per connection:**
  - "`thread/start`... automatically subscribes you to turn/item events for that thread"
  - "`thread/unsubscribe` - unsubscribe this connection"
  - "the server keeps the thread loaded until it has no subscribers and no thread activity for 30 minutes"
  - `thread/loaded/list` and `thread/status/changed` exist

  — [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- **Streaming and turn events:** `item/agentMessage/delta` "appends streamed text for the agent message". `turn/completed` has `{ turn }` with `status` `completed` | `interrupted` | `failed`. — [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- **Delta type:** `AgentMessageDeltaNotification = { threadId: string, turnId: string, itemId: string, delta: string }`. — [openai/codex app-server-protocol schema](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/v2/AgentMessageDeltaNotification.ts)
- **Approvals and questions:**
  - `item/commandExecution/requestApproval` and `item/fileChange/requestApproval` (with `itemId`, `threadId`, `turnId`)
  - `item/permissions/requestApproval`
  - `mcpServer/elicitation/request`
  - `tool/requestUserInput` (experimental)
  - `serverRequest/resolved`

  — [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- **History methods:** `thread/list`, `thread/read`, `thread/resume`, `thread/turns/list` and `thread/items/list` read persisted threads ("persisted JSONL logs, or rollout files"). Experimental methods require `capabilities.experimentalApi: true`. Generated TS/JSON Schema "matches the specific Codex version that generated it". — [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- **Control socket is owner-only:** the unix control socket is bound with `CONTROL_SOCKET_MODE: u32 = 0o600` in a 0700 directory (`bind_private_daemon_socket`). The CLI has `codex app-server proxy`: "Proxy stdio bytes to the running app-server control socket." — [unix_socket.rs](https://github.com/openai/codex/blob/main/codex-rs/app-server-transport/src/transport/unix_socket.rs); [cli/src/main.rs](https://github.com/openai/codex/blob/main/codex-rs/cli/src/main.rs)
- **Daemon purpose and status:** "`codex-app-server-daemon` is experimental and its lifecycle contract may change". It "backs the machine-readable `codex app-server` lifecycle commands used by remote clients such as the desktop and mobile apps". The TUI can implicitly attach to a discovered daemon. — [app-server-daemon README](https://github.com/openai/codex/blob/main/codex-rs/app-server-daemon/README.md)
- **Rollout compression:** the experimental `rollout/compress` method schedules compression of "local rollout storage", and "Clients sharing this Codex home must support compressed rollout files". A `features.local_thread_store_compression` flag and a local state DB (`useStateDbOnly`) also exist. — [app-server README in repo](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- **Extension binary:** the extension uses a bundled executable: "manually overriding the bundled executable can prevent parts of the extension from working". `chatgpt.cliExecutable` is development-only. — [Codex developer settings (IDE)](https://learn.chatgpt.com/docs/developer-settings?surface=ide)
- **History file:** "By default, Codex saves local session transcripts under `CODEX_HOME` (for example, `~/.codex/history.jsonl`)". `[history] persistence = "none"` disables this. — [Codex advanced config](https://learn.chatgpt.com/docs/config-file/config-advanced)
- **OTel:** Codex OTel events include `codex.conversation_starts`, `codex.api_request`, `codex.sse_event`, `codex.user_prompt` (content redacted unless `log_user_prompt`), `codex.tool_decision` and `codex.tool_result`. The page doesn't say whether assistant text is exported. — [Codex advanced config](https://learn.chatgpt.com/docs/config-file/config-advanced)
- **Rollout format sources are third-party only.** Rollout layout (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, `response_item`/`event_msg` records) is described only by third-party blogs, which conflict on compression (`.jsonl` vs `.jsonl.zst`). — [Daniel Vaughan blog (third-party)](https://codex.danielvaughan.com/2026/04/29/codex-cli-rollout-files-session-recording-replay-audit-trails/)

### Inferences
- **No supported way to read the extension's live stream.** The app-server's live events are exactly what SDC needs, but only the extension's own connection receives them. The docs don't say whether the extension uses stdio or the daemon socket; either way, attaching would be a private channel.
- **A separate app-server would be a replacement runtime.** Starting a separate `codex app-server` and `thread/resume`-ing the extension's thread would create a second live owner of the thread. This is the forbidden case, even though the protocol is documented.
- **Rollout tailing is passive but fragile.** It is undocumented internal format, compression can be turned on, and there is a state DB alongside it. Use it only as labeled reconciliation fallback, if at all.

### Gaps
- Not confirmed whether the `openai.chatgpt` extension uses stdio or the shared daemon control socket. Not observed on this machine.
- No official rollout line schema.
- Write cadence of rollout files during a turn is unknown.
- Whether Codex OTel exports assistant text is not documented.

## Classification for ServerDrivenChat (no replacement runtimes, no CLI sessions, no private sockets): supported versus internal, latency, identity, stability, security

### Takeaway
Supported mechanisms that run inside the existing IDE session:

- **Claude Code:** settings hooks (`Stop.last_assistant_message`, `UserPromptSubmit`, `PermissionRequest`/`Notification`/`Elicitation`, possibly `MessageDisplay`); mods (`turn.step` streaming text, `turn.complete.answer`, `$.session.id()`); OpenTelemetry (`assistant_response`, opt-in, batched).
- **Codex:** hooks (`Stop.last_assistant_message`, `UserPromptSubmit`, `PermissionRequest`) and the legacy `notify` (end-of-turn).

Codex has **no supported in-session streaming/partial-text channel available to third parties**. Its streaming lives only in the app-server connection owned by the extension.

Transcript and rollout file reading is passive but uses an undocumented, async format. Everything that starts a process with its own agent loop or attaches to a private channel is excluded.

### Cited Findings
| Mechanism | Surface (VS Code extension) | Reply text | Streaming | Identity | Turn start/finish | Pending perm/question | Status / stability | SDC class |
|---|---|---|---|---|---|---|---|---|
| Claude `Stop`/`SubagentStop` hooks (command or HTTP) | Fires in IDE extensions ([hooks](https://code.claude.com/docs/en/hooks)) | `last_assistant_message` (v2.1.47+, [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)) | End of turn | `session_id`, `prompt_id`, `transcript_path` | `UserPromptSubmit` / `Stop` / `StopFailure` (no `Stop` on interrupt) | `PermissionRequest`, `Notification` (`permission_prompt` ~6 s delayed under VS Code), `Elicitation` | Documented, GA settings hooks | Allowed (in-session, official) |
| Claude `MessageDisplay` hook | Hooks fire in IDE; incremental behavior there unverified | `delta` lines | Line-batched in terminal; once per message in `-p`/SDK hosts ([hooks](https://code.claude.com/docs/en/hooks)) | `turn_id`, `message_id` | n/a | n/a | Documented (v2.1.152+) | Allowed; streaming in panel unverified |
| Claude mods (`turn.*`, `session.append`, `$.session`) | "Hooks run: Yes" in VS Code panel ([overview](https://code.claude.com/docs/en/plugins/mods/overview)) | `turn.complete.answer`; `$.session.messages()` | `turn.step` text chunks | `turnId`, `$.session.id()`, `agentId` | `turn.start` / `turn.complete` (`isAborted`, `reason`) | Indirect (`tool.check` `ask`, `classic.*`) | Documented but types "EARLY ACCESS" ([d.ts](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts)) | Allowed (in-process plugin of existing app); pin version |
| Claude OTel `claude_code.assistant_response` | `app.entrypoint` `claude-vscode` ([monitoring](https://code.claude.com/docs/en/monitoring-usage)) | Text blocks (opt-in env) | No; 5 s batches | `session.id`, `prompt.id` | `user_prompt` events | `tool_decision` | Documented | Allowed (passive export); needs collector |
| Claude transcript JSONL | Shared history ([VS Code](https://code.claude.com/docs/en/vs-code)) | Full transcript | No; async writes may lag ([hooks](https://code.claude.com/docs/en/hooks)) | Session UUID = filename | Derivable | Derivable | Location documented, schema not ([.claude dir](https://code.claude.com/docs/en/claude-directory)) | Passive fallback only |
| Claude `-p --output-format stream-json`, Agent SDK `query()`, `--resume` | New process ([headless](https://code.claude.com/docs/en/headless)) | Yes | Token deltas | Own session | Yes | Own | Documented | **Excluded** (separate runtime; second opener) |
| Codex `Stop`/`SubagentStop` hooks | Shared config layers ([IDE settings](https://learn.chatgpt.com/docs/developer-settings?surface=ide)); app-server emits `hook/*` ([app-server](https://learn.chatgpt.com/docs/app-server)) | `last_assistant_message` (`string \| null`) | End of turn | `session_id`, `turn_id`, `transcript_path` | `UserPromptSubmit` / `Stop` / `Interrupt` | `PermissionRequest` only; no question/notification hook ([hooks](https://learn.chatgpt.com/docs/hooks)) | Documented; trust-by-hash; open IDE/app bugs ([#21723](https://github.com/openai/codex/issues/21723), [#47607](https://github.com/openai/codex/issues/47607)) | Allowed in principle; needs native acceptance |
| Codex `notify` | App-server turns include `client` ([PR #12968](https://github.com/openai/codex/pull/12968)) | `last-assistant-message` | End of turn | `thread-id`, `turn-id`, `client` | Completion only | None | "Legacy", TODO remove ([legacy_notify.rs](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/legacy_notify.rs)) | Allowed but deprecated |
| Codex app-server events (`item/agentMessage/delta` etc.) | Owned by extension's connection | Yes | Token deltas | `threadId`/`turnId`/`itemId` | `turn/started` / `turn/completed` | `*/requestApproval`, `tool/requestUserInput` | Experimental, version-specific ([app-server](https://learn.chatgpt.com/docs/app-server)) | **Excluded** (private pipe or 0600 daemon socket, or separate app-server runtime) |
| Codex rollout JSONL / `history.jsonl` | Shared `CODEX_HOME` | Yes (internal records) | Unknown cadence | Thread id in file | Derivable | Derivable | Undocumented schema; optional compression ([README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)) | Passive fallback only, fragile |
| Codex `exec --json`, Codex SDK, `codex --remote`, `app-server proxy` | New process or attach to daemon socket | Yes | Yes | Own | Own | Own | Documented/experimental | **Excluded** |

- **Security notes:**
  - **Claude mods** run unsandboxed with user permissions and can approve tool calls. — [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)
  - **Claude transcripts** are plaintext and may contain secrets. — [.claude directory](https://code.claude.com/docs/en/claude-directory)
  - **Claude policy kill-switches:** organization settings `allowManagedHooksOnly`, `allowManagedModsOnly` and `disableAllHooks` can silently disable these channels. — [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference)
  - **Codex hooks** need hash-based trust review and can be enterprise-managed. — [Codex hooks](https://learn.chatgpt.com/docs/hooks)

### Inferences
- **Claude Code.** A sound SDC design for observing replies is a mod (stream + `turn.complete` + `turnId`/session id), with a settings `Stop` HTTP hook as a simpler, more stable end-of-turn fallback. Fence `$.prompt.submit` separately. Transcript reading and OTel are reconciliation aids only.
- **Codex.** Only end-of-turn text is obtainable through supported means (the `Stop` hook, or deprecated `notify`). Live streaming and pending-approval state would require the extension-owned app-server channel, which SDC's rules forbid. This is consistent with AGENTS.md keeping Codex drivers blocked.
- **Both.** Every mechanism above is version-sensitive. Acceptance must pin the exact extension build: Claude 2.1.300 and Codex 26.51007.21434 as of 2026-10-15.

### Gaps
- No terms-of-service text specific to hooks, mods or extension integration was found or reviewed. Both vendors document these as user-facing customization features; SDC should still review the applicable usage policies separately.
- No live capture on this machine for any Codex mechanism, or for Claude's mods or `MessageDisplay` in the VS Code panel. All "in VS Code panel" claims beyond the vendors' general statements and this project's 2.1.296 classic-hook test are unverified.
