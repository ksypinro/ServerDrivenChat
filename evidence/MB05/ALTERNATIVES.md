# MB-05 alternate route investigation — 2026-10-14

**2026-10-15:** [A separate one-shot native run](NATIVE-QUEUE.md) now proves an
offer while busy waits until completion and then reaches classic refusal. The
earlier manual attempt remains inconclusive. Authority transitions and final
execution-boundary/lifecycle races remain open; no production driver is admitted.

## Current finding

**Four native manual refusal cases passed; Phase A remains open. MB-05 is not complete.**
The subsequent [Mod-origin run](NATIVE-ORIGIN.md) passed two attributed refusals.
Its busy attempt was late by 341 ms and provides no queue-timing evidence.
The earlier Mod-only conclusion was too narrow. Claude's classic
`UserPromptSubmit` command/HTTP hook can use `onFailure: "block"`. Official
documentation dates this option to 2.1.295 and explicitly includes prompt
blocking. The **installed 2.1.296 settings schema** contains the option too.
Its native failure handling is distinct from the ordinary Mod middleware's
`.catch` handler. No version upgrade or replacement conversation is required
to investigate this route.

[Official failure policy](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails)
and [prompt hook](https://code.claude.com/docs/en/hooks#userpromptsubmit).

## Verification already performed

- `scripts/check-claude-hook-evaluation.mjs` validates the prepared settings
  fragment against the installed extension's complete JSON Schema 2020-12.
  The fragment passes; an invalid failure-policy value is rejected.
- It checks the extension manifest and bundled executable version, records both
  executable and schema hashes, and hashes the reviewed probe files.
- Seven Python script checks pass for ordinary local input, refusal-only marked
  input (including an `allow` spelling), wrong session, injected crash, invalid
  output, timeout-path refusal, and unexpected event/nontext input.
- Existing six Mod diagnostics remain evidence about the ordinary Mod route.
  They do not test classic native failure policy.
- User-approved temporary classic-hook tests passed in the existing Project
  analysis view: refusal, crash, malformed JSON and timeout all produced native
  blocked notices and `prompt.submit: dropped`. See [native results](NATIVE-CLASSIC-HOOKS.md).
  The original settings bytes were restored, `/hooks` shows no configured hooks,
  the observer is disabled and the SDC host disconnected.

Commands (repository root):

```sh
/usr/bin/python3 -B extensions/claude-hook-evaluation/test_guard.py
npx --yes --package=node@24.19.0 --package=npm@11.12.1 -c 'node scripts/check-claude-hook-evaluation.mjs "/Users/samin/Library/Application Support/ServerDrivenChat/PluginLab/extensions/anthropic.claude-code-2.1.296-darwin-arm64" > evidence/MB05/classic-hook-schema-check.json'
```

The [measurement](classic-hook-schema-check.json) is contract evidence, not
execution evidence. Tests run the Python script directly; only Claude can prove
how its native core handles that script failing. No database or shared runtime
changed, so root and PostgreSQL suites were not rerun for these isolated probes.

## Architecture to investigate

Keep the generic host and in-session Mod design, and add a separate native
classic hook for admission. The Mod remains responsible for supported attributed
submission and observation. A future classic hook would consult a session-bound
SDC authority service through an authenticated, loopback-only interface. Claude
would refuse if that check failed to execute or returned a refusal.

This is an experimental design, not an implemented driver. The current probe
uses **no HTTP, credentials, pairing, file reads or remote submission**. It only
demonstrates refusal and deliberately broken checks for marked test inputs.
The selected session's digest restricts diagnostic injection; it is not a
credential and must never serve as production authentication.

## The remaining experiments, in order

1. **Independent native failure handling — four cases passed.** Explicit refusal,
   crash, invalid JSON and timeout each produced a native blocked notice and
   dropped-prompt log. No independent turn-start observer was loaded in this run.
   Missing executable/script remains an additional case, not an inferred pass.
   The temporary entry has been removed and cleanup verified.
2. **Mod-origin coverage and timing.** With a separately reviewed submission
   candidate and local consent, offer an attributed prompt while a turn is
   active. Record whether the classic hook executes when input is offered or
   only after the session becomes idle. Do not infer this from manual Enter.
3. **Authority loss while queued.** Revoke before idle and require refusal before
   turn start. Repeat for expiry, host failure, selection replacement, and local
   takeover. Record session/turn identities and command attribution.
4. **Lifecycle independence.** Unload the Mod with pending input while retaining
   the classic hook. Then examine settings removal/reload separately: absence
   of a configured hook is different from failure of a configured hook.
5. **Late execution race.** Insert another deliberately slow native hook after
   the authority check. Revoke during that delay. If execution can still start,
   `onFailure` alone does not satisfy the accepted execution-boundary gate.
6. **Recovery and qualification.** Only after the above pass, implement the
   durable host/driver mapping and remaining B–F work. Preserve Unknown outcomes
   after ambiguous dispatch; do not replay to manufacture proof of completion.

The user approved and completed step 1's four bounded tests. The separate
`extensions/claude-origin-evaluation` candidate passes six stubbed Node checks
plus the exact native strict validator. The user subsequently approved loading
it: both offers were natively refused, but the busy offer arrived after completion.
It is now disabled/unloaded and the classic hook removed. This granted no server
binding or lease. A deterministic busy-offer candidate is needed next.

## Other alternatives considered

| Route | Disposition |
| --- | --- |
| Classic prompt hook plus native failure policy | Newly viable Phase A candidate; priority for real IDE tests |
| Custom command that pulls work only when invoked | Can avoid sending text before handler execution, but command output and a subsequent model turn are separate effects; model continuation still needs admission evidence |
| Managed Mod priority or namespace restriction | Changes which Mods can run or call methods; no newly identified queue revocation guarantee. Do not change organization policy for this experiment |
| Channels/MCP push | Official route for delivering to a running session, but exact IDE enablement and queued revocation are unproven. Adding another inbound queue does not independently satisfy the gate |
| Model fork/complete | Does not continue the selected native conversation; excluded by the user's design |
| UI automation/private bridge or a new runtime | Outside the accepted backend architecture |

Research references: [managed Mods](https://code.claude.com/docs/en/plugins/mods/admin),
[channels](https://code.claude.com/docs/en/channels), and
[Mods API](https://code.claude.com/docs/en/plugins/mods/api).

If the classic route fails one of these experiments, record the specific failed
race rather than restoring the broad claim that no supported failure policy
exists. If it passes, retain the old Mod failure tests as regression evidence
explaining why the independent hook is required.
