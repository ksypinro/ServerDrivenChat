# MB-05 native busy-queue timing — 2026-10-15

**Passed: one attributed prompt offered while Claude was busy waited for the
existing turn to complete, then the classic guard refused it.** This resolves
the timing uncertainty from the earlier manual attempt. It does not complete
MB-05 or qualify changing authority at execution time.

The user approved the one-shot `sdc-queue-probe` 0.1.0, the already tested classic
guard, and one no-tools counting response in the existing Project analysis
conversation. Claude stayed pinned to 2.1.296 in isolated VS Code 1.140.0.
The probe was installed locally and armed on October 14. Before resuming on
October 15, logs confirmed only the arm event existed: no offer or turn had run
during the pause. The prepared counting prompt was then submitted once.

## Native sequence

Times are UTC on 2026-10-15; the native UI displayed 07:02 in Asia/Dhaka.
The selected session digest was `763571110b7e7f52` throughout.

| Time | Native evidence |
| --- | --- |
| 01:02:18.704 | Classic guard passes the ordinary manual counting prompt |
| 01:02:18.784 | Counting turn starts; digest `8bf70ba975043cf3` |
| 01:02:18.849 | One-shot Mod records its fixed attributed offer |
| 01:02:18.850 | Native log records the Mod's `$.prompt.submit` call |
| 01:02:29.230 | Same counting turn completes |
| 01:02:29.266 | Native prompt processing resumes for the Mod submission |
| 01:02:29.409 | Classic guard completes with refusal, exit 0, duration 138ms |
| 01:02:29.413 | Native `prompt.submit: dropped` |
| 01:02:29.428 | Mod receives `dropped`; no second native turn-start observed |

The offer preceded counting completion by **10,381ms**. Native refusal followed
completion by **183ms**. The UI rendered numbers 1–100 and the explicit blocked
notice. These positive observations establish actual busy waiting and subsequent
classic-hook refusal for this path, rather than inferring them from a label or
the absence of a response. Default Mod attribution was preserved.

The [sanitized machine-readable record](native-queue-test.json) validates this
ordering and records a digest of the private source log slice. No raw transcript,
session identifier or credential is copied into evidence.

## Cleanup verified

The single offered prompt is reconciled as dropped. Disabled the Mod through
the native manager, verified its switch off, then reloaded plugins: **0 plugins**.
Removed only the temporary classic guard; `/hooks` reports **No hooks configured**.
Original settings values remain plus the new probe's explicit disabled flag.
All three evaluation Mods remain installed but disabled, and their local
marketplaces remain registered. SDC remains disconnected. Credentials, native
permissions, history, other editor installations and CA trust were preserved.

## What this unblocks, and what it does not

Phase A now has evidence for independent native error blocking, attributed
Mod-origin coverage, and classic admission after a genuine native busy wait.
The implementation hypothesis is stronger: an independent classic guard could
consult current SDC authority when queued input finally reaches admission.

The current guard **always refuses** its marked diagnostic. Nothing in this run
changed authority while input waited. It does not prove that a previously valid
lease is rejected after expiry, that a successful guard result cannot become stale
during a later native hook, or that removing/reloading a guard cannot strand
executable input. No successful remotely controlled turn or API path is qualified.

The next bounded feasibility implementation needs a disposable authority source,
exact session/generation correlation, and deterministic transition evidence:

1. Observe an attributed offer while authority is initially valid and Claude is
   busy; invalidate before idle; require refusal without a second turn.
2. Repeat for expiry, source unavailability and identity/generation replacement.
   A short-lived permit alone is insufficient if it is not checked at admission.
3. Exercise local takeover and Mod/guard lifecycle with pending input.
4. Revoke after a successful check while a later hook delays execution. A late
   effect disproves a complete execution fence even if the queue test passes.
5. Only after Phase A passes, implement durable pairing/driver mapping and the
   native recovery/API suites required by B–F.

These are remaining gates, not results or new grants. Wire protocol 2.0, local
driver contract 1.0, Cline qualification and the Claude version remain unchanged.
No shared/runtime/DB code changed in this native diagnostic, so root and database
suites were not rerun. The candidate's seven focused checks, six origin regressions
and exact native strict validation retain their separately recorded scope.

## Follow-up native authority transition

The user approved both exact-build scenarios and cleanup. Test A ran: the
attributed offer happened during the counting turn, the synthetic permit was
revoked before that turn completed, and the classic guard blocked the prompt
after idle. Native timestamps and cleanup hashes are recorded in
[`NATIVE-AUTHORITY.md`](NATIVE-AUTHORITY.md).

Test B did not run. After the one-shot Mod reset, its `session.start` callback
did not register the arm command for the pinned native session. Reloading the
isolated editor produced a warning that the same conversation was open in
another place; the offered **Open here anyway** action was left untouched. No
second native prompt was submitted. The stale-success race therefore remains
unqualified and MB-05 stays in Phase A. Do not infer safety from Test A.

Cleanup restored original project Claude settings byte-for-byte, removed the
synthetic authority file, restored the pre-existing diagnostic trace exactly,
and reloaded the window. The installed queue probe is disabled; the Claude log
explicitly says it will not register. See the detailed cleanup and limitations
in [`NATIVE-AUTHORITY.md`](NATIVE-AUTHORITY.md).
