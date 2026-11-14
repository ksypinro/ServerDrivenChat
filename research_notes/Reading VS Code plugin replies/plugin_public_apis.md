# Public extension APIs for reading assistant replies: Cline, Roo Code, Kilo Code, Continue (state as of 2026-10-15)

Method note: the source was read directly from GitHub through the authenticated `gh` API on 2026-10-15. Line numbers refer to the pinned commits linked below. Pins: Cline `789f79e4` (main, 2026-10-14). Its `exports/cline.d.ts`, `exports/index.ts` and `sdk/hooks-adapter.ts` have the same blob SHAs as tag `v4.1.24`. Roo Code `b867ec91` (archived main). Its `api.ts`, `events.ts`, `ipc.ts`, `message.ts`, `src/extension/api.ts` and `src/extension.ts` have the same blob SHAs as tag `v3.54.0`. Kilo Code `a72ad306` (main, 2026-10-14), Kilo legacy `ae046aca` (archived main) and Continue `5522c6f4` (main, 2026-07-21). Nothing was installed or executed. "Inferences" are my reasoning and are not verified at runtime.

## Stock Cline (saoudrizwan.claude-dev, v4.1.24): full ClineAPI surface, reply/event access, history of the API, related issues

### Takeaway
Stock Cline 4.1.24 exports only four fire-and-forget input methods: `startNewTask`, `sendMessage`, `pressPrimaryButton` and `pressSecondaryButton`. They all return `Promise<void>`. The API has no events and no getters. You cannot read reply text, task IDs, ask/approval state or completion, and the API has no cancel method. The surface has only ever shrunk: it went from six methods to four in June 2025. Feature requests for an external events/streaming API were closed without being merged. The only official, unpatched way to see output is the opt-in file-based `TaskComplete` hook script. In 4.1.24 that hook receives `taskId` and the run's final `outputText`. It gets no streaming text and no ask/approval notification.

### Cited Findings
- The current release is `v4.1.24`, published 2026-10-13. The repo license is Apache-2.0, and `apps/vscode/package.json` declares `name: claude-dev`, `publisher: saoudrizwan`, `version: 4.1.24` and `license: Apache-2.0`. Other tags in the repo, such as `cli-v3.0.71`, `desktop-v0.0.46` and `sdk/sdk/v0.0.93`, belong to other products. — [Cline releases](https://github.com/cline/cline/releases/tag/v4.1.24); [package.json](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/package.json)
- The whole interface is `startNewTask(task?: string, images?: string[]): Promise<void>` (L7), `sendMessage(message?: string, images?: string[]): Promise<void>` (L14), `pressPrimaryButton(): Promise<void>` (L19) and `pressSecondaryButton(): Promise<void>` (L24). It has no event emitter, no getter and no task-ID return. — [apps/vscode/src/exports/cline.d.ts L1-L25](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/exports/cline.d.ts#L1-L25)
- How each method is implemented:
  - `startNewTask` calls `clearTask()`, `postStateToWebview()`, `sendChatButtonClickedEvent()` and then `initTask(task, images)` (L8-L14).
  - `sendMessage` calls `task.handleWebviewAskResponse("messageResponse", ...)` (L16-L22).
  - The two buttons call `handleWebviewAskResponse("yesButtonClicked"/"noButtonClicked")` (L24-L38).
  - If there is no active task, each method only logs `"No active task ..."`. It does not throw.
  - Source: [apps/vscode/src/exports/index.ts L6-L42](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/exports/index.ts#L6-L42)
- The API object is the return value of `activate()`: `return createClineAPI(webview.controller)`. — [apps/vscode/src/extension.ts L517](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/extension.ts#L517)
- In 4.x the `Controller` behind the API is SDK-backed: `export { Controller } from "@/sdk/SdkController"`, with the comment "The Controller class is now provided by the SDK adapter layer". — [apps/vscode/src/core/controller/index.ts L1-L7](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/core/controller/index.ts#L1-L7)
- The official README tells consumers to `getExtension<ClineAPI>("saoudrizwan.claude-dev")`, check `isActive`, and add `"extensionDependencies": ["saoudrizwan.claude-dev"]`. It documents only the four methods. — [apps/vscode/src/exports/README.md L1-L48](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/exports/README.md)
- History (did any version expose more?):
  - Commit `0914c069af` (2024-10-09, "Refactor exports") renamed `ClaudeDevAPI` to `ClineAPI`. At that point the API had six methods: `setCustomInstructions`, `getCustomInstructions` and the four that remain. — [commit 0914c069af](https://github.com/cline/cline/commit/0914c069af)
  - PR #4158 (2025-06-11, "Remove custom instructions") removed `setCustomInstructions` and `getCustomInstructions`. — [commit 542ec2bd4a / PR #4158](https://github.com/cline/cline/pull/4158)
  - The file moved to `apps/vscode/` in PR #10961 (2026-05-25) with no change to the interface. — [commit 791d238996](https://github.com/cline/cline/commit/791d238996)
  - I found no version that exposed events or reply text. This is based on the `git log` of both `src/exports/cline.d.ts` and `apps/vscode/src/exports/cline.d.ts`.
- Requests for an events or streaming API:
  - Issue #4886, "External API Integration for Cline [Feature proposal]" (2025-07-14), asked for "WebSocket streaming for real-time event updates" and to "start new task, read prev task". It was closed the same day without implementation. — [issue #4886](https://github.com/cline/cline/issues/4886)
  - Draft PR #6984, "[DRAFT] VS Code plugin system" (2025-10-20), proposed `clineApi.plugins.registerPlugin(...)` through `exports`. It was closed the same day and not merged. — [PR #6984](https://github.com/cline/cline/pull/6984)
- File-based hooks, which run as out-of-process scripts:
  - `HookInput` carries `task_id` (L14).
  - `PostToolUseData` has `result` (L53).
  - `NotificationData` has `message`, `waiting_for_user_input` and `requires_user_action` (L65-L76).
  - `TaskCompleteData` has `task_metadata` (L96-L97).
  - `HookOutput` can return `cancel` (L39).
  - Source: [apps/vscode/proto/cline/hooks.proto L10-L99](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/proto/cline/hooks.proto#L10-L99)
- In the 4.x SDK adapter, only these hooks are wired: TaskStart and UserPromptSubmit map to `beforeRun`, PreToolUse to `beforeTool`, PostToolUse to `afterTool`, TaskComplete to `afterRun` when completed, and TaskCancel to `afterRun` when aborted. The source says verbatim: "Deferred hooks (NOT wired here): TaskResume, TaskError, SessionShutdown, PreCompact, Notification." The TaskComplete hook is passed `taskMetadata: { taskId, ..., result: ctx.result.outputText }` (L283-L294), and it only runs when hooks are enabled (L258). — [apps/vscode/src/sdk/hooks-adapter.ts L1-L12, L254-L294](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/sdk/hooks-adapter.ts#L1-L12)
- The hooks documentation URLs now only say "See details under SDK Plugins page". — [docs.cline.bot/features/hooks/hook-reference](https://docs.cline.bot/features/hooks/hook-reference); [docs.cline.bot/customization/hooks.md](https://docs.cline.bot/customization/hooks.md)
- The SDK Plugins page describes in-process `AgentPlugin` hooks: `beforeRun`, `afterRun` (`result`), `beforeModel`, `afterModel` (`assistantMessage`, `finishReason`), `beforeTool`, `afterTool` and `onEvent`. Their snapshots carry an agent id and a conversation id. Plugins are registered via `cline.start({ config: { extensions | pluginPaths } })` or `cline plugin install`. The page says the VS Code extension "ship[s] the worker bootstrap". It documents no streaming deltas and no ask/question signal. — [docs.cline.bot/sdk/plugins](https://docs.cline.bot/sdk/plugins)

### Inferences
- The task ID is not exposed through `exports`. `startNewTask` returns `void`, and nothing reports which task `sendMessage` reached. The only official sources of a task ID are hook payloads (`taskId`).
- Nothing in `exports` signals that a turn has finished or that Cline is waiting for approval or a question. In 4.1.24 the `Notification` hook, the one hook designed to carry `waiting_for_user_input` and `requires_user_action`, is explicitly not wired. So no official channel reports "waiting for approval/question" in the current release.
- Cancellation: `exports` has no cancel method. `pressSecondaryButton` only rejects the current ask. A hook can return `cancel: true`, but that is a hook-script decision, not a remote command.
- Whether the extension needs its sidebar: `createClineAPI` uses the sidebar controller and posts state to the webview. The README requires the extension to be active, not visible. I have not verified whether `startNewTask` works while the sidebar webview has never been resolved.
- The `TaskComplete` hook (final `outputText` plus `taskId`) is the only official, unpatched way to observe output. It is opt-in, runs as an external script, gives only the final text, and does not fire on asks or approvals. It cannot support streaming, mid-turn questions or correlated approvals.

### Gaps
- I did not verify whether the VS Code extension (as opposed to the SDK/CLI) loads user-installed SDK `AgentPlugin`s that use `afterModel` or `onEvent`. A code search of `apps/vscode` for `pluginPaths` found only MCP-server sync code in `marketplace-helpers.ts`. If it does load them, `afterModel.assistantMessage` would be an in-process reply source. This needs a runtime check.
- I did not verify that `afterRun` fires once per user turn, as opposed to once per whole task, under the 4.x SDK runtime.
- I did not verify at runtime whether `sendMessage` (`handleWebviewAskResponse("messageResponse")`) is delivered when the task is mid-stream rather than waiting on an ask, in the 4.x `TaskProxy`.
- Issue #4886's closing reason was not recorded in the API payload I read. It may have been converted to a discussion.

## Roo Code (RooVeterinaryInc.roo-cline): full RooCodeAPI, event payloads, streaming and task ID, IPC socket, stability and documentation

### Takeaway
Roo Code has by far the richest official surface:
- A typed `RooCodeAPI extends EventEmitter<RooCodeEvents>`.
- A `message` event that carries `taskId` plus the full `ClineMessage`, including `partial: true` streaming updates and ask/question text.
- Explicit lifecycle events: `taskCompleted`, `taskAborted`, `taskInteractive`, `taskIdle`, `taskAskResponded` and others.
- `startNewTask` returns the task ID, `resumeTask(taskId)` reopens an existing conversation, and `cancelCurrentTask()` cancels.
- An optional Unix-socket IPC server, enabled by the `ROO_CODE_IPC_SOCKET_PATH` environment variable, that broadcasts all events and accepts commands.

However, the extension was shut down and the repo archived on 2026-05-15, with final release v3.54.0. It is now unmaintained.

### Cited Findings
- Status: the repository is archived (`archived=true`, last push 2026-05-15, Apache-2.0). The README says "The Roo Code Extension was shut down on May 15th." It recommends ZooCode, a community fork, and Cline. — [README.md L64-L69](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/README.md#L64-L69); [repo](https://github.com/RooCodeInc/Roo-Code)
- The last release is `v3.54.0` (2026-05-15); the one before it was `v3.53.0` (2026-04-23). — [Roo releases](https://github.com/RooCodeInc/Roo-Code/releases/tag/v3.54.0)
- Secondary sources add that the shutdown was announced around April 2026, that the Marketplace listing remains without updates, and that installed copies keep working. These come from a competitor's page and were not verified against a primary source. — [kilo.ai comparison page](https://kilo.ai/compare/roo-code-shutdown-roomote)
- The full `RooCodeAPI` interface is defined in [packages/types/src/api.ts L11-L136](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/api.ts#L11-L136):
  - `startNewTask({configuration, text, images, newTab}): Promise<string>` returns the new task ID.
  - `resumeTask(taskId)`, `isTaskInHistory(taskId)` and `getCurrentTaskStack(): string[]`.
  - `clearCurrentTask(lastMessage?)` and `cancelCurrentTask()`.
  - `sendMessage(message?, images?)`, `pressPrimaryButton()` and `pressSecondaryButton()`.
  - `isReady()`, `getConfiguration()` and `setConfiguration()`.
  - Profile CRUD: `getProfiles`, `getProfileEntry`, `createProfile`, `updateProfile`, `upsertProfile`, `deleteProfile`, `getActiveProfile` and `setActiveProfile`.
- The same file defines a separate `RooCodeIpcServer` interface with `listen`, `broadcast`, `send`, `socketPath` and `isListening`. — [api.ts L138-L144](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/api.ts#L138-L144)
- The `RooCodeEventName` enum has these events. — [packages/types/src/events.ts L11-L53](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/events.ts#L11-L53)
  - Task lifecycle: `taskCreated`, `taskStarted`, `taskCompleted`, `taskAborted`, `taskFocused`, `taskUnfocused`, `taskActive`, `taskInteractive`, `taskResumable`, `taskIdle`.
  - Subtasks: `taskPaused`, `taskUnpaused`, `taskSpawned`, `taskDelegated`, `taskDelegationCompleted`, `taskDelegationResumed`.
  - Execution: `message`, `taskModeSwitched`, `taskAskResponded`, `taskUserMessage`, `queuedMessagesUpdated`.
  - Usage: `taskTokenUsageUpdated`, `taskToolFailed`.
  - Configuration: `modeChanged`, `providerProfileChanged`.
  - Query responses: `commandsResponse`, `modesResponse`, `modelsResponse`.
- Event payloads are Zod schemas. — [events.ts L59-L127](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/events.ts#L59-L127)
  - `message` is `[{ taskId: string, action: "created" | "updated", message: ClineMessage }]` (L96-L102).
  - `taskCompleted` is `[taskId, tokenUsage, toolUsage, { isSubtask }]` (L63-L70).
  - `taskAborted`, `taskInteractive`, `taskIdle`, `taskResumable` and `taskAskResponded` are each `[taskId]`.
  - `taskDelegationCompleted` carries `completionResultSummary` (L86-L90).
- `ClineMessage` has these fields: `ts`, `type: "ask" | "say"`, `ask?`, `say?`, `text?`, `partial?: boolean` (L256) and `isAnswered?` (L273). — [packages/types/src/message.ts L249-L273](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/message.ts#L249-L273)
- Ask types include `followup`, `command`, `completion_result` and `tool`. The file also defines `idleAsks` (including `completion_result`), `resumableAsks` (`resume_task`) and `interactiveAsks` (`followup`, `command`, `tool`, `use_mcp_server`). — [message.ts L27-L89](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/message.ts#L27-L89)
- Streaming is emitted on the API as follows:
  - `Task.addToClineMessages` emits `message` with `{action: "created"}` (L1150).
  - `Task.updateClineMessage` emits `{action: "updated"}` (L1163).
  - In `say()`, a partial update replaces `lastMessage.text = text` and calls `updateClineMessage` (L1733-L1740). The final version sets `partial = false`, saves, and emits again (L1764-L1779).
  - Source: [src/core/task/Task.ts L1144-L1164, L1727-L1779](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/core/task/Task.ts#L1144-L1164)
- The API forwards each task `message` as `this.emit(RooCodeEventName.Message, { taskId: task.taskId, ...message })` (L388-L394). It also re-emits `taskStarted`, `taskCompleted`, `taskAborted`, `taskInteractive`, `taskIdle`, `taskAskResponded` and the others, all keyed by `task.taskId` (L313-L420). — [src/extension/api.ts L313-L420](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/extension/api.ts#L313-L420)
- "Waiting for user" signals:
  - For a blocking, non-partial ask, after `statusMutationTimeout = 2_000` ms, Roo emits `taskInteractive` for interactive asks (followup, command, tool or MCP approval), `taskResumable` for `resume_task`, and `taskIdle` for idle asks such as `completion_result`. — [Task.ts L1344-L1382](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/core/task/Task.ts#L1344-L1382)
  - `TaskAskResponded` is emitted when the ask is answered (L1452). `TaskAborted` is emitted at L2229. — [Task.ts L1452](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/core/task/Task.ts#L1452)
- Cancellation: `cancelCurrentTask()` calls `sidebarProvider.cancelTask()` (api.ts L253-L255; ClineProvider.ts L2629). There is also an IPC `CancelTask` command. — [api.ts L253-L255](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/extension/api.ts#L253-L255); [ClineProvider.ts L2629](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/core/webview/ClineProvider.ts#L2629)
- IPC enablement: `const socketPath = process.env.ROO_CODE_IPC_SOCKET_PATH`. If it is set, logging is also enabled, and `activate` returns `new API(outputChannel, provider, socketPath, enableLogging)`. — [src/extension.ts L237-L238, L293](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/extension.ts#L237-L238)
- How the API wires IPC:
  - The API constructs `new IpcServer(socketPath, ...)` from `@roo-code/ipc` (L65-L69).
  - It handles `TaskCommand`s: StartNewTask, CancelTask, ResumeTask, SendMessage, GetCommands, GetModes and GetModels (L85-L160).
  - It overrides `emit` so that every API event is also broadcast to IPC clients as `{type: "TaskEvent", origin: "server", data: {eventName, payload}}` (L166-L173).
  - Source: [api.ts L65-L173](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/extension/api.ts#L65-L173)
- The IPC wire types are message types `Connect`, `Disconnect`, `Ack`, `TaskCommand` and `TaskEvent`, and `TaskCommandName` values `StartNewTask`, `CancelTask`, `CloseTask`, `ResumeTask`, `SendMessage`, `GetCommands`, `GetModes`, `GetModels` and `DeleteQueuedMessage`. — [packages/types/src/ipc.ts L10-L52, L107-L149](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/ipc.ts#L10-L52)
- How the API depends on the sidebar:
  - `startNewTask` executes `${Package.name}.SidebarProvider.focus`, which opens the sidebar, unless `newTab` is set (L188-L198). It sets `consecutiveMistakeLimit: Number.MAX_SAFE_INTEGER` and throws "Failed to create task due to policy restrictions" if creation is refused (L205-L215).
  - `resumeTask` focuses the sidebar, waits up to 5 s for the webview, and otherwise continues "in headless mode" (L218-L232).
  - `sendMessage` posts to the webview when it is launched; otherwise it calls `currentTask.submitUserMessage` directly (L257-L274).
  - `pressPrimaryButton` and `pressSecondaryButton` only post `invoke` messages to the webview (L287-L293).
  - `isReady()` returns `sidebarProvider.viewLaunched` (L295-L297).
  - Source: [api.ts L175-L297](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/extension/api.ts#L175-L297)
- Versioning and stability:
  - Types ship as the npm package `@roo-code/types`, latest `1.115.0`, last modified 2026-03-02. — [npm @roo-code/types](https://www.npmjs.com/package/@roo-code/types)
  - The package was created in PR #3912 (2025-05-26). — [commit e66136f1aa](https://github.com/RooCodeInc/Roo-Code/commit/e66136f1aa)
  - Commits to `events.ts`:
    - "Task and TaskProvider event emitter cleanup + a few new events" (#6606, 2025-08-02).
    - "Emit event when a task ask requires interaction" (#7128, 2025-08-16).
    - "Move message queue to the extension host" (#7604).
    - "Metadata-driven subtasks" (#9090).
    - "IPC fixes for task cancellation and queued messages" (#11162, 2026-02-02).
    - "add IPC query handlers" (#11279, 2026-02-07).
    - A revert to the pre-AI-SDK state (#11462, 2026-02-13).
    - "Remove Roo Code Cloud and evals" (#12328, 2026-05-12).
    - Source: [events.ts history](https://github.com/RooCodeInc/Roo-Code/commits/main/packages/types/src/events.ts)
  - The CHANGELOG records "Add DeleteQueuedMessage IPC command" (PR #11464), a "Bump @roo-code/types metadata version to 1.111.0 after revert regression" (PR #11588) and "Add IPC types to roo-code.d.ts". — [CHANGELOG.md](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/CHANGELOG.md)
- Documentation: the Roo-Code-Docs repo mentions `RooCodeAPI` only in the update notes, for example v3.9.0: "Exposed task stack in `RooCodeAPI`". A code search for `ROO_CODE_IPC_SOCKET_PATH` there found nothing. — [Roo-Code-Docs update-notes v3.9.0](https://github.com/RooCodeInc/Roo-Code-Docs/blob/main/docs/update-notes/v3.9.0.md)
- Licensing: the repository is Apache-2.0. `src/package.json` has no `license` field. — [repo metadata](https://github.com/RooCodeInc/Roo-Code)

### Inferences
- Reply text can be read from the `message` event. Filter on `taskId`, `message.type === "say"` and `message.say === "text"` (or `"completion_result"` / `"reasoning"`). While streaming, `action: "updated"` with `partial: true` carries the cumulative text, because `say()` replaces `lastMessage.text` rather than appending a delta. The final message arrives with `partial` false.
- Questions and approvals arrive as `type: "ask"` messages that carry the ask text (for example `ask: "followup"` or `"tool"`). Lifecycle events `taskInteractive` and `taskIdle` follow about 2 s later.
- The API is officially exported and typed, but it was never documented as a stable public product API. It changed shape repeatedly through 2025-2026. Events were added, payloads for subtasks and delegation changed, and a revert caused a types version regression. It was mainly built for Roo's own evals and CLI.
- Because the repo is archived, the API is now frozen at v3.54.0, but it gets no security or model updates.
- The API has no `getMessages(taskId)` or history-read method. To "read an existing conversation", call `resumeTask(taskId)` and then observe new events. Past transcript text is not returned.
- `sendMessage`, the button methods and `cancelCurrentTask` take no task ID. They act on whatever the "current task" is, so they could race with the user's UI selection.
- The IPC socket is opt-in only through an environment variable that must be set before VS Code starts. I found no authentication on it beyond Unix-socket file permissions.

### Gaps
- The Task.ts and ClineProvider.ts line numbers come from the archived `main`. I compared blob SHAs with tag v3.54.0 only for the API, types and extension files, not for Task.ts.
- I could not confirm at runtime whether every caller of `say("text", ..., partial)` passes cumulative text. Inference: it does, because of the replace semantics.
- I found no official prose documentation of the event API or the IPC socket on docs.roocode.com. The docs site's status after the shutdown is unverified.
- ZooCode, the community fork the README recommends, may inherit this API. I did not examine it.

## Kilo Code (kilocode.kilo-code): equivalents; is the Roo-inherited API still present?

### Takeaway
No, not in the current extension. Kilo Code 7.x is a rewrite on Kilo's shared CLI runtime, which is OpenCode-derived. Its `activate()` returns nothing, so `exports` is `undefined`. None of its 73 commands sends a message or reads a reply. The legacy 5.x extension, now in an archived repo, still exposed the Roo-inherited `RooCodeAPI` class and IPC socket, with `KILO_IPC_SOCKET_PATH` falling back to `ROO_CODE_IPC_SOCKET_PATH`. That is now historical.

### Cited Findings
- The current repo is `Kilo-Org/kilocode`, licensed MIT and not archived. Releases include `v7.8.10` (pre-release, 2026-10-14), `v7.8.9` (pre-release, 2026-10-13) and `v7.8.8` (marked "release", 2026-10-07). — [Kilo releases](https://github.com/Kilo-Org/kilocode/releases)
- `packages/kilo-vscode/package.json` declares `name: kilo-code`, `publisher: kilocode`, `version: 7.8.10`, `license: MIT` and `activationEvents: ["onStartupFinished", "onUri"]`. Tag v7.8.8 has `kilocode.kilo-code` 7.8.8. — [packages/kilo-vscode/package.json](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/kilo-vscode/package.json)
- The repo root has `.opencode-version` set to `v1.18.26`, which shows it tracks OpenCode upstream. — [.opencode-version](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/.opencode-version)
- `export async function activate(context)` runs from L66 to L943 and ends by registering disposables. It has no `return` of an API object. — [packages/kilo-vscode/src/extension.ts L66, L927-L943](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/kilo-vscode/src/extension.ts#L927-L943)
- All 73 contributed commands are UI actions. Examples are `kilo-code.new.plusButtonClicked`, `kilo-code.new.focusChatInput`, `kilo-code.new.closeTask`, `kilo-code.new.addToContext` and many `agentManager.*` commands. None reads chat output, and no configuration property mentions a server, URL, port, socket, IPC or API. — [packages/kilo-vscode/package.json](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/kilo-vscode/package.json)
- How the extension runs its backend: it spawns its bundled CLI as `serve --port 0` with a fresh `KILO_SERVER_PASSWORD = crypto.randomBytes(32).toString("hex")` and `KILO_PARENT_PID`. — [services/cli-backend/server-manager.ts L82-L152](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/kilo-vscode/src/services/cli-backend/server-manager.ts#L82-L152)
- Kilo's docs say the extension "uses the shared Kilo agent runtime" and "includes its own embedded runtime. No separate Kilo CLI installation is required." The page mentions no extension API or IPC. It still tells users to choose "Install Pre-Release Version". That conflicts with GitHub marking v7.8.8 as a "release" and may be stale. — [kilo.ai/docs VS Code page](https://kilo.ai/docs/code-with-ai/platforms/vscode)
- A secondary source says Kilo CLI is built on OpenCode's MIT codebase. — [morphllm comparison](https://www.morphllm.com/comparisons/kilo-code-vs-opencode)
- Legacy extension (historical):
  - `Kilo-Org/kilocode-legacy` is archived (Apache-2.0). Its last release is `v5.16.2` (2026-06-04), and its last push was 2026-08-03. `src/package.json` declares `kilo-code` by `kilocode`, version 5.16.2. — [kilocode-legacy](https://github.com/Kilo-Org/kilocode-legacy)
  - Its API is the Roo API: `export class API extends EventEmitter<RooCodeEvents> implements RooCodeAPI` with an `IpcServer` from `@roo-code/ipc`. — [src/extension/api.ts L22-L66](https://github.com/Kilo-Org/kilocode-legacy/blob/ae046acafd17993bdf12dce0f81d9ac948e17ee8/src/extension/api.ts#L22-L66)
  - `activate` reads `const socketPath = process.env.KILO_IPC_SOCKET_PATH ?? process.env.ROO_CODE_IPC_SOCKET_PATH // kilocode_change` (L531) and returns `new API(...)` (L597). — [src/extension.ts L531, L597](https://github.com/Kilo-Org/kilocode-legacy/blob/ae046acafd17993bdf12dce0f81d9ac948e17ee8/src/extension.ts#L531)

### Inferences
- The same Marketplace ID, `kilocode.kilo-code`, moved from the 5.x Roo-fork code base, which had a RooCodeAPI and IPC, to the 7.x OpenCode-based code base, which has neither. This is a complete breaking change for any extension that depended on `exports` or `KILO_IPC_SOCKET_PATH`.
- The 7.x CLI backend is an HTTP server, OpenCode-style, that presumably has session and event endpoints. The extension's instance listens on a random port and is protected by a random password that is never published. So another extension cannot officially attach to the IDE's live conversations through it.
- Running `kilo serve` yourself would create a separate standalone runtime, not the user's existing IDE conversation.

### Gaps
- I did not determine the exact version and date when 7.x became the default stable Marketplace build. The sources conflict: GitHub says "(release)" while the docs say "Install Pre-Release".
- I did not inspect the `onUri` handler's accepted paths. It could accept prompt deep links, but it would not return replies.
- I did not read the Kilo CLI server's HTTP/SSE API docs. They are relevant only to a standalone runtime.
- Legacy 5.x event names were inherited through `@roo-code/types`. I did not verify any per-event Kilo divergence.

## Continue (Continue.continue): any exported API or official way to read chat replies?

### Takeaway
No. Continue's only public export is `registerCustomContextProvider(contextProvider)`, which lets another extension feed context into Continue. It provides no way to send prompts, read replies, get events, or obtain session IDs, completion status or cancellation. The full internal `extension` object is exported only when `NODE_ENV === "test"`. Commands are UI actions.

### Cited Findings
- `activateExtension` builds `const continuePublicApi = { registerCustomContextProvider: api.registerCustomContextProvider.bind(api) }`. It returns `{ ...continuePublicApi, extension: vscodeExtension }` only when `process.env.NODE_ENV === "test"`, and otherwise returns `continuePublicApi` (comment: "'export' public api-surface or entire extension for testing"). — [extensions/vscode/src/activation/activate.ts L67-L79](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/vscode/src/activation/activate.ts#L67-L79)
- The same lines are unchanged at tag `v2.1.0-vscode`, where `package.json` has version 2.1.0. — [activate.ts @ v2.1.0-vscode](https://github.com/continuedev/continue/blob/v2.1.0-vscode/extensions/vscode/src/activation/activate.ts#L67-L79)
- `VsCodeContinueApi` has a single method, `registerCustomContextProvider(contextProvider: IContextProvider)`. — [extensions/vscode/src/activation/api.ts L5-L11](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/vscode/src/activation/api.ts#L5-L11)
- `activate()` returns `activateExtension(context)` through a dynamic import. — [extensions/vscode/src/extension.ts L12-L17](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/vscode/src/extension.ts#L12-L17)
- Contributed commands include `continue.focusContinueInput`, `continue.newSession`, `continue.shareSession`, `continue.viewHistory`, `continue.applyCodeFromChat` and others. None is documented as returning reply text. — [extensions/vscode/package.json](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/vscode/package.json)
- Versions and licensing:
  - The extension's `package.json` declares `name: continue`, `publisher: Continue` and `license: Apache-2.0`.
  - Main's `package.json` says 1.3.40 (main's last commit was 2026-07-21), while tags `v2.0.0-vscode` and `v2.1.0-vscode` were published 2026-06-19.
  - The repo description is now "open-source coding agent".
  - Sources: [continuedev/continue releases](https://github.com/continuedev/continue/releases/tag/v2.1.0-vscode); [repo](https://github.com/continuedev/continue)

### Inferences
- An extension cannot officially read Continue chat replies. `registerCustomContextProvider` only injects context, in the opposite direction.
- Using the test-only `extension` export would be incidental and unsupported, and it is not available in production builds.
- `continue.shareSession` presumably exports a transcript after a user action. That would be incidental at best and has no programmatic return.

### Gaps
- I did not verify the Marketplace's current published Continue version, given that main says 1.3.40 while the 2.x tags exist.
- I did not verify what `continue.shareSession` does or what it outputs.
- I did not check docs.continue.dev for any newer extension-API documentation. The source shows no such API.

## Cross-cutting: documented vs incidental, stability, sidebar dependency, licensing

### Takeaway
Only Cline (four input-only methods) and Roo Code (a full typed event API and IPC) officially export chat-control APIs through `exports`. Only Roo's API allows reading replies. Roo's API was effectively built for its own evals and CLI and churned frequently, and Roo is now archived. Kilo removed the inherited API in its 7.x rewrite. Continue exports only a context-provider hook.

### Cited Findings
- Cline documents its API in an in-repo README and `.d.ts` file that consumers are told to copy. — [Cline exports README](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/exports/README.md)
- Cline has removed methods before, in PR #4158. — [PR #4158](https://github.com/cline/cline/pull/4158)
- Roo publishes its types on npm as `@roo-code/types` but has no prose API documentation beyond release notes. — [npm](https://www.npmjs.com/package/@roo-code/types); [Roo-Code-Docs v3.9.0](https://github.com/RooCodeInc/Roo-Code-Docs/blob/main/docs/update-notes/v3.9.0.md)
- Roo's `isReady()` is literally `viewLaunched`. Its button presses only go through the webview, and `startNewTask` forces the sidebar into focus. — [Roo api.ts L188-L198, L287-L297](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/extension/api.ts#L287-L297)
- Licenses:
  - Cline: Apache-2.0 ([repo](https://github.com/cline/cline)).
  - Roo Code: Apache-2.0 ([repo](https://github.com/RooCodeInc/Roo-Code)).
  - Kilo 7.x: MIT ([repo](https://github.com/Kilo-Org/kilocode)).
  - Kilo legacy: Apache-2.0 ([repo](https://github.com/Kilo-Org/kilocode-legacy)).
  - Continue: Apache-2.0 ([repo](https://github.com/continuedev/continue)).

### Inferences
Summary matrix. Each cell is backed by the findings above.

| Plugin and version | `exports` API | Reply text (partial / final) | Task ID | Turn-done / waiting signal | Cancel | Needs sidebar | Status |
|---|---|---|---|---|---|---|---|
| Cline 4.1.24 | 4 input methods, all `void` | No / No (only the final `outputText` in an opt-in TaskComplete hook script) | No (hooks only) | No (Notification hook not wired) | No API method | Not verified | Active, Apache-2.0 |
| Roo Code 3.54.0 (final) | Full `RooCodeAPI` with EventEmitter, plus an opt-in env-var Unix socket | Yes / Yes (`message` with `partial`) | Yes | `taskCompleted`, `taskIdle`, `taskInteractive`, `taskAskResponded`, `taskAborted` | `cancelCurrentTask()`, IPC `CancelTask` | Partly (buttons and `isReady`; others have headless fallbacks) | Archived 2026-05-15, Apache-2.0 |
| Kilo Code 7.8.x | None (`undefined`) | No | No | No | No | n/a | Active, MIT |
| Kilo Code 5.16.2 (legacy) | Roo-inherited API, `KILO_IPC_SOCKET_PATH` | Yes (inherited) | Yes | Inherited | Inherited | Inherited | Archived, Apache-2.0 |
| Continue 1.3.40 / 2.1.0 | `registerCustomContextProvider` only | No | No | No | No | n/a | Active, Apache-2.0 |

### Gaps
- No vendor states a semver or stability policy for these extension APIs. I found none in the source or docs I examined.

## Could ServerDrivenChat be built on these APIs without patching?

### Takeaway
On a maintained plugin, it cannot be done fully, unpatched, with the current official APIs.
- Stock Cline: you can push prompts in, but you cannot read replies, task IDs, asks or approvals back.
- Roo Code: technically sufficient, with events, task IDs, streaming, resume-by-ID and cancel. But it is archived and unmaintained, and it lacks task-scoped commands and authentication on its IPC socket.
- Kilo 7.x and Continue: neither offers anything usable.

### Cited Findings
- Cline's exports return `void` and have no listener. — [cline.d.ts L1-L25](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/exports/cline.d.ts#L1-L25)
- Cline's only official output hook carries the final `outputText` and `taskId` on completion. The Notification hook, which signals waiting for input, is deferred. — [hooks-adapter.ts L1-L12, L283-L294](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/src/sdk/hooks-adapter.ts#L283-L294)
- Roo provides `startNewTask` returning a task ID, `resumeTask(taskId)`, `message` events with `taskId` and `partial`, and `cancelCurrentTask`. `sendMessage` and the button methods take no task ID. — [Roo api.ts](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/packages/types/src/api.ts#L11-L136)
- Roo is shut down. — [README L66](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/README.md#L64-L69)
- Kilo 7.x has no exports and uses a private, password-protected backend. — [extension.ts](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/kilo-vscode/src/extension.ts#L927-L943); [server-manager.ts](https://github.com/Kilo-Org/kilocode/blob/a72ad30628fd6583fb492a84badf36bd9dba0aee/packages/kilo-vscode/src/services/cli-backend/server-manager.ts#L82-L152)
- Continue's only export is a context-provider registration. — [activate.ts L67-L79](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/vscode/src/activation/activate.ts#L67-L79)

### Inferences
- **Cline (stock):** A companion extension could inject prompts with `startNewTask`/`sendMessage` and approve or reject with the two buttons. Those button presses are uncorrelated: they act on "the current ask", with no ask identity.
  - Getting text back without patching would require the opt-in TaskComplete hook script. That gives final text only, after completion, with no streaming and no question or approval visibility.
  - Alternatively it would require reading Cline's on-disk task files or webview state, which is incidental and unsupported.
  - This is why a bidirectional design on Cline needs a patched or forked build. That matches this repository's existing use of a maintained, patched Cline API boundary.
- **Roo Code:** An unpatched companion could do everything needed:
  - Subscribe to `message` and filter by `taskId`.
  - Stream partial text.
  - Detect asks and questions from `type: "ask"` plus `taskInteractive`, and detect turn end from `taskIdle`/`taskCompleted`.
  - Answer with `sendMessage`/`pressPrimaryButton`, cancel with `cancelCurrentTask`, and reopen existing conversations with `resumeTask`.
  
  The caveats:
  - The project is archived: no fixes, and its security posture is frozen at May 2026.
  - Commands target "the current task", so authority and fencing against concurrent local UI use would have to be enforced by the companion.
  - Button presses depend on the webview being launched.
  - The IPC socket needs an environment variable set at VS Code launch and has no authentication of its own.
  - There is no transcript-read method, so existing history cannot be returned, only new events.
- **Kilo Code 7.x and Continue:** These are not viable without patching or forking. Kilo legacy 5.x would have worked like Roo but is archived.
- **Forks:** A maintained fork that keeps Roo's API, such as ZooCode, might be the only unpatched candidate. This is unverified.

### Gaps
- None of these behaviours were validated in a running VS Code host, including Roo's headless paths, Cline hook enablement and Cline SDK-plugin loading in the extension.
- I did not evaluate ZooCode's API retention, maintenance status or license.
