# M01–M10 requirements and completion audit

Current disposition: [All findings resolved; M01–M10 revalidated and Done](m01-m10-closeout.md), 2026-10-06. The audit and its defect-reproduction scripts remain historical evidence.

Reviewed: 2026-10-05. Review scope: milestone deliverables, acceptance criteria, relevant requirements, checked-in evidence, source, and current tests. No production implementation was changed during this review.

## Original verdict — superseded for current status

The ten milestones cannot all remain marked Done. The original test suites pass, but additional probes reproduce failures in protocol validation, the fake native resolver, bridge output recovery, server authorization/replay, and bridge disable/lease enforcement. M04, M05, M07, M09, and M10 are reopened. Prior completion records are preserved as historical evidence and superseded by this audit for current status.

| Milestone | Review result | Requirement assessment |
|---|---|---|
| M01 | Discovery complete | Addressed two-turn continuity and a genuine supervised app-access approval have evidence. The negative external-route conclusion is permitted by M01. External attachment and atomic remote approvals remain M16/M17 gates; they were never established by M01. |
| M02 | Discovery complete | Both-host Cline task continuity and native Save/Reject demonstrations are recorded. Native identities are mapped from pinned source; stock task-addressed/atomic APIs and trusted Connect origin are explicitly missing. The proposed upstream addition is a future integration gate. |
| M03 | Foundation acceptance passes, with environment caveat | Module boundaries, pinned dependencies, decision records, TypeScript and Swift builds exist. Selected Node 24 has not been exercised; tests run on Node 25.9.0. M09 also deviates from the accepted Fastify decision without an amendment. |
| M04 | Reopened | Arbitrary JSON content is interpreted as protocol timestamps by name, rejecting schema-valid input (F10). Canonicalization, digest, closed message types, binding and pure-state checks otherwise pass current tests. |
| M05 | Reopened | The fake native approval resolver accepts caller-modified digest, choices, and requested permissions instead of using its stored pending request (F09). Script, queue, cancellation and explicit fault behavior otherwise pass. |
| M06 | Storage acceptance passes | Real PostgreSQL migration, deduplication, concurrency, rollback, repeatable-read snapshots and service-restart checks pass. A separate backup/dump restoration has not been tested; evidence proves restart recovery, not backup recovery. |
| M07 | Reopened | SQLite output uniqueness omits bridge epoch, breaking the protocol's per-session/per-epoch producer identity (F05). Inbox atomicity and uncertain-attempt recovery tests pass. |
| M08 | Primitive acceptance passes | Pairing, roles, rotation/revocation, device assertions and Keychain tests pass. Keycloak behavior uses synthetic discovery/tokens/keys; a live realm and GUI flow are future deployment/UI work. M09 fails to maintain authorization on an already-open stream. |
| M09 | Reopened | Open-stream role revocation, atomic fence checks, skipped-sequence resynchronization and bounded pending queues are incomplete (F02/F04/F06/F11). Existing single-binding HTTP/SSE tests pass. |
| M10 | Reopened | Disable/expiry can lose races with inspection, startup can override disable, leases can be overextended in transit, multiple bindings cannot consume the shared device feed, and maximum backoff exceeds its cap (F01/F03/F07/F08/F12). F05/F06 also invalidate recovery/delivery assumptions. |

## Findings, ordered by severity

### F01 — P1: a new app action can start after disable or lease expiry

Affected: M10; requirements §4, §11, FR-12; M10 pass criteria for local disable and expired leases.

At [bridge runtime](../../bridge/src/runtime/index.ts), lines 189–205, the bridge checks its lease and then awaits `adapter.inspect()`. It does not recheck the abort signal, lifecycle, or deadline before persisting an applying attempt and invoking the adapter. A deferred inspection followed by `disable()` still produced one new `submit()` with state disabled and lease deadline zero. Advancing the injected time beyond expiry during that same inspection also produced one new submit. These actions had not started when authority was withdrawn.

Repair: revalidate lifecycle, abort, binding authority and conservative lease deadline immediately after asynchronous checks and at the app mutation boundary. Add paused-inspection disable, stop, expiry and takeover tests.

### F02 — P1: a revoked viewer continues receiving session events

Affected: M09; M08 authorization integration; requirements §8.1 and authenticated transport/session access.

[Server HTTP](../../server/src/http/index.ts), lines 83–90 and 201–213, authorizes the user only when opening event SSE. The pump never rechecks the session role or access-token validity. The real PostgreSQL probe revoked viewer membership, verified that `authorizeUser()` now denies view access, then inserted a new event. The already-open viewer stream still received that event.

Repair: terminate/invalidate streams on authorization change and token expiry, and recheck authorization at delivery. Test role revocation and credential/token expiry on open streams, not only reconnect.

### F03 — P1: lease response delay creates authority beyond server expiry

Affected: M10; requirements §4 conservative local monotonic deadline.

[Bridge runtime](../../bridge/src/runtime/index.ts), lines 54 and 262–274, defaults to wall-clock `Date.now()` and sets the local deadline to response-arrival time plus the server's full TTL. Response transit is not deducted. A synthetic probe advanced elapsed time by 60,001 ms before receiving a response with a 60,000 ms TTL. The bridge granted itself another 60,000 ms and submitted a command even though the server lease had already expired. The fixed 1,500 ms dispatch margin cannot cover arbitrary network delay. Wall-clock rollback can extend authority too.

Repair: derive a conservative monotonic deadline from request-start time, account for elapsed transit, reject already-exhausted leases, and enforce the deadline independently of renewal-request completion. The requirements' §4 initial 60/20-second lease defaults also need reconciliation with the implementation's 45/15-second defaults; §10's 45-second transport-staleness default is a separate concept.

### F04 — P1: lease fence verification is separate from event/ack commit

Affected: M09/M10; requirements §4 stale-owner fencing; M10 stale-owner acceptance.

[Server HTTP](../../server/src/http/index.ts), lines 128–132 and 149–153, calls `assertCurrent()` before beginning the storage write's separate transaction. The binding can change between those operations. The review probe coordinated a generation change after the route's check and before `recordEvent()` committed: HTTP 202 was returned and generation-1 output persisted while the current binding was generation 2. Acknowledgements have the same check-then-write shape, identified by source inspection.

Repair: validate and lock the current device/binding fence in the same transaction as command/event/ack mutation, with takeover following the same synchronization. Test both race orderings and expiry during lock waits.

### F05 — P1: a new output epoch collides with old producer sequences

Affected: M07/M10; requirements §6.1, §11, FR-06/FR-11.

[Bridge storage](../../bridge/src/storage/index.ts), lines 127–138 and 216, keys output by `(session_id,event_seq)` instead of `(session_id,bridge_epoch,producer_seq)`. The server and protocol correctly scope producer sequence to session and epoch. Persisting epoch A sequence 1 followed by epoch B sequence 1 raises a SQLite uniqueness error. [Runtime subscription](../../bridge/src/runtime/index.ts), lines 280–282, also resumes from a session-wide maximum without an epoch, so restarted sequences may be suppressed before reaching storage.

Repair: use epoch-aware persistence and contiguous output replay checkpoints, migrate existing rows safely, and test old unacknowledged output alongside a new epoch. Preserve immutable event IDs and do not silently skip gaps.

### F06 — P1: filtered device commands leave a permanent receipt gap

Affected: M09/M10; requirements §6.1, FR-06; M09 replay and M10 durable consumption.

[Command SSE](../../server/src/http/index.ts), lines 187–197, silently advances its cursor past commands whose session is no longer authorized. It sends no tombstone, replay-gap or resynchronization outcome. The real-server probe stored device-lane sequence 1 for an unbound old session and sequence 2 for the current session. SSE delivered sequence 2 first. The bridge correctly kept its contiguous cursor at zero and returned no dispatchable commands, but sequence 1 can never arrive through that stream.

Repair: define authenticated explicit skip/resynchronization semantics for obsolete bindings, preserving the per-device lane contract, and integrate them with the bridge's durable cursor. Do not solve this by blindly advancing past unknown work.

### F07 — P1: pending startup overrides local disable

Affected: M10; local disable acceptance.

[Runtime startup](../../bridge/src/runtime/index.ts), lines 69–85, creates the controller only after awaiting initial native inspection. Disabling during that inspection has no controller to abort. When inspection resolves, `start()` creates a fresh controller, renews the lease and changes disabled to online. The probe reproduced this without any external network or app.

Repair: establish a cancellable lifecycle generation before the first await, preserve explicit disable through startup completion, and serialize start/stop. The same ordering also permits concurrent starts before the controller exists.

### F08 — P2: per-binding runtimes cannot share one device's feed

Affected: M10; requirements binding isolation and documented multiple runtime instances.

[Runtime receipt](../../bridge/src/runtime/index.ts), lines 131–145, opens an unfiltered per-device stream but treats every command for another session as a fatal conflict. Server sequences and command queries are device-wide. A legitimate second active session's record therefore stops the first session's runtime; the local probe reached reconciliation-required. Shared dispatch reads and recovery attempts are also device/global rather than scoped to the runtime binding.

Repair: provide a single durable device consumer/router with per-binding schedulers, or define compatible session-specific feeds/checkpoints. Test interleaved prompt/control records for two simultaneous bindings on one device.

### F09 — P2: the fake resolver trusts caller-replaced native approval content

Affected: M05; exact native identity/outcome contract and approval conformance fixture.

[Fake resolver](../../adapters/fake/src/index.ts), lines 145–160, checks pending request ID/revision, then derives digest comparison, offered choices and grant subset from the caller-provided request. It does not compare these to the stored native request. The probe replaced the digest, invented a persistent allow choice and expanded requested permissions to the filesystem root; the simulator returned applied.

Repair: use the stored pending native request as authority and reject changed native review content even when request ID/revision are reused. M11 validation will not make an inaccurate native adapter simulator a reliable conformance test.

### F10 — P2: opaque JSON data is misclassified as protocol timestamp fields

Affected: M04; schema/type contract for `JsonValue`.

[Timestamp validation](../../protocol/src/validation.ts), lines 67–77, recursively validates every property named `createdAt`, `observedAt`, `receivedAt`, or `expiresAt`, including arbitrary answers, action arguments and permission scopes. A schema-valid `input.respond` answer `{createdAt: "yesterday", expiresAt: "never"}` is rejected as an invalid protocol timestamp.

Repair: validate timestamps by declared schema/path, excluding opaque JSON content. Add fixtures proving arbitrary user/tool data survives validation unchanged.

### F11 — P2: bounded batches and connections do not bound pending work

Affected: M09 delivery requirement for bounded queues; requirements §10/§15.

Source inspection: [HTTP options](../../server/src/http/index.ts), lines 15–23, bound request size and simultaneous SSE connections; [command persistence](../../server/src/storage/index.ts), lines 159–176, accepts commands without pending-turn/control admission limits. The 100-record replay batch bounds each query, not the durable backlog. An offline device can accumulate unlimited accepted pending work. Existing tests verify 413/connection 429, not pending-queue rejection.

Repair: define configurable pending queue limits and transactional admission/deduplication, preserving capacity for controls. Test boundary rejection and recovery after acknowledgement/terminal outcomes.

### F12 — P2: reconnect jitter exceeds the configured cap

Affected: M10; requirements §10.1 capped reconnect backoff.

Source inspection: [backoff](../../bridge/src/runtime/index.ts), lines 402–405, caps the exponential ceiling before multiplying by a factor between 0.5 and 1.5. With the default 30,000 ms cap, the final delay can be 45,000 ms.

Repair: cap the final jittered delay or use a bounded full-jitter policy. Add deterministic random-source tests at both extremes and large failure counts.

## Verification and limits

| Check | Current result |
|---|---|
| `npm run build`, `npm run lint` | Passed for all five TypeScript workspaces. |
| `npm test` | 30 passed, 0 failed, 4 PostgreSQL tests skipped in the portable run. |
| `swift test --package-path companion --scratch-path /private/tmp/m01-m10-review-swiftpm` | 3 passed; temporary Keychain item removed by the test. |
| Dedicated M06/M08/M09/M10 PostgreSQL suites | Passed sequentially: 1 / 1 / 2 / 6 tests. M06 included service restart. |
| [Local review probes](../../evidence/reviews/m01-m10/local-probes.mjs) | 8 defect observations reproduced; see [results](../../evidence/reviews/m01-m10/local-results.json). |
| [Server review probes](../../evidence/reviews/m01-m10/server-probes.mjs) | 3 defect observations reproduced; see [results](../../evidence/reviews/m01-m10/server-results.json). |

The review probes assert the observed defects to make reproduction repeatable. Their exit status zero means the defects were reproduced, not that the implementation passed those requirements. They are stored outside the normal suite so review does not replace intended acceptance tests with assertions of faulty behavior.

Node 25.9.0/npm 11.12.1 ran the checks; selected Node 24 remains unverified. PostgreSQL was the disposable 17.11 service. Server probes used a uniquely named isolated schema, synthetic identities, and loopback HTTP; the schema was dropped and the service stopped afterward. Historical M01/M02 app evidence was audited from the saved records, not recreated as new live app interaction. No real external identity realm, app adapter, Connect installation, or production deployment was tested.

DECISION-002 still specifies Fastify 5, while M09 uses `node:http`. Record an accepted architecture amendment or align the transport implementation before handing the server to later UI/deployment milestones. Current feasibility documents also contain historical present-tense status statements (for example M01/M03 still incomplete/not started); date-label or amend them to avoid contradicting the current register.

## Repair order and close-out gates

1. Restore native mutation authority: F01/F03/F04/F07, then test takeover fencing at the actual adapter boundary.
2. Repair epoch recovery and device/binding replay routing: F05/F06/F08.
3. Correct the protocol validator and native simulator: F10/F09, then revalidate dependent tests.
4. Finish queue admission, backoff bounds and architecture/runtime evidence: F11/F12 and the documented caveats.

Before reclosing M10, add runtime-level blocked-turn cancellation, a second queued prompt after ordinary completion, real runtime-to-API integration, startup/dispatch disable races, transit/clock/deadline tests, multiple bindings, obsolete binding sequences and epoch restart. The current isolated scheduler test's injected approval handler establishes delivery only; M11 still owns authenticated request-bound approval application.

This audit ends at review/documentation. Reopened milestone implementation should proceed one milestone at a time. M11 should wait until the affected prerequisites are repaired and revalidated.
