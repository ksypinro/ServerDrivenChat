# M01 Completion Plan

Prepared: 2026-10-05, Asia/Dhaka. Executed: 2026-10-05 11:23 +06:00. Status: **M01 Done as feasibility research after user-supplied native app-access evidence**.

## Final disposition

**Investigation closed. No required M01 action remains.** The user-provided app-access approval and actual Allow this conversation choice satisfy the native demonstration. The [final audit](../../evidence/M01/closure-audit.json) reconfirmed both baseline replies, the completed access calls and all closure gates. The route assessment is a completed scoped negative finding; M16/M17 own external implementation proof. The command-specific steps below are historical and do not request another test.

## Initial execution outcome — historical checkpoint

The user instructed execution of this plan. Its exact prompt was delivered once to the existing probe chat. The completed turn reported that its effective approval policy is `never` and its tool instructions prohibit `sandbox_permissions`; it did not invoke the command. `read_thread` returned no commandExecution or fileChange item in that turn. This is a probe-agent policy report, not an independently inspected policy configuration or a native denial. The earlier human-reported Ask for approval selection remains separate evidence.

Step 1 passed: existing text continuity and automatic-write evidence retained; both existing markers verified unchanged. Step 2 stopped under its unsupported-option rule. Step 3 was Not run because no pending request existed in the observed probe. Step 4 completed with the scoped negative route decision. Step 5 saved the checkpoint, evidence and validation, but research closure and `M01-DONE-001` are withheld because the native gate did not pass. No fallback, retry, extra probe, setting change or later milestone was performed.

See [native probe evidence](../../evidence/M01/native-approval-probe.json), [route decision](../../evidence/M01/integration-route-decision.json), and [execution checkpoint](../../IMPLEMENTATION_TRACKER.md#m01-checkpoint-008--completion-plan-execution-stopped-at-native-gate). Further probing needs a supported genuine approval surface or an explicit revision of the discovery acceptance criterion; this execution does not authorize repeated escalation attempts.

## Research closure amendment

The command probe remains stopped and its unsupported outcome is preserved. The user supplied a genuine native **Computer Use app-access** request from **Create M01 approval probe**, thread `01a109ef-ba1d-7512-8442-181392ae57eb`, another existing disposable M01 chat. Its screenshot shows “Allow ChatGPT to use Xcode?” with Always allow, Deny and Allow this conversation. The human confirmed the actual choice was **Allow this conversation**; the prompt's intended Always allow was not the choice used. Both separate `cua.getApp("Xcode-beta")` tool items completed. The welcome window/version is a probe-agent report; raw window output and native resolution IDs are not exposed by `read_thread`.

The tracker criterion requires a genuine pending approval and its available response mechanism, rather than a particular permission category. The captured request and supervised response satisfy that criterion without claiming command escalation, persistent grants, external attachment or atomic remote resolution. M01 is **Done as feasibility research**; see [approval evidence](../../evidence/M01/xcode-app-access-probe.json), [screenshot](../../evidence/M01/xcode-app-access-pending.png), and [M01-DONE-001](../../IMPLEMENTATION_TRACKER.md#m01-done-001--codex-feasibility-research-complete).

The original steps below record the planned command probe. Command-specific stdout/exit checks were not run or passed. No new probe or later milestone was executed by the recording agent. M03 requires an explicit product decision; M16/M17 remain gated on usable integration.

## Objective and corrected interpretation

Complete **Codex app-control feasibility** against the existing tracker criteria. Ordinary edits to permitted project files should run automatically. The marker write is a successful baseline, not a failed approval test. Protected paths and other policy restrictions remain separate. [Official sandbox behavior](https://learn.chatgpt.com/docs/sandboxing).

M01 must demonstrate same-conversation input/output, inspect one real pending approval, establish its available response mechanism, and deliver a capability/route decision. The tracker explicitly permits a negative discovery result. It does not require building a server, companion, or production approval relay. Conversely, completing research cannot certify those missing capabilities.

## Current evidence

| Check | Current result | Remaining work |
|---|---|---|
| App/version and conversation identity | Recorded | Recheck only if installation changes |
| Two turns in one existing conversation | Passed through app-owned tools | Preserve existing evidence |
| Native workspace edit | Passed automatically | Preserve marker; do not repeat to trigger approval |
| Selected permission mode | Ask for approval, user-reported | Keep this mode |
| Genuine native pending approval | Passed: native Xcode app-access screenshot | Research gate satisfied |
| Response mechanism | Passed: Allow this conversation; access calls completed | Supervised local scope only |
| External input/output attachment | No usable route established; assessment finalized | Implementation gate remains |
| Atomic remote approval | Unverified | Disable capability; record prerequisite for M17 |

## Step 1 — Freeze the baseline

Use the existing **M01 disposable app-control probe**, thread `01a107bf-812f-7082-8fc3-978ac74a289f`. Retain the original text-turn and automatic-write evidence. Do not reset the chat, clear grants, change global settings, or install hooks for this step.

**Exit:** existing passed checks are cross-referenced; the workspace write is classified as already permitted. This step is documentation work and requires no new native probe.

## Step 2 — Trigger and inspect a real approval

Proposed test: ask the app's native command tool to execute one fixed stdout-only command with an explicit sandbox escalation request. The command is `/usr/bin/printf 'M01-NATIVE-APPROVAL-OK\n'`. It needs no files, network, credentials, or persistent settings. `/usr/bin/printf` exists on this host. The escalation is deliberately requested to test the approval mechanism, not because printing requires broader access.

This is an operation performed by the existing desktop app. The user interacts through the chat and approval UI; no terminal or LLM CLI runtime is introduced. The earlier marker authorization did not cover this different operation. The user can submit the following prompt themselves, or explicitly authorize its delivery to that existing chat:

```text
Run one bounded M01 native approval test. Keep Ask for approval selected.
Use your native command-execution tool for exactly:
/usr/bin/printf 'M01-NATIVE-APPROVAL-OK\n'

Request sandbox_permissions="require_escalated", with a justification that
this is an intentional stdout-only approval-flow test. Set login=false if
supported and omit prefix_rule. Let the native approval pause execution.
Do not replace it with a chat consent question, use an in-sandbox fallback,
retry after rejection, or run another command. Do not edit files, access
the network, or change permissions. If this explicit approval request is
unavailable or runs without a native prompt, report that and stop.
```

A genuine prompt is expected only if the host exposes this tool option and the effective policy requires review. A saved grant or managed policy can change the result; do not promise a dialog merely from the menu label.

While pending, record the chat identity, exact command, requested scope, displayed choices, and native request/item ID if exposed. The human supplies a sanitized screenshot or transcription because this environment cannot inspect Codex through Computer Use. Never fabricate a missing request ID or substitute a chat question for native approval.

**Exit:** a real native request is documented. If it runs automatically or the tool rejects the option, save that outcome and stop this probe. Do not move to unrelated paths or repeatedly request broader privileges. Under the current acceptance criterion, M01 stays In Progress until a supported genuine probe is available or the user explicitly approves a revised discovery-only exit criterion.

## Step 3 — Resolve that request once

After capturing it, the human selects the native one-time approval choice, if offered. Record the exact label; do not assume the UI uses protocol enum names. Verify the native command item completes, its output is exactly the marker plus newline, and its exit status is zero. A rejection is also valid evidence of a response mechanism if the native result confirms the operation was declined and no fallback ran. A second allow/deny probe is optional for M01; full conformance belongs to M17/M18.

Save sanitized results as `evidence/M01/native-approval-probe.json`, including evidence provenance. Distinguish human-observed pending UI, programmatically observed completion, and anything unverified. A manual click establishes only a supervised local response mechanism. It does not establish server access, request-switch protection, or native atomic resolution.

**Exit:** the pending request, actual response mechanism, decision, and resulting action state are recorded separately. [Documented approval lifecycle](https://learn.chatgpt.com/docs/app-server#approvals).

## Step 4 — Finish the integration-route decision

Perform one bounded review of the documented interfaces and exposed app tools, using the saved investigation rather than repeating successful text probes. Evaluate external existing-chat input, observable output, and native approval response separately:

| Candidate | Required conclusion |
|---|---|
| Built-in chat tools | Working inside this host; no external companion API established |
| App Server | Published protocol; no supported attachment to this running desktop established by the reviewed setup |
| PermissionRequest hook | Candidate approval callback; graphical trust and live response unverified; does not provide idle prompt submission |
| Vendor Remote | Vendor-client workflow; custom-server access unverified |
| Accessibility | Current Computer Use probe is prohibited; third-party companion feasibility remains unverified |

If a supported external route becomes available, record its exact attachment prerequisites and evidence. Otherwise conclude **no usable external route established within the assessed interfaces and current constraints**. Do not claim universal impossibility. Record what the vendor/integration would need to expose: authorized attachment, addressed idle prompt submission, observable events, and request-bound decisions.

**Exit:** evidence-backed route decision; unsupported/unverified capabilities remain disabled. The native local approval probe does not change the external-route conclusion.

## Step 5 — Close research and hand off honestly

Update `codex.md`, `capability-matrix.json`, the probe procedure and evidence index. Validate JSON, local links, unchanged marker bytes, and agreement between report and tracker. Append `M01-DONE-001` with the walkthrough, test result, limitations, actual model/effort if known, and downstream gates; then update the M01 row and current handoff together.

**Done means:** baseline input/output passed; genuine approval and available response mechanism inspected; remaining capabilities classified; route decision saved; completion artifacts consistent. No acceptance gate is silently removed.

If the route result is negative, M01 can be **Done as feasibility research** once those checks pass. M16/M17 remain gated. M03 still needs an explicit product decision before selecting a Codex implementation path: obtain supported integration, approve a revised supervised scope, or defer the Codex pilot and prioritize Cline. Do not silently switch the product order or assume a manual approval demonstration makes the companion viable.

Suggested execution: retain M01's existing **GPT-6.1 Sol / High** recommendation. Work sequentially in one chat; no delegation or later milestone implementation is needed.
