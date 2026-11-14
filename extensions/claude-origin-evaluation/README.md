# MB-05 Mod-origin refusal probe

Evaluation candidate for Claude 2.1.296, now installed but disabled after the
approved run. No network, files, processes,
server credentials, model API, tools, or conversation creation. This does submit
up to two fixed, attributed prompts **only after explicit local commands** in
the selected disposable existing conversation. The session digest limits this
diagnostic; it is not production authentication. Reloading resets the two-attempt
limit, so do not reload to retry an ambiguous submission.

Use with the separately reviewed classic hook in `../claude-hook-evaluation`.
The hook is expected to refuse both prompts. Whether Mod prompts reach that hook,
and whether attribution changes its text input, are exactly what remains unknown.
If the hook does not cover this path, the fixed prompt requests one no-tools leak
marker. Stop on that result; do not promote this probe into a driver.

## Native procedure (requires approval before loading new local code)

1. Back up local settings privately. Temporarily restore only the already tested
   classic hook. Confirm `/hooks` lists the entry with `onFailure: "block"`.
2. Add this local marketplace through Claude's native plugin manager and install
   `sdc-origin-probe` at project-local scope. This can load in other sessions for
   this project; commands and diagnostics are restricted to the selected digest.
   Reload plugins in the existing **Project analysis** conversation.
   In the tested IDE, use `/plugins` → Marketplaces → path → Add; the terminal-style
   `/plugin marketplace add` command reports unavailable in this environment.
3. Run `/sdc-fence-offer idle`. Require the Mod's offer log, native classic-hook
   refusal and `prompt.submit: dropped`, with no associated `turn.start`.
   A resolved Mod promise alone proves neither refusal nor execution.
4. Only if step 3 passes, manually ask the same native conversation to write a
   numbered list from 1 to 100, one number per line, using no tools/files and not
   continuing earlier work. While its native turn is visibly active, invoke
   `/sdc-fence-offer busy`. Record native turn start/completion and hook timing.
   If the turn completes first, record the busy attempt as inconclusive; do not
   manufacture queue evidence from an idle submission or retry automatically.
5. Require an explicit native refusal for each offered diagnostic before cleanup.
   Missing completion/refusal is unknown and may leave pending input: keep the
   classic guard loaded until reconciled. Disable the Mod and reload, then remove
   only the evaluation hook. Confirm original settings and SDC disconnected.

The 100ms timer moves submission outside the command hook, as documented for
background Mod work. It does not fence execution or cancel an already offered
prompt. The `busy` label records operator intent; native timestamps must establish
that the session was actually busy. No binding/lease is implemented or simulated.
Queue revocation, late-hook races, lifecycle and recovery remain subsequent gates.

Developer checks stub all native effects; they do not qualify the live route.
The exact bundled runtime must also accept this package with `plugin validate
--strict --json`. Public documentation is not an exact-build type declaration.

Sources: [commands and background submission](https://code.claude.com/docs/en/plugins/mods/api),
[classic hook failure policy](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails).

Recorded outcome: both offers were refused, but the busy label arrived after the
counting turn completed. See [native results](../../evidence/MB05/NATIVE-ORIGIN.md).
The Mod is disabled and unloaded; the temporary classic hook was removed.
