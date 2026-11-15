# MI-06 implementation plan — command retention and cursor recovery

Date: 2026-11-14 (Asia/Dhaka). **Done for repaired candidate .2 automated acceptance (2026-11-15).** Retention, recovery, packaging and automated gates are recorded in [MI-06 evidence](../../evidence/MI06/README.md). Installed-host testing and deployment are separate and were not performed.

The goal is to reclaim acknowledged command payload storage, keep command retries and public API receipts correct, and recover a bridge whose replay cursor predates retained commands. Most acceptance will run against real PostgreSQL, HTTP/SSE and file-backed SQLite, with a deterministic adapter at the native boundary. No model execution is required to exercise retention or cursor recovery.

## 1. Recommended scope and testing budget

Implement **contiguous-prefix payload compaction with permanent compact command receipts**, rather than deleting command identities or moving full payloads into another indefinitely growing table.

Required completion gate: automated storage, transport, recovery, concurrency, migration/restore and exact packaged-bridge checks. **Zero compulsory Cline windows, model prompts, browser sign-ins or pairing flows.** The original MI-06 exit gate is retention/replay/resynchronization testing; it does not specify fresh native model qualification.

Optional installed-host confidence check: one already available task, one connection and at most two fixed text echoes, with no model/provider changes or repeated reload/Move exercises. This supplements automated acceptance; it does not replace automated recovery tests. If installation into the retained deployment is later requested, record its separate rollout/installed-host status accurately.

Preserve the MI-04 native Cline/API pin and adapter semantics. Change the shared server/bridge and package the updated companion; do not change native controllers, task selection, approvals, model configuration or conversation-history reconciliation to make a transport test pass. If native code actually needs modification, reassess the affected native gate before extending this plan.

### In scope

- Per-device, per-lane archive floors and bounded compaction batches.
- Preservation of command identity, payload fingerprints, terminal acknowledgements, public-operation references and authority records.
- `410 CURSOR_EXPIRED` for obsolete **command-lane** cursors and authenticated recovery from an archive checkpoint.
- Atomic local cursor advancement that preserves unresolved attempts and unsent output.
- Retention scheduling/configuration, diagnostics, migration/restore and documentation.

### Outside this milestone

- Session event/transcript, public result, attachment or local SQLite history retention.
- Purging compact command-ID/acknowledgement receipts; changing the lifetime of deduplication promises.
- Sparse deletion across unresolved holes, forced resolution of unknown native outcomes, N2 park/resume, native approval expansion or new backend support.
- Repeating MI-03/MI-04's complete graphical matrix, provider benchmarking, 5–10 real editor windows or signed-release promotion.

The resulting bound is on **replayable command payloads**, not all database bytes. Compact receipts and unchanged transcript/event history still grow. State this limitation explicitly rather than claiming constant total disk use.

## 2. What the current code establishes

| Finding | Evidence | Planning consequence |
|---|---|---|
| Command identity deduplication currently compares the stored full payload. | [recordCommand](../../server/src/storage/index.ts:237) | Preserve a canonical fingerprint before discarding payloads. Identical late retries must not become new commands. |
| Retained-lane limits count all command rows and their JSON bytes. | [capacity and sequence allocation](../../server/src/storage/index.ts:264) | Count replayable payload rows after compaction; compact receipts must not keep the old 50,000-row hot limit permanently full. |
| `applied` acknowledgement does not establish model-turn completion; outstanding-prompt admission separately checks terminal events. | [outstanding prompt predicate](../../server/src/storage/index.ts:253) | An applied submit cannot be compacted while its turn remains active or uncertain. |
| Acknowledgements are monotonic, and final acknowledgements also update approval state. | [recordCommandAck](../../server/src/storage/index.ts:433) | Preserve terminal ACK rows and ensure retries cannot repeat approval effects after payload removal. |
| ACKs, skips, public operations/authority and cancellation records reference commands. | [003](../../server/migrations/003_command_acknowledgements.sql), [005](../../server/migrations/005_command_skips.sql), [008](../../server/migrations/008_public_operations.sql), [009](../../server/migrations/009_public_conversations.sql) | Keep `commands` as a compact identity ledger so foreign keys and public receipts survive. |
| Approval decisions also insert command rows directly. | [approval insertion](../../server/src/approvals/index.ts:89) | Update both writers; metadata/capacity accounting cannot cover only `recordCommand`. |
| Command SSE checks only whether a cursor is ahead, then polls batches. | [streamCommands](../../server/src/http/index.ts:474) | Check floor/head and read a batch at one consistent database cut, including after a stream is already open. |
| An unexpected 4xx currently stops bridge loops for reconciliation. | [command loop](../../bridge/src/runtime/index.ts:139) | Add one specific recovery path for a validated `410/CURSOR_EXPIRED`; keep other authority errors fail-closed. |
| Fresh-inbox initialization intentionally does not overwrite an existing cursor. | [initializeCursors](../../bridge/src/storage/index.ts:104) | Add a separate authenticated recovery-checkpoint operation; do not repurpose fresh-inbox initialization. |
| The session snapshot is user-authenticated; bridge replay uses device authentication and a shared device lane. | [HTTP routes](../../server/src/http/index.ts:310) | Use a dedicated device-authenticated command checkpoint, not a user transcript snapshot or the device lane head. |
| Two real bridge processes with separate SQLite files already run against the real server. | [MI-02 test](../../tests/mi02-multi-window.test.mjs:125), [fixture](../../tests/helpers/api-fixture.mjs:5) | Extend this harness for stalled-reader recovery instead of opening more editors. |

Line references describe the planning baseline; implementation should update documentation when methods move.

## 3. Retention contract to settle before coding

### 3.1 Eligible records and the archive floor

For each `(deviceId, lane)`, define:

- `head`: last assigned lane sequence; never decrement it or reuse sequences.
- `archivedThrough`: every sequence at or below this number is safely removed from command replay. Initial value is zero.
- `after`: the client's last durably accounted-for lane sequence.

Choose the largest **contiguous** eligible prefix after the existing floor, within the configured age, retained-tail and batch limits. Stop at the first ineligible sequence. Never use `MAX(acknowledged sequence)` to jump across a pending or uncertain command.

Recommended eligibility:

1. A durable final ACK is exactly `applied` or `rejected`.
2. `received`, missing ACK, `unknown` and `reconciliation_required` block compaction.
3. An applied `turn.submit` additionally has matching terminal turn evidence (`turn.completed`, `turn.failed` or `turn.cancelled`) or durable command-rejection evidence. Reuse the current outstanding-prompt semantics and preserve any stricter uncertainty checks. A completed public convenience result alone must not manufacture native completion.
4. Do not compact an applied submit whose public/native record still requires reconciliation. Define conservative handling of historical/malformed rows: they block and produce diagnostics.
5. Rejected records and obsolete-binding tombstones still require a safe final receipt. In particular, `skipCommand()` may leave a prior `received` ACK unchanged; do not silently upgrade it merely to release storage.
6. Age is measured from durable terminal evidence/ACK, using the later relevant timestamp, not just command creation. A long-running turn that finished now is recent.

An unresolved early command can block this first version's entire lane prefix. Report that blocker; keep ordinary capacity refusal if necessary. Resolving uncertain native work or implementing sparse archival is separate work. This deliberately favors preserved work over forced storage reclamation.

### 3.2 Payload compaction and deduplication

Retain command ID, session/device/lane/sequence, creation time, ACK/skip rows, public authority and operation/cancellation references. Before clearing `commands.payload`, retain:

- A SHA-256 fingerprint of the **existing `canonicalJson` payload representation**.
- Original payload byte count and archive timestamp.
- Any small command metadata proven necessary by the SQL-consumer inventory; avoid retaining prompt text or approval assertions in a second column.

Use `payload = NULL` plus `archived_at` with a schema invariant linking the two. Keep full payloads for unarchived rows. All replay/dispatch code must distinguish these states explicitly.

Do not use PostgreSQL `jsonb::text` as a substitute for JavaScript canonical hashing: representation differences would break existing deduplication. Existing rows can receive their fingerprint lazily inside bounded compaction batches; no startup-wide JavaScript rewrite is necessary. New writes, including approval commands, record it consistently.

Late identical command-ID retries return the original identity/sequence and existing disposition; they neither allocate a sequence nor restore the payload nor requeue work. Changed payload, routing identity or public caller identity remains a conflict. Keep the existing public request fingerprint checks as well as the command payload fingerprint.

Compacted commands must not count as outstanding prompts or consume replayable-payload capacity. Preserve public operation results, control receipts and original idempotency responses. Terminal duplicate ACKs remain idempotent and must not repeat approval/grant transitions.

### 3.3 Cursor semantics

| Cursor | Response |
|---|---|
| `after < archivedThrough` | `410` with machine-readable code `CURSOR_EXPIRED`. |
| `after == archivedThrough` | Valid; replay starts strictly after the floor. |
| `archivedThrough < after <= head` | Existing replay behavior. |
| `after > head` | Existing `409 CURSOR_AHEAD`; never silently clamp it. |

Support both `Last-Event-ID` and `after` with their existing precedence. Validate safe integers. Authenticate first; do not disclose floor/head or session information to an unrelated device.

A session's event cursor and a device's command-lane cursor are different sequence spaces. MI-06 does not expire transcript event cursors.

### 3.4 Recovery checkpoint

Propose a device-authenticated, read-only endpoint:

`GET /v2/devices/{deviceId}/commands/checkpoint?lane=...&sessionId=...&bindingRevision=...&leaseGeneration=...`

Return a versioned, strictly validated object containing device/lane, session and exact current binding identity, `archivedThrough`, `head` and the checkpoint version. Validate current device credentials and binding authority transactionally; no transcript content, other-session labels, commands or new credentials are needed. Add an additive server capability such as `commands.retention.v1`.

The checkpoint certifies an already terminal **prefix**. Recovery advances only through `archivedThrough`, never straight to `head`; commands between the floor and head can still be pending.

A `410` response triggers checkpoint retrieval; do not trust arbitrary error-body numbers as a cursor-reset instruction. On an already-open SSE stream, if compaction overtakes the reader, end that stream cleanly and let the next HTTP handshake return410. Do not attempt to change an already-sent200 into410 or invent a command skip range without authentication.

## 4. Ordered implementation steps

### Step 1 — Freeze invariants and add failing tests

Files: new `tests/mi06-retention.test.mjs`, `tests/mi06-recovery.test.mjs`; existing helpers where needed.

- Encode the eligible/ineligible state table, exact floor boundaries and post-archive identical/conflicting retries first.
- Build reusable fixtures for terminal, running, rejected, skipped and uncertain commands on both lanes and two sessions.
- Inventory every direct command insert, payload read, admission query, ACK effect, dispatch permit and public result/receipt query. Keep this checklist in evidence.
- Add a `test:mi06` entry that requires an explicit disposable database URL and fails if required integration tests are skipped.

Exit: baseline tests fail for the missing retention/recovery behavior, without changing any native package or local deployment.

### Step 2 — Migration and bounded storage primitive

Files: `server/migrations/011_command_retention.sql`, matching rollback, `server/src/storage/index.ts`, server exports, storage tests.

- Add compact-receipt metadata and a per-device/lane retention-state table with a monotonic archive floor. Preserve all existing foreign keys and lane counters.
- Add indexes for unarchived delivery/capacity queries and efficient bounded next-prefix scans. Inspect representative query plans rather than assuming indexes help.
- Implement `compactCommandLane({deviceId, lane, policy, ...})` in one short transaction: acquire the lane maintenance lock, read bounded next records, verify immutable terminal evidence, fingerprint before clearing, compact, and advance the floor atomically.
- Reuse the lane serialization discipline, with try-lock/short timeout so a worker skips busy lanes. Do not acquire command-ID advisory locks after the lane lock: writers acquire those in the opposite order.
- Do not acquire binding/device/session authority locks while holding a compaction lane lock. Terminal ACKs are immutable; eligibility can rely on committed final state rather than adding an inverted ACK/binding lock chain. Verify this choice against every writer.
- Update hot-capacity and outstanding-prompt queries. Preserve late command/ACK idempotency and public FK/receipt behavior.
- Update the direct approval-command writer, preferably through a small shared insert/metadata helper that preserves its existing transaction and permission checks.
- Reject dispatch/permit admission for archived identities, including a command fetched before compaction. Serialize this archived-state check with compaction using a compatible, reviewed row-lock order; a plain pre-check outside the dispatch transaction is insufficient.

Exit: storage, admission, approval/operation receipt, deduplication and concurrent compaction tests pass. No archival takes place merely by applying the migration.

### Step 3 — Atomic replay checks and authenticated HTTP recovery

Files: `server/src/http/index.ts`, storage replay helpers, `protocol/src/contracts.ts`/validators or a small shared transport-contract module; HTTP tests.

- Expose a bounded `readCommandBatch` result whose floor, head and rows come from one consistent snapshot. Before SSE headers, fetch/validate the initial batch with the same cursor rules.
- Repeat the floor check on every poll. Handle compaction between batches or during backpressure by terminating the old stream; the next handshake delivers410.
- Map the typed expired-cursor error to the existing JSON error envelope and add the checkpoint route with exact device/binding checks.
- Keep `401`, `403`, `409`, rate limits, stream accounting, request IDs and no-store behavior distinct. Ensure an expired-cursor request does not leak an SSE slot.
- Validate the checkpoint schema centrally; export its validator for the bridge without adding vendor types.

Exit: actual TCP HTTP/SSE tests pass for before/at/after-floor cursors, races and unauthorized recovery. No model or editor involved.

### Step 4 — Durable bridge checkpoint application

Files: `bridge/src/storage/index.ts`, `bridge/src/runtime/index.ts`, bridge exports; SQLite/runtime tests.

- Add a separate `applyCommandRecoveryCheckpoint` operation and a versioned local schema record for the applied floor. Do not change `initializeCursors()` to overwrite existing ledgers.
- Validate device/lane, exact current session/binding revision/lease generation, checkpoint version, safe integer bounds and monotonic floor. Bind the response to the runtime that requested it; it grants no new native authority.
- Pause new dispatch claims for the affected lane while recovering, while lease renewal, ACK/output flushing and unrelated lanes continue. Serialize installation with dispatch-start claims; preserve already-applying attempts and their authority checks rather than replaying or pretending to undo them.
- In one SQLite transaction, compare the expected cursor, verify retained local state, record the certified floor, move the receipt cursor forward only as justified, and continue normal contiguous advancement through already stored receipts above it.
- If local queued/applying/uncertain work at or below the certified floor conflicts with the proof, retain the ledger and enter `reconciliation_required`. Do not delete attempts, invent terminal outcomes, mark ACKs sent or drop unsent output.
- Preserve pending ACKs and reject newly delivered own/foreign commands at or below an installed archive floor before they can enter a fresh dispatch path. Leave the separate registration-watermark semantics intact.
- Handle only validated `410/CURSOR_EXPIRED` as recoverable. An ahead cursor, malformed checkpoint, unsupported endpoint or changed authority remains fail-closed. Authentication failure keeps its existing repair state.
- Retry transient errors with current jitter/backoff. Bound immediate repeated410/checkpoint attempts, then back off if compaction keeps advancing; avoid a tight loop. Keep aggregate runtime status reconnecting until the affected lanes have recovered.
- Add transaction fault points around checkpoint persistence/cursor movement and prove restart sees either the old or new durable checkpoint, never half a skip.

Exit: recovered bridges deliver each new addressed command once, retain uncertain attempts, and never reset session/native authority or producer output cursors.

### Step 5 — Retention worker and rollout controls

Files: `server/src/retention/` (new), `server/src/main.ts`, deployment env examples/templates, focused worker tests.

Proposed initial defaults, to be documented as policy choices:

| Setting | Initial proposal |
|---|---|
| Enabled | **Off** until explicit operator rollout. |
| Minimum terminal age | 24 hours. |
| Recent payload tail | Keep at least the most recent128 lane sequences. |
| Batch | At most100 commands in one transaction. |
| Tick | 60 seconds, one in-flight sweep per server process. |
| Sweep budget | At most8 lanes per tick with fair progress across devices. |
| Busy lane | Short lock deadline; skip/retry later, never wait behind a long permit. |

Inject time/tick invocation for tests; never wait24hours or fill50,000 production commands to test policy. Policy must not override eligibility or archive an uncertain command to satisfy a quota. A retained tail/minimum age can legitimately leave capacity exhausted during a burst; expose that condition rather than secretly relaxing retention.

Use the same database lane locks across multiple server workers so a second process cannot compact the same prefix concurrently. Avoid starvation by keeping a deterministic bounded scan position or equivalent fair selection. Stop scheduling, await an in-flight bounded batch, then close the pool on shutdown. Do not run an unbounded cleanup in command admission.

Diagnostics should report counts/bytes compacted, floor movement, blocked sequence/reason category, duration and skipped-busy lanes. Do not log command bodies, assertions or credentials.

### Step 6 — Automated end-to-end acceptance and packaged candidate

Files: new `tests/mi06-runtime-integration.test.mjs`, `tests/mi06-retention-restore.test.mjs`, an extension of `tests/helpers/mi02-window.mjs` or a small MI-06 worker, companion candidate packaging/activation tests.

- Use real server TCP/SSE, PostgreSQL and two child bridge processes with independent file-backed SQLite stores, sharing one device. Only the native adapter boundary is deterministic/simulated; count adapter effects by command ID.
- Stall B's command-stream intake while A completes and ACKs enough commands to compact a prefix. Keep B's lease/other transport paths available; do not confuse cursor recovery with intentionally losing native authority.
- Compact, reconnect B with its untouched old durable cursor, assert actual410, checkpoint fetch, atomic local installation, resumed stream, and one new B effect. A must remain usable, and neither bridge stores or executes the other's payloads.
- Repeat with prompt/control lanes, a pending hole, an applying/reconciliation attempt, late ACKs, an already-open stream and a process killed at checkpoint commit. Use latches/barriers and persisted fault points, not timing guesses or long sleeps.
- Build the exact companion VSIX once implementation is stable. Exercise the **packaged shared bridge code**, not just an independently compiled source copy, in an automated host harness. Verify packaged native Cline hashes are unchanged and run the existing activation guard with the new candidate identity.
- Proposed package boundary: companion **0.10.0**, new `package-mi06.mjs`/MI-06 artifact manifest and a separately tagged server image. Keep Cline4.1.2206/API1.3 and its native fingerprints unchanged. Preserve all frozen MI-04 packages/manifests and use the shared reviewed-pin registry rather than another activation whitelist.
- Perform a dedicated disposable PostgreSQL backup/restore of used retention state and post-restore replay/deduplication tests. Do not rely on the root suite's optional old M06 restore check, whose current guard is tied to another port/database.
- Use an explicitly named disposable MI-06 container/database and free loopback port. Never reuse the retained local deployment or assume55432 is free. Clean up only the test resources created for this gate.

Exit: complete scripted evidence includes real410/recovery and effect counters, not only endpoint shape or mocked fetch responses. Label the native boundary honestly; this is not fresh model/provider qualification.

### Step 7 — Optional small installed-host smoke

Perform only if installed-candidate confidence or deployment acceptance is requested and a working native task/provider is available.

1. Verify the reviewed candidate hashes and backup the selected target before replacement; keep retention disabled during installation.
2. Use one existing consented, active task with Auto-approve None. Send one fixed text echo, enable the reviewed policy for the selected target, then send one more fixed echo and check ordinary listening/lease/ACK/output behavior.
3. Verify session/binding history, revoke temporary API keys, disconnect only the test binding and record the final state.

Do not claim those echoes exercised410: a new Connect often initializes at a fresh registration watermark. The automated stalled-reader test is the mandatory proof of expiry recovery. Do not edit native conversation files or manually rewind a real SQLite cursor to manufacture live410. Do not add a production-only test switch solely to force it.

Budget: one window, one connection, at most two model turns, zero Move tests and zero task reloads. A provider/authentication interruption ends this optional check with a precise deployment limitation; it does not restart the entire MI-03/MI-04 campaign or authorize model/pairing changes. Any decision to require a real native410 would need a separate reviewed transport-stall procedure; it is not the default gate.

### Step 8 — Completion records and exact claim

Update `docs/server-storage.md`, `docs/server-http-api.md`, `docs/bridge-storage.md`, relevant public API notes, deployment configuration, the multi-instance plan, tracker and `evidence/MI06/README.md`/verification/manifest.

Record the schema/candidate hashes, test commands and non-skipped counts, retained failure attempts, unchanged native fingerprints, policy, performance measurements and cleanup. Keep raw state/captures local under the existing ignore rules; publish prose and permitted manifests.

Mark MI-06 Done only after every mandatory automated gate passes. State explicitly whether installed-host smoke/rollout happened; source/transport acceptance does not silently promote the candidate to the signed M24/M26 release. No further milestone starts automatically.

## 5. Automated test matrix

| ID | Required scenario | Layer and decisive assertion |
|---|---|---|
| R01 | Every ACK state and running/terminal submit | Real PostgreSQL: only safe terminal records compact; received/unknown/reconciliation and running turns remain intact. |
| R02 | Hole, recent tail, age and batch boundary | Real PostgreSQL with controlled timestamps: floor stops before the first blocker, never jumps; both lanes independent. |
| R03 | Archive transaction interrupted | Injected failure plus connection/process restart: payload/fingerprint/floor either all commit or all roll back. |
| R04 | Identical/conflicting late command retry | Original command ID/sequence preserved, changed payload/caller conflicts, no new adapter effect or payload resurrection. |
| R05 | Public operations, control receipts, cancellation FK | Existing responses/joins survive compaction; principal scoping and single-outstanding admission remain correct. |
| R06 | Approval final ACK retry | Existing grant/interaction effects happen once; no assertion replay after archived body removal. |
| R07 | Hot capacity recovery and blocked capacity | Small injected limits: safe compaction frees admission; an uncertain prefix retains the existing safe capacity error. |
| R08 | Cursor below/at/above floor, ahead of head | Actual HTTP: exact410/200/409 behavior for query/header inputs, safe integers and proper SSE slot release. |
| R09 | Archive while SSE is open/backpressured | Real stream: no invisible hole or null command payload; old stream ends and reconnect obtains410 when required. |
| R10 | Device/binding/credential validation | Wrong/revoked credentials and stale revision cannot obtain/install a usable checkpoint or new dispatch authority. |
| R11 | SQLite floor install crash/CAS race | File-backed SQLite reopened after injected failure: monotonic durable floor/cursor, no lost attempts/output/ACKs. |
| R12 | Late buffered delivery below installed floor | No new queue entry/effect; conflicting identity fails safely; foreign session payload remains unretained. |
| R13 | Two real bridge processes, one stalled | Real TCP/PostgreSQL/SQLite: observed410 and recovery; exactly one new B effect; A stays usable. |
| R14 | Native applying/uncertain and lost ACK response | Persisted attempts survive; no automatic replay; identical terminal ACK retry is accepted after compaction. |
| R15 | Concurrent append/ACK/compaction/permit/revocation | Barrier-controlled races: no deadlock/inverted locks, duplicate allocation, archive of pending work or post-archive permit. |
| R16 | Restore and rollback | Used state restored with floor/head/deduplication/FKs; rollback refuses when discarded payloads cannot be reconstructed. |
| R17 | Worker lifecycle and fairness | Bounded batches, busy-lane skip, two workers, no overlapping tick and clean shutdown; no arbitrary sleeps. |
| R18 | Older/current server and bridge behavior | New bridge works against retention-disabled older server; old bridge gets its existing fail-closed behavior on410, never silent success. |
| R19 | Exact packaged code and seeded traces | Packaged bridge covers recovery; bounded seeded append/ACK/archive/reconnect sequences preserve invariants without new dependencies. |

Do not substitute a high percentage coverage target for these outcomes. Tests can be parameterized to cover the state table without hundreds of separate slow processes. Use tiny queue/batch limits, explicit terminal events and counted adapter effects; run no LLMs in these tests.

## 6. Efficient execution order

1. Create the focused suites and run only the failing contract/storage cases.
2. After each storage/HTTP/bridge seam changes, build the affected workspaces once and rerun its focused suite. Reuse one disposable database service with isolated schemas.
3. Run the two-process recovery/race and dedicated restore gates after the primitives pass. A failure gets a targeted fix/retest; do not repeat unrelated graphical setup.
4. Freeze/build the candidate and run packaged-code/activation checks.
5. Run one final root build/lint/full test pass with bounded concurrency, plus affected public API and approval regressions. Repeat only a failing seam and its justified regression scope after a new change.
6. Run gateway/OpenAI/Anthropic suites only if a gateway/profile boundary changes or public read semantics differ; otherwise existing TypeScript public-operation/receipt tests cover the changed storage joins. State the exact suites executed.
7. Review the remaining diff, migration/query plans and final evidence; optionally run the tiny installed-host smoke. Clean up test containers/keys and stop.

Suggested focused command shape: `MI06_TEST_DATABASE_URL=<explicit disposable URL> npm run test:mi06`. The implementation should supply the script and required-environment guard rather than quietly skip missing integration tests.

Measure batch lock-hold time and hot-lane admission/renewal under compaction with the automated harness. Report raw measurements and regressions against a same-process baseline, not an inferred M26 native p95 qualification. If locks or query plans regress materially, fix that before native testing.

## 7. Rollout, compatibility and rollback

- Apply migration011 and deploy retention-aware server code with the worker disabled. Read/replay behavior is unchanged while floors remain zero and no payloads are compacted.
- Upgrade the chosen companion cohort before enabling retention. The first version can use an operator-controlled allowlist of device IDs (empty means none), keeping older devices at floor zero; do not infer readiness from a display label. A device with mixed old/new windows must be treated as mixed until the operator verifies the cohort. Automated R18 records old-client behavior without claiming broad upgrade-skew qualification.
- Start with one selected cohort, monitor blocked prefixes/bytes/410 rates, then expand only under the configured policy. No retained live target is altered as part of writing this plan.
- Turning the worker off stops future compaction; it does not recreate old command payloads or lower floors. New server code must keep serving checkpoint recovery for already-compacted lanes.
- Rollback SQL must refuse if floors advanced or payloads were compacted. An older server must not be launched against used nullable-payload state. Prefer roll-forward or the new binary with retention disabled; full backup restoration is a separate quiesced operator recovery action with its normal retained-write consequences.
- Preserve native conversations, server transcript events, binding continuity, credentials and public result retention. A DB backup/restore test does not count as new signed-release or production identity acceptance.

## 8. Completion checklist

- [x] Payload reclamation frees the intended hot-storage limit without deleting identity/deduplication/FK receipts.
- [x] Final ACK plus terminal-turn rules, pending/uncertain blockers and prefix boundaries are implemented and tested.
- [x] Actual HTTP410 and authenticated checkpoint recovery pass against the real server.
- [x] Two durable bridge processes recover safely without duplicate native-boundary effects or cross-session payload storage.
- [x] Mid-stream, crash, authority, approval, public receipt/idempotency and restore regressions pass.
- [x] Bounded worker, disabled-default/cohort configuration and safe rollback are documented and tested.
- [x] Exact candidate packaged code is exercised; native Cline fingerprints are unchanged.
- [x] Required suites have zero unexpected failures and zero silently skipped MI-06 integration gates.
- [x] Optional native/installed-host status is stated separately; no full MI-04 rerun is claimed or required.
- [x] Evidence, tracker and plan are synchronized; test resources cleaned; MI-06 alone marked complete when achieved.

## 9. Safety repair and completion addendum — 2026-11-15

The earlier completion claim was reopened after reproducing reuse of an older turn's completion evidence. Candidate .2 adds migration 012, permanent per-session prompt turn ownership, conservative historical ambiguity handling, matching timestamp/binding/lease checks shared with outstanding admission, and indexed evidence lookups. It also closes command streams overtaken while waiting for TCP drain.

The remaining acceptance gate includes real two-process pending-hole and local-conflict variants, lost HTTP ACK responses, observed TCP backpressure, seeded source/packaged reconnect traces, and explicit cursor/age boundaries. Performance acceptance is five paired mixed-workload runs: median loaded p95 at most 25 ms and median added p95 at most 10 ms for peer admission and renewal. Only samples overlapping measured compaction-lock intervals count. Candidate hashes, R01–R19 traceability and final results belong in evidence/MI06; installed-host testing and retained deployment remain separate.

Repair completion: 63 dedicated tests passed without skips, the mixed-workload performance budget passed, and the full suite passed 352 tests with one unrelated legacy restore skip. See [candidate .2 verification](../../evidence/MI06/verification.md) and [R01–R19 mapping](../../evidence/MI06/traceability.md). No installed-host or retained-deployment rollout occurred.
