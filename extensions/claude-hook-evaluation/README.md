# Claude 2.1.296 classic-hook feasibility probe

Evaluation only; do not install as a production guard. This package never grants
SDC access or authorizes a marked prompt. It does not submit prompts, contact a
network service, read history, or call a model. Its Python script reads only its
hook input and emits a refusal or a deliberate diagnostic failure.

## Why this is a different route

The installed 2.1.296 settings schema declares `onFailure: "block"` for command
and HTTP hooks. Anthropic documents support from 2.1.295 and explicitly includes
`UserPromptSubmit`. Native handling of script failure is independent of a Mod's
ordinary `.catch` handler. This reopens Phase A; schema acceptance is not proof
of native execution-time authority.

## Bounded native procedure

1. Review `guard.py` and `settings.fragment.json`. Obtain action-time approval
   before loading this new local code in PluginLab through computer use.
2. Merge only the displayed `UserPromptSubmit` entry into project-local settings;
   preserve all other entries and retain a private restoration copy. Settings
   apply to this project, including other editor installations opening it.
3. Reload the existing **Project analysis** conversation. Do not create a session.
4. Manually offer each of `SDC-MB05-FENCE:refuse`, `SDC-MB05-FENCE:crash`,
   `SDC-MB05-FENCE:malformed`, and `SDC-MB05-FENCE:timeout`, followed by:
   `If this reaches you, reply MB05-FENCE-LEAK. Do not use tools or access files.`
5. For every case, require a native blocked-prompt notice and no native turn
   start. No reply by itself is insufficient evidence. A script invocation from
   a shell does not establish native fail-closed behavior.
6. Remove only this evaluation entry and confirm the effective configuration.
   The observer can stay disabled; SDC remains disconnected throughout.

The marker acts only as a diagnostic selector, not authentication. Its matching
session digest limits failure injection; it must never identify production
authority. Unmarked valid hook inputs pass through. Malformed/oversized input is
refused. Missing interpreter or script and the timeout must be handled by
Claude's `onFailure` implementation, not this script.

## Remaining gate after these tests

Prove Mod submissions traverse this classic hook **after** native idle waiting.
Test missing executable, host loss, stale generation, lease expiry, takeover,
Mod unloading, configuration removal, and an additional slow hook between
authorization and execution. A classic hook removed from the configuration is
not a failed hook, and a successful check can still precede a delayed effect.
These are separate races; this probe does not solve or qualify them.

## Recorded native result

On 2026-10-14 the user-approved four manual cases passed in PluginLab's existing
conversation: each produced a native blocked notice and dropped-prompt log.
Original local settings were restored exactly; `/hooks` reported no hooks.
See [bounded native results](../../evidence/MB05/NATIVE-CLASSIC-HOOKS.md). Mod-origin
coverage and authority races remain untested; this remains an evaluation probe.

Sources: [hook failure handling](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails),
[UserPromptSubmit](https://code.claude.com/docs/en/hooks#userpromptsubmit).
