# Handoff: multiple VS Code instances (MI workstream)

## Current handoff — bounded MI-03 completion, 2026-11-12

**MI-03 is Done for the exact two-to-three-window, six-case runbook subset.** The
user explicitly chose "Accept the exact 2–3-window six-case subset; explicitly track
broader gaps" after the broader plan requirements were explained. This amendment
does not close the full matrix, MI-04/MI-06 or the three-backend goal.

Start with [verification](verification.json), [runbook/report](README.md),
[API receipts](api-native-2026-11-12.json), [native observations and retained
attempts](acceptance-2026-11-12.json), and [credential cleanup](credential-cleanup-2026-11-12.json).
Tracker `MI-03-DONE-001` is the completion entry.

- Two and three different-workspace Cline windows shared one device and routed
  independent text correctly through the first-party API; A/B graphical prompts also
  reached their native windows. Thirteen API operations completed/applied, with
  identical idempotent retries, scoped aliases, cross-session 403 and isolated snapshots.
- Real duplicate-task refusal named A; Cancel preserved A/C; an explicit human Move
  transferred the same task to B; new prompts to old A were refused 403. A moved task
  opened from history must be resumed natively before remote execution. Fresh B/C
  post-resume API echoes passed. Stable server-session continuity is not claimed.
- C reload did not interrupt B. Its old lease remained briefly live, then expired;
  the first immediate count attempt is retained. Reopening/resuming/reconnecting the
  same C task created a new host/session and reused the shared device.
- Native Show Connections displayed A/B/C online and identified C as this window.
- Revoke and Forget in C stopped B with the cross-window notice. Four retained inbox
  files (three held open beforehand) were removed. Scoped lsof checks, including
  unlinked paths across all 20 isolated-app processes, found zero remaining inbox
  SQLite handles. Fresh human pairing changed the device while preserving C's task;
  its final echo passed, then C was disconnected.

**Final state:** zero live test bindings (`sessions-final-disconnected.json`), no inbox
SQLite files/open handles, all seven test API keys revoked/rejected401 and zero
unrevoked MI-03-labelled keys. The API consumer exited; its tokens lived only in memory.
The old paired device was revoked/forgotten; fresh device credentials intentionally
remain saved by the companion after the re-pairing test, with the bridge disconnected.
All five persistent services remain running on the candidate server. No rollback was
requested. Native history, the ordinary editor and signed M24 artifacts are preserved.

The exact pair is still Cline 4.1.2204/API1.3 plus **unsigned companion0.8.0**, isolated
VS Code1.140.0/macOSarm64. Server image ID and all package/installed hashes are in
`verification.json`; no product build/reinstall/dependency/trust/signing/deployment
change occurred in this acceptance session. The user selected the currently FREE-listed
`cline-free/nemotron-3.5-super-vl` Act model after the previous free model retired.

Fresh checks: Node24.22.1, MI-02 units9/9, MI-01/MI-02 HTTP/PostgreSQL12/12,
zero failures/skips; temporary PostgreSQL on55433 stopped/removed. Full root/build/
lint/gateway/SDK/Swift and restart/restore suites were not rerun. The read-only audit
`node scripts/verify-mi03-evidence.mjs` passed. The new writing consumer is developer-only
`scripts/mi03-native-acceptance.mjs`; preserve this evidence before reruns, allocate a
TTY, and use its append mode only after prior-run keys are cleaned up.

Retained limitations: invalid stored refresh credentials still surface HTTP500 in
normal Connect/Show Connections; the supported graphical revoke/forget flow with
fresh sign-in recovered them, without a code repair. A pre-resume probe was durably
rejected and not retried. Native computer input was unreliable, so the user performed
all passwords/consents and several UI steps; this is human-assisted native acceptance,
with live AX/screenshots observed inline rather than an archived screenshot suite.

**Still unqualified:** held-native-permit/control p95 and backlog versus M26;
simultaneous interactive sign-in; server-only device revocation; old/new companion
skew; five-to-ten-window load/resources; queued-old-binding tombstones beyond refusal
of new work; approval routing when enabled; generic-host/other-installation/version/
platform/SDK/client support. Same-workspace/continuity is MI-04; archival is MI-06.
Both milestones remain Not started and require a new instruction. MB-05 and the
Codex/Claude existing-IDE attachment/effect-time fences remain unchanged. No signing,
publication or next milestone was authorized.

## Historical pre-acceptance handoff

The following original November12 checkpoint is retained as history. Its live-state,
next-action and computer-tool statements are superseded by the current handoff above.

**Originally written:** 2026-11-12, before acceptance. **Then-current phase:** MI-03,
In Progress, waiting on user-driven graphical steps.

Read this file first, then [the plan](../../docs/feasibility/multi-instance-concurrency.md),
[the MI-03 runbook](README.md), and the tracker entries `MI-01-DONE-001`,
`MI-02-DONE-001`, `MI-03-START-001` and `MI-03-CHECKPOINT-001` at the end of
`IMPLEMENTATION_TRACKER.md`.

## 1. What we are doing and why

The user asked to remove the "only one VS Code instance can be connected, and only one
chat is alive" limitation. Several VS Code instances, on different workspaces and on the
same workspace, should be able to run connected chats at the same time.

The research is in [the plan](../../docs/feasibility/multi-instance-concurrency.md) §1–§6.
The key facts:

- **Cline 4.1.22 itself allows one live task per window.** It has a singleton webview and
  a single active SDK session. Several live chats therefore means several windows.
- **The server and bridge already modelled many sessions per device.** The real limits
  were in the SDC Cline patch and the companion (one binding per window, which is
  intended) and in shared-resource problems:
  - nothing stopped the same Cline task being bound twice, because Cline 4 keeps tasks
    in a shared `~/.cline/data`;
  - device-row lock contention between bindings of one device;
  - a fixed OIDC callback port (15945);
  - windows sharing one SQLite inbox;
  - pending limits applied per device rather than per session.

## 2. Decisions the user made

| Date | Decision |
|---|---|
| 2026-11-04 | **One live chat per VS Code window.** Tiers A and B are in scope. Several live chats inside one window (tier C, a Cline fork change) is **out of scope**. |
| 2026-11-04 | Plan §9's other choices use the **proposed defaults** unless the user changes them: a new server session per Connect through MI-03 (session continuity decided in MI-04), one inbox per binding, and continued sharing of `~/.cline/data` (no per-instance `CLINE_DIR`). |
| 2026-11-04 → 05 | The user explicitly started MI-01, MI-02 and MI-03, one milestone at a time. |
| 2026-11-05 | The user approved **both**: backing up and upgrading the persistent local server to the candidate image, and installing companion 0.8.0 in the isolated VS Code. Both were carried out (§4). |
| 2026-11-05 | The user asked the agent to "take control of the PC". **Not possible in that session**: no computer-use tools were available. Even with them, VS Code is click-only, password entry is forbidden, and local consent is the user's. |

## 3. The plan and where we are

Milestones are appended without renumbering. MI-05 (in-window concurrency) was dropped by
the 2026-11-04 decision.

| Milestone | Scope | Status |
|---|---|---|
| MI-00 Decisions | Tier scope, continuity, inbox topology, `CLINE_DIR` | Tier decided; the rest use proposed defaults |
| MI-01 Server hardening | One live binding per native conversation, shared device locks, per-session pending limits, lane watermarks, display labels | **Done** 2026-11-04 |
| MI-02 Bridge, companion and host | Scoped inboxes, cross-window locks, sign-in single-flight, takeover consent, labels, connections list, generic-host fixes | **Done** 2026-11-05 |
| **MI-03 Real multi-window acceptance** | Candidate pair; 2–3 real windows; §8 cases | **In Progress**: deployed and installed, graphical cases not yet run |
| MI-04 Same workspace and continuity | Worktree and duplicate-window acceptance; overlap warnings (S6); session continuity (S7); native scope from the Cline patch (N1); optional park/resume (N2) | Not started |
| MI-06 Command retention | Archival of acknowledged commands, `410 CURSOR_EXPIRED` | Not started |

Project rule (AGENTS.md and the tracker): implement **one milestone at a time**, start
the next only on a **new user instruction**, record exact commands and limitations in the
tracker, and never claim fixture results as real native support.

## 4. Done so far

### MI-01, server (tracker `MI-01-DONE-001`)

- Optional `Binding.nativeScopeId` (protocol), plus migration
  `server/migrations/010_native_conversation_exclusivity.sql` and a guarded rollback in
  `server/migrations/rollback/`. A second live binding of the same task gets
  `409 CONVERSATION_BOUND_ELSEWHERE`. The same owner may move it with an explicit
  `takeover`, expired holders become stale, and both are audited.
- The device and credential rows use `FOR SHARE` locks. Before the change, another
  binding waited 10,020 ms behind a held dispatch permit; afterwards it doesn't wait, and
  revocation still waits for the permit.
- One `assertPendingCapacity` check counts only active bindings and adds per-session caps.
- Registration returns and stores `laneWatermarks` and accepts bounded `display` labels.
- `GET /v2/sessions` and the control-UI session list show the labels.
- Tests: `tests/mi01-multi-binding.test.mjs` (8). Docs: `docs/server-http-api.md`
  ("Multiple bindings"), `docs/server-storage.md` and `docs/protocol-v2.md`.

### MI-02, bridge, companion and generic host (tracker `MI-02-DONE-001`)

- `bridge/src/storage`: `BridgeStore({ path, sessionId })` scopes an inbox. Other
  sessions become pruned `foreign_receipts`; `initializeCursors` and
  `countUnresolvedAttempts` are added.
- `bridge/src/locks`: cross-process SQLite file locks, released by the OS when a holder
  dies (verified with `SIGKILL`).
- `protocol/src/display.ts` holds the label rules shared by server and clients.
  `/v2/health` lists `features`.
- `adapters/cline/src/native-scope.ts` derives the Cline scope: a hash of `machineId`
  plus Cline 4.1.22's `CLINE_DATA_DIR`/`CLINE_DIR`/`~/.cline/data` rules. The adapter and
  driver accept it.
- Companion (`extensions/vscode/src/connect.ts`, `connect-ui.ts`, `index.ts`):
  - per-binding inboxes `inboxes/<hash>/binding-<hash>.sqlite`;
  - single-flight sign-in, refresh and pairing via `$TMPDIR/sdc-oidc-callback-15945.lock`;
  - feature negotiation;
  - consent-gated takeover ("Move connection here");
  - labels, with the application-scoped setting `sdcCline.shareDisplayLabels`;
  - a cross-window "Revoke and forget" broadcast;
  - the read-only "Show Connections for This Account" command.
- Generic host (`extensions/vscode-host/src/*`, `recovery.ts`): the same sign-in lock,
  labels, negotiation and scoped inboxes. It also fixes a real bug: shared global-state
  recovery records blocked every other window and could detach other windows' live
  bindings.
- Tests: `tests/mi02-units.test.mjs` (9, no database) and
  `tests/mi02-multi-window.test.mjs` (4, PostgreSQL). Helpers:
  `tests/helpers/lock-holder.mjs`, `tests/helpers/mi02-window.mjs`, and a new `taskId`
  option in `tests/helpers/m21-native.mjs`.
- Docs: `docs/bridge-storage.md` and `docs/cline-connect.md` ("Several windows").

### MI-03 so far (tracker `MI-03-START-001` and `MI-03-CHECKPOINT-001`; [`upgrade.json`](upgrade.json))

- Companion source bumped to **0.8.0**. `extensions/vscode/scripts/package-mi03.mjs`
  builds `extensions/vscode/dist/mi03-candidate/`:
  - the maintained Cline VSIX, byte-identical to the signed M24 package (`e89b68ff…`);
  - companion `sdc-cline-bridge-0.8.0-mi03.1.vsix` (`757bde5e…`, unsigned).
- Hashes are in [`artifact-manifest.json`](artifact-manifest.json).
- Server image `sdc-server:mi03-candidate` (`sha256:10c234623bf3…`) was built with the
  unchanged `deploy/m24/Dockerfile.server`. It was smoke-tested in a throwaway network.
- With approval:
  - backup `m24-20261105T153418Z` was taken and its checksums verify;
  - the private `compose.env` line `SDC_SERVER_IMAGE` now points at the candidate;
  - `local.sh up` brought all services back healthy, with migrations 001–010 applied to
    the persistent database;
  - verified-HTTPS `/v2/health` lists the four features;
  - companion 0.8.0 was installed through the isolated VS Code CLI (installed bundle
    `fc40838a…`), and the Cline bundles still match their pinned fingerprints.
- `scripts/mi03-sessions-check.mjs` is the evidence checker. It uses a human browser PKCE
  sign-in under the shared lock, writes `evidence/MI03/sessions-<label>.json` with
  digests and labels only, and fails if any scoped task has two live bindings.
- Three disposable folders `/private/tmp/sdc-mi03/window-{a,b,c}` were opened as three
  isolated VS Code windows.

## 5. Live environment state (checked 2026-11-12)

| Item | State |
|---|---|
| Local deployment | `https://localhost:15943`, compose project `sdc-local`. The server runs **`sdc-server:mi03-candidate`** (healthy). Gateway `sdc-gateway:m24-local-1` (its container shows a restart about 21 h before this check; not caused by this work), proxy, Keycloak and PostgreSQL are up |
| Private state | `/Users/samin/Documents/ServerDrivenChat-local/m24` (CA `tls/ca.pem`, `compose.env`, backups, launcher). **Never print or copy credential files** (`LOGIN`, env secrets) into evidence |
| Isolated VS Code | `~/Applications/ServerDrivenChat VS Code 1.140.app`, with separate dirs under `~/Library/Application Support/ServerDrivenChat/M24/` (`vscode-user`, `vscode-extensions`). **Running**, with Cline 4.1.2204 and companion **0.8.0**. Open it with the launcher `…/ServerDrivenChat-local/m24/ServerDrivenChat VS Code.app`, which sets `NODE_EXTRA_CA_CERTS`. The ordinary `/Applications` VS Code must not be used or changed |
| Windows | `window-a`, `window-b` and `window-c` were opened. Whether Cline tasks were created or connected in them is **unknown**; no evidence file exists |
| Evidence | `evidence/MI03/` has `README.md`, `artifact-manifest.json`, `upgrade.json` and this file. **No `sessions-*.json` yet.** The user ran `mi03-sessions-check.mjs case1` once, but it never completed (no sign-in) |
| Git | Nothing is committed (the only commit is `a88fc04`). The working tree also holds the user's separate, uncommitted multi-backend (MB) work, so don't commit, reset or reformat files you didn't change without asking |

## 6. What to do next (MI-03)

1. **Confirm the state.** Run `deploy/m24/local.sh status`, check
   `curl --cacert <state>/tls/ca.pem https://localhost:15943/v2/health` for `features`,
   and list the isolated extensions:
   `"<app>/Contents/Resources/app/bin/code" --user-data-dir <vscode-user> --extensions-dir <vscode-extensions> --list-extensions --show-versions`.
2. **Guide the user through the runbook cases** in [README.md](README.md) §Procedure. The
   user does the graphical steps: creating Cline tasks (this uses their model),
   **Cline Bridge: Connect Current Task to Server**, browser sign-in with their password,
   and the consent dialogs.
   - Case 1: two windows. Case 2: a third window.
   - Case 3: the same task in a second window, Cancel and then **Move connection here**.
     Use a disposable task: Cline doesn't stop the same task being open twice.
   - Case 4: reload one window. Case 5: Show Connections.
   - Case 6: Revoke and forget, **run last**. It deletes credentials and needs fresh
     pairing afterwards.
3. **Capture evidence after cases 1, 2, 3 and 6.** Ask the user to run this (it needs
   their browser sign-in), then read `evidence/MI03/sessions-<case>.json`:
   ```sh
   cd /Users/samin/Documents/ServerDrivenChat && NODE_EXTRA_CA_CERTS=/Users/samin/Documents/ServerDrivenChat-local/m24/tls/ca.pem node scripts/mi03-sessions-check.mjs case1
   ```
4. **Drive prompts and check routing.** Prompts can go through the control page
   (`https://localhost:15943`) once the user has signed in, in Chrome or the built-in
   browser. Check that each answer appears only in its own window and session. The
   API-based route needs a user token; only use browser tools after the user signs in.
5. **Optionally measure.** Prompt and control latency with 2–3 windows, compared with the
   M26 baseline (control p95 under 119 ms).
6. **Close MI-03.**
   - Write `evidence/MI03/verification.json` with the cases, results, hashes and
     limitations.
   - Update [README.md](README.md) status, the plan §7 table, a tracker `MI-03-DONE-001`
     entry and an AGENTS.md section.
   - Leave the bridge disconnected afterwards. Ask whether the deployment should stay on
     the candidate or roll back.
   - Signing the candidate (`deploy/m24/sign-release.mjs`) needs separate approval.
7. **If a case fails,** keep MI-03 In Progress, record the failure (retain failed
   attempts, as the project does), then diagnose and fix in source with tests. Rebuild
   the image and package, and get fresh approval before redeploying or reinstalling.

### Rollback, if the user asks

1. Restore line 9 of `<state>/compose.env` to `SDC_SERVER_IMAGE=sdc-server:m24-local-1`
   and run `deploy/m24/local.sh up`. The old server ignores migration 010; to remove it,
   use `server/migrations/rollback/010_native_conversation_exclusivity.sql`, which only
   works when no keyed binding is live.
2. Reinstall the signed companion
   `extensions/vscode/dist/m24-release-candidate/sdc-cline-bridge-0.7.3-m24.4.vsix` with
   the isolated CLI and `--force`.
3. The backup `m24-20261105T153418Z` can restore both databases (operator guide).

## 7. After MI-03 (each needs a new user instruction)

- **MI-04:**
  - same-workspace windows: "Duplicate As Workspace in New Window" and git worktrees;
  - the server warns when two active bindings share a `workspaceId` (S6);
  - session continuity on re-attach as binding revision n+1 (S7, a policy decision);
  - the native patch exposes `nativeScopeId` (N1, a maintained-Cline change that needs
    native requalification);
  - optional park/resume on task switch (N2).
- **MI-06:** command-lane archival and retention.
- **Known gaps to keep in mind:**
  - the generic host's Cline driver package doesn't pass a native scope yet;
  - host recovery records written before MI-02 count as orphaned;
  - the companion's scope derivation mirrors the pinned Cline 4.1.22 rules;
  - source no longer matches the M26 frozen candidate or MB-04's signed host.

## 8. Rules and pitfalls for this environment

- **Node 24 is required.** The default `node` is 25.9.0. Use
  `PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"`
  (Node 24.22.1) with npm 11.12.1.
- **Test database.** Port 55432 (the documented `postgres-m06`) is taken by an unrelated
  container (`iotsw-pg`); don't touch it. Start a throwaway database instead:
  `docker run -d --rm --name sdc-mi01-pg -p 127.0.0.1:55433:5432 -e POSTGRES_USER=sdc_m06_test -e POSTGRES_PASSWORD=m06_local_test_only -e POSTGRES_DB=sdc_m06_test postgres:17.11-bookworm`,
  then set every `M06…M30_TEST_DATABASE_URL`, `MI01_TEST_DATABASE_URL` and
  `MI02_TEST_DATABASE_URL` to
  `postgres://sdc_m06_test:m06_local_test_only@127.0.0.1:55433/sdc_m06_test`. Stop it
  afterwards. The Docker restart and dump/restore checks (`M06_TEST_DOCKER_*`) can't run
  while 55432 is taken.
- **Last full results (2026-11-05):** root `npm test` 274 passed, 1 skipped, 0 failed;
  gateway `api-gateway/.venv/bin/python -m pytest -q` with `M27_TEST_DATABASE_URL` and
  `SDC_TEST_NODE` 54 passed; control-UI browser tests 4/4. Scripts are `npm run test:mi01`
  and `npm run test:mi02`.
- **Known flake.** `tests/http-api.test.mjs:108` can fail under full-suite load, because
  it waits only 50 ms for an SSE slot. It passes alone; it was recorded but not changed.
- **Credentials and consent.** Never enter the user's password, never read or copy
  `LOCAL-LOGIN.txt` or other secret files into evidence, and leave sign-in and every
  local consent to the user.
- **No desktop control.** No computer-use tools were available. The `$TMPDIR` sign-in
  lock is also taken by the evidence checker, so a pending checker blocks VS Code
  sign-in until it finishes or times out (330 s).
- **Other work.** Don't touch MB-05 (the multi-backend workstream) or task.md work.
  Don't add a runtime or headless executor; Cline still executes the LLM.
