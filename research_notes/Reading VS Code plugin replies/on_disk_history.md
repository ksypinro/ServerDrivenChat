# On-disk conversation/task history of VS Code AI coding plugins: can an external process reliably read assistant replies by watching files?

Research date: 2026-10-15. Most findings come from reading pinned upstream source. Source snapshots (shallow clones, read only, never built or run):

| Project | Repo @ commit (commit date) | Version in tree |
|---|---|---|
| Cline, current/"next" SDK bundle | cline/cline@789f79e (2026-10-14) | `apps/vscode` 4.1.24 |
| Cline, legacy bundle | cline/cline branch `legacy-extension`@7761370 (2026-08-18) | `apps/vscode` 4.0.12 (=3.89.2 code) |
| Roo Code | RooCodeInc/Roo-Code@b867ec9 (2026-05-15, **archived**) | 3.53.0 |
| Kilo Code | Kilo-Org/kilocode@a72ad30 (2026-10-14) | `kilo-vscode` 7.8.10 |
| Continue | continuedev/continue@5522c6f (main HEAD 2026-07-20) | `extensions/vscode` 1.3.40 |
| VS Code (chat storage, now hosts Copilot Chat) | microsoft/vscode@1220a0f (2026-10-14) | main |
| Copilot Chat (old repo) | microsoft/vscode-copilot-chat@5863f5a (**archived**) | — |
| Codex | openai/codex@4ca84a1 (2026-10-15); latest release rust-v0.162.1 (2026-10-09) | — |

"Local structural inspection" below means file names, permission bits and JSON key names checked on this Mac on 2026-10-15. No conversation content was read or copied. Claude Code 2.1.295 was observed there.

---

## Q1. Where each plugin persists conversations, and in what format

### Takeaway
No plugin keeps one stable "chat log" file. Cline ships two storage layouts in the same VSIX, and a remote rollout flag picks one per window. Kilo Code moved to SQLite. Roo Code is frozen because it was archived. VS Code/Copilot has changed format three times. Claude Code and Codex use append-only JSONL under the user's home directory, and their layouts are the most stable of the set.

### Cited Findings

**Cline (`saoudrizwan.claude-dev`), 4.1.x: two concurrent layouts**
- Since 4.1.0, the stable VSIX has been "a combined A/B package: one VSIX containing both the current (legacy) extension and the new SDK-based extension, plus a loader that activates exactly one per window via a staged remote rollout… (starting at 1%)." — [Cline CHANGELOG 4.1.0](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/CHANGELOG.md#L443)
- The loader reads a cached cohort assignment per window. The single PostHog flag `ext-sdk-bundle-rollout` promotes or demotes "on the next reload". The README states the known demotion cost: "tasks created on the SDK bundle are stored as SDK sessions the legacy bundle doesn't list." — [apps/vscode-rollout/README.md](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode-rollout/README.md#L51)
- Related history: 4.0.0 introduced the SDK runtime ([CHANGELOG L559](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/CHANGELOG.md#L559)). 4.0.1 rolled stable back to the 3.89.2 code ([L553](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/CHANGELOG.md#L553)). Releases 4.1.10 and later describe fixes as landing "through the SDK bundle… not the legacy one" ([CHANGELOG](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/CHANGELOG.md#L271)).
- *Legacy bundle layout.* The task root is VS Code's `context.globalStorageUri.fsPath` ([extension.ts L645](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/extension.ts#L645)). On macOS that is `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/`. Each task gets `tasks/<taskId>/ui_messages.json`, `api_conversation_history.json`, `context_history.json`, `task_metadata.json` and `settings.json`, and the index is `state/taskHistory.json`. — [legacy disk.ts GlobalFileNames](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/core/storage/disk.ts#L48)
- *`ui_messages.json` schema (legacy).* It is a JSON array of `ClineMessage {ts, type:"ask"|"say", ask?, say?, text?, reasoning?, images?, files?, partial?, conversationHistoryIndex?, modelInfo?…}` — [ExtensionMessage.ts L123](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/shared/ExtensionMessage.ts#L123).
  - `ClineAsk` values: `followup`, `plan_mode_respond`, `act_mode_respond`, `command`, `command_output`, `completion_result`, `tool`, `api_req_failed`, `resume_task`, `resume_completed_task`, `mistake_limit_reached`, `browser_action_launch`, `use_mcp_server`, `new_task`, `condense`, `summarize_task`, `report_bug`, `use_subagents`.
  - `ClineSay` values include `task`, `error`, `api_req_started`, `api_req_finished`, `text`, `reasoning`, `completion_result`, `user_feedback`, `command`, `command_output`, `tool`, `checkpoint_created`, `info`, `task_progress`, `hook_status`, `subagent` and others.
  - Source: [ExtensionMessage.ts L142–L200](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/shared/ExtensionMessage.ts#L142)
- *Settings/secrets moved to `~/.cline/data`.* A one-time migration moves VS Code memento state and secrets into file-backed stores in `~/.cline/data/` (`globalState.json`, `secrets.json`, `workspaceState`). The code comment says task history and task data were *not* moved: "TODO: Migrate taskHistory.json and task data files ({globalStorageFsPath}/tasks/) to ~/.cline/data/". — [vscode-to-file-migration.ts L1–L33](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/hosts/vscode/vscode-to-file-migration.ts#L30)
- *SDK ("next") bundle layout.* Sessions go under `resolveSessionDataDir()` = `$CLINE_SESSION_DATA_DIR` or `<CLINE_DATA_DIR | ~/.cline/data>/sessions`. The SQLite index is `resolveDbDataDir()` = `~/.cline/data/db`. — [sdk shared/storage/paths.ts L186–L253](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/shared/src/storage/paths.ts#L194). The index database is `sessions.db` ([sqlite-session-store.ts L45](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/core/src/services/storage/sqlite-session-store.ts#L45)).
  - Each session has `sessions/<id>/<id>.json` (manifest), `<id>.messages.json` and `<id>.compaction.json`; subagents have their own `*.messages.json`. — [session-artifacts.ts](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/core/src/services/session-artifacts.ts#L75)
  - The SDK bundle reads old `tasks/<id>/ui_messages.json` only through a "legacy-state-reader" ("Reads on-disk state written in the pre-SDK storage format"). I found no SDK-bundle code path that writes `ui_messages.json` for new tasks. — [legacy-state-reader.ts](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/sdk/legacy-state-reader.ts#L1)
- *Local structural inspection.* This Mac has `~/.cline/data/{globalState.json, secrets.json, sessions/, db/, settings/, workspaces/…}`. Session folders are named like `1791166408508_7s9ly`, which looks like epoch milliseconds plus a random suffix, and each holds `<id>.json` and `<id>.messages.json`. `db/` holds `sessions.db`, `sessions.db-wal` and `sessions.db-shm` (SQLite in WAL mode).
  - `messages.json` top-level keys: `agent, messages, origin, sessionId, system_prompt, updated_at, version`. Each message has `content, id, metrics, modelInfo, role, ts`, with provider-style content blocks such as `thinking` and `text`. These are LLM messages, not UI `say`/`ask` rows.
  - Manifest keys include `cwd, workspace_root, status, pid, started_at, ended_at, messages_path, model, provider, source`.
  - Source: [Local structural inspection, 2026-10-15](file:///Users/samin/.cline/data/sessions)

**Roo Code (`RooVeterinaryInc.roo-cline`): archived**
- The repository is archived; the GitHub API reports `archived: true` and a last push on 2026-05-15 ([GitHub API repos/RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code)). Third-party reports say the shutdown was announced in April 2026 and recommend migrating to Cline or Kilo ([kilo.ai Roo shutdown page](https://kilo.ai/compare/roo-code-shutdown-roomote); [rywalker research](https://rywalker.com/research/roo-code)). The announcement date is unverified: secondary sources give 2026-04-20 or 2026-04-21.
- Layout is inherited from Cline: `globalStorage/tasks/<taskId>/ui_messages.json` (`ClineMessage[]`) plus `api_conversation_history.json`, `task_metadata.json` and a per-task `history_item.json`. A `tasks/_index.json` cache is rewritten with a 2 s debounce. Storage can be moved with the `roo-cline.customStoragePath` setting. — [taskMessages.ts L52](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/core/task-persistence/taskMessages.ts#L52); [TaskHistoryStore.ts L24, L62](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/core/task-persistence/TaskHistoryStore.ts#L62); [utils/storage.ts](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/utils/storage.ts#L16)

**Kilo Code (`kilocode.kilo-code`) 7.x: rebuilt on OpenCode, SQLite storage**
- The rebuilt extension went GA on 2026-04-02. It is "built on OpenCode server" and shares its engine with the Kilo CLI and Cloud Agents. — [Kilo blog: New Kilo for VS Code is live](https://blog.kilo.ai/p/new-kilo-for-vs-code-is-live)
- The extension spawns a private local server, `kilo serve --port 0`. — [server-manager.ts L129](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/kilo-vscode/src/services/cli-backend/server-manager.ts#L129)
- Sessions and messages live in SQLite at `<xdgData>/kilo/kilo.db`, with channel builds using `kilo-<channel>.db`. Through `xdg-basedir` that is typically `~/.local/share/kilo/kilo.db`, even on macOS (inferred from the library default). The database runs `PRAGMA journal_mode = WAL`. — [storage/db.ts L35, L110](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/opencode/src/storage/db.ts#L35); [core/src/global.ts L12–L22](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/core/src/global.ts#L12)
- The extension contains a legacy migrator that scans old v5-style `ui_messages.json` / `api_conversation_history.json` task folders and a Roo importer. — [legacy-migration/task-store.ts](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/kilo-vscode/src/legacy-migration/task-store.ts#L1)

**Continue (`Continue.continue`)**
- Sessions are stored as `~/.continue/sessions/<sessionId>.json`, with the list index in `~/.continue/sessions/sessions.json`. The global directory can be overridden with `CONTINUE_GLOBAL_DIR`; this override is inferred from `getContinueGlobalPath` and not separately verified. — [core/util/paths.ts L78–L111](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/util/paths.ts#L102)
- Each file is pretty-printed JSON `{sessionId, title, workspaceDirectory, history, mode?, chatModelTitle?, usage?}`. — [core/util/history.ts L111–L134](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/util/history.ts#L111)

**GitHub Copilot Chat (storage implemented in VS Code core)**
- The Copilot Chat extension repo is archived and "has been moved into the main VS Code repository". — [vscode-copilot-chat README](https://github.com/microsoft/vscode-copilot-chat/blob/5863f5a7088958050792b5dccbe8b46c6e13eccc/README.md)
- Local chat sessions are stored per workspace in `workspaceStorage/<workspaceId>/chatSessions/`. Empty windows use `globalStorage/emptyWindowChatSessions`. The session index is not a file; it lives in VS Code's storage database under the key `chat.ChatSessionStore.index`. — [chatSessionStore.ts L39, L72–L76](https://github.com/microsoft/vscode/blob/1220a0f4e53fb3376fcbc51f11df3f5919ab32fa/src/vs/workbench/contrib/chat/common/model/chatSessionStore.ts#L72)
- Current format (when `chat.useLogSessionStorage` is not `false`, the default) is `<sessionId>.jsonl`, an "object mutation log":
  - The first line is `{kind:0 (Initial), v:<full state>}`. Later lines are `{kind:1 Set, k:path, v}`, `{kind:2 Push, k, v[], i?}` or `{kind:3 Delete, k}`.
  - The log is rewritten from a fresh `Initial` once it exceeds 512 entries.
  - If the log is turned off, the old flat `<sessionId>.json` is used.
  - Sources: [chatSessionStore.ts L349–L395, L740](https://github.com/microsoft/vscode/blob/1220a0f4e53fb3376fcbc51f11df3f5919ab32fa/src/vs/workbench/contrib/chat/common/model/chatSessionStore.ts#L349); [objectMutationLog.ts L195–L216, L315, L413](https://github.com/microsoft/vscode/blob/1220a0f4e53fb3376fcbc51f11df3f5919ab32fa/src/vs/workbench/contrib/chat/common/model/objectMutationLog.ts#L195)
- Copilot CLI background-agent sessions are separate. They live at `~/.copilot/session-state/<id>/events.jsonl`, and the Copilot extension *itself* watches `**/*.jsonl` there with a file-system watcher. — [copilotcliSessionService.ts L238–L250](https://github.com/microsoft/vscode-copilot-chat/blob/5863f5a7088958050792b5dccbe8b46c6e13eccc/src/extension/chatSessions/copilotcli/node/copilotcliSessionService.ts#L238)

**Claude Code (CLI and VS Code extension)**
- Official docs list `~/.claude/projects/<project>/<session>.jsonl` as the "Full conversation transcript: every message, tool call, and tool result". The same table lists set-aside copies (`.orphaned-<ts>-<suffix>.jsonl`, `.jsonl.superseded-<ts>`), `<session>/subagents/` transcripts and `<session>/tool-results/` spill files. `~/.claude/history.jsonl` holds every typed prompt. — [Claude Code docs: Explore the .claude directory, "Application data"](https://code.claude.com/docs/en/claude-directory)
- The VS Code extension writes the same files. Issue #79118 (Claude Code 2.1.215, VS Code native extension, macOS) reported that the extension created the expected `~/.claude/projects/<slug>/<session>.jsonl` but wrote no `user`/`assistant` lines into it. It was closed as fixed on 2026-07-19. — [claudeissues mirror of anthropics/claude-code#79118](https://claudeissues.com/issue/79118-vs-code-extension-conversation-content-never-persisted-to-session-file-no-conver)
- Local structural inspection of one 2.1.295 transcript (entrypoint `claude-desktop`):
  - Line `type` values: `user`, `assistant`, `system`, `attachment`, `queue-operation`, `last-prompt`, `custom-title`, `agent-name`, `file-history-snapshot`, `atis-latch`.
  - Every `assistant` line carried exactly one content block (`thinking`, `text` or `tool_use`). Several lines shared one `message.id`; per-id counts were 1–6.
  - Assistant lines carry `uuid`, `parentUuid`, `sessionId`, `requestId`, `apiBlockIndex`, `version`, `cwd`, `gitBranch`, `isSidechain` and `timestamp`.
  - Source: [Local structural inspection, 2026-10-15](file:///Users/samin/.claude/projects)

**Codex (CLI, app-server and VS Code extension `openai.chatgpt`)**
- Rollouts are written under `$CODEX_HOME/sessions` (`SESSIONS_SUBDIR`), with `archived_sessions` beside it. Files are JSONL; each line has a `timestamp`, an ordinal and an item. — [rollout/src/lib.rs L86](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/rollout/src/lib.rs#L86); [recorder.rs L2095–L2112](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/rollout/src/recorder.rs#L2107)
- Line types seen by a third-party parser (Cline's own Codex importer): `session_meta`, `turn_context`, `event_msg` (for example `user_message`), `response_item` (`message` with role `assistant`/`user`) and `compacted`. The same importer reads `session_index.jsonl` for `thread_name`. — [cline sdk session-import/codex.ts L112–L182](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/core/src/services/session-import/codex.ts#L112)
- Cold rollouts are compressed in the background to `.jsonl.zst` and materialized back to plain `.jsonl` when appended to. — [rollout/src/compression.rs L52–L121](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/rollout/src/compression.rs#L57)
- Codex also keeps SQLite stores, including `state_5.sqlite` and `thread_history_1.sqlite`. It has two thread history modes, `Legacy` (default) and `Paginated`. — [state/src/sqlite.rs L34–L39](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/state/src/sqlite.rs#L38); [protocol.rs L883](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/protocol/src/protocol.rs#L883)
- `history.jsonl` holds user prompts, not replies. Config: "`history.persistence` (`save-all | none`): Control whether Codex saves session transcripts to history.jsonl"; `history.max_bytes` caps its size. — [Codex config reference](https://learn.chatgpt.com/docs/config-file/config-reference); [message-history/src/lib.rs L52](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/message-history/src/lib.rs#L52)
- The documented app-server "powers rich clients (for example, the Codex VS Code extension)", so the extension's sessions go through the same core rollout recorder. — [Codex App Server docs](https://developers.openai.com/codex/app-server)

### Inferences
- **Cline:** for one installed Cline 4.1.x, a watcher must handle both layouts: legacy `globalStorage/.../tasks/<id>/ui_messages.json` and SDK `~/.cline/data/sessions/<id>/<id>.messages.json`. Which one is active can change per window on reload, driven by a remote flag the user doesn't control.
- **ServerDrivenChat's pin:** whether the project's maintained Cline 4.1.2204 fork runs the legacy or SDK bundle has to be confirmed from its own evidence. It could not be determined from upstream source.
- **Codex:** the extension shares `~/.codex` with the CLI, so a file watcher cannot tell which rollouts came from the IDE without parsing `session_meta`.

### Gaps
- Kilo's exact table schema and session-ID format were not inspected in detail. Its migrations are bundled through `KILO_MIGRATIONS`.
- How VS Code derives the `workspaceId` hash was not traced in source. Issue #305818 only says it is "derived from the workspace folder URI".
- I did not verify which VS Code release first shipped the `.jsonl` log. The commit is 2026-01-13 (#286644), which would place it around 1.109 by release cadence; that is an inference.

---

## Q2. Latency: when are files written during a turn, and are streaming partials persisted?

### Takeaway
Write timing ranges from about every 40 ms (legacy Cline rewrites the whole file on each streamed UI update) down to once a minute or only at window close (VS Code/Copilot). Only legacy Cline persists every partial text update. Roo persists the first chunk and the final message. Kilo, the Cline SDK bundle, Continue, Claude Code and Codex persist complete items only.

### Cited Findings
- **Cline, legacy bundle.** During streaming, `say(..., partial=true)` on an existing partial message calls `messageStateHandler.updateClineMessage()`. That method mutates the message and then runs `saveClineMessagesAndUpdateHistoryInternal()` ("Save changes and update history"), which rewrites `ui_messages.json` and updates the task-history item, including a recursive folder-size scan. — [legacy task/index.ts say() L969–L1060](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/core/task/index.ts#L969); [message-state.ts L120–L170, L239–L262](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/core/task/message-state.ts#L239)
- **Cline, legacy cadence.** Streamed content is presented by a scheduler whose default cadence is 40 ms locally and 90 ms in remote workspaces; the "immediate" priority uses 0 ms. — [latency.ts L53–L66](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/core/task/latency.ts#L65)
- **Cline, SDK bundle.** Session messages are persisted when an agent event of type `iteration_end` arrives for the primary agent (`persistMessages(sessionId, agent.getMessages())`). The write is fire-and-forget. Text deltas are not persisted. — [agent-events.ts L312–L318](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/core/src/services/agent-events.ts#L312); [local-runtime-host.ts L358–L375](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/core/src/runtime/host/local-runtime-host.ts#L358). UI messages (`ClineMessage`, with `partial` flags) stay in memory and go to the webview over gRPC. `finalizeMessagesForSave` strips `partial` only when a task is cleared. — [sdk-message-coordinator.ts](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/sdk/sdk-message-coordinator.ts#L110)
- **Roo Code.** An existing partial message is updated in memory and posted to the webview (`this.updateClineMessage(lastMessage)`) without a disk write. A *new* partial message goes through `addToClineMessages`, which saves. Completion (`partial=false`) also saves: "Instead of streaming partialMessage events, we do a save and post like normal to persist to disk." — [Task.ts say() ~L1714–L1790](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/core/task/Task.ts#L1714); [Task.ts addToClineMessages/saveClineMessages ~L1140–L1172](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/core/task/Task.ts#L1166)
- **Kilo Code 7.** `text-start` persists an empty text part. `text-delta` only publishes a `PartDelta` event on the bus/SSE, with no database write. `text-end` persists the full text part. — [session/processor.ts L770–L800](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/opencode/src/session/processor.ts#L779); [session/session.ts updatePartDelta L1081–L1089](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/opencode/src/session/session.ts#L1081)
- **Continue.** `streamThunkWrapper` awaits the whole stream (`await runStream()`) and only then dispatches `saveCurrentSession`, which reaches core `history/save` and then `HistoryManager.save()`. Other saves happen on UI actions such as switching tabs or sessions. — [streamThunkWrapper.tsx L27–L35](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/gui/src/redux/thunks/streamThunkWrapper.tsx#L27); [core.ts history/save](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/core.ts#L319)
- **VS Code / Copilot Chat.** `ChatService` stores live local sessions only from `storageService.onWillSaveState(() => this.saveState())`, when a model is disposed, or after a title change. — [chatServiceImpl.ts L355–L364, L394, L437–L458, L512](https://github.com/microsoft/vscode/blob/1220a0f4e53fb3376fcbc51f11df3f5919ab32fa/src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L394). The storage service's flush is `DEFAULT_FLUSH_INTERVAL = 60 * 1000 // every minute`, scheduled through `runWhenGlobalIdle`; shutdown also flushes. — [platform/storage/common/storage.ts L336–L386](https://github.com/microsoft/vscode/blob/1220a0f4e53fb3376fcbc51f11df3f5919ab32fa/src/vs/platform/storage/common/storage.ts#L336)
- **Claude Code.** "The Claude Code subprocess always writes each batch of transcript entries to local disk first", and `SessionStore.append` is called "After each batch of transcript entries is written locally". — [Agent SDK: Persist sessions to external storage](https://code.claude.com/docs/en/agent-sdk/session-storage). Local inspection showed one complete content block per assistant line and no token-level partial lines ([Local structural inspection](file:///Users/samin/.claude/projects)).
  - Issue #74340 (macOS desktop app; opened 2026-07-05, closed "not planned" 2026-09-14) reports that the `Stop` hook can fire before the final assistant message is written to `transcript_path`. The message appeared "a couple of seconds later". The reporter switched to the Stop input's `last_assistant_message` field, which they say is undocumented. — [claudeissues mirror #74340](https://claudeissues.com/issue/74340-stop-hook-fires-before-the-final-assistant-message-is-flushed-to-the-transcript)
- **Codex.** Persistence policy drops `AgentMessageContentDelta`, `ReasoningContentDelta`, `ReasoningRawContentDelta`, `PlanDelta` and `ExecCommandOutputDelta`. It keeps complete `ItemCompleted`, `AgentMessage` (legacy mode) and `TurnComplete`. — [rollout/src/policy.rs L128–L224](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/rollout/src/policy.rs#L215). Each `AddItems` command triggers `flush_if_materialized()`: one `write_all` and `flush` per line once the file exists. New rollouts are "deferred" until first materialized. — [recorder.rs L1787–L1825, L1959–L1961, L2107–L2112](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/rollout/src/recorder.rs#L1959)

### Inferences
- **Fastest final text:**
  - Legacy Cline: within tens of ms of each UI update. The final `say:"text"` or `ask:"completion_result"` shows up as `partial` changing to false or absent.
  - Codex: shortly after the item completes.
  - Kilo: at `text-end`.
  - Claude Code: per completed block, but with a reported lag of seconds relative to hooks.
- **Slower final text:**
  - Cline SDK bundle: at `iteration_end`, which can come after tool execution in that iteration.
  - Continue: at end of stream.
  - VS Code/Copilot: anywhere from a few seconds to a minute or more after the reply, depending on idle flush, and possibly only when the window or session closes.
- **"Reply finished" signals differ by plugin:**
  - Cline legacy: `api_req_started` JSON gains `cost`, and a `completion_result` ask appears.
  - Codex: `TurnComplete`.
  - Claude Code: `stop_reason` on the line plus the following `user`/`system` line.
  - Copilot: the response object's completion state inside the mutation log; I did not verify the field name.
- **VS Code partial snapshots:** because writes are periodic snapshots, a flush that happens mid-stream may persist an incomplete response that a later flush completes. This follows from the snapshot design and was not directly observed.

### Gaps
- No primary measurement of end-to-end disk latency was made for any plugin; no tests were run.
- I did not confirm the exact field name of VS Code's response completion state, or whether Claude Code currently documents `last_assistant_message` in its hooks reference.

---

## Q3. Atomicity: whole-file rewrites vs appends, and the risk of torn reads

### Takeaway
Three styles exist:
- Atomic replace via temp file and rename: legacy Cline, Roo (with a missing-file window).
- Non-atomic in-place rewrites, where torn JSON is possible: Cline SDK `messages.json`, Continue, VS Code log compaction.
- Appended JSONL, where a trailing partial line is possible: Claude Code, Codex, VS Code.

A reader therefore needs retry-on-parse-failure, and for JSONL it must hold back an incomplete last line.

### Cited Findings
- **Legacy Cline.** `atomicWriteFile` writes `<file>.tmp.<ts>.<rand>.json` and then calls `fs.rename(tmp, file)` ("atomic in most cases"). It is used for both `ui_messages.json` and `api_conversation_history.json`. — [legacy disk.ts L34–L46, L282–L339](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/core/storage/disk.ts#L34)
- **Cline SDK bundle.** `persistSessionMessages` calls `writeFileSync(path, contents)` directly on `<id>.messages.json`, rewriting the whole JSON in place, and the manifest is written the same way. The SDK does have a `writeFileAtomic` helper (temp, fsync, rename), but this path doesn't use it. — [session-manifest-store.ts L114, L220–L245](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/core/src/session/stores/session-manifest-store.ts#L220); [atomic-file.ts](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/core/src/session/stores/atomic-file.ts#L23). Legacy task `settings.json` and `task_metadata.json` also use plain `fs.writeFile` ([current disk.ts](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/core/storage/disk.ts#L176)).
- **Roo Code.** `safeWriteJson` takes a `proper-lockfile` advisory lock and streams to a temp file. Step 2: "If the target file exists… rename it to a backup path". Step 3: "Rename the new temporary file to the target file path". It then deletes the backup. — [safeWriteJson.ts L20–L35, L94–L125](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/utils/safeWriteJson.ts#L94)
- **Continue.** `fs.writeFileSync(getSessionFilePath(id), JSON.stringify(...))`, then a read-modify-write of `sessions.json` with `writeFileSync`. — [history.ts L131–L180](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/util/history.ts#L131)
- **VS Code.** `writeSession` calls `fileService.writeFile(log, data, { append: op === 'append' })`. Compaction or the first write uses `op:'replace'` and rewrites the whole file. No `atomic` option is passed. — [chatSessionStore.ts L386–L395](https://github.com/microsoft/vscode/blob/1220a0f4e53fb3376fcbc51f11df3f5919ab32fa/src/vs/workbench/contrib/chat/common/model/chatSessionStore.ts#L386); [objectMutationLog.ts L405–L420](https://github.com/microsoft/vscode/blob/1220a0f4e53fb3376fcbc51f11df3f5919ab32fa/src/vs/workbench/contrib/chat/common/model/objectMutationLog.ts#L413)
- **Codex.** Files are opened in append mode and each line is written with `write_all(json + "\n")` followed by `flush()`. Compression moves a rollout between `.jsonl` and `.jsonl.zst`. Readers in Codex itself retry when "the requested path disappears during a representation transition". — [recorder.rs L1773–L1775, L2107–L2112](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/rollout/src/recorder.rs#L2107); [compression.rs L69–L121](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/rollout/src/compression.rs#L69)
- **Claude Code.** Transcripts are append-only batches. When it cannot continue a transcript it sets the old one aside "instead of overwriting or deleting it" (`.orphaned-*`, `.superseded-*`). — [claude-directory docs](https://code.claude.com/docs/en/claude-directory)
- **Kilo.** SQLite in WAL mode with `synchronous = NORMAL`. — [db.ts L110–L111](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/opencode/src/storage/db.ts#L110)

### Inferences
- **Legacy Cline and Roo:** readers never see half-written JSON. On Roo, a read between steps 2 and 3 can get ENOENT.
- **Inode replacement:** for both, every save replaces the file's inode, so a watch on the file itself goes dead (see Q6).
- **Cline SDK, Continue and VS Code compaction:** readers can get truncated or partial JSON and must retry. For VS Code, a torn file can be any `.jsonl` mid-compaction, or a trailing partial line in append mode.
- **JSONL readers (Claude Code, Codex, VS Code):** track byte offsets, buffer an incomplete final line, and detect when the file is truncated or rewritten: the size drops, or the first line becomes a new `Initial`/`session_meta`. Codex also needs handling for `.zst` transitions.

### Gaps
- Whether Claude Code writes each batch with a single `write()` call, which bounds partial-line exposure, is not documented; I did not verify it in source because Claude Code's CLI is closed source.

---

## Q4. Identity: mapping the conversation open in the UI to a file

### Takeaway
Files are keyed by plugin-internal IDs: Cline task/session IDs, VS Code workspace hash plus session UUID, Claude session UUID, Codex thread UUID. None of the stores marks which conversation is open in a given IDE window. An external process has to guess, for example by most recent mtime plus the workspace `cwd`, unless a documented interface supplies the ID.

### Cited Findings
- **Cline legacy.** The folder name is the task ID, and `state/taskHistory.json` holds `HistoryItem {id, ulid, ts, task, tokensIn/Out, totalCost, size, cwdOnTaskInitialization, modelId…}`, updated on every save. — [message-state.ts L120–L165](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/core/task/message-state.ts#L120)
- **Cline SDK.** Manifests carry `session_id, cwd, workspace_root, pid, status, started_at, ended_at` (local inspection), and a SQLite `sessions.db` index sits alongside. History in the SDK bundle also merges Cline Cloud sessions (`ses-…` IDs) that are "not the local SDK store". — [sdk-task-history.ts L46–L58](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/sdk/sdk-task-history.ts#L46); [Local structural inspection](file:///Users/samin/.cline/data/sessions)
- **VS Code / Copilot.** The path is `workspaceStorage/<workspaceId>/chatSessions/<sessionId>.jsonl`, and the index lives in the storage database, not in a file. Issue #305818 (open, Backlog) reports that moving or renaming a folder "creates a new hash on next open" and orphans earlier sessions. It also says each `workspace.json` stores the original folder URI. — [chatSessionStore.ts L39, L73](https://github.com/microsoft/vscode/blob/1220a0f4e53fb3376fcbc51f11df3f5919ab32fa/src/vs/workbench/contrib/chat/common/model/chatSessionStore.ts#L73); [microsoft/vscode#305818](https://github.com/microsoft/vscode/issues/305818)
- **VS Code public API.** No public API exposes other participants' chat history: `ChatContext.history` contains "only chat messages for the current participant". — [vscode.d.ts L19673–L19678](https://github.com/microsoft/vscode/blob/1220a0f4e53fb3376fcbc51f11df3f5919ab32fa/src/vscode-dts/vscode.d.ts#L19673)
- **Claude Code.** `projectKey` is "a stable, filesystem-safe encoding of the working directory", overridable via `CLAUDE_CODE_PROJECT_DIR_NAME` (Agent SDK v0.3.234+), and `sessionId` is a UUID. — [Agent SDK session storage](https://code.claude.com/docs/en/agent-sdk/session-storage). The docs describe the scratchpad's `<project>` as "your working directory path with every character other than letters and digits replaced by `-`" ([claude-directory](https://code.claude.com/docs/en/claude-directory)); the observed projects folder `-Users-samin-Documents-ServerDrivenChat` matches that scheme. Hooks receive `session_id` and `transcript_path` in their input ([Claude Code hooks reference](https://docs.claude.com/en/docs/claude-code/hooks)).
- **Codex.** Rollout files are named `rollout-<local timestamp>-<thread UUID>.jsonl` under `sessions/YYYY/MM/DD/` (observed locally, e.g. `rollout-2026-04-29T22-02-41-019dd9fa-….jsonl`). `session_index.jsonl` maps IDs to `thread_name` ([cline importer codex.ts L168–L182](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/core/src/services/session-import/codex.ts#L168)). The app-server's `thread/read` reads a stored thread by ID ([Codex App Server docs](https://developers.openai.com/codex/app-server)).
- **Continue.** `sessions.json` lists `{sessionId, title, workspaceDirectory, dateCreated}`. — [history.ts](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/util/history.ts#L131)

### Inferences
- **Heuristic failure modes:** guessing by most recently modified file plus matching cwd breaks in these cases:
  - Several windows or tasks are active at once.
  - Subagent or sidechain files are also being written.
  - Cline's rollout cohort flips the store between legacy and SDK.
  - VS Code is only flushing every ~60 s.
  - A Codex or Claude CLI session runs in the same directory as the IDE session.
- **Reliable binding:** an ID handed over by a supported channel (a Claude hook's `session_id`, a Codex app-server thread ID) is the only dependable way to bind a UI conversation to a file.

### Gaps
- I found no documented way to ask Cline, Roo, Kilo, Continue or Copilot from outside the process which task is focused in a given window.

---

## Q5. Documented interface vs private internal storage, and format churn

### Takeaway
Under ServerDrivenChat's rule against reading "internal databases" as a bypass:
- **Private internal storage:** every plugin's history store.
- **Internal databases, explicitly in scope of the rule:** the SQLite stores (Kilo `kilo.db`, Cline `sessions.db`, VS Code storage DB with the chat index, Codex `state_*.sqlite`).
- **Claude Code:** the only one whose transcript location and content are officially documented. Even there the entry schema is "opaque", and supported programmatic reads go through Agent SDK functions or hooks.
- **Codex:** documents `history.jsonl` (prompts only) and the app-server API, not the rollout schema.

### Cited Findings
- **Claude Code.** Docs document location, contents, retention and "Plaintext storage" ([claude-directory](https://code.claude.com/docs/en/claude-directory)). The Agent SDK says to treat transcript entries "as opaque JSON-safe values" and calls summary `data` "opaque SDK-owned state" ([session-storage](https://code.claude.com/docs/en/agent-sdk/session-storage)). It offers `listSessions()`, `getSessionMessages()` and `getSessionInfo()` as supported readers. `getSessionMessages` "returns the post-compaction chain", so it is not the raw file. — [session-storage](https://code.claude.com/docs/en/agent-sdk/session-storage); [Anthropic cookbook: building a session browser](https://platform.claude.com/cookbook/claude-agent-sdk-05-building-a-session-browser). GitHub issue #51779 says parts of the cleanup documentation were outdated. — [anthropics/claude-code#51779](https://github.com/anthropics/claude-code/issues/51779)
- **Codex.** The config reference documents `history.persistence`, `history.max_bytes` and `sqlite_home`. It makes no statement on rollout format stability. — [Codex config reference](https://learn.chatgpt.com/docs/config-file/config-reference). Third-party blogs disagree on details such as whether rollouts are `.jsonl` or `.jsonl.zst`; the source shows both exist, depending on background compression. — [danielvaughan Codex rollout posts](https://codex.danielvaughan.com/2026/04/29/codex-cli-rollout-files-session-recording-replay-audit-trails/); [compression.rs](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/rollout/src/compression.rs#L52). The app-server is the documented interface and streams `item/agentMessage/delta`, `item/completed` and `turn/completed`. — [Codex App Server docs](https://developers.openai.com/codex/app-server)
- **Cline.** The fetched docs page "Task history recovery" says each task "Has a unique identifier and dedicated storage directory" but gives no path or file names. — [docs.cline.bot task-history-recovery](https://docs.cline.bot/troubleshooting/task-history-recovery.md). A search-engine summary claimed this page lists the globalStorage paths, but the fetched page did not, so treat that claim as unverified.
  - The format has churned: the 4.0.0 SDK migration was rolled back in 4.0.1, then re-shipped as a per-window A/B rollout in 4.1.0. Source comments call the old files the "pre-SDK storage format". — [CHANGELOG](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/CHANGELOG.md#L443); [legacy-state-reader.ts](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/sdk/legacy-state-reader.ts#L1)
  - Third-party parsers are already split. CodeBurn scans both the globalStorage and `~/.cline/data` roots ([CodeBurn Cline provider doc](https://raw.githubusercontent.com/getagentseal/codeburn/main/docs/providers/cline.md)), and found the CLI uses `~/.cline/data/sessions/<id>/` with `sessions.db` instead of `tasks/` ([codeburn#874](https://github.com/getagentseal/codeburn/issues/874)).
- **VS Code / Copilot.** The store moved from the storage DB to per-session `.json` files on 2025-03-18 ([microsoft/vscode commit a4ee266 "Store chat sessions in fs (#243670)"](https://github.com/microsoft/vscode/commit/a4ee2666f0a3bbadcf5f9cceb78f6bff05070faf)), then to an append log on 2026-01-13 ([commit 5438d07 "chat: store disk sessions using an 'append log' (#286644)"](https://github.com/microsoft/vscode/commit/5438d07dd307c360160fdf8761fc0119380e493a)).
  - The setting `chat.useLogSessionStorage` still switches between the two formats ([chatSessionStore.ts L740](https://github.com/microsoft/vscode/blob/1220a0f4e53fb3376fcbc51f11df3f5919ab32fa/src/vs/workbench/contrib/chat/common/model/chatSessionStore.ts#L740)).
  - A third-party integration doc warns these formats are version-dependent implementation details ([aiwg copilot-sessions doc](https://cdn.jsdelivr.net/npm/aiwg@2026.8.8/docs/providers/copilot-sessions.md)).
  - Community recovery tools exist because of orphaned or lost sessions ([chasm-cli](https://docs.rs/crate/chasm-cli/latest); [#305818](https://github.com/microsoft/vscode/issues/305818)).
- **Kilo.** The VS Code extension was rebuilt on OpenCode and SQLite in 2026 and replaced the Roo-derived v5 JSON task folders, which are now handled only by a migrator. The Kilo blog does not describe storage. — [Kilo GA blog](https://blog.kilo.ai/p/new-kilo-for-vs-code-is-live); [legacy-migration/task-store.ts](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/kilo-vscode/src/legacy-migration/task-store.ts#L1)
- **Roo.** The project is archived and its format frozen, with no further maintenance. — [GitHub repo (archived)](https://github.com/RooCodeInc/Roo-Code); [kilo.ai Roo shutdown](https://kilo.ai/compare/roo-code-shutdown-roomote)
- **Continue.** I found no official documentation of `~/.continue/sessions` as an integration interface; the source is the only reference ([history.ts](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/util/history.ts#L111)).
- **Third-party parsers (evidence of de facto use, not stability).** Cline's own SDK ships importers that parse Claude Code JSONL (`type` user/assistant, `isSidechain`, `parentUuid`) and Codex rollouts. — [session-import/claude-code.ts](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/core/src/services/session-import/claude-code.ts#L63); [session-import/codex.ts](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/core/src/services/session-import/codex.ts#L112)

### Inferences
| Plugin | Classification for ServerDrivenChat rules |
|---|---|
| Cline (legacy JSON + SDK JSON + `sessions.db`) | Private internal storage; `sessions.db` is an internal DB |
| Roo | Private internal storage (frozen) |
| Kilo 7 | Internal database |
| Continue | Private internal storage (undocumented) |
| VS Code/Copilot | Private internal storage; index in internal DB |
| Claude Code | Documented location and purpose, but opaque schema; supported access = SDK readers/hooks |
| Codex rollouts | Private internal storage; `history.jsonl` is documented but has no replies; supported access = app-server |

Watching any of these files to obtain replies would sit on the "internal storage bypass" side of the project rule, except where a vendor exposes a documented reader. That conclusion is consistent with the project's existing stance that Codex and Claude remain blocked until supported attachment exists.

### Gaps
- No vendor publishes a versioned schema or deprecation policy for these files.
- Claude Code's hooks page was not re-fetched to confirm whether `last_assistant_message` is now documented.

---

## Q6. Practical file-watching considerations (macOS and cross-platform)

### Takeaway
Native watchers are lossy and platform-dependent:
- **Node `fs.watch`:** watches inodes, so it loses track after a temp-file-and-rename save or a delete and recreate. On macOS it uses kqueue for files and FSEvents for directories, and the filename in events is not guaranteed.
- **FSEvents:** coalesces events.
- **chokidar v6:** smooths over these, but `awaitWriteFinish` adds latency.

A robust watcher watches parent directories, treats events only as hints, and re-reads with validation.

### Cited Findings
- **Node `fs.watch`.**
  - "The fs.watch API is not 100% consistent across platforms, and is unavailable in some situations."
  - "On macOS, this uses kqueue(2) for files and FSEvents for directories."
  - "On Linux and macOS systems, fs.watch() resolves the path to an inode and watches the inode. If the watched path is deleted and recreated, it is assigned a new inode… Events for the new inode will not be emitted."
  - The filename argument "is not always guaranteed".
  - Watching is unreliable on network or virtualized filesystems; `fs.watchFile()` falls back to stat polling, with a default `interval` of 5007 ms.
  - Source: [Node.js fs docs, fs.watch Caveats](https://nodejs.org/docs/latest-v24.x/api/fs.html#caveats)
- **FSEvents.** The latency parameter trades responsiveness for temporal coalescing. File-level events need `kFSEventStreamCreateFlagFileEvents`, and dropped events can collapse into `MustScanSubDirs`. These details come from third-party summaries of Apple's API, not Apple's page. — [fsnotify/fsevents](https://pkg.go.dev/github.com/fsnotify/fsevents); [go.fsevents INTERNALS](https://github.com/zchee/go.fsevents/blob/master/INTERNALS.md); [fswatch(7)](https://man.archlinux.org/man/fswatch.7.en.txt)
- **chokidar v6.** The current major is v6 (Oct 2026) and requires Node 22.22+.
  - `atomic` handles temp-file-and-rename saves: by default it turns the resulting `unlink` and `add` within 100 ms into one `change`.
  - `awaitWriteFinish` holds events until the size is stable for `stabilityThreshold`.
  - The `auto` backend uses native recursive watching on macOS and Windows.
  - Source: [chokidar README](https://github.com/paulmillr/chokidar)
- **First-party precedent.** The Copilot extension itself watches the Copilot CLI's `events.jsonl` files with VS Code's file-system watcher. — [copilotcliSessionService.ts L238](https://github.com/microsoft/vscode-copilot-chat/blob/5863f5a7088958050792b5dccbe8b46c6e13eccc/src/extension/chatSessions/copilotcli/node/copilotcliSessionService.ts#L238)

### Inferences
- **Legacy Cline and Roo** replace the file on every save, so watch the task *directory*, not `ui_messages.json`.
- **Write volume:** legacy Cline at ~40 ms cadence produces bursts of rename events; FSEvents coalescing and chokidar's `atomic` collapse them, so expect to see roughly the last state per burst rather than each chunk.
- **Cline SDK and Continue** do in-place rewrites, which need parse-retry. `awaitWriteFinish` helps but adds at least `stabilityThreshold` of latency.
- **JSONL sources** (Claude Code, Codex, VS Code): tail by byte offset and handle truncation or compaction. For Codex, also handle `.zst` swaps and date-partitioned directories, since each new day creates a new `YYYY/MM/DD` folder and the watcher needs recursive coverage.
- **SQLite stores** (Kilo, Cline `sessions.db`): changes land in `-wal` first, so watching only the main `.db` file misses them. Reading these databases is out of bounds under the project rules anyway.
- **Cross-platform paths:**
  - Windows: `%APPDATA%\Code\User\...`
  - Linux: `~/.config/Code/User/...`
  - VS Code Insiders, VSCodium and Cursor use different roots.
  - Isolated `--user-data-dir` profiles (as in this project's M24 host) move globalStorage and workspaceStorage entirely.
- **macOS TCC:** may block an external process from reading under `~/Documents`; this project has already hit TCC denials there. The `~/Library/Application Support` and `~/.<tool>` paths are not normally TCC-gated for the same user. That last point is an inference I did not verify.

### Gaps
- Apple's own FSEvents reference was not retrieved directly.
- Coalescing behavior under the specific write patterns above was not measured.

---

## Q7. Security and privacy

### Takeaway
All of these stores hold full conversation content and frequently secrets (file contents, command output, pasted keys) in plaintext. Permissions vary: some files are 0600, but many are 0644 on this machine. Any watcher becomes another holder of that sensitive data.

### Cited Findings
- **Claude Code.** "Transcripts and history are not encrypted at rest. OS file permissions are the only protection. If a tool reads a `.env` file or a command prints a credential, that value is written to `projects/<project>/<session>.jsonl`."
  - Mitigations: `cleanupPeriodDays` (default 30, minimum 1), `CLAUDE_CODE_SKIP_PROMPT_HISTORY`, `--no-session-persistence` with `-p`, `persistSession: false` (TypeScript SDK), `claude purge`.
  - Source: [claude-directory docs](https://code.claude.com/docs/en/claude-directory)
  - Local inspection: transcript `.jsonl` files are 0600 and session folders 0700, but subagent `*.meta.json` sidecars are 0644 ([Local structural inspection](file:///Users/samin/.claude/projects)).
- **Codex.** `history.jsonl` is opened with `mode(0o600)` and its permissions are corrected to 0600 ([message-history/src/lib.rs L149, L305–L316](https://github.com/openai/codex/blob/4ca84a10696623fcd7c200db3df9c41671d3bad0/codex-rs/message-history/src/lib.rs#L149)). Locally, rollout files and `session_index.jsonl` were 0644 ([Local structural inspection](file:///Users/samin/.codex)). A third-party post warns that rollouts contain prompts, file paths, code and pasted content ([danielvaughan rollout post](https://codex.danielvaughan.com/2026/04/29/codex-cli-rollout-files-session-recording-replay-audit-trails/)).
- **Cline.** Locally, `~/.cline/data/secrets.json` is 0600, but `globalState.json`, session `*.json` / `*.messages.json` and `db/sessions.db*` are 0644. `messages.json` also embeds the full `system_prompt`. — [Local structural inspection](file:///Users/samin/.cline/data). Legacy `atomicWriteFile` uses the default mode, so files are subject to umask. — [legacy disk.ts L34](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/core/storage/disk.ts#L34)
- **Cline remote sync.** The legacy `saveApiConversationHistory` also enqueues the data to a remote "syncWorker" ("Queue for remote sync without blocking"). — [legacy disk.ts L282–L297](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/core/storage/disk.ts#L282)

### Inferences
- **Containing a watcher:** an external watcher needs the same confidentiality controls as the plugins' own stores. That means least privilege, no copying of raw transcripts into logs or evidence, and redaction. This is consistent with the project's rule never to copy credential files into evidence.
- **0644 files:** world-readable in practice for other local users, unless the parent directory blocks traversal. The `~/.cline/data/sessions` directories observed were `drwxr-xr-x`.

### Gaps
- Default permissions of VS Code `workspaceStorage/*/chatSessions/*.jsonl` and Continue session files were not inspected.

---

## Q8. Overall: is file watching a reliable way for an external process to read assistant replies?

### Takeaway
No, not as a primary channel. Persistence timing ranges from ~40 ms to "at idle flush or window close". Partial-text semantics differ by plugin. Two plugins do non-atomic rewrites. Identity is not exposed. Formats churned during 2025–2026 (Cline's A/B dual layout, Kilo's SQLite rewrite, VS Code's .json-to-.jsonl change, Roo's archival). Most of the stores are private internal storage or databases. File watching is at best a best-effort, read-only audit or fallback signal. For Claude Code and Codex, vendor-documented interfaces exist (Agent SDK session readers and hooks, the Codex app-server), but they belong to the process that owns the session.

### Cited Findings
- **Per-plugin variability in timing, atomicity and identity:** see Q2–Q4 sources above, especially [legacy Cline updateClineMessage save](https://github.com/cline/cline/blob/7761370240ffce9e3890cb56f6c51655f3f5b0a7/apps/vscode/src/core/task/message-state.ts#L239), [VS Code onWillSaveState-only persistence](https://github.com/microsoft/vscode/blob/1220a0f4e53fb3376fcbc51f11df3f5919ab32fa/src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L394) and [Cline SDK `iteration_end` persistence](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/sdk/packages/core/src/services/agent-events.ts#L312).
- **Even vendor hook timing doesn't guarantee the file is current:** Claude Code's Stop hook fired before the transcript was written, and the issue was closed "not planned". — [#74340 mirror](https://claudeissues.com/issue/74340-stop-hook-fires-before-the-final-assistant-message-is-flushed-to-the-transcript)
- **The plugin version on disk can change per window via a remote flag:** Cline. — [vscode-rollout README](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode-rollout/README.md#L51)

### Inferences
Best-to-worst for "final reply text reaches disk quickly and is cheaply parseable":

| Rank | Plugin | Why |
|---|---|---|
| 1 | Codex rollouts | Append-only, complete items, flushed per batch |
| 2 | Claude Code transcripts | Append-only per block; documented location; reported lag vs hooks |
| 3 | Legacy Cline | Every chunk, atomic rename, but heavy churn |
| 4 | Kilo | Final text at `text-end`, but a database |
| 5 | Roo | First chunk plus final; frozen |
| 6 | Cline SDK | Per iteration; non-atomic |
| 7 | Continue | End of stream; non-atomic |
| 8 | VS Code / Copilot | Periodic or at close; log compaction |

None provides a stable contract, an "active conversation" marker or delivery guarantees. For ServerDrivenChat, the supported-interface routes already in the project's design remain the right path: Cline's adopted patch/API boundary, and the Claude/Codex attachment gates.

### Gaps
- No empirical latency or reliability test was run against live plugins. That would require operating the user's IDE sessions, which this research deliberately avoided.
