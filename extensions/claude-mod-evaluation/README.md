# SDC Claude Code read-only evaluation probe

This is a temporary feasibility probe for the installed Claude Code VS Code
extension **2.1.296**. It checks whether a Mod loaded by the existing IDE session
can observe session identity and lifecycle events. It is not the MB-05 driver and
cannot connect to the SDC server.

The probe listens to `session.start`, `session.end`, `prompt.submit`, `turn.start`,
and `turn.complete`. It passes every event through unchanged. Its transcript lines
contain only event names, field names, a truncated SHA-256 digest of the native
session/turn identifiers, and a bounded event reason. It does not record prompt
text or model output. It makes no file, process, network, model, or tool calls.

## Prepare it in Claude Code

1. Open the existing Claude Code VS Code panel in isolated PluginLab.
2. Use a disposable conversation with no important history or workspace task.
3. In the Claude panel, run:
   `/plugin marketplace add /Users/samin/Documents/ServerDrivenChat/extensions/claude-mod-evaluation`.
   This local marketplace contains only this probe.
4. Open `/plugins`, select `sdc-session-observer`, inspect its details,
   and install it at **local** scope for this project. Claude Mods execute with
   the user's permissions; review the small hook file before accepting.
5. Reload the Mod in that same session if the panel requests it.
6. If this load generates `.claude-plugin/types`, inspect the declarations and
   record their declared Claude Code version. Generation during a marketplace
   installation is not established; absence must be reported, not replaced by
   declarations from a different version.
7. In the disposable conversation, send a harmless manual message such as
   `probe event one`, then another such as `probe event two`. Confirm that logs
   show the same redacted session identifier and distinct turn identifiers.
8. Use the UI to clear or resume the disposable session. Confirm that the probe
   observes a session boundary or a changed redacted identity.
9. Remove the evaluation plugin and this local marketplace when the probe is
   complete.

The local-scope install may create `.claude/settings.local.json`; uninstall the
probe from the panel when finished and confirm the temporary local setting is
removed. The probe itself does **not** test server control, queued prompt
invalidation, leases, crash recovery, or native execution fencing. Do not treat
passing observations as Claude backend qualification.

Local scope applies to this project, potentially including other Claude sessions
in the same project. Separate VS Code extension directories do not isolate Claude
account settings or history. Select the disposable conversation before evaluation.

## Exact-build developer checks

After the repository build, run this with Node 24:

```sh
node scripts/check-claude-mod-evaluation.mjs "/Users/samin/Library/Application Support/ServerDrivenChat/PluginLab/extensions/anthropic.claude-code-2.1.296-darwin-arm64"
```

The script uses the extension's bundled executable, not `claude` from PATH. It
validates the packages and runs stubbed tests without starting a model session.
The separate failure fixture is developer-only and must never be installed.
