# M01 investigation history

Archived at final closure audit. The observations below are historical; use the [final report](codex.md) for current status and decisions. Earlier pending actions are superseded by M01-DONE-001 and the closure audit.

# M01 — Codex desktop control feasibility

Observed: 2026-10-04; reassessed 2026-10-05, Asia/Dhaka. Milestone status: **Done as feasibility research**.

## Finding and integration decision

Two harmless turns passed through the installed desktop host's built-in chat tools, including a follow-up addressed to the same conversation. This verifies app-owned conversation input, final output, completion status, and context continuity. It does **not** verify a custom server or graphical companion attaching to that host.

No usable external route was established within the assessed interfaces and current constraints. The baseline app-owned text input/output and automatic file write passed. The command-escalation probe stopped as unsupported. A later user-supplied screenshot captured a genuine native Xcode app-access request; the human selected **Allow this conversation**, and the disposable chat's two access tool calls completed. This satisfies the research approval demonstration with a supervised local response mechanism. [Approval evidence](../../evidence/M01/xcode-app-access-probe.json), [route decision](../../evidence/M01/integration-route-decision.json).

**Decision:** retain the app-only design and gate Codex adapter implementation on a supported attachment or independently verified, permitted accessibility route. M16/M17 must not treat the built-in chat-tool probe as an external integration. No server, companion, adapter, or replacement runtime was implemented.

## Installed environment

| Property | Observation |
|---|---|
| App bundle | `/Applications/ChatGPT.app` |
| Bundle identifier | `com.openai.codex` |
| Bundle display name | ChatGPT |
| Version / build | 26.930.31730 / 12947 |
| Platform | macOS 26.5.1, ARM64 |
| Project | `/Users/samin/Documents/ServerDrivenChat` |
| Actual model / effort | Unrecorded |

Use the bundle identifier rather than assuming a separate `Codex.app` exists. These observations apply only to this installation. [Environment evidence](../../evidence/M01/environment.json).

## Routes investigated

### App-owned controls

The available `codex-app-tools` surface provides conversation creation, addressed follow-up submission, reading, and waiting. The user authorized one disposable project chat and two text-only prompts. No tool calls were made inside the probe turns.

1. `create_thread` created **M01 disposable app-control probe** on the local host.
2. Its first turn returned `M01-APP-INPUT-OK` and completed.
3. `send_message_to_thread` addressed the existing chat, without repeating its remembered marker.
4. The second turn returned `M01-CONTEXT-7K4P CONTINUITY-OK` and completed.
5. `read_thread` confirmed both prompts and replies. The final status snapshot reported the chat idle.

Native conversation ID: `01a107bf-812f-7082-8fc3-978ac74a289f`. Observed durations were 8,558 ms and 4,730 ms; these are single observations, not performance benchmarks. [Sanitized trace](../../evidence/M01/app-owned-conversation-probe.json).

These tools are available to this app-hosted chat. No external authentication, subscription, endpoint, or companion SDK was demonstrated. The exposed tool inventory contains no native pending-approval enumerator or approval-response method. That finding concerns this tool surface, not every product interface. [Inventory](../../evidence/M01/available-app-tools.json).

### Published interfaces

OpenAI documents continuation, questions, approvals, and output review through its own Remote clients. This supports the app-only concept; a public interface for this project's server is not established by those instructions. [Remote connections](https://learn.chatgpt.com/docs/remote-connections).

App Server documents request-bound authorization and conversation events. Its protocol is useful for a future authorized attachment, but the reviewed documentation does not establish attachment to this already running desktop instance. Launching another runtime would violate this project's boundary. [App Server](https://learn.chatgpt.com/docs/app-server).

The bundle advertises URL schemes and contains a generic Chromium scripting dictionary. Static inspection found browser/window/tab commands, without conversation or approval-specific commands. Browser `stop` concerns page loading. No URL, AppleScript, JavaScript injection, private socket, or scripting command was executed. These declarations cannot establish safe task control. [Bundle metadata](../../evidence/M01/bundle-integration-metadata.json), [dictionary summary](../../evidence/M01/scripting-dictionary-summary.json).

### Accessibility

`cua.getApp("com.openai.codex")` returned:

> Computer Use is not allowed to use the app 'com.openai.codex' for safety reasons.

No accessibility tree, screenshot, or semantic control was returned. The refusal was not bypassed using another UI technology. This is a restriction on the present probe environment; it does not prove that a user-installed companion can or cannot access the app through macOS accessibility. [Restriction evidence](../../evidence/M01/computer-use-restriction.json).

## Version-specific capability matrix

“Passed” below is scoped to the app-owned probe. “Unverified” must not become an enabled production capability. [Machine-readable matrix](../../evidence/M01/capability-matrix.json).

| Operation | Result | Evidence and limit |
|---|---|---|
| Conversation identity | Passed: host tools | Same native thread ID and local host; no UI selection verified |
| Input into existing chat | Passed: host tools | Second prompt reached the addressed conversation |
| Final output and completion | Passed: host tools | Exact replies and completed turn records |
| Context continuity | Passed: host tools | Earlier marker recalled on follow-up |
| UI message echo | Unverified | Desktop transcript not inspected |
| Streaming / replacement output | Unverified | No incremental-output probe |
| Native file change | Passed: automatic write | User-submitted probe; native completed fileChange and exact bytes |
| Native approval capture | Passed: native app access | Human-supplied screenshot with exact action/choices; command escalation remains unsupported |
| Native approval response | Passed: supervised local UI | Human confirmed Allow this conversation; completed access calls; no remote resolver established |
| Questions / elicitation answers | Unverified | Text replies do not prove active-question resolution |
| Stop / active-turn steering | Unverified | No cancellation or steering probe |
| Foreground / background behavior | Unverified | No controlled focus comparison |
| Restart / reconnect | Not run | App not restarted; no external connection established |
| External companion attachment | Unverified | Host tools are not a demonstrated companion API |
| Approval request-switch protection | Unverified | Neither atomic native resolution nor UI race protection tested |

## Follow-up investigation — supported hooks

On 2026-10-04, the requested retry reviewed another supported route. Official [Computer Use guidance](https://learn.chatgpt.com/docs/computer-use#safety-guidance) explicitly excludes automating ChatGPT itself. Retrying that interface or increasing file permissions will not establish native control.

[Codex hooks](https://learn.chatgpt.com/docs/hooks#permissionrequest) document a `PermissionRequest` callback, including MCP handlers, that can allow, deny, or defer to normal approval. This is a candidate native approval path, not a tested capability. It requires a connected tool and trusted hooks; graphical installation is documented for [plugins](https://learn.chatgpt.com/docs/plugins#use-plugins-from-a-supported-surface), but this installed version's graphical hook trust flow remains unverified.

The next bounded probe should establish graphical installation/trust first, capture one genuine callback with action and conversation identity, then test bounded allow/deny and timeout fallback. Preserve native permission enforcement and distinguish decision from action outcome. No hooks were installed or trusted in this investigation.

Hooks do not establish an external idle-chat input API. That gate remains separate: demonstrate an authorized external client submitting into the same idle conversation, without a permanent model polling loop. A permission callback alone cannot complete the server-controlled workflow. If that route remains unavailable, document Codex's limitation and prioritize M02's Cline extension feasibility upon authorization.

## Approval propagation requirements

For a supported protocol route, preserve the native JSON-RPC request ID and thread/turn/item identities. Distinguish command, file-change, permission-subset, and question/elicitation requests. Return only native choices actually offered; prefer one-action or turn scope. Correlate request resolution with the decision and subsequent item state: a resolved notification can also represent cleanup. Action success remains a separate result. [Approval protocol](https://learn.chatgpt.com/docs/app-server#approvals).

For a UI route, capture the selected conversation, full reviewable action, dialog fingerprint, and offered semantic controls. Recheck immediately before acting. If the app cannot atomically bind the decision to that pending request, advertise supervised/local approval rather than unattended approval. No request-switch protection has been established here.

The future server must distinguish **decision recorded**, **native decision applied**, and **action completed**. Assistant text and a generic “Approve for me” message cannot supply missing native request identity, scope, or application evidence. These requirements preserve requirements §§7–9; no new wire schema is defined in M01.

## Remaining acceptance probe and handoff

The user asked the agent to approve the probe. At the initial checkpoint, the disposable chat was idle with its second text turn completed; no pending approval was exposed in that status. No approval was applied and no marker file existed then. On 2026-10-05 the user submitted the bounded marker prompt; the app wrote automatically, as recorded below. [Approval checkpoint](../../evidence/M01/native-approval-checkpoint.json).

M01 is Done as feasibility research. The command probe remains stopped; a user-proposed app-access request supplied the genuine pending approval and supervised response evidence in another disposable M01 chat. The actual native choice was Allow this conversation. No persistent grant, native approval ID or atomic remote resolver is inferred.

M02 is Done; M03–M26 remain Not started. M03 must explicitly decide whether to obtain supported Codex integration, approve a revised supervised scope, or defer Codex and prioritize Cline. M16/M17 remain gated on usable attachment and native request-bound controls. See [M01-DONE-001](../../IMPLEMENTATION_TRACKER.md#m01-done-001--codex-feasibility-research-complete), [procedure](../../evidence/M01/live-probe-plan.md), and [evidence index](../../evidence/M01/README.md).

## 2026-10-05 reassessment

The installed version/build is unchanged. `read_thread` returned the original two completed text turns; its current chat state was `notLoaded`, which does not enumerate native pending requests. No new prompt was dispatched, and the marker remains absent. The current `codex-app-tools` inventory still exposes no approval enumerator/resolver or task-permission setter. [Reassessment evidence](../../evidence/M01/reassessment-2026-10-05.json).

Official safety guidance continues to exclude automating ChatGPT itself, so the successful IDE grants from M02 do not open this UI route. A manual, narrowly scoped native approval probe is required unless a supported non-UI inspection interface is established. The user was asked to identify an available task-specific review mode and authorize the exact marker prompt in the disposable chat. M01 remains In Progress pending that evidence.

The hook candidate is narrower than a general permission-grant API: its current decision is allow/deny/defer, while `updatedPermissions` and `updatedInput` are reserved. The documented event supplies session/turn/tool input but no unique approval-request ID in its event table. A future server relay must bind its request to the specific pending invocation, digest and expiry, and return only through that callback; session/turn identity alone is insufficient. Hook trust and graphical installation remain unverified. [Hooks](https://learn.chatgpt.com/docs/hooks#permissionrequest).

App Server also documents a default/custom Unix-socket transport. This does not establish an authorized running-desktop attachment: the reviewed setup starts app-server. No sockets were scanned or connected to, and no separate runtime was launched. Vendor Remote is documented for app-based prompts/approvals but remains a vendor-client workflow, not a verified custom-server API. [App Server](https://learn.chatgpt.com/docs/app-server), [Remote](https://learn.chatgpt.com/docs/remote-connections).

## 2026-10-05 automatic file-edit result

The user submitted the prescribed prompt in **M01 disposable app-control probe** and reported “it wrote automatically.” `read_thread` confirmed completed turn `01a109e5-c6f4-7312-aca5-ee03e85989a2` with a native completed `fileChange` item adding only `evidence/M01/native-approval-marker.txt`. Independent filesystem inspection confirmed exactly `M01 APPROVAL PROBE\n`. No shell-command item appeared in this returned turn. [Automatic-write evidence](../../evidence/M01/automatic-write-probe.json).

This verifies native app file-edit execution and observable action completion. It does not verify an approval request, remote approval application, or permission propagation. The task permission mode was not reported; automatic behavior does not establish Full Access or any particular preset. No additional probe, outside-workspace edit, setting change, or hook was used to force an approval. The agent requested the exact task-menu labels/current selection before determining whether a genuine bounded approval test is possible. M01 remains In Progress; M02 remains Done.

## 2026-10-05 permission mode clarification

The user reports three choices: **Ask for approval**, **Approve for me**, and **Full access**, with **Ask for approval** selected. This is human-reported UI evidence; the exact sandbox configuration was not independently inspected. It resolves the earlier unreported-mode note. [Mode evidence](../../evidence/M01/permission-mode-observation.json).

Ask for approval does not require a prompt for every edit: actions already permitted within the configured boundary can continue automatically. The marker target was writable, so the automatic write is consistent with this mode. Approve for me changes the reviewer for eligible requests while retaining the sandbox; Full access removes sandbox restrictions. [Permissions](https://learn.chatgpt.com/docs/sandboxing), [Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review).

The original marker procedure was unsuitable for reliably triggering native approval. No per-edit review mode is established by the supplied menu. Keep the existing mode; no settings were changed or new probe dispatched. A future server must relay actual native pending requests and separately record already-permitted execution, reviewer type, native resolution and action outcome. A server consent record cannot substitute for native permission enforcement. M01 remains In Progress pending a genuine native approval/response mechanism and external companion route.

## Completion plan

The [M01 completion plan](m01-completion-plan.md) separates discovery completion from a usable production integration. Preserve the successful automatic workspace edit; use one explicitly authorized, stdout-only native escalation probe to inspect a real approval and its available local response mechanism. Then finalize the scoped route decision. A documented negative route finding can close research after the native gate passes, while Codex implementation and M03's product-scope decision remain gated. No new probe was executed when preparing this plan.

## 2026-10-05 completion-plan execution — historical checkpoint

The exact prompt reached **M01 disposable app-control probe**, turn `01a10a84-242b-7120-b6ad-f5bea731312f`, which completed in 7,056 ms. The probe agent reported effective policy `never` and an unavailable `sandbox_permissions` option. The returned turn contains its final report and no commandExecution or fileChange item. The policy itself was not independently inspected; no native rejection or pending approval is asserted. [Sanitized evidence](../../evidence/M01/native-approval-probe.json).

The bounded interface review confirms the scoped route decision: built-in chat input/output works within this host; App Server attachment to this running desktop remains unestablished; PermissionRequest is an untested callback candidate without idle submission; Vendor Remote is a vendor-client workflow; current Computer Use is prohibited and third-party accessibility feasibility is unverified. [Route evidence](../../evidence/M01/integration-route-decision.json), [current inventory](../../evidence/M01/tool-inventory-2026-10-05.json). Sources: [App Server](https://learn.chatgpt.com/docs/app-server), [hooks](https://learn.chatgpt.com/docs/hooks#permissionrequest), [Remote](https://learn.chatgpt.com/docs/remote-connections), [Computer Use safety](https://learn.chatgpt.com/docs/computer-use#safety-guidance).

A vendor or integration must expose authorized attachment, addressed idle input, observable events, and request-bound decisions. Production capabilities remain disabled, including atomic remote approval. Both existing marker files retain their original bytes and digest. The [evidence index](../../evidence/M01/README.md) records provenance and the open gates. M01 remains In Progress; no completion entry is warranted.

## 2026-10-05 native app-access evidence and completion amendment

The user submitted the Xcode-beta retry prompt directly in **Create M01 approval probe**, another existing disposable chat in this workspace. `read_thread` confirms thread `01a109ef-ba1d-7512-8442-181392ae57eb`, completed turn `01a10acb-d558-7c10-ab7b-6af39afaf854` and two separate `cua.getApp("Xcode-beta")` tool items with completed status (31,150 ms and 98 ms). The turn took 49,573 ms. The final agent report says the retry returned Welcome to Xcode, Xcode Version 27.0 beta; raw window output is not included in the retrieved transcript.

The [screenshot](../../evidence/M01/xcode-app-access-pending.png) shows native Computer Use state Awaiting approval and “Allow ChatGPT to use Xcode?” with Always allow, Deny and Allow this conversation. The user confirmed selecting **Allow this conversation**. This establishes an observed genuine request and supervised local response, corroborated by completed tool calls. Request IDs and native resolution events remain unexposed; tool-call IDs are not approval IDs. Intended Always allow wording does not establish a saved grant. [Provenance](../../evidence/M01/xcode-app-access-probe.json).

The alternative category satisfies the existing research criterion; the command-specific probe remains Unsupported, with no stdout or exit status claimed. No acceptance criterion was removed. The self-app restriction, external-route conclusion and downstream integration requirements are unchanged. M01 is Done; production capabilities remain disabled. No further app request, automated click, global setting change, hook or runtime was introduced by the recording agent.
