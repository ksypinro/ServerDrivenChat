# M01–M10 repaired acceptance close-out

Recorded: 2026-10-06 00:16 +06:00 (Asia/Dhaka). User authorization: “fix all these and make M01 to M10 Complete.” The twelve findings from the [audit](m01-m10-audit.md) are resolved, and M01–M10 are Done within their defined milestone boundaries. M11–M26 remain Not started.

## Acceptance by milestone

| Milestone | Result | Established acceptance and boundary |
|---|---|---|
| M01 | Done — feasibility | Saved addressed two-turn continuity and genuine Xcode app-access request with human **Allow this conversation** response. The assessed external route has a documented negative finding, which satisfies discovery acceptance. No new app approvals or external attachment claims were added. M16/M17 retain their integration gates. |
| M02 | Done — feasibility | Saved Cline task continuity and native Save/Reject observations in both IDE hosts; native identities, app-owned API additions, and trusted Connect origin are specified. Production API adoption remains M19–M21. |
| M03 | Done | Fresh Node 24.21.0/npm 11.19.0 setup, all workspace build/lint/smoke, dependency direction, Swift core and Keychain checks pass. DECISION-002 explicitly amends the transport choice to `node:http`; the React/Vite graphical interface remains its later milestone. |
| M04 | Done | Public schemas/fixtures, canonical digest, decision and pure-state validation pass. Calendar checks follow declared fields and preserve opaque JSON. Closed dispatch-permit/skip schemas and separate `ProducerCursor` recovery contracts are exported. |
| M05 | Done | Deterministic scripts, suspension, queue, input/cancel/approval controls and explicit faults pass. Native review content is compared to the stored request. Foreign approval bindings/turns are rejected and valid approval event envelopes are tested. Mutation guards are checked in the simulator. |
| M06 | Done | Real PostgreSQL migrations, atomic deduplication, concurrency, rollback, snapshots, service restart and separate schema dump/restore pass. Restore verifies accepted data, watermarks, acknowledgements and duplicate recognition. Applied migrations remain immutable. |
| M07 | Done | File-backed SQLite fault/restart tests pass. Migration preserves old output/acknowledgements under session/epoch uniqueness; cursors remain contiguous. Authenticated skip receipt and session-scoped recovery are durable. |
| M08 | Done | OIDC/PKCE/signature, pairing, roles, rotation/revocation and assertion primitives pass with synthetic identities/provider fixtures. The temporary macOS Keychain item roundtrip passes and cleans up. Live realm and graphical sign-in remain deployment/UI work. |
| M09 | Done | Durable authenticated HTTP/SSE, replay, heartbeats, framing/backpressure and limit rejection pass. Open streams recheck access. Command/event/ack writes use transactional authority checks and consistent lock order. Independent prompt/control queue limits reserve control capacity. Obsolete records emit durable explicit skips. |
| M10 | Done | Independent control delivery during a blocked turn, input/cancel/approval delivery seam, subsequent queued turns, durable retry and uncertain-effect reconciliation pass. Startup/disable/stop/expiry/takeover races, conservative monotonic lease deadlines, hung-renewal watchdog, capped backoff, two bindings and new-epoch recovery pass against both a scripted peer and real API/PostgreSQL. |

## Finding resolutions

| Finding | Repair | Regression evidence |
|---|---|---|
| F01 | Recheck abort/lease after inspection; reserve server authority and require the adapter's guard at the mutation boundary | `repair-runtime.test.mjs`: paused inspection after disable/stop/expiry/takeover and deferred native guard; `repair-integration.test.mjs`: real admission/takeover ordering |
| F02 | Reauthenticate bearer tokens and current session/device access throughout stream delivery | `repair-server.test.mjs`: viewer revocation, user-token expiry, device rotation and device expiry close existing streams |
| F03 | Request-start monotonic deadlines subtract transit; exhausted leases fail; independent watchdog and 10-second request/channel bound; lease/renewal defaults 60/20 seconds | `repair-runtime.test.mjs`: exhausted transit, wall-clock rollback and hung renewal |
| F04 | Lock binding/device/credential state inside writes, recheck expiry after waits and before commit admission; user role checks share command admission; dispatch holds the same authority locks | `repair-server.test.mjs`: takeover before admission for commands/events/acks, write-before-takeover, expired lock wait, revoked operator, consistent command/event lock order; real runtime takeover test |
| F05 | Session/epoch output uniqueness, transactional old-row migration, contiguous `ProducerCursor` checkpoints and immutable event IDs | `repair-storage.test.mjs`: migration/history/gap/duplicate cases; real runtime old-outbox/new-epoch sequence-one integration |
| F06 | Persist/replay server-authenticated obsolete-command skips; bridge stores skips before contiguous advancement | Server skip test, SQLite skip/restart test, real API multi-binding/obsolete-work test |
| F07 | Establish cancellation before initial inspection; serialize startup; pending/late responses cannot override disable or stop | Startup, concurrent-start and late-command-response regressions |
| F08 | Shared device inbox routes all authenticated records; schedulers, acks, output and recovery are scoped to their session | Two concurrent bindings with interleaved prompts and controls; retained output recovery |
| F09 | Stored native request supplies review authority; caller replacements and foreign native binding/turns fail | Adapter conformance for changed digest/choices/grants, foreign script identity and valid envelopes |
| F10 | Ajv calendar validation applies to schema-declared timestamps, including closed transport metadata | Protocol arbitrary answer/action/scope JSON plus invalid calendar tests |
| F11 | Transactional bounded admission after duplicate detection, independent per-device lanes; applied/rejected acks release capacity | Concurrent capacity boundary, exact retry at capacity, reserved control lane, excess-control rejection and post-ack admission |
| F12 | Clamp final jittered reconnect delay | Deterministic random-extreme/high-failure tests |

The shared inbox is one logical durable device router; per-binding stream readers may receive duplicate records, which the store deduplicates before any scheduler sees them. It does not silently discard another binding's command. Native authority is reserved only for admission/application acceptance, never the lifetime of an LLM turn. Adapters must honor `AdapterMutationContext` at every actual effect boundary; real app conformance remains required in its owning milestones.

## Final verification

| Check | Result | Evidence |
|---|---|---|
| Fresh Node 24 container: `npm ci`, build, lint, full tests with PostgreSQL URLs | 62 passed, 0 failed, 1 host-only dump/restore check skipped | [Node 24 output](../../evidence/reviews/m01-m10-repair/node24.log) |
| Host build/lint and portable tests | 48 passed, 0 failed, 15 external-store checks skipped | [Portable output](../../evidence/reviews/m01-m10-repair/host-portable.log), [lint](../../evidence/reviews/m01-m10-repair/host-lint.log) |
| Dedicated M06 with service restart and dump/restore | 2 passed, 0 failed, 0 skipped | [M06 output](../../evidence/reviews/m01-m10-repair/m06-restart-restore.log) |
| Dedicated M08 | 1 passed, 0 failed | [M08 output](../../evidence/reviews/m01-m10-repair/m08.log) |
| Dedicated M09 | 9 passed, 0 failed | [M09 output](../../evidence/reviews/m01-m10-repair/m09.log) |
| Dedicated M10 | 23 passed, 0 failed | [M10 output](../../evidence/reviews/m01-m10-repair/m10.log) |
| Swift/macOS Keychain | 3 passed, 0 failed | [Swift output](../../evidence/reviews/m01-m10-repair/swift.log) |
| Cleanup | No isolated repair schemas remain; PostgreSQL stopped | [Cleanup output](../../evidence/reviews/m01-m10-repair/cleanup.log) |

See [machine-readable verification](../../evidence/reviews/m01-m10-repair/verification.json) for exact environment/commands and [source hashes](../../evidence/reviews/m01-m10-repair/source-hashes.json) for the validated implementation. Node 24 uses the pinned Linux ARM64 image digest recorded there. Host checks use Node 25.9.0/npm 11.12.1 and native Swift/Xcode; their runtime limitation is now complemented by actual Node 24 validation.

## Decisive validation corrections

Early Node 24 attempts exposed a no-execute container temporary mount and then lint running before generated workspace declarations existed. The final fresh-copy run uses an executable container directory and the documented build-before-lint order. The new restart fixture also needed confirmed dispatch completion before graceful shutdown, keeping interrupted-effect reconciliation as a separate test.

Node 24 integration then exposed a real session/binding lock-order deadlock introduced while strengthening command authorization. All fenced writes now acquire binding/device before session/membership locks; device rows use non-key-update locks so credential foreign-key insertion cannot form the reverse cycle. The controlled concurrent command/event regression and the previously failing epoch restart now pass. Earlier failed logs remain saved as historical attempts; only the final passing runs establish completion.

## Handoff and limits

No required M01–M10 repair remains open. The next eligible milestone is M11, requiring a separate implementation request. Its request-bound decision application engine is not supplied by the M10 approval delivery seam. Real Codex attachment/atomic native approval, adopted Cline API/Connect origin, production identity realm, graphical product and deployment remain their explicit downstream milestones. Existing M01/M02 observations were reviewed from evidence, not re-recorded as new live app interaction. Schema dump restoration is verified; a production backup service or disaster-recovery procedure is not claimed.
