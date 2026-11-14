# MB-05 native Mod-origin test — 2026-10-14

**Attributed Mod submission reaches the independent classic guard. Busy queue
timing remains inconclusive. MB-05 is not complete.**

The user approved the reviewed `sdc-origin-probe` 0.1.0 and temporary classic
guard in the existing Project analysis conversation, with one idle offer and one
offer intended to occur during a harmless counting response. Claude remained at
2.1.296 in isolated VS Code 1.140.0. No SDC binding was created.

The native `/plugin marketplace add` command was unavailable in the IDE. The
graphical `/plugins` manager successfully added the local marketplace and
installed the exact probe at **local** scope. Native logs confirmed module load
and command registration. Installation alone did not submit a prompt.

## Observed sequence

All times below are UTC; the UI uses Asia/Dhaka (UTC+06:00).

| Time | Observation |
| --- | --- |
| 03:29:57.750 | Mod logs `offer-idle` in selected session digest `763571110b7e7f52` |
| 03:29:57.910 | Classic UserPromptSubmit refuses; native `prompt.submit: dropped` |
| 03:29:57.917 | Mod receives a drop result; native UI shows refusal |
| 03:30:24.870 | The manual counting turn starts, digest `f5fe06f0caee6b13` |
| 03:30:38.513 | That same counting turn completes; UI renders numbers 1–100 |
| 03:30:38.854 | Mod logs `offer-busy`, **341 ms after completion** |
| 03:30:38.987 | Classic guard refuses again; native `prompt.submit: dropped` |
| 03:30:38.991 | Mod receives second drop result; native UI shows refusal |

Only the counting turn produced start/completion observations in this run. Both
fixed diagnostic offers were positively reconciled as dropped; neither was
blindly retried. The `busy` label was operator intent, not native state. The UI
showed activity while the command was being prepared, but native timestamps show
that the actual offer arrived too late. This run therefore cannot establish
whether the guard runs before or after native waiting.

The probe used supported `$.prompt.submit({text})` with default Mod attribution.
No `asUser`, injected origin, test-only `wait` override, new conversation, separate
model process or private extension API was used.

## Cleanup

Disabled the probe through the native plugin manager (switch off), then reloaded
plugins: the native UI reports **0 plugins**. Removed only the temporary classic
hook; `/hooks` reports **No hooks configured**. Original settings values remain,
plus an explicit `false` flag for the newly installed probe so it stays disabled.
The reviewed package and local marketplace remain registered, with no active
control. The earlier observer is disabled, SDC disconnected, and the existing
conversation idle. No credentials, trust or native permissions changed.

[Sanitized native record](native-origin-tests.json) contains timings and hashed
identities. Raw logs remain private. The existing candidate's six stubbed Node
checks and exact strict validation remain developer evidence; this run adds the
bounded native observations above, not full MB-05 qualification.

## Next test must remove manual timing dependence

The separate [queue candidate](../../extensions/claude-queue-evaluation/README.md)
is prepared and uninstalled. It arms once through a local command,
observes the next native `turn.start`, and schedules the fixed refusal prompt
outside that handler. It must check that the same turn is still active before
offering; if the callback runs too late it records a skipped attempt and sends
nothing. Retain Mod attribution and the independent classic hook. Assert the
native offer timestamp precedes the active turn's completion before interpreting
hook timing. Loading alone sends nothing, and ambiguous effects never retry.
Seven new stubbed queue checks and six origin regressions pass on Node 24.19.0;
the pinned Claude 2.1.296 strict validator accepts it. See
[candidate record](queue-probe-candidate.json). New software loading requires
action-time approval before any native run of this candidate.

This is a preparation requirement, not permission to reload the exhausted 0.1.0
probe and silently repeat its two offers. Once actual busy timing is established,
the accepted plan still requires authority loss/lease expiry, local takeover,
Mod/configuration lifecycle, a later slow-hook race, recovery and API acceptance.
