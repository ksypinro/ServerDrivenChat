# M22 native server workflow acceptance

**Status:** Done for the adopted local VS Code/Cline pin. **Recorded:** 2026-10-08 00:23 +06:00 (Asia/Dhaka). Native execution occurred on 2026-10-07; final validation and cleanup were recorded on 2026-10-08 (Asia/Dhaka).

## Scope and provenance

The user approved companion 0.4.0 with the already adopted Cline 4.1.22 `sdc-m21.3` development package (extension 4.1.2203, API 1.2). The isolated development host opened `/private/tmp/sdc-m19-vscode-probe` with native task `1791311237025_zxtup`. Native Cline used the free MiMo model; the server contained no model runtime. The maintained native package was reused unchanged. [Artifact manifest](artifact-manifest.json) and [independent hash check](artifact-verification.json) identify loaded code and preserve M19–M21 packages and the installed stock extension.

The developer fixture used a disposable identity with real PostgreSQL, authenticated HTTP/SSE, signed decisions and the built React interface at `http://127.0.0.1:57312`. It supplied no prompts automatically. All six prompts and subsequent controls were submitted through the graphical server interface. The only programmed fault was one bounded connection drop after continuity. Commands to build, launch the development host and run the fixture were developer setup. Ordinary conversation operation remained graphical.

## Graphical walkthrough

1. Open the isolated VS Code project and its existing Cline task; configure profile `default` for the exact loopback server and explicitly select prompts, questions, whole-action approval/denial and cancellation.
2. Start **M22 Acceptance Capture (Disposable Task)**, then type **“Connect to my server and follow its instructions”**. The native SDK tool captured trusted task/session/tool-call origin. Graphical first-use sign-in and independent server/local pairing occurred. Two attempts exceeded the bounded 120-second Connect lifetime and returned rejection. Each retry was explicit. The final cached-sign-in retry succeeded at `2026-10-07T14:25:46.345Z`; its initiating local turn completed at `14:25:57.215Z`. This does not claim one-shot first-use setup or persistent Always allow.
3. Queue the first instruction through the server composer. Native Cline returned `M22-76e77a9a-FIRST-OK` in the same task. Queue the follow-up only after completion: it omitted the marker and native output recalled `M22-76e77a9a-CONTINUITY-OK`. The extension listener continued after the model turn ended.
4. At `14:27:37.984Z`, the fixture terminated its current loopback connections once. The listener reported reconnecting at `14:27:37.991Z`, online at `14:27:38.315Z`, reopened command streams, and subsequently delivered the allow prompt.
5. Queue the exact allow action. Cline used its actual native `editor` tool (there is no separate `write_file` tool) and waited at its permission boundary. While pending, both test files were absent. Authenticated lease renewals at `14:28:46.602Z` and `14:29:06.655Z` show the listener stayed active beyond 20 seconds. In the server UI choose `allow_once` and record the exact reviewed decision. The signed assertion was consumed through real HTTP (200); native receipt, `approval.applied`, durable command acknowledgement and exact allowed file contents were observed. Native output included `M22-76e77a9a-ALLOW-DONE`.
6. Queue the second exact file action and record `deny` in the server UI. Its independently signed assertion was consumed through HTTP (200). Native resolution was denied, the decision receipt was applied, the denied file stayed absent, and native output included `M22-76e77a9a-DENY-DONE`. No persistent or narrowed permission was granted.
7. Queue the clarification and answer `blue` through the server interface. The addressed question resolved as answered in the same native turn, advanced conversation revision, and returned `blue M22-76e77a9a-QUESTION-DONE`.
8. Queue the cancellation question. When native Cline waited for input, click **Request stop** for that exact turn. The native SDK acknowledged abort for `1791311237025_zxtup:1791383524900`, observed resume-task state, emitted `turn.cancelled` and resolved the pending question elsewhere. The server command received an applied acknowledgement. Cancellation was not inferred from a button click or method return alone.
9. Type the fixture's local takeover prompt in native Cline. The local echo invalidated the remote binding, disabled subscriptions and detached it on the server. Native Cline visibly completed `M22-76e77a9a-LOCAL-OK`. The remote server does not receive that final local reply because dispatch/delivery is already disabled.
10. Finish the passive capture, copy it byte-for-byte, validate, restore Solar graphically, confirm an empty composer and disconnected bridge, close only the five test tabs, stop the fixture and verify schema/listener/database cleanup.

## ID linkage

All turns share binding `b0351aa4-b999-48b3-b6ae-860e231e8731` and session `e75baf9b-2d65-42db-bbb2-4bae091e1930`. The [machine-readable validation](native-validation.json) additionally links command IDs, output item IDs, start event IDs and terminal result event IDs. Full request action digests and native coordinator IDs are recorded there and in the two traces.

| Step | promptId | turnId | Native task/turn | Terminal result |
|---|---|---|---|---|
| first | `d3976c5d-f958-4fda-aabc-a52a937ba5d1` | `6481c23d-f2f2-45c8-9cb9-f374c95874ca` | `1791311237025_zxtup:1791383194637` | turn.completed |
| continuity | `cea2d7d8-593d-4f3c-b225-05fa9f289669` | `ca205b20-e0f3-4bc0-b9f7-f85146ce5371` | `1791311237025_zxtup:1791383231277` | turn.completed |
| allow | `38b2aa84-7b09-4bd0-8365-588ca4945a93` | `1bb26131-c2f3-4cdc-914b-63e54b54b93f` | `1791311237025_zxtup:1791383295545` | turn.completed |
| deny | `3c43c445-a697-4e43-82ff-59597cdc77c1` | `b6aa738a-dda0-44e8-b39d-59db05ed667a` | `1791311237025_zxtup:1791383381332` | turn.completed |
| question | `42feb030-b1e7-4cf8-a5bd-0ef8b42ea454` | `8f2a7dba-05e4-43bf-b81c-71b20fe79b72` | `1791311237025_zxtup:1791383454120` | turn.completed |
| stop | `d45a0db1-6df4-467d-b5aa-7d9ef24a38d7` | `27cbe5c0-52d7-44df-95ee-b16dfca7e14b` | `1791311237025_zxtup:1791383524900` | turn.cancelled |

| Decision | requestId / revision | decisionId | Control commandId |
|---|---|---|---|
| allow | `bfd45fa4-bbbe-4a33-a440-169a0c511c3e` / 1 | `736464c1-5789-4d98-8377-9b484da40541` | `65a56742-8c24-4fa4-bc0e-3cf13a9e94d6` |
| deny | `8d467232-2873-4f02-a61f-81d85ec286e8` / 1 | `d1091406-c55d-48cf-a647-65fd53d91762` | `71a677f7-5028-4033-b196-a45612403ac4` |

Clarification request `3f198ee4-d78c-4f03-b29c-f484e08aafde` was answered by command `f3ef23de-3e65-4e90-822b-3940a269ec99`. Cancellation command `fbe7fa38-3687-4bfa-9796-e08c26246932` addressed the stop turn above. [Native capture](live-vscode.json) contains 524 valid protocol events; [server trace](server-live.json) contains 519 valid events. Shared event IDs have canonically identical payloads. All ten delivered commands have applied native acknowledgements. Both action digests were independently recomputed and both Ed25519 decision signatures verified. Each request has its own exact revision/turn/digest; allowed file contents are exactly `M22-76e77a9a-ALLOWED`, and the denied file is absent.

## Repairs established by this run

- Native registration now reports validated delegated capabilities. Capability metadata describes availability; server authorization and native authority still govern mutation.
- Native prompt acceptance and clarification answers report conversation revision. Storage advances monotonically under the exact binding fence; replay does not advance twice. The UI uses the current snapshot revision and nested native identity.
- Decision assertion consumption accepts the protocol's bounded 8192-character token rather than the unrelated 256-character generic string cap.
- Approval dispatch reads its durable live attempt without invoking restart recovery. Recovery previously changed a live outer dispatch to reconciliation. Completed receipts remain idempotent without repeating the native effect.
- Remote resolved decisions emit the native `approval.applied` receipt; local resolutions do not fabricate a remote receipt. Denial still produces an applied decision-processing receipt while the action remains denied.
- Stop stays visible for every active/waiting turn. Alphabetically sorted IDs no longer discard an older active turn; recent terminal history follows observed transcript order.
- Passive capture drains takeover invalidation before finishing. M22 packaging verifies and reuses the frozen native pin, produces a separate 0.4.0 companion, and the historical M21 generator refuses the current version before modifying historical artifacts.

The first attempt remains in [attempt-01](attempt-01/server-live.json): first/follow-up/reconnect passed, but signed approval consumption returned HTTP 400 and live dispatch recovery was incorrect. No file action ran; local Reject ended that attempt. It is failed diagnostic evidence, not the accepted proof. After repairs, a fresh schema/binding completed the full journey. Native task history includes prior milestones and the failed attempt; validation restricts accepted commands to the new marker/binding/session.

## Verification and cleanup

See [verification](verification.json) for exact commands: 42 focused checks, 20 repair checks, three browser checks and eight Swift tests passed. Root regression: 95 passed, 20 older database-dependent suites skipped, zero failed. Root build and lint passed. The first final browser rerun exposed a test readiness race (obsolete intermediate heading); the corrected test waits for the current native heading and all three passed. The first Swift attempt lacked sandbox compiler-cache access; its approved retry passed. Logs are retained.

[Cleanup](cleanup.json) establishes fixture exit 0, isolated schema absent, both loopback listeners closed and PostgreSQL stopped. [Native observations](native-observations.json) and [accessibility state](native-cleanup.ax.txt) establish Solar selected, empty composer and bridge disconnected. Native task/history and the allowed disposable marker file remain; the denied file is absent. The test tabs were closed and normal installed Cline remained untouched.

## Remaining scope

Only the exact adopted local VS Code/Cline build is supported. This run does not establish stock Cline, Antigravity, remote extension hosts, live production OIDC, publication/signing (M24), grant narrowing/persistence/revocation, or systematic crash/race hardening (M23). PNG remains M19's independently validated acceptance; this run used text and native file actions. Host checks used Node 25.9.0/npm 11.12.1; a selected Node 24 rerun is not claimed for M22. M16 remains deferred by Cline-first priority. M23 has not started.

![Server after cancellation and takeover](server-complete.jpg)

![Native local reply and disconnected bridge](native-complete.jpg)
