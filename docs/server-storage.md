# Server storage

M06 implements PostgreSQL persistence for server-owned users, devices, sessions, bindings, commands, immutable events, interactions, decisions, grants, attachment metadata, and audit records. The schema and migration runner live in `server/migrations/` and `server/src/storage/`. The Node driver is `pg` 8.23.1. PostgreSQL 17 is selected by the dedicated transactional-store decision; this resolves the older PostgreSQL 18 wording in DECISION-002 in favor of DECISION-005.

`ServerDatabase.migrate()` applies checksum-verified SQL migrations under a PostgreSQL advisory transaction lock. Repository writes use transactions and parameterized queries. Command IDs and event IDs are idempotent only when all stored identity/payload fields match; changed retry data raises `StorageConflictError`. Prompt/control command lane counters are independently allocated in the same transaction as command insertion. Event ingestion increments the session replay sequence in the same transaction as immutable event insertion. Decision recording serializes contenders for one session/request/revision and enforces one winner with a unique constraint. Interaction state changes use compare-and-set updates. `readSnapshot()` uses a repeatable-read, read-only transaction and returns its event watermark with the captured projection data. M09 migration 003 persists monotonic bridge command acknowledgements keyed to an existing device/lane/sequence command and rejects session mismatches or state regression.

M10 migration 004 adds a bounded binding lease expiry. Authenticated device renewal must match the current binding revision and fencing generation; it cannot revive an expired binding, which is marked stale. Command delivery requires an unexpired lease, and event/ack writes carry the same revision/generation and are checked against the current lease.

M11 adds migration 006 to support pending grant-ledger entries. Approval-required events create request-scoped interaction rows in the same transaction as event ingestion. `ApprovalEngine` stores one decision winner and its signed control command atomically. Native application events/acks change the grant state; pending request expiry does not revoke an already applied native grant. M12 snapshot reads include stable session and command-lane cursors and continue to use a repeatable-read cut.

M13 adds migration 007 for durable adapter staging receipts. Attachment bytes live outside PostgreSQL in the configured private filesystem root; `attachment_metadata` binds the opaque ID, session, uploader, checksum, MIME type, size, and retention state. The service re-verifies content on commit/download/staging and removes expired incomplete uploads and retained blobs. A failed filesystem/database commit can leave an opaque orphan for retry or retention cleanup; no path or credential is exposed to the model.

## Real PostgreSQL checks

The integration suite is not a mock and is kept out of the default portable test run. Start the dedicated local PostgreSQL 17.11 container (host port bound to loopback only):

```sh
docker compose up -d postgres-m06
M06_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@127.0.0.1:55432/sdc_m06_test \
M06_TEST_DOCKER_RESTART=1 npm run test:m06
```

The suite exercises 12 concurrent identical command writes, conflicting retries, independent lanes, atomic event/session sequencing, one-winning-decision races, conditional interaction transitions, repository coverage, rollback, a repeatable snapshot/replay watermark, and persistent data after restarting the PostgreSQL container and reopening the pool. The compose database and credentials are for local test use only; never reuse them outside this test container. Its named volume allows restart persistence to be observed. Remove the test volume with `docker compose down -v` only when the disposable test data is no longer needed.

## M01–M10 repair validation (2026-10-06)

Migration 005 adds immutable command skip metadata. Applied migrations 001–004 remain checksum-pinned and unchanged. New bindings have a 60-second lease; the historical migration 004 used the then-implemented 45-second initialization and remains preserved rather than extending historical owners during an upgrade. Fenced writes lock current device/binding/credential state in their commit transaction, with real-time expiry checks after lock waits. Command admission additionally locks current user roles and applies bounded per-device lane capacity after duplicate detection.

The restoration check performs `pg_dump` of a disposable isolated schema and `psql` restoration into another isolated schema. It verifies migrations, accepted commands/events, acknowledgement state, snapshots, watermarks and duplicate recognition. Run it against the local compose test database with `M06_TEST_DOCKER_RESTORE=1` alongside `M06_TEST_DATABASE_URL`; service restart remains the separate `M06_TEST_DOCKER_RESTART=1` check. It validates schema backup/restore, not a production backup service or disaster-recovery runbook.
