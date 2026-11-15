# MI-06 candidate .2 verification — 2026-11-15

- Root `npm run build`, `npm run lint`, and `node scripts/export-protocol-schemas.mjs`: passed on the final source.
- `MI06_TEST_DATABASE_URL=<explicit disposable database> MI06_TEST_PG_CONTAINER=sdc-mi06-test-pg npm run test:mi06`: **63 passed, zero failures, zero skips**, followed by a passing five-pair mixed-workload performance gate. Its script rejects skipped tests and unavailable required dependencies.
- `node --test --test-concurrency=4 tests/*.test.mjs tests/conformance/*.test.mjs`, with all affected database suite variables set to that disposable database: **352 passed, zero failures, one skip** (353 total). The skipped old M06 restore check requires a different compose database/port; the dedicated MI-06 used-state restore and permanent turn-ownership retry checks passed.
- Exact packaged companion activation, 410 recovery and seeded reconnect traces passed; `mi06-artifacts.test.mjs` verified tested bundle/archive bytes, the unchanged accepted native archive, both migration hashes and the server image ID against the manifest.
- R01–R19 decisive assertions are mapped in [traceability.md](traceability.md). Full performance results, overlap validation, index paths and limits are described in [README.md](README.md).

Raw final build/lint/schema/image/package/test logs are local under this directory and excluded by the existing evidence policy. The performance report SHA-256 is `ba82179df5bf39e99e3ba6502f542c0793a3c8a3514a024066192b1fee4cb8f1`.

This is automated source/transport/candidate acceptance with a simulated native boundary. The prior-server check uses the accepted MI-04 HTTP transport with current fixture storage/protocol dependencies; it is not full prior-release deployment qualification. No installed-host, retained deployment, model/provider, signing, publication or cohort rollout was performed. Only the disposable MI-06 test resources were used.
