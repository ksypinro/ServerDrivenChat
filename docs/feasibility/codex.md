# M01 — Codex desktop control feasibility

Status: **Done. Investigation closed.** Completion: [M01-DONE-001](../../IMPLEMENTATION_TRACKER.md#m01-done-001--codex-feasibility-research-complete). Final audit: [closure-audit.json](../../evidence/M01/closure-audit.json).

## Established result

The installed desktop host supports addressed input and observable completed output in an existing conversation through its app-owned tools. A genuine native Computer Use app-access approval was captured in a disposable M01 chat. The human selected **Allow this conversation**, and both subsequent access tool calls completed. The required M01 demonstrations have passed. No further approval screenshot or app-access prompt is required to close this milestone.

**Integration decision:** no-go for an unattended custom-server Codex pilot on the currently evidenced interfaces. No usable external route was established within the assessed interfaces and constraints. This is a completed negative feasibility finding, not a claim that all possible integrations are impossible. Production capabilities remain disabled.

M01 explicitly permits a negative route conclusion. External attachment, atomic remote approvals and recovery are owned by M16, M17 and M23. These are implementation prerequisites and conformance work; they are not unfinished M01 approval demonstrations. [Tracker acceptance criterion](../../IMPLEMENTATION_TRACKER.md#m01--codex-app-control-feasibility).

## Acceptance and evidence

| Required M01 check | Final result | Evidence |
|---|---|---|
| Selected existing conversation accepts input and exposes replies | Passed | [Two completed turns](../../evidence/M01/app-owned-conversation-probe.json), reconfirmed in the final audit |
| Genuine native approval inspected in a disposable task | Passed | [Pending screenshot](../../evidence/M01/xcode-app-access-pending.png), target and all native choices visible |
| Available response mechanism established | Passed: supervised local UI | [Actual human choice and completed tool calls](../../evidence/M01/xcode-app-access-probe.json) |
| Unsupported/unknown operations and request-switch limits classified | Passed | [Capability matrix](../../evidence/M01/capability-matrix.json) |
| Evidence-backed integration decision | Passed: scoped negative finding | [Route assessment](../../evidence/M01/integration-route-decision.json) |
| Artifacts, walkthrough and tracker consistent | Passed | [Validation](../../evidence/M01/documentation-validation.json), [completion entry](../../IMPLEMENTATION_TRACKER.md#m01-done-001--codex-feasibility-research-complete) |

## Installation and conversation identity

Read-only installed metadata identifies `/Applications/ChatGPT.app`, bundle `com.openai.codex`, version **26.930.31730**, build **12947**. The final audit reconfirmed that version. Recorded platform: macOS 26.5.1 ARM64. Actual model/effort: Unrecorded. [Environment](../../evidence/M01/environment.json).

The input/output baseline used **M01 disposable app-control probe**, thread `01a107bf-812f-7082-8fc3-978ac74a289f`. It returned exactly `M01-APP-INPUT-OK`, then `M01-CONTEXT-7K4P CONTINUITY-OK` on an addressed follow-up in the same conversation. Host records identify completed turns and the native conversation ID. This establishes the app-owned route's scope; no external endpoint or client authenticated in that demonstration.

The user performed the approval probe in another existing disposable M01 chat, **Create M01 approval probe**, thread `01a109ef-ba1d-7512-8442-181392ae57eb`. Approval evidence is tied to that chat rather than relabeled as the original baseline chat.

## Native approval and action outcome

The supplied screenshot shows native Computer Use state **Awaiting approval** and **Allow ChatGPT to use Xcode?**, with **Always allow**, **Deny**, and **Allow this conversation**. The actual human selection was **Allow this conversation**. The prompt's stated intention to use Always allow was not the choice used; no persistent grant is claimed.

In turn `01a10acb-d558-7c10-ab7b-6af39afaf854`, two separate `cua.getApp("Xcode-beta")` calls completed. The final probe-agent response reports Welcome to Xcode, Xcode Version 27.0 beta. The retrieved transcript exposes completed call statuses, not raw window payloads or native approval-resolution events. Those provenance limits are retained in [the evidence record](../../evidence/M01/xcode-app-access-probe.json).

The screenshot, explicit human decision and completed tool calls establish a supervised local response mechanism. No native approval request ID is exposed, and MCP call IDs are not approval IDs. Request-switch atomicity and remote resolution are not demonstrated.

Computer Use app approvals are presented directly to the human and are separate from automatic review of eligible tool actions. This supports treating the observed app-access request as a valid native permission category; its existence does not establish hook coverage for that dialog. [Official approval guidance](https://learn.chatgpt.com/docs/sandboxing/auto-review#when-it-triggers).

The earlier stdout-only escalation attempt remains **Unsupported before invocation**. Its original evidence is preserved; no command output or exit status is invented. The automatic workspace marker edit remains a passed file-edit baseline. Both existing marker files retain exactly `M01 APPROVAL PROBE` plus newline. [Command attempt](../../evidence/M01/native-approval-probe.json), [automatic edit](../../evidence/M01/automatic-write-probe.json).

## Final integration-route assessment

| Assessed interface | Established capability | Final limitation and disposition |
|---|---|---|
| Built-in chat tools | Addressed host-owned input, final output, completion and identity | No external companion endpoint or native approval resolver exposed; retain as feasibility evidence |
| App Server | Documented protocol for turns, events and request-specific decisions | No supported attachment recipe to this already running desktop instance established; not selected for the current pilot |
| PermissionRequest hook | Documented approval callback candidate | Live trust/identity/response untested; no idle submission route; not an established end-to-end integration |
| Vendor Remote | Documented vendor-client chat and approval workflow | Custom-server access not established; not a verified project integration |
| Current Computer Use | Xcode access works; human-supplied native approval is inspected | Automating ChatGPT itself is restricted; no Codex UI adapter established |
| Separately installed accessibility companion | No live capability established here | Requires an explicitly selected permitted implementation and conformance checks; no atomic resolver established |

App Server's documented control-socket transport is not proof of attachment to this running desktop app. The reviewed setup starts an app-server; no separate runtime or private socket was launched or connected during M01. [App Server](https://learn.chatgpt.com/docs/app-server). Hooks and vendor Remote likewise do not establish the project's external input/output/approval contract. [Hooks](https://learn.chatgpt.com/docs/hooks#permissionrequest), [Remote](https://learn.chatgpt.com/docs/remote-connections). The current self-app automation restriction is documented and backed by the saved refusal. [Computer Use](https://learn.chatgpt.com/docs/computer-use#safety-guidance), [refusal evidence](../../evidence/M01/computer-use-restriction.json).

## Capability boundaries and handoff

Streaming/replacement output, active-question responses, stop/steering, foreground-independent operation, restart/recovery and external attachment remain unverified. Atomic approval resolution is not advertised. The native request, selected scope, resolution and action outcome must remain separate concepts in future implementation.

M03 owns the explicit product decision: obtain supported Codex integration, approve a revised supervised scope, or defer Codex and prioritize Cline. This report does not select a new product order. M16 owns external binding and two server-originated turns in the existing app; M17 owns request-bound remote decisions and native acceptance; M23 owns stale/duplicate/concurrent decisions and recovery. No server, companion or adapter was built in M01.

M01 has **zero remaining required investigation actions**. The outcome is final for the assessed installation and interfaces. Reopen discovery only for materially new integration evidence, a relevant app/interface change, or a revised product requirement—not to repeat the passed app-access approval demonstration. At the original M01 closure, M03–M26 were Not started. As of the 2026-10-06 repair close-out, M03–M10 are implemented and revalidated; current status is recorded in the [tracker](../../IMPLEMENTATION_TRACKER.md).

See the [evidence index](../../evidence/M01/README.md) for all artifacts. The [investigation history](codex-investigation-history.md) preserves earlier checkpoints and superseded next steps.
