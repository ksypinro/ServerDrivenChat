# M24 server and gateway deployment

This is a deployment template for the M24 topology. It packages the existing TypeScript server, FastAPI gateway, PostgreSQL, Cline control UI assets, and an HTTPS Nginx edge. The Node service owns database state and migrations. The gateway reaches it by a fixed service URL over an isolated Docker network; only Nginx publishes host ports. The SDC public API and provider paths route through FastAPI. Server/control and Cline bridge paths route to Node. SSE buffering is disabled on both routes, with a one-hour read timeout and Nginx's response buffering hint.

The selected operator target is persistent local Docker at `https://localhost:15943`, with real Keycloak 26.4.7 and private CA TLS. Project release integrity is signed with the local operator’s Ed25519 key. Current graphical/native and lifecycle results are in [M24 evidence](../../evidence/M24/README.md). Internet deployment and public publication need their own target-specific acceptance and instruction.

The user-selected local Docker deployment is documented in [LOCAL.md](LOCAL.md), using `local.compose.yaml` over this base configuration.

## Accepted package target

The package builder preserves the exact native bundle hashes accepted by M30: maintained Cline 4.1.2204 / app API 1.3. Companion 0.7.3 adds the accepted OIDC/credential lifecycle repairs. The target is VS Code 1.140.0 on macOS arm64. It creates `cline-4.1.22-sdc-m24.1.vsix` and `sdc-cline-bridge-0.7.3-m24.4.vsix` under `extensions/vscode/dist/m24-release-candidate/`, plus `evidence/M24/artifact-manifest.json`. Run:

```sh
node extensions/vscode/scripts/package-m24.mjs
```

The script checks the Cline patched bundle and native add-on against `evidence/M30/artifact-manifest.json`, then packages the current built companion and records its hash. Package metadata changes, so the M24 VSIX hashes differ from the M30 disposable hashes. The builder emits unsigned candidates; the separate `deploy/m24/sign-release.mjs` signs and verifies the integrity manifest using an operator-owned key outside the checkout. The selected local artifacts have a verified detached signature; they are not Marketplace-signed. Cline's upstream extension identifier is retained because the bridge uses its app-owned export. Therefore, VS Code treats the maintained build as the Cline extension in that profile: install it only in a separate macOS account or a separately provisioned VS Code instance with separate user-data and extension directories. Profiles alone do not isolate extension binaries. Profiles are not a physical isolation boundary; see [VS Code extension storage](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace) and [isolated instances](https://code.visualstudio.com/docs/configure/command-line). The exact installed hashes, graphical sign-in/consent and lifecycle results must match the selected signed manifest.

## Identity and secrets

Choose a production OIDC issuer that supports authorization code with PKCE, RS256 discovery/JWKS validation, verified email and an access-token audience claim for the SDC API. Register the exact public client ID and API audience. Allow the companion 0.7.3 redirect `http://127.0.0.1:15945/callback` and the exact control-page origin callback; no client secret is used by the native public client. Confirm the actual issuer, redirect and audience with the identity owner before using a real realm.

Copy `deploy/m24/.env.example` to an operator-owned Compose env file outside the checkout. Copy the three `*.env.example` files to protected paths and replace every example value. Keep the DB password, connection string and OIDC config files mode `0600`. Generate an Ed25519 key pair dedicated to signed approval decisions; mount only the private key into the server container. The public key is derived at startup. Do not commit secrets or put them in shell history, logs, source maps or evidence.

The Compose edge uses private-network HTTP between gateway and TypeScript server. The gateway only accepts cleartext origins listed exactly in `SDC_TRUSTED_HTTP_UPSTREAMS`; Compose sets both that value and `SDC_SERVER_URL` to `http://server:3000`, never caller-controlled, on their private Docker network. Do not list a public or untrusted upstream. Browser/native clients connect only to Nginx over HTTPS. PostgreSQL has no published host port and is on a data-only internal network.

Create persistent paths, set ownership for the non-root Node container (uid 1000), and set strict file permissions before startup. Generate the decision key with `openssl genpkey -algorithm Ed25519`, store it outside the checkout with owner uid 1000 and mode `0400`, and keep its public verification material available to the deployment operator. The attachment directory must be writable by uid 1000. Protect the Docker daemon and host: privileged Docker access can read environment settings and mounted secrets.

## Start and inspect

The external files and values in the Compose env file must be complete before the stack starts. TLS files must be named `fullchain.pem` and `privkey.pem` in `SDC_TLS_DIR`; DNS for `SDC_DOMAIN` must point at this host and the certificate must cover it.

```sh
docker compose --env-file /srv/sdc/compose.env -f deploy/m24/compose.yaml config
docker compose --env-file /srv/sdc/compose.env -f deploy/m24/compose.yaml build
docker compose --env-file /srv/sdc/compose.env -f deploy/m24/compose.yaml up -d
docker compose --env-file /srv/sdc/compose.env -f deploy/m24/compose.yaml ps
```

The `config` output contains resolved settings; inspect it locally and never paste it into a ticket or log. The first server startup applies checksum-verified migrations before listening. Keep a database/attachment backup before upgrading. `docker compose down` preserves the named PostgreSQL volume; never add `-v` during routine stop or rollback.

The deployment identity and credentials must be provisioned through the documented graphical sign-in, pairing and local-consent path. Public credentials remain scoped to their selected session and scopes. Caller tools remain disabled unless a separately reviewed exact-binding evidence policy is configured in the server composition; this deployment does not infer trust from a model name or Cline version string.

## Backup and restore

Quiesce prompt/control traffic and stop `server` and `gateway` before making a consistent attachment/database backup. Store backups on encrypted operator-controlled storage with retention and restore access controls. Then run:

```sh
deploy/m24/backup.sh /srv/sdc/compose.env /srv/sdc/backups
```

The script requires Docker Compose and Python 3, rejects running server/gateway writers, and reads the attachment mount from the resolved Compose configuration. Failed backups keep an `.incomplete` suffix. It writes a custom-format PostgreSQL dump and an attachment archive with SHA-256 checksums under a timestamped mode-0700 directory. Copy the checksums with the files and verify them before any restore. Back up Compose/environment values and TLS/OIDC configuration separately in the operator's encrypted secret/configuration store; do not copy private keys into the application backup by default. Restore rehearsal is still required for the selected PostgreSQL version and operator backup destination. Restore into an isolated empty database, restore the matching attachment archive, then start the matching server version and verify migrations and attachment checksums before switching traffic. Do not overwrite the only live database as a restore test.

## Upgrade and rollback

1. Record current image digests, VSIX hashes, schema migration version, OIDC config revision and VS Code/Cline version. Quiesce traffic and back up PostgreSQL plus attachments.
2. Build and inspect new server/gateway image digests and the M24 artifact manifest. Confirm migration checksum history and review release notes before changing the pinned image references in the external Compose env file.
3. Start the new server/gateway and verify health, HTTPS sign-in, scoped API access, SSE heartbeats/reconnect, one approved and one denied native action, and exact supported Cline task behavior.
4. For application rollback, restore the previous image tags/digests and compatible environment. If a new migration is not backward compatible, restore the paired pre-upgrade database and attachments into a separate database target, verify it, then switch the connection. Never run historical rollback SQL blindly against production.
5. Test the upgrade and rollback with a clean test user and representative retained data before production use. Re-pair only when the migration or identity policy invalidates a binding; report that outcome clearly.

## Uninstall and credential cleanup

Run **Cline Bridge: Revoke and Forget Server Credentials** for the selected profile before uninstalling. Confirm that server device revocation and local profile credential/inbox removal succeed; offline revocation failures retain credentials for retry. This does not cancel native work or delete Cline task history. Revoke separately issued public API credentials through their authorized management route. Stop the Compose stack. Remove the VSIX pair through VS Code's graphical extension manager, preserving stock Cline. Export or retain database and attachment data according to the operator's retention policy. Delete the decision private key, environment files, TLS private key and attachment/database volumes only after approved retention and backup expiry. Destructive volume deletion is deliberately not automated here.

## Acceptance required for another operator environment

- Select the real supported DNS/TLS proxy, identity realm/client/audience, deployment host, backup destination, and release/signing/publishing owner.
- Build the server/gateway images with the release toolchain and deploy to that selected test target. Verify external HTTPS, real OIDC login, exact scopes and credentials, and SSE delivery/reconnect/control timing through the actual proxy.
- As a clean supported user, use a separate macOS account or operator-provisioned physically isolated VS Code instance, install both versioned VSIX files there, complete sign-in/pairing/consent, and verify Connect/status/disconnect and a server-driven task. Confirm the ordinary VS Code installation still has stock Cline and historical packages remain untouched.
- Exercise upgrade, rollback, database/attachment restore and uninstall/credential cleanup; record evidence, versions, artifact digests, failures and supported host/OS.
- Sign and verify the release manifest with the operator-selected key or use the Marketplace process. A checksum alone is not a signature, and a project signature is not Marketplace approval.

The selected local target’s evidence is recorded separately; do not transfer that acceptance to a different host or identity. M25 guide finalization and M26 frozen release/soak remain separate milestones.
