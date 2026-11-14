# MB-05 native classic-hook results — 2026-10-14

**Four manual native refusal cases passed. MB-05 remains In Progress.**
Claude 2.1.296's independent classic-hook failure policy works in the selected
existing PluginLab conversation for the cases below. This resolves a specific
obstacle that ordinary Mod middleware could not resolve: an error in the guard
does not automatically allow the prompt through when `onFailure: "block"` is set.

The user approved temporary project-local installation and these four diagnostics.
The test used official Claude extension 2.1.296 in isolated VS Code 1.140.0, the
existing Project analysis conversation (session digest `763571110b7e7f52`), and
the reviewed Python script/settings fragment. No SDC binding was established.

| Native case | Positive evidence | Native drop time (UTC) |
| --- | --- | --- |
| Explicit refusal | JSON decision:block; blocked UI; prompt.submit: dropped | 2026-10-13 18:12:12.844 |
| Script crash | Exit 1; native onFailure:block; blocked UI; dropped | 2026-10-13 18:13:06.163 |
| Malformed output | Exit 0 with invalid braced JSON; native parse failure blocks; dropped | 2026-10-14 03:10:55.260 |
| Timeout | 1000ms deadline, measured 1029ms; native timeout blocks; dropped | 2026-10-14 03:11:19.931 |

All occurred on October 14 in Asia/Dhaka. The first two cases preceded the user's
continuation; the remaining two completed afterward. The editor's accessibility
state lagged, so native logs were checked before repeating any submission.

The native UI displayed a blocked-prompt notice in every case and the native log
explicitly recorded `prompt.submit: dropped`. The observation Mod was disabled;
there was no independent turn-start observer for this run. These are positive
native refusal observations, not an argument based only on the absence of a reply.
The prompts originated in the **manual IDE composer**, not `$.prompt.submit`.

## Cleanup verified

Only the temporary evaluation hook was removed. The project-local settings file
was restored byte-for-byte from its private backup, with SHA-256
`cb00f9004909fadc6581f4d108acb4c1699168d71bdb893789828269b590f0be`.
Claude's `/hooks` UI reported **No hooks configured**. The observer remains
disabled, the SDC host disconnected, and the existing conversation idle. History,
credentials, native permissions, other installations and CA trust were preserved.

The machine-readable local record is [native-classic-hook-tests.json](native-classic-hook-tests.json).
It contains sanitized results and candidate hashes, not raw history or credentials.
The source log remains in PluginLab's private logs. Seven Python guard tests pass.
No shared runtime or database code changed; root/DB suites were not rerun.

## Next prepared experiment

The uninstalled [origin probe](../../extensions/claude-origin-evaluation/README.md)
registers one local command. It can offer one fixed attributed prompt at idle and
one while the selected native conversation is busy. Loading it submits nothing;
it has no server, file, network, process, independent model or tool access.
Six stubbed Node 24.19.0 checks pass. The exact Claude 2.1.296 strict validator
passes after adding the initially missing marketplace description. These checks
do not prove native Mod-origin submission, hook coverage or queue timing.

New action-time approval is required before loading this new local Mod through
computer use. Its two prompts are expected to be refused by the restored classic
guard. If the native route bypasses that guard, the prompt requests only a fixed
no-tools marker. Stop and record that failure rather than extending control.

Still required after this experiment: real authority loss during native waiting,
lease expiry, local takeover, configuration/Mod lifecycle, a later slow-hook race,
and the accepted crash/replay/core-text/API qualification. A successful manual
guard check alone cannot authorize Phase B or mark MB-05 complete.
