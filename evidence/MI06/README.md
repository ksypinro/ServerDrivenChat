# MI-06 — repaired command retention and recovery

**Done for automated candidate .2 acceptance — 2026-11-15.** The earlier candidate's completion claim was reopened after reproducing stale terminal-evidence reuse. Candidate .2 repairs that defect and closes the missing acceptance cases. [R01–R19 traceability](traceability.md), [verification](verification.md), and [exact artifact hashes](artifact-manifest.json) describe the final acceptance. Unmodified candidate .1 records remain in `candidate-1/`; its archive and server tag remain historical, not repaired candidates.

Migration 012 permanently retains prompt turn ownership. Another command cannot reuse a session's turn ID, including after archival; identical command retries retain their meaning. Historical ambiguity blocks applied-prompt compaction. Terminal evidence must match session, command/turn, binding revision and lease generation, validate as an event, and not predate command creation. Admission and compaction share this rule. Indexed evidence lookups and periodic event-loop yields keep bounded compaction responsive to peer requests.

The automated gate uses real PostgreSQL, TCP/SSE, separate bridge processes and file-backed SQLite, with a simulated native adapter. It covers actual expired cursors, pending holes, queued/applying/reconciliation conflicts through restart, dropped HTTP ACK responses, actual paused-reader backpressure, seeded source and exact packaged reconnect traces, public receipts, approval effects, restore and rollback. No real user inbox was rewound. Candidate .2 uses the unchanged accepted Cline 4.1.2206/API 1.3 archive. The companion shared bridge bytes also match candidate .1 because these repairs are in server storage/transport; the new .2 artifact identifies the newly qualified candidate set.

## Performance gate

Five paired rounds used 10,000 prompt records per round: half applied with matching terminal events and half rejected. Each peer sample runs the same control-admission and HTTP lease-renewal operations in baseline and loaded phases. Only samples intersecting measured compaction lane-lock intervals count under load; every round requires at least 30 overlapping samples per operation. Warm-up precedes baseline measurement. Batches remain 100 records; retention defaults are unchanged.

The selected gate is the median across five rounds: loaded p95 at most 25 ms and added p95 at most 10 ms, independently for admission and renewal. It **passed**: admission loaded p95 **10.42 ms**, added **5.16 ms**; renewal loaded **10.49 ms**, added **5.01 ms**. These are synthetic completion limits, not production or native-host SLAs. Individual rounds can exceed the added-latency limit; acceptance uses the explicitly selected median.

| Round | Admission baseline p95 ms | Loaded | Added | Renewal baseline p95 ms | Loaded | Added | Overlapping samples admission / renewal |
|---|---|---|---|---|---|---|---|
| 1 | 4.62 | 18.72 | 14.10 | 5.03 | 18.14 | 13.11 | 292 / 292 |
| 2 | 5.26 | 10.42 | 5.16 | 5.36 | 10.38 | 5.01 | 305 / 305 |
| 3 | 7.50 | 10.11 | 2.61 | 7.59 | 10.49 | 2.90 | 315 / 315 |
| 4 | 4.70 | 11.61 | 6.91 | 4.88 | 11.30 | 6.41 | 317 / 317 |
| 5 | 6.46 | 10.35 | 3.89 | 6.40 | 10.39 | 3.99 | 312 / 312 |

Full samples, lock intervals, batch durations, busy skips and query plans are retained locally in `performance.json` under the evidence ignore policy. Replay uses `commands_unarchived_delivery`; correlated terminal evidence uses bitmap scans of `events_retention_turn` and `events_retention_rejection`. Before these indexes, the mixed workload showed per-command sequential transcript scans; that profiling attempt was stopped after identifying the access-path defect. The old rejected-only measurements are preserved only as historical evidence.

## Reproduction and rollout

Use Node 24/npm 11, build workspaces and candidate .2, and set `MI06_TEST_DATABASE_URL` to the explicitly disposable test database plus `MI06_TEST_PG_CONTAINER=sdc-mi06-test-pg`. The restore test documents its exact synthetic database/port. `npm run test:mi06` requires the database, exact candidate archives and accepted MI-04 compatibility image; it refuses missing dependencies or skipped tests and also runs the performance gate. Candidate generation requires `sdc-server:mi06-candidate.2` to exist and records its exact image ID plus migrations 011/012 hashes. Archives/images and raw reports remain local build products.

Retention remains **off by default**, with an empty device allowlist. No installed-host smoke, Cline/model/provider run, deployment, signing, publication or cohort enablement occurred. The retained deployment was not changed. Quiesce server writers and apply 011/012 with retention disabled before future rollout. Migration 012 refuses already-compacted intermediate candidate-011 databases; do not bypass the refusal—use a reviewed pre-compaction backup. Disabling retention does not restore discarded payloads. Compact command receipts and transcript/event history continue to grow, so only replayable payload storage is bounded. The disposable MI-06 database is removed after acceptance.
