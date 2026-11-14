# MI-03 real multi-window acceptance

**Status:** **Done for the user-selected two-to-three-window, six-case subset**,
2026-11-12. The user explicitly chose this bounded gate after the broader plan's
additional qualification requirements were explained. See
[`verification.json`](verification.json), [current handoff](HANDOFF.md), and tracker
`MI-03-DONE-001`. Broader gaps below remain unqualified.

The approved November 5 upgrade ([`upgrade.json`](upgrade.json)) remains installed:
backup `m24-20261105T153418Z`, server `sdc-server:mi03-candidate` with migration 010,
isolated VS Code 1.140.0/macOS arm64, companion 0.8.0, unchanged Cline 4.1.2204/API 1.3.
The companion is an unsigned candidate; this is not a newly signed/public release.

## Completion results

| Runbook case | Real result |
|---|---|
| 1. Two different workspaces | A/B shared one device and kept distinct scoped tasks. Concurrent first-party API and graphical control-page markers reached their intended native tasks. Per-session keys/aliases, cross-session 403, identical same-key retry IDs and snapshot isolation passed. |
| 2. Third workspace | Three live scoped bindings on the same device; distinct concurrent API echoes and snapshot isolation passed. C's native reply was visually inspected. |
| 3. Same task / move | Warning named A. Cancel preserved A/C and subsequent echoes passed. Human-approved Move transferred the same task to B; old A new-prompt admission returned 403. Native Resume Task was required after opening history; fresh B/C API echoes then passed. |
| 4. Reload | User reloaded C; B completed a new server prompt. C's old lease expired, and reopening/resuming that same task and locally reconnecting created a new host/session while preserving its native task identity. |
| 5. Connections list | Native read-only list displayed A/B/C online, C marked "this window", and offline history below. |
| 6. Revoke / forget | C cleanup stopped B with the cross-window notice, removed four retained inbox files, and left zero live bindings/open SQLite handles. Fresh user pairing created a different device for the same C task; its final echo passed, then C was disconnected. |

The [API report](api-native-2026-11-12.json) contains **13 completed/applied native
text operations**, with identical idempotent retries. All **seven** temporary API keys
were revoked and rejected with 401; a narrow operator read verified zero unrevoked
MI-03 test keys. [Cleanup evidence](credential-cleanup-2026-11-12.json) includes an
audit of all isolated-app processes for still-open/unlinked inbox SQLite handles.

Fresh focused checks: Node 24.22.1, 9 MI-02 unit tests and 12 MI-01/MI-02 real
HTTP/PostgreSQL tests passed, zero failures/skips. The disposable PostgreSQL 17.11
container on port 55433 was stopped/removed. Full build/lint/root/gateway/SDK/Swift
and restart/restore checks were not rerun. Their November 5 results remain historical.

## Retained attempts and practical prerequisites

[Detailed observations](acceptance-2026-11-12.json) retain the invalid saved refresh
token/HTTP 500, retired free-model response, denied initial workspace tools,
pre-resume context-command rejection and immediate post-reload count attempt.
The supported graphical Revoke and Forget flow recovered the expired credentials;
the underlying refresh-error UX was not changed. The user approved changing the Act
model to the currently FREE-listed `cline-free/nemotron-3.5-super-vl`.

After opening a task from history, its native **Resume Task** step is required for
execution. A bridge connection alone does not make a paused task ready. The pre-resume
probe was durably rejected with "Task is busy, unavailable, or conversation revision
changed"; it was not automatically retried. After reload, wait for the old lease to
expire when asserting the live binding count. Reconnect creates a new server session.

Computer use provided live AX/screenshot inspection and supported actions, but native
mouse/keyboard dispatch and picker state were unreliable. The user performed password
entry, all local consent, and the native steps the tool could not dispatch. This is
**human-assisted real native acceptance**, not fully automated PC control. Screenshots
were inspected inline, not saved as an image archive.

[`api-native-initial-stdin-closed.json`](api-native-initial-stdin-closed.json) retains
the initial auth-only harness invocation whose stdin was closed; no key or prompt
was created. The interactive run used a TTY. Between runs, the harness was extended
with append mode and a single-binding round trip for reload/final-state checks;
first-run keys were revoked before restarting.

## Final state and remaining scope

All test bridges are disconnected; no inbox SQLite files/open handles or unrevoked
MI-03 test API keys remain. The old paired device was revoked/forgotten. Fresh device
credentials remain saved by the companion after the final re-pairing test, with its
bridge disconnected. The five persistent local services and candidate deployment
remain running; ordinary VS Code and native/server histories are preserved. No new
product build, installation, dependency, CA trust, signature or publication occurred.

Explicitly unqualified broader checks: held-native-permit/control latency and backlog
against M26; simultaneous interactive sign-ins; server-only revocation without the
maintenance broadcast; old/new companion skew; five-to-ten-window load/resource
limits; queued-old-binding tombstones beyond new-admission refusal; and approvals
enabled in multiple bindings. Same-workspace overlap and server-session continuity
remain MI-04; retention remains MI-06. Generic host, other installations/versions/
platforms and vendor SDK/client profiles are not qualified by these six cases.
No next milestone, signing or publication is authorized by this completion.

## Developer evidence tools

`scripts/mi03-native-acceptance.mjs` is an interactive **public API consumer**, not a
model executor. It obtains human browser PKCE credentials in memory under the shared
15945 lock, captures expected binding counts, issues bounded session keys, sends
no-tools marker prompts, verifies results and revokes its test keys. All model work
still runs in the existing consented Cline windows. It writes the dated evidence here;
preserve this accepted directory or use a copied checkout before a new writing run.
Automated runners must allocate a TTY; `--append` resumes its report after cleanup.

The completed run used Node 24.22.1 with only the verified public CA supplied through
`NODE_EXTRA_CA_CERTS`. Recorded interactive commands included `capture case1 2`,
`roundtrip case1 window-a window-b`, the three-window case, Cancel/move checks,
single-binding reload/fresh-pairing checks, `cleanup` and `quit`.

The read-only consistency audit can be rerun without credentials or native actions:

```sh
node scripts/verify-mi03-evidence.mjs
```

It checks receipt coherence and hashes, not an independent replay of native actions.

## Candidate

| Part | Identity | Notes |
|---|---|---|
| Maintained Cline | `cline-4.1.22-sdc-m24.1.vsix`, SHA-256 `e89b68ff76b61b9c8eb2930e768682d068df13696131500af1f3b686fcbe6826` | Byte-identical to the project-signed M24 package; native API 1.3 unchanged. Already installed in the isolated VS Code |
| Companion | `sdc-cline-bridge-0.8.0-mi03.1.vsix`, SHA-256 `757bde5e415f8d5dee2d5f1327d6e366c3bcd02c41c8a45e00c6f815a16273b6` | MI-02 source; unsigned. Built by `extensions/vscode/scripts/package-mi03.mjs` into `extensions/vscode/dist/mi03-candidate/` |
| Server image | `sdc-server:mi03-candidate`, image `sha256:10c234623bf3…` | MI-01/MI-02 source; currently deployed. The original `sdc-server:m24-local-1` image is preserved for rollback |

[`artifact-manifest.json`](artifact-manifest.json) records the package hashes. A smoke test
ran the candidate image in an isolated throwaway Docker network with a fresh
PostgreSQL 17.11. Migrations 001–010 applied, the new unique index exists, the server
started, and `/v2/health` listed `binding.nativeScope`, `binding.display`,
`binding.takeover` and `binding.laneWatermarks`. The smoke containers and network were
removed.

## Recorded upgrade approvals and rollback

Both following approvals were given and carried out on November 5. These are the
historical upgrade steps, not new pending permission requests.

**A. Upgrade the local server.**
1. Run `deploy/m24/local.sh backup`, which stops the writers and backs up both databases and
   attachments.
2. Change one line in the private `compose.env` from `SDC_SERVER_IMAGE=sdc-server:m24-local-1`
   to `sdc-server:mi03-candidate`.
3. Run `deploy/m24/local.sh up`, then check `/v2/health` over verified HTTPS.

The persistent database gains migration 010: a nullable column and a partial unique
index. Existing rows get no key, so nothing existing is constrained.

Rollback: restore the original line and run `local.sh up`. The older server reads only
migrations 001–009 and keeps working; `server/migrations/rollback/010_*.sql` removes 010
when no keyed binding is live.

**B. Install companion 0.8.0** in the isolated VS Code 1.140.0 (the M24 instance), replacing
0.7.3, with that instance's own CLI and its separate user-data and extension directories.
The ordinary editor is not touched. Rollback: reinstall the signed
`sdc-cline-bridge-0.7.3-m24.4.vsix`.

Neither approval grants native permissions. Sign-in passwords, pairing confirmations and
every local consent stay with you.

## Reproduction procedure

Use disposable Cline tasks, and expect each prompt to use your configured Cline model. The
default profile allows prompts, questions and cancel; approvals stay disabled.

1. **Two windows, different workspaces.** Open two folders in separate windows of the
   isolated instance, with one Cline task in each. Run **Cline Bridge: Connect Current Task
   to Server** in each. Expect at most one browser sign-in; the second window waits and
   reuses it. From the control page, send one short prompt to each session. Each answer
   appears only in its own window, and the session list shows each workspace name.
2. **Third window.** Connect a third folder the same way and repeat the check.
3. **Same task twice.** In window 2, open window 1's task from Cline history and run Connect.
   The dialog names window 1. Cancel: the connection is refused and window 1 still works.
   Connect again and choose **Move connection here**: window 2 now holds the task, and a
   prompt to window 1's old session is refused. Perform native **Resume Task** in the
   moved task before testing fresh remote execution; reject any unrequested tools.
4. **Reload.** Reload one window. Only its binding drops; prompts to the other windows still
   work. An abruptly stopped binding can remain live until its existing lease expires.
5. **Connections list.** Run **Cline Bridge: Show Connections for This Account** and check
   which entries are live and which one is marked as this window.
6. **Revoke and forget (last).** Run it in one window while another is connected. The other
   window stops with the "being removed in another window" message, and both inboxes are
   removed. Reconnecting then needs one fresh sign-in and pairing. Reopen/resume the
   same native task, verify the new paired device and echo, then disconnect the final
   binding. Fresh saved credentials can remain; the old revoked device must not be reused.

The original `scripts/mi03-sessions-check.mjs <case>` is a duplicate-binding inventory
checker, not a complete acceptance runner or expected-count assertion. The accepted
receipts above were written by `mi03-native-acceptance.mjs` with explicit `capture LABEL
COUNT` assertions, real API round trips and cleanup. Both use human browser PKCE and
save identifiers as truncated digests; preserve accepted evidence before a writing rerun.

## Original scope exclusions

Same-workspace duplicate windows and worktrees (MI-04), session continuity (MI-04),
command retention (MI-06), extra platforms, VS Code versions and Cline versions, and any
release signing or publication.
