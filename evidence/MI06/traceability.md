# MI-06 requirement-to-test evidence — repaired candidate .2

Each row names an executable test group and its decisive assertion. The dedicated gate includes all listed MI-06 suites and refuses skipped tests. The native adapter boundary is simulated; transport, PostgreSQL, processes and SQLite stores are real.

| ID | Executable coverage | Decisive assertion |
|---|---|---|
| R01 | `mi06-retention`: terminal prefix; four nonfinal ACK cases. `mi06-safety`: ownership/evidence matrix | Only final safe receipts compact; applied running, malformed, mismatched or ambiguous prompts block. |
| R02 | `mi06-retention`: age/tail/batch boundary. `mi06-transport-gaps`: terminal age. `mi06-process-matrix`: pending hole | Floor stops at the hole; later final ACKs do not bypass it; exact terminal-age cutoff and independent lanes hold. |
| R03 | `mi06-extra`: failed compaction transaction and fresh connection | Trigger failure restores all payloads and floor; reopening storage observes the same intact state. |
| R04 | `mi06-retention`: identical/conflicting retry. `mi06-safety`: ownership before/after archival | Original identity/sequence remains; changed content or a second command owning the same session/turn conflicts. |
| R05 | `mi06-retention`: public operation and command receipt. `mi06-extra`: cancellation FK. Root public API regressions | Public results, idempotency and cancellation references survive; deleting the referenced command fails. |
| R06 | `mi06-extra`: lost HTTP approval ACK response | Server persists approval/grant transition, response is dropped, and post-archive retry returns identical without another transition. |
| R07 | `mi06-retention`: injected two-command hot capacity | Pending prefix retains capacity refusal; compacting a safe prefix frees admission. |
| R08 | `mi06-retention`: HTTP floor boundaries. `mi06-transport-gaps`: above-floor/cursor/SSE capacity | Actual HTTP returns 410/200/409 appropriately; invalid integers return 400; repeated 410s do not consume the single SSE slot. |
| R09 | `mi06-transport-gaps`: actual TCP backpressure. `mi06-retention`: open-stream expiry | Paused reader causes observed write backpressure; compaction closes the socket without requiring drain, complete delivered frames remain contiguous/non-null, reconnect gets 410. |
| R10 | `mi06-retention`: auth and stale revision. `mi06-extra`: revoked device. `mi06-runtime-integration`: malformed/changed authority | Invalid credentials, stale authority and invalid checkpoint data cannot establish usable recovery or dispatch. |
| R11 | `mi06-recovery`: two transaction faults, SIGKILL, competing SQLite connections | Reopen sees an atomic checkpoint/cursor; stale expected cursor fails; attempts, ACKs and output remain. |
| R12 | `mi06-recovery`: delayed own/foreign/skip deliveries. Root scoped-inbox checks | Deliveries below the installed floor fail before queuing; foreign payloads remain absent from the session inbox. |
| R13 | `mi06-runtime-integration`: source and exact packaged bridges. `mi06-process-matrix`: pending-hole variant | Actual 410/checkpoint occurs; new addressed effect happens once; peer remains usable and session payloads stay isolated. |
| R14 | `mi06-process-matrix`: queued/applying/reconciliation conflict and restart. `mi06-extra`: lost ACK | Real 410 does not advance a conflicting cursor; durable work/output/ACKs survive, uncertain state remains reconciliatory after restart, peer continues. |
| R15 | `mi06-extra`: duplicate append plus ACK/compaction; live permit/compaction/revocation. `mi06-safety`: concurrent turn ownership | No duplicate allocation or unsafe archive; held permit bounds compactor wait, revocation fences later permits, and exactly one new turn owner wins. |
| R16 | `mi06-retention-restore`, `mi06-migration`, `mi06-safety` | Used-state dump/restore preserves floor, archived identity and turn reservation; destructive rollbacks and unsupported compacted-011 upgrades refuse. |
| R17 | `mi06-retention` and `mi06-extra`: allowlist, busy lane, overlapping ticks, two workers, two devices, shutdown | Bounded fair sweeps visit both lanes across devices; no double compaction; stop awaits in-flight work. |
| R18 | `mi06-compatibility`; `mi06-runtime-integration`: older bridge | New bridge works with accepted MI-04 HTTP transport and current fixture storage; exact old companion fails closed on actual 410. No full old deployment upgrade qualification is inferred. |
| R19 | `mi06-artifacts`, `mi06-packaged-activation`, `mi06-process-matrix`: seeded source/packaged reconnect traces | Tested VSIX bundle/image/migration hashes match manifest; seed-driven stop/archive/restart traces match reference cursor and effect counts after every settled round. |

Performance is a separate mandatory phase of `npm run test:mi06`: five paired mixed-workload rounds, real compaction-lock overlap, at least 30 overlapping samples per operation/round, and the selected median 25 ms loaded / 10 ms added p95 limits. Full sample timestamps, lock intervals, query plans and batch durations remain local in `performance.json` under the existing evidence ignore policy.
