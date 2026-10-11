# M24 implementation plan and deployment boundary

**Prepared and started:** 2026-10-10, Asia/Dhaka. **Status:** Done for the user-selected persistent local Docker target; current results are in [M24 evidence](../../evidence/M24/README.md). **Dependencies:** M23 and M30 are Done for their recorded pins/subsets. **Authority:** [M24 tracker gate](../../IMPLEMENTATION_TRACKER.md#m24--cline-packaging-and-servergateway-deployment), [DECISION-008](../decisions/008-cline-first-release.md), [M30 evidence](../../evidence/M30/README.md).

## What M24 must close

M24 packages and deploys the already accepted product path. It adds no new Cline capability. Its acceptance target is local macOS VS Code with the maintained Cline package and companion pair, plus the existing Node/PostgreSQL server, FastAPI gateway, and the chosen HTTPS/OIDC edge. It must preserve the stock Cline package and all historical M21–M30 evidence.

The tracker gate has four distinct outcomes: (1) reviewed, versioned artifacts with source provenance, integrity data, and an explicit signing/distribution state; (2) a clean supported user graphically installs and consents to the exact pair; (3) real OIDC and TLS proxy/SSE behavior works through gateway → server → Cline; and (4) upgrade, rollback, backup/restore, and uninstall/credential cleanup are demonstrated. A configuration template or unsigned package proves only that it can be prepared; it does not prove those live outcomes.

## Source findings and constraints

- M30 accepted two exact native fingerprints: Cline 4.1.2204 / API 1.3 with companion 0.7.0 for caller-tool ownership and recovery, and the same maintained Cline task path for the declared M27–M30 public text/API subsets. The accepted source bundle hashes and disposable VSIX hashes are in `evidence/M30/artifact-manifest.json`.
- The M30 packages are disposable unsigned candidates. M24 may repackage their unchanged native bundles, but any metadata/package output has a new VSIX hash and needs clean-install verification. The frozen stock upstream install and M21 artifacts must remain intact.
- The FastAPI gateway is deployable as a locked Python application, but its documented entry point binds loopback and its upstream URL validation rejects a private container service name. A production topology needs configurable listener binding and an explicit operator-managed exact-origin allowlist for plain HTTP over an isolated private container network. User-supplied URLs remain rejected.
- The TypeScript server exposes transport/service constructors but has no production `main` that composes PostgreSQL, OIDC, approval signing, attachment storage, migrations, health startup, and graceful shutdown. Production cannot be started by the current developer fixtures because they use synthetic identity providers.
- At the start, no deployment/signing target was selected. The user subsequently selected persistent local Docker, genuine Keycloak, private CA TLS, project MIT licensing and local-operator Ed25519 release integrity. Private state remains outside the checkout. Internet infrastructure and Marketplace ownership are outside the selected target.

## Implementation sequence

1. Add a production server entry point that requires database, Keycloak-compatible OIDC, redirect URI, and approval-signing-key configuration; migrates before listening; uses durable attachment storage; and shuts down cleanly. Keep public caller tools disabled by default because activation requires a reviewed per-binding evidence allowlist.
2. Add pinned container build definitions for the TypeScript server and Python gateway. Add a deployment Compose file with PostgreSQL on a data-only network, application services on a private edge, and an Nginx TLS edge. Bind SSE without buffering and set explicit request/stream limits and timeouts. Keep secrets in operator-provided files outside the checkout.
3. Add operational instructions for identity-client redirect/audience setup, TLS, environment/secrets, migrations, backup/restore, versioned upgrades, rollback compatibility, and uninstall cleanup. Deployment remains externally triggered.
4. Repackage the exact M30 accepted native bundle hashes as an M24 release candidate, generate a provenance/integrity manifest, and preserve all M30/M21 outputs. Do not imply a digital signature without the release signing identity.
5. Close graphical installation, live identity, proxy/SSE, upgrade/rollback, restore, and uninstall evidence only against the operator-selected production-like test environment and a clean user. Record supported host/OS and exact version fingerprints.

## Completion boundary

Repository work can supply the launcher, container/proxy templates, release candidate, and runbooks. For the initial planning gate, M24 stays **In Progress** until a named operator provides or selects the real OIDC/TLS/deployment target and signing/distribution ownership, then the exact packages pass fresh-user installation, native/API proxy acceptance, and lifecycle checks. Public publication or deploying to an external destination requires a separate explicit instruction.

## Selected local operator target — 2026-10-11

The exact target is macOS arm64, signed isolated VS Code 1.140.0, maintained Cline 4.1.2204/API 1.3 and companion 0.7.3. Real local identity/TLS, native controls and official SDK text profiles passed; graphical rollback, credential revoke/forget and uninstall/reinstall passed. Fresh reinstalled-pair consent has been approved and applied; final affected SDK acceptance passed on all three text profiles. The [verification record](../../evidence/M24/verification.json) supersedes historical missing-infrastructure checkpoints. M25/M26 remain Not started.
