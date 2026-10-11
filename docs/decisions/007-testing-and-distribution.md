# DECISION-007 — Testing, linting, and distribution

**Status:** Accepted for planned implementation. **Scope:** M03 and later owning milestones.

Use strict TypeScript compiler checks as the Node lint/type gate; Node's built-in test runner for dependency-free package and architecture checks; XCTest through SwiftPM for companion modules. Add Vitest only if later server/UI tests need its isolation/fixture ergonomics, and Playwright for M14 browser journeys. Each package owner pins exact direct dependencies and commits the npm lockfile. Build/test code is developer tooling and does not create a product CLI.

The VS Code integration is packaged as a VSIX after its upstream API gate passes. The companion is a graphical SwiftUI macOS application distributed as a Developer ID-signed, notarized DMG at M24. Server deployment artifacts and PostgreSQL migrations are also M24 work. M03 performs no signing, notarization, marketplace publication, deployment, or release.

The M03 acceptance check is limited to clean dependency installation, empty-workspace build/lint, a cross-module smoke, and the Swift package check. It does not establish protocol, persistence, authentication, app integration, or release acceptance.

## First-release scope amendment — 2026-10-08

[DECISION-008](008-cline-first-release.md) supersedes the dual-app distribution requirement for the first final version. M24 distributes the adopted maintained-Cline native/companion VSIX pair and required shared server/control UI with real HTTPS/identity configuration. The standalone SwiftUI/Codex companion DMG is deferred; its signing/notarization is not a Cline release prerequisite. Existing Swift modules remain and relevant regression checks still apply. Cline release integrity/signing/distribution prerequisites, compatibility, graphical clean installation, upgrade/rollback/uninstall and real deployment checks remain required. M26 runs shared/Cline conformance and measured soak/latency gates; Codex native conformance is excluded and must not be reported as passed. Historical unsigned packages and synthetic identity evidence do not establish a production release.

## Public API release amendment — 2026-10-08

[DECISION-009](009-fastapi-public-api.md) appends M27–M30 before M24. Packaging/deployment includes the FastAPI gateway and locked Python runtime, server operation/credential migrations and both provider profiles. M25 includes API/desktop/SDK/coding-client guides; M26 freezes all API/native/client artifacts and extends traceability to FR-01–FR-28 with actual public proxy/identity and load/soak evidence. Native gateway/SDK/client acceptance is required before packaging; fixture-only formats are insufficient. Existing integrity/GUI/native/rollback gates remain. No implementation/distribution begins in this research amendment.
