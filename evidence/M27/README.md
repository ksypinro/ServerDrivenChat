# M27 evidence

**M27 is Done** under DECISION-010. The [current verification](restart-media-run/verification.json) and [walkthrough](restart-media-run/README.md) record real gateway/server/Cline acceptance, including companion 0.6.0 fingerprints, history, controls, media, restart, local resolution, disconnect and reload. The current native caller-tool profile is withheld before dispatch. Full public/native/named-client acceptance remains M30.

The following original checkpoint files are historical; [verification-checkpoint.json](verification-checkpoint.json) preserves their initial incomplete status and hashes.

- `server-tests.log`: 14 focused real PostgreSQL/HTTP checks.
- `root-tests.log`: 154 tests, 153 passed, one restore skip; `restore-tests.log` separately passes restart and dump/restore.
- `gateway-tests.log`: ten checks; three use a real TypeScript server/PostgreSQL with synthetic native/identity events, including Uvicorn TCP SSE replay/revocation.
- `swift-tests.log`: eight passed. Build/lint/install/locked-environment logs are retained.
- `artifact-manifest.json`: newly built uninstalled companion 0.6.0, frozen native archive fingerprints. M19–M23 validators pass.
- `native-field-matrix.json` / `native-gate-review.json`: exact supported/defined/unsupported/unverified distinction, source hashes, candidates and required unblock work.
- `runtime.json`, `source-review.json`, `cleanup.json`: reproducibility, source comparison and disposable cleanup.

Successful final logs are hash-linked in verification. Prior failed probes and corrections are described in the [tracker checkpoint](../../IMPLEMENTATION_TRACKER.md#m27-checkpoint-002--first-party-rest-implemented-native-gate-open). Fixture credentials/prompts are disposable; no real caller credential, private prompt or unrelated app history is exported.
