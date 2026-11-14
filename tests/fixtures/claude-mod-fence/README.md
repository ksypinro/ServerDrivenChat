# Developer-only Claude failure fixture

Never install this fixture in a conversation. It deliberately throws in a prompt
guard and its refusal handler. `claude plugin test` replaces the native effect
with a counter; it makes no model call. Four tests distinguish ordinary refusal,
successful recovery after a guard failure, and fail-open behavior when both fail.
A passing third test confirms the blocker, not a safe control implementation.
The fourth checks a rejected recursive prompt submission: when its fallback also
fails, the outer prompt reaches core, while the nested prompt does not.

Run the repository's `scripts/check-claude-mod-evaluation.mjs` with the installed
2.1.296 extension directory. It selects the bundled executable, refuses other
versions, validates both packages, runs their tests, and reports fingerprints.
Build the repository first so its existing artifact measurement helper is present.
