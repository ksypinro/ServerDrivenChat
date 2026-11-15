# MI-06 verification

Executed 2026-11-14 using Node 24 and a disposable PostgreSQL container at loopback port 55434. The retained deployment and its data were not modified.

- `npm run build`: passed all workspaces.
- `npm run lint`: passed all workspaces.
- `node scripts/export-protocol-schemas.mjs`: passed.
- `MI06_TEST_DATABASE_URL=<disposable URL> MI06_TEST_PG_CONTAINER=sdc-mi06-test-pg npm run test:mi06`: **43 passed, zero failed, zero skipped**. The gate verifies required dependencies and fails on any skipped test.
- `node --test --test-concurrency=4 tests/*.test.mjs tests/conformance/*.test.mjs`, with the affected PostgreSQL suite variables pointing to the disposable database: **332 passed, zero failed, one skipped**. The skip is the older M06 restore gate restricted to a different compose database and port. The dedicated MI-06 used-retention backup/restore gate passed.
- A 5,000-row analyzed replay fixture selected the `commands_unarchived_delivery` index for device/lane/sequence replay.
- The accepted MI-04 native archive matches its frozen SHA-256; the extracted exact MI-06 companion bundle passed activation and real transport/recovery tests. The accepted MI-04 server transport was exercised with the current fixture database and protocol dependencies; this is not a full prior-release deployment qualification.

The simulated native boundary, constrained local performance measurements, lack of installed-host smoke, rollout controls and retained failures are described in [README.md](README.md). Exact immutable candidate identifiers are in [artifact-manifest.json](artifact-manifest.json). No signing, publication, upgrade or cohort enablement was performed.
