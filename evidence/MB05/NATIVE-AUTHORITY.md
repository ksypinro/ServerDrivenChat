# MB-05 native authority transition probe — 2026-10-15

## Result

The approved first race passed: an attributed Mod prompt offered during a busy
native turn waited until the counting turn finished, then the Claude 2.1.296
classic `UserPromptSubmit` guard read the revoked synthetic permit and blocked
the queued prompt. Claude did not start a second turn for that offer.

The second race **was not run**. After resetting the one-shot Mod, the current
view no longer matched the Mod's pinned session identity, so its arm command did
not register. Claude's UI then warned that this conversation was already open
somewhere else and that using it in two places could mix messages. I did not
override that warning, create another conversation, or submit the race prompt.
Consequently, the critical check-to-use race remains unqualified and the MB-05
safety gate is still open.

## Scope and setup

The user approved both fixed no-tools tests in the existing disposable
**Project analysis** conversation, using Claude Code 2.1.296 in isolated VS Code
1.140.0. Test A used the already-installed one-shot `sdc-queue-probe` and the
reviewed project-local `extensions/claude-authority-evaluation/` hooks. The
permit was synthetic data in the current user's temporary directory; it was
not an SDC credential, lease, API key, or server binding. The SDC host stayed
disconnected. No tool, file, approval, or caller-control permission was granted.

The initial local settings contained only the three evaluation plugin flags,
all disabled, with SHA-256
`576ed52b059f2ccc198d20e3978ff5722f69f090c0f1632657674b312dff7d85`.
The pre-existing private trace was backed up byte-for-byte before the run.

## Test A event order

Times below are UTC on 2026-10-15. The native UI displays Asia/Dhaka (UTC+06).
Only hashed native identities and fixed event labels are included.

| Time (UTC) | Event |
| --- | --- |
| 02:02:23.248 | The approved counting turn starts. |
| 02:02:23.270 | The one-shot Mod records its attributed prompt offer. |
| 02:02:23.466 | The watcher sees the offer and revokes synthetic authority. |
| 02:02:38.814 | The same counting turn completes. |
| 02:02:38.985 | The guard finishes; its structured decision is `block`, reason `revoked`. |
| 02:02:38.989 | Claude records the attributed prompt as dropped by `UserPromptSubmit`. |
| 02:02:39.006 | The Mod receives `dropped`. No second native turn-start was recorded. |
| 02:02:46.999 | The deliberately slow parallel hook finishes. |

The offer preceded revocation by 196 ms and preceded completion by 15.544 s.
The guard ran only after the original turn had completed and saw the revoked
state. The UI rendered the harmless numbers 1–100 and an explicit blocked-prompt
notice; it did not render `MB05-QUEUE-LEAK`.

This is evidence for one ordering: **authority revoked before the queued prompt
reached the hook admission point**. It is not evidence for atomic fencing after
a successful authorization decision.

## Test B stopped before submission

Test B needed to revoke synthetic authority after the guard returned `allow`
while the parallel eight-second hook was still running. After Test A was fully
reconciled, `/reload-plugins` reloaded one local plugin. The hook list and
session UI then had to be reinitialized. The extension log showed the queue
probe module loading, but its `session.start` callback did not register
`/sdc-fence-arm` for the pinned session digest. After a bounded Developer:
Reload Window, the visible conversation displayed the warning:

> This conversation is still open somewhere else. Using it in two places at
> once can mix up its messages.

The UI offered **Open here anyway**. I left it untouched. This is a native
identity/ownership conflict, so the test is recorded **inconclusive/not run**;
there was no second synthetic grant for Test B and no second native test prompt.
Do not treat the retained conversation title as proof that the native session
identity still matches.

## Cleanup and verification

- Restored `.claude/settings.local.json` byte-for-byte to its original SHA-256
  shown above: no temporary `hooks` property and all three evaluation plugins
  disabled.
- Reloaded the isolated VS Code window. The exact Claude extension log then
  reported `sdc-queue-probe` as `enabled=false; will NOT register` at 08:05:32
  and again at 08:05:41 local time. The native conversation lock warning was
  left in place rather than overridden.
- Removed the synthetic `authority.json` for the expected session/generation;
  verified no such state or `.tmp` remained under the user's temporary folders.
- Restored the pre-existing `trace.jsonl` byte-for-byte; its SHA-256 again
  matches `f57a902950acc56f01012a457935c067cc365158eac8117847be787c7c19c1e4`.
- Removed only the two private temporary backups created for this run.
- The evaluation Mod package and local marketplace remain installed but
  disabled, as they were before. Cline history, other VS Code profiles,
  credentials, server state, native permissions, CA trust and other editor
  installations were not changed. The conversation history now includes the
  one approved counting diagnostic and the bounded arm/reload commands.

## Gate disposition

Test A passes only the revoked-while-queued scenario for this exact build and
conversation. Test B is the decisive stale-success race and remains outstanding.
This checkpoint does **not** establish an execution-time safety fence and does
not authorize Phase B, a Claude driver, remote binding, or a production claim.
MB-05 remains In Progress at Phase A. Resume Test B only after the existing
conversation is safely available in one native view and the probe confirms the
same pinned session identity; do not select **Open here anyway** merely to force
the test.
