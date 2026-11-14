# MB-05 completion plan: steps reviewed individually by Luna

Date: 2026-10-15. Status: **plan only; MB-05 remains In Progress at Phase A**.

This plan implements the Claude milestone in [task.md](../../task.md), not the
historical M05 milestone. Its goal is an authenticated SDC client exchanging text
with the user's selected, existing Claude Code VS Code conversation, with reliable
identity, permission enforcement, output attribution, and recovery.

Each numbered step is a separate implementation and review unit. Rows with suffixes
such as `06a` are separate units too. Complete one unit, give Luna its evidence,
resolve findings, and only then begin dependent work. This document does not claim
that Luna has reviewed anything or authorize running all native tests at once.

## What is already established

| Existing evidence | What it proves | What it does not prove |
| --- | --- | --- |
| [Manual classic-hook tests](../../evidence/MB05/NATIVE-CLASSIC-HOOKS.md) | Explicit refusal, crash, malformed JSON, and timeout blocked the tested manual input | The same failures block attributed Mod input |
| [Mod-origin tests](../../evidence/MB05/NATIVE-ORIGIN.md) | Attributed input reaches the classic guard and can be refused | Its original busy-labeled attempt was actually queued |
| [Busy-queue test](../../evidence/MB05/NATIVE-QUEUE.md) | An attributed offer made while busy waited and was refused after the active turn | Changing permission or a successful stale check |
| [Authority Test A](../../evidence/MB05/NATIVE-AUTHORITY.md) | Synthetic permission revoked before queued admission caused refusal | Real server leases or permission revoked after an allow |
| Authority Test B | No result: it was not submitted | Any claim about the post-allow race |

The immediate blocker is the existing conversation's ownership/identity conflict.
The decisive unresolved experiment is Test B. Even a successful Test B is only one
required observation; it does not establish all lifecycle and recovery guarantees.

## Fixed boundaries

- Official Claude Code **2.1.296**, isolated PluginLab VS Code **1.140.0**;
  measure actual artifacts before testing. Do not upgrade to bypass a missing API.
- Preserve existing IDE conversations. Use the approved disposable **Project
  analysis** conversation for the already approved diagnostic. A title alone is
  not identity. Additional existing sessions need explicit selection for their
  bounded tests; discovery must never create them.
- No independent Claude process/model runtime, private socket/webview protocol,
  patched extension, UI-driven production adapter, or automatic permission grant.
  UI interaction may set up and observe native acceptance only.
- Keep wire protocol **2.0**, local driver contract **1.0**, and neutral package
  boundaries. A demonstrated contract gap needs a separate reviewed decision.
- Reuse the generic host, authenticated server transport, and file-backed SQLite
  bridge. Server credentials stay in the host; the Mod never receives them.
- Core scope: `probe`, `attach`, `inspect`, `submit`, `subscribe`, `detach`.
  Approval decisions, question responses, running-turn cancellation, media,
  attachments, caller tools, and native-tool-denial claims remain unavailable.
- Preventing a queued remote prompt from starting after authority loss is
  mandatory even when running-turn cancellation is unavailable.
- Native safety diagnostics use fixed no-tools text and bounded one-shot offers.
  Preserve native permissions. Human password entry remains human-only.
- Existing approval for the two exact synthetic tests persists. Reuse it within
  that scope; do not ask for it again. It does not automatically authorize new
  failure-injection code, other conversations, or real server device binding.
- These tests use synthetic authority until expressly labeled real authority.
  Local hook state is not a server token, lease, or production credential.
- Production catalog admission and distribution remain **MB-09**. MB-05's own
  native crash/replay/takeover/expiry requirements cannot move to MB-08.

## Review and execution rules

Use the companion [Luna review template](mb05-luna-review-template.md) for every
unit. The implementer submits a bounded diff plus a factual evidence packet; Luna
independently inspects the changes and results. Request the Luna model explicitly
when the review is run. If Luna is unavailable, keep review pending rather than
silently substituting another model or labeling the step approved.

Use these separate fields:

| Field | Allowed values | Meaning |
| --- | --- | --- |
| Implementation status | Not started / In progress / Ready for review | Work progress only |
| Result | PASS / FAIL / INCONCLUSIVE / BLOCKED | Outcome of this exact step |
| Luna review | Pending / ACCEPT / CHANGES REQUIRED | Whether evidence and conclusion withstand review |

Luna may ACCEPT a well-supported FAIL. That validates the finding; it **does not**
pass the gate or unlock implementation. Missing timestamps, absent native results,
skipped tests, or unavailable evidence cannot be turned into PASS. Advance only
on PASS plus ACCEPT for every prerequisite. A review itself grants no native access.

For each unit, record under the proposed `evidence/MB05/steps/<step-id>/` directory:

1. `handoff.md`: objective, prerequisites, bounded file list, exact commands and
   versions, expected result, observed result, limitations, and cleanup.
2. `result.json`: step/attempt IDs, UTC time, artifact hashes, session/selection
   digests where relevant, result, test counts/skips, and evidence references.
3. Sanitized supporting observations: ordered events, fixed diagnostic labels,
   native outcome, durable state/checkpoints, and UI observations where needed.
4. `luna-review.md`: reviewer/model, reviewed diff fingerprint, verdict, cited
   findings, commands independently run, checks not rerun, and final disposition.

These are proposed future artifacts, not files already containing successful
results. Never include credentials, raw transcript, full native IDs, private
settings, or copied private state. Keep private restoration backups outside the
checkout. Preserve failed attempts; record each retry separately.

Record a baseline Git status before each unit. This checkout contains existing
changes; do not reset, discard, or attribute them to a new unit. Give Luna the
actual bounded patch and hashes, not an undifferentiated whole-checkout diff.
Changed reviewed bytes invalidate the affected review and downstream measurements.

Every native unit includes setup, one explicitly bounded attempt, reconciliation,
and cleanup. Keep the refusal mechanism active until every offered prompt is
accounted for. Unknown is not permission to retry or remove the guard. Restore
only added settings/state; verify probe unload and leave SDC disconnected. If
pending native input cannot be safely resolved, record the exact state and block
dependent work instead of declaring cleanup complete.

## Dependency order

Execute `01 → 02 → 03 → 04 → 05 → 06a…e → 07a…g → 08a…d → 09a…f → 10 → 11a…c → 12`.
Steps 01 and 03 are read-only preparation and may still be completed if Step 02
needs user assistance. All other native work depends on verified session ownership.

**Step 12 is the hard Phase A decision.** No production-shaped Claude driver,
transport, or pairing implementation begins before it passes. If it passes,
continue sequentially through Steps 13–32; every numbered predecessor and each
listed subcase must pass review before the next dependent step begins.

This is a conditional completion plan. The exact pinned build may lack the
required primitive. An evidence-backed blocker is a valid investigation outcome,
but MB-05 is complete only after Step 32 passes.

## Phase A — Establish the supported native execution boundary

### 01 — Freeze the baseline and evidence inventory

**Input:** current tracker, task, native evidence, and
[DECISION-011](../decisions/011-backend-driver-contract.md).

**Work:** record current source state, exact installed extension/runtime/host and
probe inventories, tool versions, disabled plugin state, and disconnected SDC
state. Classify historical evidence as native, schema, script, or stubbed evidence.
Identify any stale summary text without overwriting original observations.

**Check / PASS:** complete artifact measurements match the intended pins; settings
baseline is privately restorable; no earlier test is credited with a wider scope.
**Evidence:** inventory, baseline hashes, evidence table, bounded Git status.
**Stop:** changed native pin or unexplained artifact mismatch; resolve before load.

### 02 — Recover single-view ownership of the existing conversation

**Work:** inspect PluginLab windows and supported Claude session UI. Identify the
actual view owning Project analysis. Close only a verified duplicate disposable
view if safe; reopen the same existing conversation through supported native UI.
Do not force “Open here anyway”, delete lock files, kill unrelated sessions, or
create another conversation. If ownership cannot be established, record the exact
manual action needed from the user.

**Check / PASS:** one authoritative view, no ownership warning, stable native
session digest matching the previously selected session, correct host/window and
workspace. If the approved observation probe is needed, load it only in its
approved observation scope, reconcile its events, and unload it afterward.
**Evidence:** sanitized ownership observations and matching identity digests.
**Stop:** title-only matching, unexplained session replacement, or unresolved owner.

### 03 — Confirm the exact-build API and safeguard contract

**Work:** inspect supported declarations/schema generated by the installed bundled
2.1.296 runtime using developer validation commands only. Resolve how session,
turn, origin, submission result, lifecycle, and refusal are exposed. Obtain exact
declarations; public 2.1.277 declarations are insufficient. If unavailable, record
that limitation rather than substituting private implementation calls.

**Check / PASS:** the inventory is complete, the evaluation's callable APIs match
supported exact-build validation, and every unproven guarantee is explicitly
listed. Distinguish interface support, documented semantics, and observed behavior.
Identify the candidate native enforcement operation whose semantics Test B will
test. This is approval of the investigation inputs, not approval of that fence.
**Evidence:** API mapping, schema/type hashes, remaining guarantee questions.
**Stop:** the evaluation itself requires an unsupported method. Missing generated
types or unresolved fence semantics remain mandatory Step 12 closure items; they
must not be silently waived, but do not require abandoning an already supported,
approved diagnostic that can settle whether the candidate is unsafe. A Mod catch
alone is insufficient; empirical passes cannot invent a missing atomic guarantee.

### 04 — Review the Test B harness and observation protocol

**Input:** approved scripts in
[claude-authority-evaluation](../../extensions/claude-authority-evaluation/README.md)
and the [one-shot queue probe](../../extensions/claude-queue-evaluation/README.md).

**Work:** compare source and installed/cache hashes with approved candidates. Run
the 11 guard checks, focused queue/origin checks, and installed-schema validation.
Specify how one offer, guard allow, slow-hook start/end, revocation, and native
start/drop/completion will be correlated. Resolve the prior arm-registration
failure through supported lifecycle behavior, without weakening the session pin.

**Check / PASS:** one-shot arm registers in the verified session; no offer occurs
on loading; records can prove revocation occurred after allow and before the slow
hook ends. Record clock sources, precision, and ordering uncertainty. Ambiguous
ordering must be INCONCLUSIVE. No native test prompt is sent in this unit.
**Evidence:** source hashes, local test results, observation/cleanup procedure.
**Stop:** changed software requires review and any genuinely required new approval;
do not describe changed bytes as the already approved candidate.

### 05 — Run the decisive post-allow revocation test

**Work:** execute Test B exactly as documented, once, in the verified session.
Create fresh synthetic authority, arm, send the fixed no-tools count, observe
allow and the slow hook still running, revoke, then reconcile the single offer.
Use the existing user approval for this unchanged diagnostic.

**Check / PASS:** prove `allow < revoke < slow-hook-end`, with the same correlated
offer, followed by native refusal/drop and no remote turn start. Capture positive
native outcome evidence; absence of a rendered marker alone is insufficient.
**FAIL:** a native remote turn starts after revocation, even if no marker renders.
**INCONCLUSIVE:** missed timing, identity change, lost observer, or uncertain result.
**Evidence:** ordered trace, native result, identity/offer correlation, cleanup.
**Stop:** FAIL rejects this route. Do not start driver implementation or retry
until a substantively different supported primitive has been reviewed. A repeat
of an inconclusive attempt needs a documented cause, remedy, and bounded scope.

### 06 — Check other authority losses while input is pending

**Work:** review each new diagnostic before loading it. Reuse the proven effect
boundary and run each row as its own offer/evidence/review unit. Use synthetic
authority here; repeat actual server/host integration in Step 28.

| Unit | Injected transition | PASS requirement |
| --- | --- | --- |
| 06a | Synthetic permit expires while Claude is busy | No queued remote turn starts after expiry |
| 06b | Authority checker becomes unavailable before admission | Native refusal; outage cannot become allow |
| 06c | Selected generation changes before admission | Old generation's prompt cannot enter any session |
| 06d | Local user takes over before queued admission | Local activity proceeds under native permissions; old remote work is refused |
| 06e | Expiry and local takeover, separately, during the measured post-allow interval | Neither old authorization survives until execution |

**Evidence:** per-case timing, native identity, positive refusal, and cleanup.
**Stop:** unavailable transition signal or late refusal after turn start. Timeouts,
idle detection, and SDC-side timers alone are not execution fences.

### 07 — Check native failure refusal for attributed input

Historical manual-input checks do not close these cases. Execute one case at a
time using attributed Mod input, independently observed native start/drop events,
and the fixed no-tools fallback marker if a defect lets input through.

| Unit | Failure | PASS requirement |
| --- | --- | --- |
| 07a | Explicit guard refusal | No native remote turn |
| 07b | Guard process throws/exits unexpectedly | Native failure policy refuses |
| 07c | Malformed guard output | Native failure policy refuses |
| 07d | Guard timeout | Native failure policy refuses |
| 07e | Guard executable/script unavailable | Missing checker cannot admit input |
| 07f | Mod guard and refusal-handler both fail | Independent native safeguard still refuses |
| 07g | Guard re-entry or competing callback | No extra offer and no invalid-authority turn |

**Evidence:** failure injection definition, native outcome, offer count, cleanup.
**Stop:** any fail-open path; report the precise affected layer instead of assuming
that an isolated script test proves Claude's behavior.

### 08 — Check safeguard and Mod lifecycle with pending input

These are destructive to temporary test configuration only. Prepare bounded
diagnostics and restoration first; obtain only approvals actually required for
the new scope. Distinguish removal of a guard from failure of a configured guard.

| Unit | Transition with one pending offer | PASS requirement |
| --- | --- | --- |
| 08a | Mod disabled/unloaded | No orphaned executable remote prompt |
| 08b | Mod reloaded | Old generation loses authority; no automatic replay |
| 08c | Temporary guard settings removed/reloaded | Pending work is natively invalidated before enforcement disappears |
| 08d | Isolated extension host/window reload | Lost authority cannot survive in a retained queue |

**Evidence:** before/after configuration hashes, native queue disposition and
generation transitions. **Stop:** the only protection is a callback in the component
being unloaded; inability to establish safe removal is a gate blocker.

### 09 — Verify identity and revision transitions

**Work:** use supported native observations and the same existing-session scope.
Plan any conversation-changing action separately. For destructive clear/branch
diagnostics or other sessions, obtain specific authorization before execution;
do not create sessions automatically or broaden the existing approval.

| Unit | Boundary | PASS requirement |
| --- | --- | --- |
| 09a | Wrong session/window/workspace | Offer is refused before any cross-delivery |
| 09b | Clear/reset | Observable identity/revision change invalidates old selection |
| 09c | Resume existing session | Fresh selection generation; old permission does not return |
| 09d | Branch/replacement | Old binding invalidated; replacement never inherits consent |
| 09e | Reload/reopen | Fresh handshake despite any retained native session ID |
| 09f | Logout/lost native authentication | Binding becomes unusable and pending input cannot execute |

**Evidence:** native lifecycle-to-generation mapping; per-case safe disposition.
If a transition is genuinely unavailable on this pinned IDE, prove that using its
supported interface inventory and have Luna review a documented applicability
decision. “We did not test it” is never non-applicability. Any available but
unobservable transition blocks reliable revision tracking.

### 10 — Prove attributed same-conversation text and correlation

**Work:** under a separately reviewed bounded positive-input scope, submit two
harmless attributed Mod prompts sequentially in the selected existing conversation.
The second references a nonce from the first. Observe ordinary local user input
separately to check that it cannot be mistaken for a remote command.

**Check / PASS:** same native session, distinct correlated turns, correct replies,
remote origin preserved without `asUser: true`, local input clearly distinguished.
**Evidence:** sanitized nonce/result assertions, command-to-turn mapping and events.
**Stop:** text/title/timing similarity is the only way to assign a reply to a command.

### 11 — Establish native recovery feasibility before building the driver

Use minimal evaluation tooling, not a production bridge, and review each case.

| Unit | Boundary | PASS requirement |
| --- | --- | --- |
| 11a | Interruption before native submission | Can prove no effect and no automatic submission on reload |
| 11b | Interruption after offer, before result | Native command/turn evidence supports reconciliation; no blind retry |
| 11c | Output observation interrupted | Identify exactly what can be recovered and what must remain incomplete/Unknown |

**Evidence:** supported observation/history capabilities and native interruption
results. A missing history API may require honest incomplete output. It does not
permit claiming full replay or resubmitting uncertain work. If effect identity is
insufficient for required reconciliation, stop Phase A.

### 12 — Luna reviews the Phase A decision

**Work:** combine 01–11 into a requirement-to-evidence table. Explain the native
execution boundary and why it holds across asynchronous waiting, guard failure,
unloading, authority loss, and local takeover. Include known limits and every
failed/inconclusive attempt. Check the explanation against the exact-build contract.

**PASS:** all required native cases have PASS plus Luna ACCEPT, exact-build API/type
questions from Step 03 are resolved, and supported semantics justify the fence.
No prerequisite is hidden behind a fixture or future milestone. **BLOCKED:**
identify the missing native primitive and leave MB-05 open.

**Deliverable:** `phase-a-decision.md` in the future step evidence directory.
On a counterexample, update the blocker with the event sequence and required vendor
capability. Do not repeatedly try unsupported substitutes. Another supported route
requires a new bounded evaluation and review of affected Phase A cases.

## Phase B — Build the smallest qualified host/driver connection

All steps below are conditional on Step 12 PASS plus Luna ACCEPT.

### 13 — Specify the local interface and authority state machine

**Work:** write the SDC-owned loopback message contract, pairing sequence, identity
tuple, command/event IDs, generation rules, expiry/invalidation rules, and storage
mapping. Map each native call to its proven Phase A guarantee. Define the precise
last native fence and the point after which an already-started turn is reported
as running rather than pretending it was cancelled.

**Check / PASS:** complete sequence from consent to native effect, including every
await/restart; no gap between host authorization and native enforcement. Reuse
existing wire/state semantics. Treat “pending native execution” as local state
unless a separately reviewed neutral contract change is actually necessary.
**Evidence:** interface specification and event/state transition tables.

### 14 — Add package boundaries and registration

**Work:** create proposed `adapters/claude-code/`,
`extensions/vscode-drivers/claude-code/`, and a separate production Mod package
distinct from the evaluation probes. Add the new npm workspaces, strict TypeScript
configuration, exact dependencies/lock changes, and driver registration. Shared
server/protocol/bridge code must not import Claude types.

**Check / PASS:** packages build; loader sees only declared contract 1.0; absent
qualification refuses control. Registration never signs in, selects a session,
launches a runtime, or submits text. **Evidence:** bounded patch, dependency graph,
workspace build and loader checks. No native installation yet.

### 15 — Implement bounded transport messages

**Work:** implement parsing for local registration, command retrieval, events,
acknowledgements, and invalidation. Specify sizes, methods, deadlines, content type,
sequence/nonces, errors, and schema versions. Bind only loopback and enforce exact
Host/origin policy where applicable. No redirect following or ambient browser trust.

**Check / PASS:** malformed/oversized/unknown-version requests, redirects, and wrong
endpoints fail before state mutation. **Evidence:** parser and real loopback HTTP
tests; they establish transport behavior, not native Claude support.

### 16 — Implement explicit session-scoped pairing

**Work:** add local graphical pairing tied to installation, host, window, workspace,
native session, and selection generation. Issue short-lived local credentials;
keep server refresh/device tokens exclusively in the host. Require a fresh
handshake after either participant restarts. Document how the Mod securely receives
its local pairing secret through supported APIs.

**Check / PASS:** workspace path/session ID alone cannot authenticate; expired,
wrong-generation, and cross-window credentials fail. Loading a Mod grants no
consent. **Evidence:** pairing tests and a reviewable consent UI flow.

### 17 — Prove local isolation and replay rejection

**Work:** exercise two independently paired participants against the real loopback
listener, using fixtures here. Try crossed identities, repeated authentication
requests/nonces, duplicated messages, revoked credentials, and listener restart.

**Check / PASS:** no command/event crosses participants; protocol-level retries are
idempotent only within the correct authenticated identity. Authentication replays
are refused. Old credentials never survive restart. **Evidence:** per-case traces
and assertions. Real native session isolation is still required later.

### 18 — Add durable command/event records

**Work:** extend or compose existing file-backed SQLite facilities. Persist accepted
commands, pending execution, native identities, outcomes, event checkpoints and
acknowledgements. Define transaction boundaries and retention/tombstones. Keep
authority assertions live; persisted identity cannot restore consent.

**Check / PASS:** injected interruption/reopen preserves deduplication and output
continuity. Successful local HTTP receipt never becomes proof of native execution.
**Evidence:** file-backed storage tests with failures at each transaction boundary.
Do not modify shared wire schema just to add a driver-local bookkeeping state.

### 19 — Implement discovery, selection, and conversation revision

**Work:** discover only paired, participating existing native sessions; present exact
host/window/session context in consent. Implement observable revision/generation
tracking and `readConversationRevision`. Recheck selection after consent and waits.

**Check / PASS:** stale selection, local activity, missed history, or uncertain
revision refuses dispatch. Revision is neither constant nor title-derived. Native
identity changes synchronously invalidate host authority before asynchronous cleanup.
**Evidence:** selection/revision tests covering the mapping established in Step 09.

## Phase C — Implement core adapter operations

### 20 — Implement truthful probe, attach, and inspect

**Work:** implement these three read/attachment paths against the qualified native
identity. Capabilities report only the tested core subset and actual limits.
Pass the host abort/current-authority context through attachment waits.

**Check / PASS:** attach cannot create/sign in or silently switch a conversation;
stale generation fails at attachment. Inspect cannot present a disconnected/stale
native state as live. Missing qualification exposes no mutation capability.
**Evidence:** focused adapter tests and capability-report examples.

### 21 — Implement attributed submit with the proven native fence

**Work:** connect durable acceptance to bounded local delivery and the actual native
execution safeguard from Phase A. Preserve origin/command identity, enforce current
selection and `AdapterMutationContext.assertAuthority()` at the effect boundary,
honor abort, and reject unsupported input before delivery.

**Check / PASS:** stale authority during any wait causes refusal; duplicate delivery
cannot submit twice; no retry after uncertain dispatch. A host preflight alone is
insufficient. **Evidence:** focused ordering/failure tests and native-primitive mapping.

### 22 — Implement output subscription and outcome attribution

**Work:** map supported native output/start/completion observations to neutral events
and durable checkpoints. Distinguish pending, applied, refused, and unknown using
evidence of the intended native effect; classify started/running separately from
response completion. Preserve honest incomplete output and local-user attribution.

**Check / PASS:** duplicate/out-of-order events do not corrupt state; response for
another/local turn never attaches to the remote command. Gaps are visible, never
filled with invented output or completion. **Evidence:** event-mapping/replay tests.

### 23 — Implement detach and pass adapter conformance

**Work:** make detach revoke local authority and invalidate pending work before
asynchronous teardown. Complete the neutral core conformance cases. Keep all optional
controls unavailable, including remote approval and native-tool-denial claims.

**Check / PASS:** detach is idempotent; teardown/reconnect cannot resurrect a prompt;
unsupported calls fail before transport/native delivery. **Evidence:** conformance
results plus assertions that the native submission count remains zero on refusal.

## Phase D — Recovery and exact evaluation packaging

### 24 — Test deterministic crash and replay boundaries

Use a separate evidence/review record for every row. These are fixtures, with
file-backed SQLite and real process/storage interruption where appropriate.

| Unit | Failure point | PASS requirement |
| --- | --- | --- |
| 24a | Before durable acceptance | No dispatch or false acceptance |
| 24b | After acceptance, before native offer | Recovery still requires fresh current authority |
| 24c | After offer, before acknowledgement | Unknown/reconciliation, never blind resubmit |
| 24d | After native evidence, before persisted result/ack | Reconciliation recovers the same effect without duplicate turn |
| 24e | Duplicate command/event deliveries and reconnect | Durable deduplication/checkpoints survive restart |
| 24f | Output gap and partial/native abort | Explicit incomplete state, no fabricated successful finish |

**Evidence:** fault point, persisted state before/after, submission count and recovery
sequence. These tests do not replace Step 27's real native interruption evidence.

### 25 — Generalize evaluation packaging and measure the candidate

**Work:** extend existing evaluation scripts through explicit backend profiles;
preserve Cline behavior. Include complete host, Claude driver, production Mod,
native extension, bundled runtime, guard helper/runtime if used, and relevant
enforcement configuration in the measured execution inventory. Preserve reviewed
signing/provenance checks and bounded evaluation expiry.

**Check / PASS:** artifact/configuration drift refuses qualification; expired or
wrong-backend evaluation records fail. A driver cannot attest to itself. Native
API identity must reflect the supported interface, not a fabricated version.
**Evidence:** reproducible candidate manifest, measurements, signature/expiry and
cross-backend regression checks. Production catalog remains unchanged. Obtain any
required new-code/native-binding consent before installing this concrete candidate.

## Phase E — Real server and native qualification

Use the selected local verified HTTPS/Keycloak/PostgreSQL deployment, isolated
PluginLab, and the exact measured candidate. Human sign-in stays human-only.
Bind only the explicitly selected existing conversation and core text scope.

### 26 — Qualify core REST and existing-conversation continuity

| Unit | Native/API scenario | PASS requirement |
| --- | --- | --- |
| 26a | Explicit local consent, REST prompt and SSE events | Correct native session/turn and correlated response |
| 26b | Second dependent prompt | Same conversation continuity, distinct command/turn |
| 26c | Unsupported controls/media/caller tools | Refused before native dispatch |
| 26d | Wrong session/window/generation, including two separately selected existing sessions where available | Zero cross-delivery; identity does not collapse to workspace or title |

**Evidence:** sanitized real public operation IDs mapped to native identity digests,
server durable results, returned text assertions, and cleanup per unit. Do not
describe a fixture with two sessions as native two-session proof. If an additional
existing session is needed, request its explicit selection and bounded consent;
do not create one to satisfy the test.

### 27 — Qualify real native crash/replay recovery

Execute each Step 24 boundary as separate native units `27a`–`27f`, using controlled
interruptions of only the isolated candidate components and the harmless test text.
Prepare observation/reconciliation before each interruption.

**Check / PASS:** native effect count and persisted state agree; uncertain offers
are reconciled without duplicate submission; reconnect and retrieval expose the
same operation and truthful output. Missing native history yields explicit
incomplete/Unknown within the reviewed contract, never fabricated replay.
**Evidence:** native/SQLite/server timelines and independent submission counts.
**Stop:** a boundary cannot be observed/injected or unknown work is silently retried.

### 28 — Qualify real authority and lifecycle enforcement

Repeat the Phase A safety arguments through the complete server/host/driver path.
Each row is independently reviewed, including the post-allow interval where applicable.

| Unit | Real transition | PASS requirement |
| --- | --- | --- |
| 28a | Real binding/device authority revoked while waiting | No stale remote turn |
| 28b | Lease expiry and failed renewals | Conservative deadline prevents pending effects |
| 28c | Local user takeover | Remote authority invalidated before further remote effects |
| 28d | Server/host disconnect and reconnect | Lost authority refuses; fresh handshake required |
| 28e | Mod/guard reload or removal | No executable orphaned prompt |
| 28f | Selection/conversation transition | Old generation cannot dispatch anywhere |
| 28g | Authority lost after guard allow, before native effect | Actual candidate closes the race tested synthetically in Step 05 |

**Evidence:** actual authority timestamps, native start/drop events, durable operation
state, exact candidate hashes and cleanup. Synthetic permit tests alone cannot pass.

### 29 — Qualify admitted provider text profiles

Run independent units `29a` OpenAI Chat Completions, `29b` OpenAI Responses, and
`29c` Anthropic Messages using the existing pinned SDK consumers and real HTTPS
gateway. Exercise text output, idempotent retry/retrieval and supported event forms;
reject unsupported options before native delivery. Review admission per profile.

**Check / PASS:** admitted text subset returns truthful correlated results with no
extra native execution. If policy correctly withholds a profile, document tested
refusal and excluded scope; do not enable it merely to get a passing request.
**Evidence:** per-profile scope, exact request/response assertions, operation/turn
counts and refusal checks. No full provider parity, caller-tool support, or new
native billing/token measurement claim follows from these text tests.

### 30 — Verify Cline after shared changes

**Work:** run affected generic host/loader/contract/bridge and Cline driver suites.
If shared installed behavior changed, perform the affected bounded real Cline
text/selection/reconnect acceptance with the new measured host and existing
qualification constraints; reuse prior user permissions only within their scope.

**Check / PASS:** Cline capabilities/identity/consent and credential handling retain
their accepted behavior. Claude qualification cannot admit a Cline binary or vice
versa. **Evidence:** affected-check rationale, fresh results and exact tested pins.

### 31 — Run final regression verification on the frozen candidate

**Work:** record Node 24/npm 11 and exact lock/runtime versions. Run clean `npm ci`,
root build/lint/tests. Enable affected disposable PostgreSQL suites using repository
guidance; record each environment/command and test count. Run restart/destructive
database checks separately from concurrent suites. Run the locked gateway suite
for API acceptance and Swift checks when companion code/boundaries are affected.

**Check / PASS:** required checks have no unexplained failures or integration skips;
optional skips are explicitly bounded and never claimed as integration success.
Compare rebuilt/installed artifacts to the native-tested candidate. If bytes change,
refresh inventory and repeat affected native checks rather than keeping stale proof.
**Evidence:** exact commands, exit codes/counts, applicability reasons and final hashes.
Use the existing disposable DB only; do not reset persistent deployment databases.

## Phase F — Documentation and milestone closure

### 32 — Final traceability, beginner guide, and Luna closure review

**Work:** update beginner setup/troubleshooting and capability/route matrices.
Explain graphical install/pairing, existing-session selection, permissions,
disconnect/reconnect, ownership-warning recovery, unsupported features, incomplete
output, and exact-version limits. Link every requirement to accepted native or
appropriately scoped fixture evidence. Update task, tracker and MB-05 evidence.

**Check / PASS:** every mandatory step/subcase has PASS and Luna ACCEPT, except
explicitly reviewed and justified applicability decisions; no safety requirement
has been waived. Preserve failed attempts and limitations. Final binding is
disconnected, evaluation artifacts disabled as appropriate, temporary credentials
revoked, settings restored within the approved scope, and no queued work uncertain.
Documentation must match measured capabilities and distribution remains MB-09.

**Deliverable:** final verification manifest, traceability table, setup/troubleshooting
guide, cleanup evidence, and Luna's milestone-level verdict. Only then mark MB-05
Done for its exact tested core text subset. Otherwise list the precise remaining
units and leave it In Progress/blocked by the recorded requirement.

## Current implementation checkpoint — 2026-10-15

**Steps 01, 02, and 03 are PASS/ACCEPT.** Step 02 first recorded a valid BLOCKED
ownership warning; after the user's normal release, a read-only recheck found the
same selected session digest, the expected isolated host/workspace, and no
warning. Its original blocked attempt remains preserved. See
`evidence/MB05/steps/01-baseline/`, `02-ownership/`, and `03-exact-build-api/`.
Step 04 is next. It validates the unchanged approved harness and defines an
unambiguous event-correlation protocol; it sends no native test prompt. The
exact-build type declarations and runtime effect-fence semantics remain
unresolved. The most valuable later native result is **Step 05**, after all
prerequisites pass.
