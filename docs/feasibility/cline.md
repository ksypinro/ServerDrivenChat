# M02 — Cline feasibility in VS Code and Antigravity

Completed: 2026-10-05, Asia/Dhaka. Status: **Done — feasibility discovery**. Scope: Cline's sidebar task in each IDE; Antigravity's separate native agent is outside this Cline milestone.

## Outcome and route decision

Both IDEs contain Cline, but their versions use different internal architectures. Static inspection establishes that both public extension APIs are insufficient for reliable unattended, task-bound server control. They provide current-task message submission and button helpers, without public task selection/snapshots, event subscriptions, or request-bound approval resolution.

**Recommended route:** a VS Code-compatible companion extension plus a small, versioned integration API owned by Cline. Implement that API against the app's existing controller and authorization boundary. Prefer upstream adoption. A separately maintained Cline build requires explicit product adoption; none has been selected, installed, or patched here. A companion must not instantiate a replacement Cline SDK runtime.

M02's required live probes passed in both IDEs after the user completed graphical provider sign-in. Each original task returned `M02-INPUT-OK`, then `M02-CONTEXT-6R8Q CONTINUITY-OK` in a follow-up turn. Each displayed a genuine native file proposal, its full one-line content, and **Save / Reject** controls. Save in VS Code produced exactly `M02 APPROVAL PROBE\n`; Reject in Antigravity left no marker file. The native review controls disappeared and both tasks reached `COMPLETED`. These are supervised app-UI demonstrations, not calls to a public companion API or a working server connection.

**Route decision:** the implementation requires an upstream Cline extension addition exposing the versioned app-owned interface below. Stock exports and UI button helpers cannot provide unattended atomic control. A maintained Cline build remains a fallback requiring explicit adoption; none was installed. M03 must decide packaging and the adoption path; M19–M21 implement and verify the contract.

## Installed versions and evidence

| Host | App version | Embedded editor version | Cline | Declared editor requirement |
|---|---|---|---|---|
| VS Code | 1.140.0 | 1.140.0 | 4.1.22 | `^1.101.0` |
| Antigravity IDE | 2.5.5 | 1.107.0 | 3.83.0 | `^1.84.0` |

Both installations use extension ID `saoudrizwan.claude-dev`. Package presence and compatible version ranges do not prove that an extension is enabled, authenticated, or running correctly. Antigravity's engine version also does not prove that upgrading its Cline installation will preserve behavior; no upgrade was attempted.

[Environment and installed bundle fingerprints](../../evidence/M02/environment.json) record the exact paths and SHA-256 hashes. Official source tags were resolved to:

- Cline 4.1.22: `f58bc118bdeef1bd2813cd08e00d98bdcda96475`.
- Cline 3.83.0: `80783b62cb0aad6e9061a6616dade1582ab5174d`.

[Source manifest](../../evidence/M02/source-manifest.json) supplies immutable URLs and content hashes. Matching release versions are not a reproducible-build attestation; the installed public-API snippets were inspected separately. Downloaded source was read, not executed. No unrelated task history or provider secrets were collected. Only the disposable probe transcripts were inspected live.

## Public API findings

Both inspected exports have four operations: `startNewTask`, `sendMessage`, `pressPrimaryButton`, and `pressSecondaryButton`. Task creation clears the current task; it must not serve as reconnect or follow-up handling. The other methods resolve `controller.task` when called. Their arguments carry no expected task, native request, or request revision. A missing task can produce a log entry and a normally resolved call, so promise resolution is not delivery evidence.

Sources: [4.1.22 exports](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/apps/vscode/src/exports/index.ts), [3.83.0 exports](https://github.com/cline/cline/blob/80783b62cb0aad6e9061a6616dade1582ab5174d/src/exports/index.ts).

A check-before-call in the companion cannot make these methods atomic: the active task or ask may change between inspection and execution. Likewise, a primary-button call does not identify the reviewed action. The internal webview `AskResponseRequest` carries response type, text, images/files, and an empty metadata structure; its handler still targets the current task. Private webview/protobuf routes are not a supported public integration contract.

## Native identity and output mapping

| Concept | Cline 3.83.0 / Antigravity | Cline 4.1.22 / VS Code | Integration requirement |
|---|---|---|---|
| Task | Classic `Task.taskId`; separate `ulid` | `TaskProxy.taskId` and `ulid` map to SDK session ID | Export opaque identity through the app; never infer it from the title |
| Turn | No public turn-addressed contract found | Internal session/turn state and SDK events | Expose native identity where available; otherwise declare an adapter generation, not a fabricated native ID |
| Message | `ts`, `type`, `ask`/`say`, `partial` | Same visible message shape plus optional `seq` and `epoch` | Preserve replacement vs append; timestamps alone are not authorization identities |
| Pending approval | `ask(...)` waits for task response state | Coordinator receives `toolCallId`, `conversationId`, `agentId`, iteration, tool name/input | Publish the actual action and mint a request revision bound to the pending native operation |
| Approval response | Assigns response state without expected ask ID | Consumes current pending approval resolver without caller-supplied expected ID | Compare identity/revision and consume the resolver atomically inside Cline |
| Output observation | Internal message state / webview state | Internal `onSessionEvent`, message coordinator, turn phase | Add filtered public snapshots/events, with explicit lifecycle and replay limits |

For 3.83.0, the ask loop detects a changed last-message timestamp, but the external responder does not supply the request it intended to answer. That is not sufficient remote stale-decision protection. For 4.1.22, native approval input is available before execution, and a normal chat message leaves an approval pending rather than granting it. These are useful internal integration points; neither is currently exported to a companion.

Sources: [classic task](https://github.com/cline/cline/blob/80783b62cb0aad6e9061a6616dade1582ab5174d/src/core/task/index.ts), [SDK interaction coordinator](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/apps/vscode/src/sdk/sdk-interaction-coordinator.ts), [SDK controller](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/apps/vscode/src/sdk/SdkController.ts), [message types](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/apps/vscode/src/shared/ExtensionMessage.ts).

Expose an allowlisted projection of visible transcript, tool summaries, artifacts, and terminal states. Do not forward the entire internal state object: internal state/config schemas include credential-related fields. Only transmit content authorized for the selected task. Keep native `seq`/`epoch` separate from the bridge's durable `eventSeq` and binding generation; native process-local counters do not provide durable replay.

## Capability matrix

Each row applies independently to both installed hosts unless noted. [Machine-readable matrix](../../evidence/M02/capability-matrix.json).

| Capability | VS Code / 4.1.22 | Antigravity / 3.83.0 |
|---|---|---|
| Installed bundle/version | Verified statically | Verified statically |
| Computer Use window access | Verified live 2026-10-05 | Verified live 2026-10-05 |
| Live extension activation | Text turns and file approval verified | Text turns and file approval verified |
| Initial input echo | Verified live | Verified live |
| Existing-task follow-up and assistant reply | Passed: exact marker and continuity | Passed: exact marker and continuity |
| Task-addressed public input | Not exposed in inspected API | Not exposed in inspected API |
| Public output subscription | Not exposed; internal events found | Not exposed; internal message state found |
| Genuine pending approval | Inspected; Save applied, exact bytes verified | Inspected; Reject applied, file absent |
| Public request-bound approval | Not exposed | Not exposed |
| Trusted task identity at default MCP server | Not supplied by inspected call path | Not supplied by inspected call path |
| Questions / cancellation / task switching | Live behavior unverified | Live behavior unverified |
| Foreground, idle delivery, reload recovery | Not run | Not run |
| Production capabilities enabled | None | None |

The [UI access trace](../../evidence/M02/ui-access.json) preserves prior access failures and later success. Provider sign-in failures were resolved by the user. The Cline model selectors during successful probes were `cline:stealth/space-bunny-alpha` in VS Code and `cline:cline-free/muse-spark-1.3-contributor` in Antigravity; the agent did not change provider/model settings. Both remained in Act mode with existing auto-approve summaries Read, Commands, Web Fetch, MCP; file editing required native review.

## Live demonstration and practical limits

Probe workspaces were `/private/tmp/serverdrivenchat-m02-probes/vscode` and `/private/tmp/serverdrivenchat-m02-probes/antigravity`, opened in separate windows. Workspace trust was granted only to these folders after explicit confirmation; parent-folder trust and Cline auto-approval settings were unchanged. Existing projects/tasks were preserved.

The [VS Code evidence](../../evidence/M02/vscode/live-probe.json) and [Antigravity evidence](../../evidence/M02/antigravity/live-probe.json) contain prompts, exact replies, lifecycle, review content, decisions, and before/after file checks. Task continuity is demonstrated by retained task header/transcript and remembered marker. Native task/request IDs were not exposed by the UI; webview IDs and titles were not used as authorization identities. The identity table above maps the required programmatic integration from pinned source.

The approval probe requested only the native file-edit tool and one disposable file, with no shell/network/MCP use. Both showed a New File preview and expandable `M02 APPROVAL PROBE` content. File absence was independently checked before the decisions. VS Code's Save switched the preview to the saved file; filesystem verification confirmed the trailing newline. Antigravity's Reject closed the preview; file absence was confirmed. Decisions applied to freshly inspected requests in this supervised session. This does not prevent a task/request switch race in an unattended bridge.

Partial-output replacement, stop/clarification, task-switch races, reload/recovery, and foreground-independent delivery were not measured by these probes. Connect was designed, not installed or executed.

## Proposed app-owned API addition

The following is a design proposal for upstream review, not callable API or M04's final schema:

| Operation | Required behavior |
|---|---|
| `getCapabilities()` | Version, implementation generation, supported actions, native identity and replay guarantees |
| `bindTask(expectedContext)` | Return explicit installation/host/workspace/task identity and binding generation after local selection |
| `getSnapshot(binding)` | Filtered transcript, lifecycle, pending interactions, and consistent event watermark |
| `subscribe(binding, cursor)` | Ordered task events; signal replay gaps and binding invalidation |
| `submitPrompt(binding, commandId, content)` | Check target and generation at dispatch; report acceptance and observable native message identity |
| `resolveInteraction(binding, requestId, revision, digest, decisionId, decision)` | Atomically validate and consume the exact pending interaction; reject stale/conflicting decisions |
| `cancelTurn(binding, turnIdentity, commandId)` | Cancel the intended active turn with observable outcome |
| `registerConnectHandler(handler)` | Provide host-derived originating task context to the installed Connect tool |

Cline must enforce comparison and consumption at its native action boundary, with no intervening await that permits the selected request to change. If asynchronous work is necessary, reserve a generation-bound request first and revalidate under the same synchronization mechanism. Local and remote decisions must use the same resolver. An exact duplicate returns its recorded outcome; a conflicting or expired decision cannot affect a later request.

Approval, question, completion, retry, and mode-change asks need distinct types. Never treat every `ask` as authorization. Allow/deny scopes must match what the native operation can enforce. Start with one-action decisions; arbitrary permission subsets and global auto-approval changes are not implied. Record native acceptance independently from tool execution success, and reconcile uncertain outcomes after interruption.

## Persistent bridge and Connect design

The companion owns the outbound SSE subscription and POST outbox while its IDE extension host is alive. Cline owns model execution and native permission enforcement. The listener must not depend on an active model turn. Local UI identifies the binding and permits disconnection. On host reload, credentials, durable cursors, and binding generations must be reconciled before dispatch resumes.

Co-locate the bridge with Cline's actual extension host. A local window can contain a remote workspace; installation path and window title alone cannot identify where Cline runs. Verify extension placement and IPC support rather than assuming cross-host exports work. [VS Code extension-host documentation](https://github.com/microsoft/vscode-docs/blob/main/api/advanced-topics/extension-host.md).

The [Connect-tool design](cline-connect.md) specifies trusted origin binding, local consent, server authentication, reconnect behavior, and the approval/control path. The current inspected MCP paths do not transmit task identity to the server, so model-supplied IDs cannot fill that gap.

## Completed discovery and downstream gates

The [probe plan](../../evidence/M02/live-probe-plan.md) records the completed GUI procedure. M02-G1 and M02-G2 are satisfied for feasibility discovery; their production API counterparts remain required in M19/M20. No native runtime substitution or alternative UI bypass was used.

| Gate | Required evidence | Affected milestone |
|---|---|---|
| M02-G1 | Passed via UI: prompt echo, exact output, retained task/context in both hosts. Authoritative ID export/binding remains required | M19 |
| M02-G2 | Passed via UI: genuine proposal/content, Save/Reject, native resolution and file checks. Request-bound remote resolution remains required | M20 |
| M02-G3 | Supported/adopted app-owned snapshot/event and atomic control interface | M19–M20 |
| M02-G4 | Host-derived Connect origin and persistent listener after initiating turn | M21 |
| M02-G5 | Window/task switching, reload, duplicate controls, and host isolation | M22–M23 |

M01 subsequently completed with a documented negative external-route finding, and M03 reconciled the reports and route gates. The [tracker](../../IMPLEMENTATION_TRACKER.md) records current implementation status. M02 completion does not authorize a custom Cline build or prove compatibility of either IDE with the proposed API. The live UI path is verified; production server control remains unimplemented.
