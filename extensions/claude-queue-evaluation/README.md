# One-shot native busy-queue diagnostic

Claude 2.1.296 evaluation only; not an SDC driver. Installed locally for the
approved run, then disabled and unloaded after cleanup.
The previous [manual timing test](../../evidence/MB05/NATIVE-ORIGIN.md) missed the
active turn by 341ms. This candidate removes that human/UI timing dependency.

Loading registers `/sdc-fence-arm` only in the selected existing Project analysis
conversation. It sends nothing. Running that exact local command once arms the
next native turn. The Mod observes `turn.start`, schedules a 1ms callback outside
the hook, and offers one fixed attributed refusal prompt if that same native turn
is still observed active. It never retries, re-arms, submits as the user, or calls
network/file/process/tool/independent-model APIs. It logs hashed identities only.

The active-turn check is a diagnostic scheduling aid, not a production execution
fence: the turn can end during an awaited call. Native timestamps must prove
`offer < turn.complete` and identify when the classic hook runs. If the callback
is late or logs `skipped-no-active-turn`, the run is inconclusive. A rejected or
unclassified result is unknown until reconciled with native evidence.

## Bounded procedure requiring approval before loading new local code

1. Back up current local settings privately, retaining both earlier probes disabled.
   Restore only `../claude-hook-evaluation/settings.fragment.json`; confirm it in
   `/hooks`. No authority service or binding is created.
2. In `/plugins` → Marketplaces, add this directory. Install `sdc-queue-probe`
   locally for this project. Do not use `/plugin` in the IDE; it is unavailable.
3. In the same existing Project analysis conversation, run `/sdc-fence-arm` once.
   Confirm the `armed` diagnostic. Then manually request numbers 1–100, one per
   line, with no tools/files or continuation of earlier work. No second command
   is required while Claude is busy.
4. Require native evidence that the fixed Mod offer preceded completion, then
   correlate the classic hook/refusal and Mod result. The expected diagnostic is
   refused. If it reaches Claude, its fixed text requests only MB05-QUEUE-LEAK
   and prohibits tools/files. Stop on leakage; never reinterpret it as success.
5. Once the single offer is reconciled, disable and unload this Mod and remove
   only the temporary hook. Keep the hook until uncertain pending input is resolved.
   Leave all probes disabled, SDC disconnected and history preserved.

This probes queue timing only. It does not prove lease expiry, authority loss,
takeover, lifecycle-with-pending-input, a later slow-hook race or recovery. Do not
reload to reset the one-shot budget and silently repeat an inconclusive result.
Developer tests use mocked native APIs. Exact strict validation checks the
installed build's package acceptance; neither substitutes for native testing.

Source: [supported timers and attributed prompt submission](https://code.claude.com/docs/en/plugins/mods/api).

## Recorded native result — 2026-10-15

One offer preceded the active turn's completion by 10.381 seconds; the classic
guard refused it after completion and no additional turn started. The single
offer is reconciled, the Mod disabled/unloaded and the temporary hook removed.
See [native sequence and remaining authority gates](../../evidence/MB05/NATIVE-QUEUE.md).
