# MI-06 — command retention and recovery

This record describes the unsigned MI-06 candidates. The server worker defaults to off and has an empty device allowlist. Migration 011 alone does not compact data. Rollout requires the retention-aware server and an upgraded, explicitly selected companion cohort; disabling the worker does not recover archived payloads. Rollback refuses used retention state. Retained command identities and event/transcript history continue to grow.

The automated acceptance uses disposable PostgreSQL and file-backed SQLite, an actual TCP/SSE server, and separate bridge processes with a deterministic simulated native adapter. Both source and code extracted from the exact companion VSIX exercise a real expired cursor and checkpoint. Control-lane recovery, process death during checkpoint transactions, retained attempts and acknowledgements, late retries, public operations and cancellation references, approval acknowledgements, permit/revocation and compaction, migration rollback, and used-state backup/restore have focused checks. The older accepted MI-04 companion fails closed on expiry; the current bridge also completes a command against the accepted MI-04 server transport without retention.

No installed-host, live Cline/model, provider or new native `410` test was performed. The native Cline archive is copied from MI-04 and verified against its accepted digest. Neither candidate is signed, published or deployed. Exact hashes and the server image ID are in [artifact-manifest.json](artifact-manifest.json).

## Reproduction

With Node 24 and an explicitly disposable database at `MI06_TEST_DATABASE_URL`, create a disposable PostgreSQL container named `sdc-mi06-test-pg` with the synthetic test credentials documented by `tests/mi06-retention-restore.test.mjs`, set `MI06_TEST_PG_CONTAINER=sdc-mi06-test-pg`, build workspaces, and run `npm run test:mi06`. The runner refuses missing database/container configuration, fails for unavailable dependencies and fails if any MI-06 test is skipped. The exact MI-04 companion VSIX and accepted MI-04 server image must be available for compatibility and packaging checks. Candidate VSIX archives and the image are local build products, not checked into git.

## Measurement and limits

A small same-process synthetic run compacted 100 records (37,360 canonical bytes) in 53 ms after batching updates. Control-lane admission p95 was 3.73 ms without compaction and 11.73 ms during the run; lease-renewal p95 was 4.98 ms and 6.98 ms. The input is small, non-native, and includes ordinary scheduler/database variation; the increase in admission latency merits monitoring before cohort expansion. It is not a native-host or 5–10-window performance qualification. `scripts/measure-mi06.mjs` repeats this measurement against a disposable database.

A deliberately malformed historical terminal event initially revealed an unsafe eligibility decision; the implementation now validates terminal evidence and the regression passes. A later restart review found that a checkpoint conflict needed a durable reconciliation marker; the stored command and any applying attempt now retain that state after restart without dropping pending acknowledgements. An attempted fixture that required dispatching across a local cursor gap was removed because dispatch is intentionally limited to the contiguous receipt cursor. The guard against a recovery beginning while a permit is in flight remains in the bridge, but that particular artificial scenario is not claimed as tested.

A 5,000-row disposable replay query plan used the `commands_unarchived_delivery` index for the device, lane and sequence predicate. This verifies the selected access path in that fixture, not production-scale behavior.
