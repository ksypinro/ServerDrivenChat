# M26 frozen Cline/API release qualification

M26 is **Done** for the exact declared local release subsets. [Verification](verification.json), [completion gate audit](gate-audit.json), [FR-01–FR-28 traceability](traceability.md) and [maintainer handoff](HANDOFF.md) record results, reproduction and limits. The user authorized M26 on 2026-10-11.

## Frozen target

macOS arm64; official isolated VS Code 1.140.0; maintained Cline 4.1.2204/native API 1.3; companion 0.7.3; retained IPv4 loopback Docker at `https://localhost:15943`, genuine Keycloak 26.4.7, PostgreSQL 17.11, TypeScript server, FastAPI and Nginx/private CA/TLS.

[Frozen candidate](frozen-candidate.json) identifies 90 product/manifest/lock/contract files, accepted archives, installed native fingerprints, SDK/client locks and five image IDs. [Final gate audit](gate-audit.json) recomputes hashes, including installed native addon and companion bundle. Qualification changed no product source, dependency lock, package or deployed image. There is no Git metadata; content hashes identify this checkout.

[M24 graphical lifecycle](../M24/persistent-local/package-lifecycle.json) is the actual same-candidate fresh installation/upgrade/rollback/uninstall/reinstall record immediately preceding M26. It preserved native history and required fresh pairing after credential cleanup. M26 reuses that exact-pair lifecycle, without inventing a separate fresh account/install. Fresh human local sign-in, exact-task Connect/reconnect and native qualification passed during M26.

## Clean regressions

| Check | Result | Evidence |
|---|---|---|
| Node 24.19.0/npm 11.12.1 clean install/build/type checks | Passed | [Install](npm-ci.log), [build](build.log), [lint](lint.log) |
| Root tests, every database suite enabled | 182 passed, 0 failed, 0 skipped | [Root](root-test.log) |
| Python 3.13.16/uv 0.12.23 clean locked gateway | 54 passed | [Sync](gateway-sync.log), [gateway](gateway-test.log) |
| Swift companion core | 8 passed | [Swift](swift-test.log) |
| Python 3.12.15/Aider 0.86.2 locked shim | 2 passed | [Sync](aider-sync.log), [retry identity](aider-shim-test.log) |
| Disposable PostgreSQL restart/dump/restore | Passed separately | [Storage](storage-restart-restore.log) |
| Trusted project signature/archive hashes/official editor signature | Passed | [Project](signature.log), [host](host-signature.log) |
| Guide links/command labels/identical 42-path OpenAPI | Passed | [Guide audit](documentation-audit.log), [release links](release-links.json) |

Root tests include shared repair and M23 hardening suites. Real HTTP/PostgreSQL fixtures use scripted/simulated native effects; they do not become real native proof because the server is real. See the requirement matrix for each seam.

## Current installed native/API/client acceptance

- [Provider sync/discovery/count/retry](provider-native.json): first-party REST, OpenAI Chat/Responses and Anthropic Messages with verified native terminal results.
- [Official Node SDK streams/retrieval](sdk-streams-native.json): actual HTTPS SSE parsing and stored Responses retrieval.
- [PNG](image-native.json) and [JPEG](jpeg-native.json): owned committed attachments, checksummed native staging and completed turns through REST/Chat/Responses/Messages. Marker turns establish delivery, not image recognition accuracy.
- [Aider 0.86.2](aider-native.json): exact local shim/text/whole-file settings, two sequential edits each through Chat and Messages on current companion/TLS. The client applies returned text; Cline did not execute native file tools for these edits.
- [First-party native controls](firstparty-native.json): same-task recall, addressed question, signed exact once/deny, actual allowed file content, denied file absence and acknowledged native cancel. Effects stayed in native-sandbox under temporary explicit human approval; Auto-approve stayed None.
- [Preflight authority](native-negative.json): default caller functions withheld 422; unsupported sampling 422; unchanged prompt cursor/no native send; view-only prompt 403.
- [Recovery/fences](native-fences.json): local intervention fenced old binding 403, reconnect, actual production server/gateway restart with same scoped key/history, restored approvals-disabled profile.
- [Final local disable](final-local-disable.json): fresh unexpired key still authenticated 200 while new prompt on graphically disconnected binding failed 403; durable admitted command count unchanged. Revoke then returned 401 and no M26-labeled key remained unrevoked.

## Measured latency and backlog

Three healthy local trials each delivered 60 controls through real HTTP/PostgreSQL/BridgeRuntime/file-backed SQLite to a guarded **simulated** native effect. Nearest-rank p95: **113.622 / 118.167 / 116.162 ms**, below 500 ms. Caller HTTP start includes durable admission/SSE/effect-boundary dispatch permission, an upper bound on server-to-bridge delivery. Model generation is excluded.

A deliberately stalled output POST retained 20 events totaling **10 MiB**, while 60 controls continued: p95 **115.474 ms**, all 20 events retained. [Raw distributions](performance.json). The root regression suite shared the host; no deliberate network/DB fault was injected during measured trials. These local figures are not Internet-network guarantees.

Actual native approval visibility was **83 ms and 156 ms**, bridge-observed event timestamp to public HTTPS SSE arrival on the same Mac, below one second. Source and samples are in the first-party report; model generation is excluded.

## Actual hour qualification

| Run | Idle/active behavior | Actual duration/result |
|---|---|---|
| [Real native hour](real-native-soak.json) | 30 minutes idle lease renewal, then 30 minutes serial real Cline tool-free marker turns | 3600002.286 ms; 20 completed turns; 0 failures; key revoked/rejected 401 |
| [Bridge hour](soak.json) | 30 minutes idle, then 30 minutes real server/bridge controls with simulated native effects | 3600000.354 ms; 60 controls; 0 failures; 120 samples; no unacked output |
| [Independent deployed monitor](final-deployed-monitor.json) | Verified HTTPS health/container state/live native authority | 3600.010 s; 120 samples; 0 failures |

Native-hour gateway admission p95 was **58.459 ms**; model-inclusive completion p95 was **53565.623 ms**. These are separate metrics; model runtime is excluded from the 500 ms control target. Bridge active-hour control p95 was **156.822 ms**. Raw records and exact start/end times are retained.

## Retained failures and corrections

1. [First control-driver attempt](firstparty-native-attempt-1.json) completed native tests but failed final key cleanup after owner-token expiry. Fresh human SSO [recovered only M26 keys](recovered-cleanup.json); owner refresh now stays in memory. Repeat passed including revocation 401. Passwords/bearers were never written to evidence.
2. Disposable PostgreSQL restart/restore overlapped the first bridge soak and terminated its fixture pool. The [partial report](soak-attempt-1.json) stays at running because the process crashed; [crash log](soak-attempt-1.log) is failure evidence. This orchestration error was corrected with a full replacement hour and no fault injection; interrupted work is not counted as a pass.
3. [Preliminary native monitor](deployed-soak.json) saw intentional takeover/restart outages. It remains fault observation, not the healthy hour. Independent final monitor passed.
4. First Aider run supplied only the private CA as Python roots, causing an external metadata-fetch certificate warning. Corrected current rerun used additive certifi roots plus public project CA and passed.
5. [First final-disable checker](final-local-disable-attempt-1.json) compared a live snapshot cursor with detached projection cursor 0. Authentication 200/prompt 403 had passed, but the assertion was wrong. Corrected checker compares authoritative durable admitted commands; same-task reduced-category reconnect/retest passed. No product change or repeat of the completed hour was required.

## Handoff and scope

[Final state](final-state.json): five persistent services retained; certificate-verified health/OIDC discovery 200; bridge disconnected; native task/history preserved; approvals disabled; Auto-approve None; zero unrevoked M26 keys; disposable PostgreSQL stopped. Stock editor/private credential state remain intact.

Acceptance covers this local Cline pair and declared REST/provider/Node SDK/Aider text subsets. Default caller functions remain withheld; historical M30 companion 0.7.0 qualification is not enabled on 0.7.3. Python SDKs remain locked fixture consumers. One real Cline task is accepted; adversarial two-binding isolation uses real HTTP/PostgreSQL with simulated native bindings. Narrowed/persistent grants, other media, arbitrary hosts/versions/clients, Internet production/Marketplace publication, Codex/Claude backend, Codex model consumer and proposed Mac client are outside these subsets. Native Codex milestones remain Deferred.

Versioned token estimates/public budgets are server settlement, not measured native generation/tokenization/billing. Changed product/native/package/image pins require affected acceptance. No further milestone or publication is started by this completion.
