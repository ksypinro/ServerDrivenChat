# DECISION-004 — VS Code / Cline extension packaging

**Status:** Accepted; version-pinned maintained build adopted for M19 on 2026-10-07. **Scope:** M02/M03/M19/M20/M21/M22/M24.

Package the eventual integration as a first-party VS Code extension, distributed as a signed VSIX and submitted through the Visual Studio Marketplace release path at M24. The extension host may own bridge lifecycle for the Cline instance in its host; it must not rely on a model turn to keep listening.

M02 established that installed Cline public exports do not provide task-addressed input, event snapshots/subscriptions, trusted Connect origin context, or atomic request-bound approval. Therefore the VSIX remains a documented package boundary until a supported upstream app-owned Cline API addition is available and adopted. Do not use private webview/protobuf routes, generic button helpers, or a maintained fork unless that fork is explicitly adopted through a product decision and its maintenance burden is accepted. A VS Code extension alone does not establish Antigravity compatibility; M19 must validate each host separately.

The user explicitly approved the pinned patch and isolated test on 2026-10-07. This adopts the local Cline 4.1.22 `sdc-m19.1` maintained build and companion package, accepting compatibility checks for upgrades. The app-owned API is inserted inside the copied Cline extension and operates on its existing controller, task, session, message coordinator, and event emitter. The companion consumes only that public namespace. It does not launch an independent Cline runtime.

The maintained package fails closed on an unrecognized base version, source bundle fingerprint, API version, remote host, or missing controller contract. Every upgrade requires renewed source review, a new patch revision and fingerprints, fixture checks, and real-task acceptance. Native task/workspace changes and extension-host reload invalidate binding; users explicitly select again. The installed stock extension is preserved during development tests.

Development VSIX artifacts are unsigned and validated only on local VS Code. Antigravity and remote extension hosts require separate compatible builds and acceptance. Native approval/input/cancel controls remain M20, Connect/pairing remains M21, and signing/publication remains M24. Adoption permits implementation; it does not itself prove M19 acceptance.

## M20 acceptance amendment — 2026-10-07

Following the user's instruction to finish the prepared isolated test, the adopted route now includes Cline 4.1.22 `sdc-m20.2` (development version 4.1.2202), app-owned API 1.1 and companion 0.2.0. The [native trace](../../evidence/M20/live-vscode.json) and [verification](../../evidence/M20/verification.json) establish exact allow/deny, local-resolution versus stale remote decision, question answer and acknowledged native cancellation. The application coordinator owns each transition; the companion supplies addressed requests through the public API. Native approval settings remained unchanged.

The generated companion retains stable identity `server-driven-chat.sdc-cline-bridge` inside the separate M20 directory. Whole-action once and denial are the supported scope. Narrowed/persistent grants and revocation reject explicitly. The same local-host, fingerprint, maintenance, unsigned-development and upgrade acceptance boundaries still apply. Solar was restored and the bridge disconnected after acceptance. M19's original artifacts/evidence remain historical; M21 Connect/pairing and M24 distribution are separate gates.

## M21 implementation amendment — 2026-10-07

The user's M21 instruction extends the adopted pinned route to app-owned API 1.2, Cline `sdc-m21.3` and companion 0.3.0. Custom tools are registered in the existing native SDK session; trusted task/session/tool-call origin is captured out of band. Profiles and graphical two-sided pairing start the neutral durable HTTP/SSE listener, and credentials remain in VS Code SecretStorage. Original artifacts remain preserved. [M21 verification](../../evidence/M21/verification.json) records source/fixture/transport checks. Native adoption/acceptance for the newly built unsigned packages remains pending action-time confirmation; implementation evidence does not close the real-host gate.

## M21 acceptance amendment — 2026-10-07

The user’s instruction to finish the remaining M21 tasks confirmed the prepared bounded isolated test. Cline 4.1.22 `sdc-m21.3`, app-owned API 1.2 and companion 0.3.0 passed real local VS Code acceptance: the native initial prompt invoked the trusted-origin SDK tool, graphical synthetic sign-in and independent server/local pairing completed, and the authenticated listener stayed online after the initiating turn ended. Two later server text prompts executed in the same task with marker continuity. Repeated graphical Connect reported the existing binding; local disconnect detached the server binding. [Native/server evidence and verification](../../evidence/M21/verification.json) record exact loaded fingerprints and limitations. Solar was restored, the composer emptied, and the disposable fixture/schema/service stopped. Installed stock Cline and original milestone artifacts remain unchanged. This closes M21 for the adopted local pin; M22’s full approval/recovery journey and M24 distribution remain separate.

## M22 acceptance amendment — 2026-10-08

The user explicitly approved the isolated M22 run with companion 0.4.0 and the adopted unchanged Cline API 1.2/native pin. Native Cline executed all six graphical server prompts in its existing task. Two signed whole-action decisions were consumed by real HTTP and produced native receipts with exact allow/deny file outcomes. Question answer, acknowledged cancellation, bounded SSE reconnect and local takeover passed. The listener renewed its lease while native approval remained pending and continued after completed turns. The [walkthrough](../../evidence/M22/walkthrough.md) records exact IDs, first-use bounded rejections/explicit retries, a preserved failed diagnostic attempt and repairs. The independent verifier validates matching native/server events, digests, receipts and effects.

M22 closes the main graphical journey for the adopted local pin. It adds no broader host or grant support. M23 systematic recovery/race hardening and M24 release distribution remain separate. The M22 generator produces a separate companion and verifies the frozen native package; the historical M21 generator refuses current sources before mutation. Solar is restored, the bridge disconnected, fixture/schema stopped and test tabs closed. Installed stock Cline and historical archives remain unchanged.

## First-release scope amendment — 2026-10-08

[DECISION-008](008-cline-first-release.md) makes the adopted local Cline plugin and its required server/control UI the first final-release target. M23–M26 proceed without deferred Codex M16–M18. Preserve the same pin/host/grant boundaries; M24 packages the reviewed native and companion pair and M26 verifies the frozen candidate rather than inferring release conformance from historical development evidence. No additional host/platform or stock-Cline support is granted by this scope change.
