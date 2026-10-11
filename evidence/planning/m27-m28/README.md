# M27/M28 research and planning evidence

Recorded 2026-10-08 for the user's request to deeply research remaining M27 and plan it together with M28. The user has no preferred coding client and requested a recommendation from source evidence.

- [Research report](../../../docs/feasibility/m27-m28-native-openai.md): pinned native seams/blockers, current OpenAI contracts and released client recommendation.
- [Execution plan](../../../docs/feasibility/m27-m28-execution-plan.md): ordered work packages, neutral/native/server/gateway design, acceptance matrix, retry/retention decisions and estimates.
- [Source manifest](source-manifest.json): exact upstream commit/tree, source URLs/byte hashes, old-cache comparisons, released client commits and candidate SDK sources. Temporary upstream source is not a repository runtime dependency.
- [Official documentation manifest](official-docs.json): primary OpenAI pages reviewed using the docs connector and official web references. Documentation retrieval is not an API request or acceptance result.
- [Findings](findings.json): verified-source findings distinguished from proposed design and unperformed gates.
- [Runtime baseline](runtime-baseline.json): 151 existing source/config/test/lock/contract fingerprints taken before planning edits.
- [Historical artifact baseline](historical-artifact-baseline.json): historical M19–M23/M27 evidence and existing VSIX fingerprints preserved through this amendment.
- [Validation](validation.json): document/link/status/dependency/source-fingerprint checks; no runtime/native/client/integration tests.

Reproduce the planning checks from the repository root with `api-gateway/.venv/bin/python evidence/planning/m27-m28/validate-planning.py`. The validator writes only this planning evidence's validation JSON. Fresh-source byte checks were additionally performed during manifest creation against the temporary cache; immutable source URLs and hashes remain in the manifest after that cache is removed.

M27 remains **In Progress**; M28 remains **Not started**. M23 remains Done for its recorded pin. No runtime changes, dependency installation, native/client install/adoption, model calls, app permission/settings changes or deployment were performed. The repository has no Git metadata; no commit is claimed.

The corrected upstream Git tree identity and matching cached files resolve only source provenance. Required context/instruction/caller-tool/cap/usage/counting/stream/finish implementation and native acceptance remain open. Roo Code is a primary Chat candidate with an unresolved retry-key integration; Continue is secondary Chat; official SDKs are the proposed Responses baseline. Full named-client/native/public-route qualification remains M30.

Roo's released common helper additionally requires strict function schemas for ordinary tools. Stock Roo qualification requires native strict enforcement; a maintained non-strict caller patch would be a different declared profile. No required strict flag may be silently ignored.
