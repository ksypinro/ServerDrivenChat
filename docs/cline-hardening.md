# Cline hardening and recovery (M23)

Scope: the adopted local VS Code Cline 4.1.22 `sdc-m21.3` / API 1.2, companion 0.5.0, and shared HTTP/SSE runtime. Codex, stock Cline, remote extension hosts and Antigravity remain outside this acceptance. M24 distribution and M26 performance/soak certification are separate gates.

## Limits and retention

These defaults are enforced in the named owning modules. Developer fixtures can lower the limits to exercise exhaustion; changing a limit does not expand native permissions.

| Resource | Default and enforcement |
|---|---|
| JSON HTTP body / SSE frame / bridge record | 1 MiB each; oversize input is rejected, oversize native output suspends delivery with reconciliation |
| Pending server prompt / control lane | 100 / 1,000 per device, admitted transactionally; duplicates retain their original identity |
| Pending bridge prompt / control lane | 1,000 / 2,000 per device, including uncertain attempts; controls have a separate lane |
| Unacknowledged bridge output | 5,000 events and 32 MiB across the local ledger; full capacity halts new remote effects |
| Retained bridge command/output payload | 64 MiB, including acknowledged history; never evict receipt or unresolved rows to make room |
| SQLite database | 65,536 pages (256 MiB with the default 4 KiB pages); FULL synchronous WAL, automatic checkpoint every 1,000 pages, idle journal target 16 MiB. The page cap excludes WAL, temporary files and filesystem overhead; disk exhaustion is separately handled |
| Retained server output | 10,000 events / 32 MiB per session; output capacity does not consume command-lane capacity |
| Retained server commands | 50,000 / 32 MiB per device and lane; prompt history does not consume control history |
| Attachments | 20 MiB per shared upload; 256 MiB / 1,000 pending or committed uploads per database. Reserve declared bytes under a PostgreSQL lock before writing a file |
| Cline images | PNG/JPEG only; 10 MiB per image and per native binding; app-owned exact checksum/echo required |
| Native receipt/event caches | 256 command receipts per binding; 512 native events and 2,048 normalized events. An expired/ahead cursor causes explicit reconciliation rather than silent skipping |
| SSE streams | 128 server connections; 15-second heartbeat; writes wait for drain independently of control dispatch |
| Remote ownership | 60-second lease, renewal every 20 seconds; independent monotonic watchdog withdraws authority 1.5 seconds before expiry |
| Dispatch permit | Held authority channel and a 10-second operation deadline; effect-boundary checks include local enablement and the captured native identity |
| Connect / setup | Native Connect deadline 120 seconds; each setup HTTP operation adds a 15-second deadline. Cancelled dialogs release the pending slot; late consent and callbacks cannot enable a binding |
| Approval / question | App-owned addressed request expires for remote resolution after 10 minutes. Expiry does not approve, revoke a native permission, or fabricate cancellation; the native user can resolve/cancel locally |
| Attachment retention | Pending upload expires after 1 hour; committed bytes after 7 days. Reads/commit reject expired content before cleanup. Cleanup removes both staged and rename-before-commit orphan bytes |
| History retention | No automatic eviction of commands, output receipts, decisions or unknown attempts. At a budget boundary, stop/reject admission and preserve evidence; review native state before an operator archives or starts a fresh binding. No automatic native replay or destructive archive workflow is provided |

PostgreSQL and filesystem volumes also need deployment-level capacity monitoring and backup (M24). Per-session/device budgets do not claim a global bound on all accounts, audit records or database overhead. A database write failure never yields a durable acceptance receipt. Capturing native state after an output gap requires explicit local review; an HTTP acknowledgement alone cannot establish whether a native effect occurred.

## Effect and lifecycle fences

The bridge writes `applying` before calling an adapter. Crash recovery changes uncertain attempts to `reconciliation_required`; it does not retry them. A received but unstarted command remains queued. A committed `applied` result can resend its acknowledgement without replaying the native action. Inbox receipt and cursor advancement are one SQLite transaction. Server command, sequence and event admission are transactional too.

A stale command pauses every later prompt in the received batch. Addressed controls remain independently available while the lease and native identity are valid; storage exhaustion or an unrecoverable event gap aborts all remote effects. A blocked output POST cannot hold the control lane.

Disconnect synchronously disables local authority. Reload does not restore opaque native tokens or a server binding; the new host needs explicit local confirmation. Task replacement, workspace changes and a local new prompt invalidate the captured binding. An old pending approval is not transferred to a different task, session, window or host. Local and remote decisions settle one captured native callback; a losing or changed decision is rejected rather than applied to the next request.

Companion activation checks the reviewed native package version, patch revision and actual host/addon SHA-256 hashes before exposing remote controls. A stock, updated or tampered build fails closed. Adoption of a new fingerprint requires source review and fresh native acceptance; preserving the same API version is insufficient.

## Verification

`npm run test:m23` runs the documented equivalent conformance suite in `tests/conformance/` together with shared repair and Cline contract tests. Set the milestone database environment variables to the disposable PostgreSQL service for database-dependent cases. `scripts/verify-m23-node24.sh` makes a clean copy, installs the lockfile, builds and verifies it under the selected Node 24 image. These are developer verification commands, not product setup instructions.

New checks cover actual SIGKILL boundaries, SQLite physical exhaustion, retained byte budgets, concurrent PostgreSQL/upload quotas, cross-owner/session content access, expired orphan cleanup, stale prompt batches, producer gaps, a hung 10 MiB output backlog, setup cancellation, callback cleanup and native upgrade fingerprints. Existing M06–M22 tests supply lease/partition/identity/deduplication/approval-race coverage. Model/coordinator fixtures are labeled simulation; required native spot checks and their exact artifacts are recorded separately in [M23 evidence](../evidence/M23/verification.json).
