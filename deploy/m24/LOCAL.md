# Authorized persistent local Docker deployment

For step-by-step explanations, use the [operator runbook](../../docs/guide/operator-guide.md), [beginner user guide](../../docs/guide/user-guide.md) and [certificate creation/trust guide](../../docs/guide/certificates.md).

The selected local deployment lives at `https://localhost:15943`. Only that loopback port is published. PostgreSQL stores SDC and Keycloak in separate databases. Keycloak runs in normal server mode behind the HTTPS proxy, with a public PKCE S256 native client, exact native loopback and HTTPS control-page callbacks and `sdc-api` audience. The server's fixed HTTPS backchannel reaches the proxy through Docker DNS while issuer/signature/nonce/audience checks retain the external localhost issuer. No browser or native TLS verification is disabled.

Developer provisioning:

```sh
python3 deploy/m24/provision-local.py --state /Users/samin/Documents/ServerDrivenChat-local/m24
deploy/m24/local.sh up
```

Provisioning is idempotent: existing settings are retained, and a partially populated unknown directory is rejected. Keys, CA, environment files, login credentials and launch state are outside the checkout in a mode-0700 directory. The initial attachment mount permits the non-root container to create files; the private parent prevents other host users from accessing it. Decision material is copied into a Docker volume with uid 1000/mode 0400. The release signing key is separate from the approval-decision and TLS keys. Keep the private state directory and Docker daemon protected.

Open `LOCAL-LOGIN.txt` in the private state directory to obtain the generated local user and admin credentials; never copy it into evidence. Trust only `tls/ca.pem` through the graphical OS certificate interface after checking its recorded fingerprint. Open the generated `ServerDrivenChat VS Code.app` to launch the isolated instance; install the reviewed VSIX pair using Extensions → Install from VSIX. On macOS, VS Code user data and extension binaries live under `~/Library/Application Support/ServerDrivenChat/M24`, outside the Documents folder, and are physically separate from ordinary VS Code. The launcher is a small native Mach-O entry point that starts the existing editor with those isolated paths; it is not a new frontend. It also sets `NODE_EXTRA_CA_CERTS` to this deployment's public `tls/ca.pem` for that isolated VS Code process and its extension hosts, so Node HTTPS requests trust the project CA while normal certificate validation remains enabled. If only the launcher needs repair, rebuild it without rotating local credentials or database state with `python3 deploy/m24/provision-local.py --state /Users/samin/Documents/ServerDrivenChat-local/m24 --refresh-vscode-launcher`. Native connection still requires exact task and control consent.

Rebuild/package commands are developer tooling. Verify releases against the already trusted public key:

```sh
node deploy/m24/sign-release.mjs sign /Users/samin/Documents/ServerDrivenChat-local/m24/signing/release-ed25519.pem
deploy/m24/local.sh verify
```

The detached signature authenticates the integrity manifest and both VSIX hashes. It is a project signature; it does not claim Microsoft Marketplace verification. Packaging again changes the manifest and requires signing again. Do not trust a replacement public key delivered alongside an unexpected update without validating its identity through an existing trusted channel.

`deploy/m24/local.sh backup` stops all application and identity writers and backs up **both** databases plus attachments. It deliberately leaves the services stopped; use `local.sh up` after a successful backup. Back up secrets/CA/signing configuration separately in protected storage. Restore dumps into separate empty SDC and Keycloak database targets with their configured roles; verify identity, migration history and matching attachment checksums before switching. Preserve pre-upgrade image IDs, database/identity dumps, attachments and configuration for rollback. Do not downgrade a changed database schema blindly.

`local.sh stop` retains data. Before uninstall, run **Cline Bridge: Revoke and Forget Server Credentials**, select only the intended profile, and confirm **Revoke and forget**. The companion stops local delivery, revokes that device through the human-authenticated public API, deletes only that profile's saved sign-in/device credentials and its closed bridge SQLite inbox, and requires fresh sign-in/pairing next time. A failed revocation retains credentials/inbox for retry while delivery stays disconnected. Other profiles, server audit history, Cline tasks and upstream provider settings are retained. Revoke any separately issued public API keys through their authorized management route. Then uninstall the pair through the isolated editor's Extensions view. Persistent Docker volume, CA trust and private state deletion are explicit final retention decisions; routine stop never deletes them. The exact native/package lifecycle acceptance is recorded in `evidence/M24/persistent-local/final-acceptance.json`.

### Updating an existing local callback allowlist

For an older provisioned state that refuses the control page login, run `python3 deploy/m24/provision-local.py --state /Users/samin/Documents/ServerDrivenChat-local/m24 --refresh-oidc-redirects`, then `deploy/m24/local.sh up`. This developer repair uses the existing local operator credential and verified public CA, adds only `https://localhost:15943/` to the selected client and server callback allowlists, and preserves credentials, keys, existing callbacks, and database state. The native companion 0.7.3 uses the exact `http://127.0.0.1:15945/callback` callback.
