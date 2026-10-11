# M23 acceptance record

M23 is **Done** for the adopted local Cline pin. Automated hardening and real pending-approval Disconnect, Reload Window and local decision/takeover checks passed. [Independent validation](native-validation.json) links the exact native requests, server commands and action digests; file absence is supported by those executed scenarios.

## Automated coverage

| Required boundary | Evidence and interpretation |
| --- | --- |
| Crash before receipt commit, before/after an external effect and before acknowledgement | `tests/conformance/m23-storage.test.mjs`: real child-process SIGKILL and SQLite recovery. The external marker simulates a native effect; uncertain dispatch requires reconciliation and is not replayed. |
| SQLite full, byte limits, retained history, pending lane capacity | `m23-storage.test.mjs`: actual SQLite page exhaustion with rollback, exact duplicates accepted at capacity, separate control admission. |
| Native cursor gap, stale batch binding, output rejection and flood | `m23-runtime.test.mjs`: injected adapter/HTTP failures halt unsafe delivery and preserve the durable prefix. A 10 MiB backlog does not block addressed control dispatch. This is not the M26 latency distribution or soak. |
| Server record/history limits and attachment exhaustion | `m23-server.test.mjs`: real PostgreSQL transactions, concurrent reservations, rollback of sequence allocation, separate lanes, exact duplicates. |
| Cross-user/session file access and expired staging | `m23-server.test.mjs` plus inherited attachment/authentication suites: authorization checks, expiry and rename-before-commit orphan cleanup. |
| Spoofed approval text, mismatched SSE ID, oversized/invalid stream | `m23-boundary.test.mjs`: assistant text never becomes a permission request; invalid delivery cannot fabricate a durable receipt or native effect. |
| Connect cancellation, late modal completion and authentication callbacks | `m23-lifecycle.test.mjs`, `m23-auth.test.mjs`: cancellation releases the pending slot; late UI/callbacks cannot bind or cache credentials. VS Code is mocked for these checks. |
| Changed/duplicate decisions, ownership, leases, partition and disable | Inherited `repair-*`, `lease-api`, `m11-13-acceptance`, `m20-cline`, `m21-*` and `m22-workflow` suites, included in the full Node 24 run. Native fixtures do not substitute for the required native M23 gate. |
| Cline upgrade and tamper fence | `m23-updates.test.mjs`: exact reviewed version/revision and actual vendor/addon hashes; altered, stock or unsupported packages rejected. Historical M19–M22 evidence validators pass. |
| Restore | `restore-tests.log`: separate real PostgreSQL dump/restore check passed. |

`node24-final.log` records a clean Node 24.21.0/npm 11.19.0 build, type checks and **139 passed, 0 failed, 1 skipped** out of 140 tests. The sole skip is the Docker restore check run separately above. `browser-tests-final.log` records four passing control UI checks, including accurate repair guidance for an offline owner. Failed attempts remain saved with their original names.

## Native acceptance

The approved disposable workspace is `/private/tmp/sdc-m19-vscode-probe`. The exact package fingerprints are in `artifact-manifest.json`. The current fixture origin, marker and prompts are in `fixture.json`; `server-live.json` records real server traffic and effects. The maintained native Cline package is unchanged from M21. The companion is 0.5.0.

The user completed GUI setup and the native boundary actions after Computer Use returned delayed input and inconsistent screenshots. The failed setup attempt is retained in `attempt-01/`. Two malformed MiMo editor requests were locally rejected; they are not counted as valid file probes. The three valid requests used Solar and the correct `path` parameter.

Disconnect detached its binding while approval remained pending; a prepared remote choice became unavailable. Local Reject then finished the native turn, visible in the next explicit binding's native history. Reload interrupted cleanup, so the old server lease remained active until its last 60-second renewal expired; it never renewed afterward. The native host started disconnected, the old pending task stayed unresumed, and a fresh task/host required explicit Connect. Local Reject in that fresh task produced `resolved_elsewhere` and removed its prepared remote choice. A subsequent local composer prompt invalidated the binding and produced LOCAL-OK. All three files remain absent. No remote approval decision was submitted in these failure checks; concurrent decision/assertion rejection remains separately covered by the automated suites and historical M20/M22 evidence.

The validator checked 504 native events and 498 server events. Pre-reload recording is preserved in `live-vscode-before-reload.json`; final recording is `live-vscode.json`. [Native observations](native-observations.json) and screenshots distinguish user handoffs from tool-verified state. Computer Use subsequently verified LOCAL-OK, saved capture, Solar and disconnected status in `native-final-ui.txt`. Window reads stayed scoped to the probe; automatic review rejected generic attachments that could expose LogGraph.

[Cleanup](cleanup.json) confirms the fixture stopped, schema/listeners are gone, PostgreSQL returned to its stopped state, the test browser tab closed and the marker files are absent. Historical VSIX files and the installed stock extension remain unchanged. The native fixture began before the JSONB accounting correction, which was verified independently against the final server build; capacity was not exercised by these native scenarios. The repaired UI was loaded and its offline guidance verified live.

## Recovery guidance

See [hardening limits and recovery](../../docs/cline-hardening.md). On `reconciliation_required`, preserve the ledger and inspect the native task before any retry. Native work may have continued after a bridge interruption. Resolve the uncertain outcome locally and establish a fresh explicit binding; never infer that an unacknowledged action did not happen. Capacity failure does not authorize deleting deduplication history. `lease_lost`, `authentication_required` and local `disconnected` each require explicit repair or reconnect; a successful UI click alone is not evidence of restored delivery.

M24 distribution/deployment and M26 release performance/soak remain outside this record.

The final screenshot exposed a stale green session-list dot for an active-but-expired lease. The row indicator now checks lease expiry too. This display correction followed native cleanup and passed the final UI build, Node 24 type check and four browser tests (detached and expired-owner cases). Saved native screenshots retain the earlier row indicator; their selected conversation controls correctly show disconnected. No native package or control behavior changed.
