# Operator runbook: install, protect and recover the local server

This guide is for the person responsible for the installation. The [user guide](user-guide.md) covers everyday graphical use. Here, terminal commands are **operator/developer tools**. An ordinary user does not need them to send a message.

The accepted target is one macOS arm64 machine, persistent Docker, `https://localhost:15943`, real local Keycloak, the private project CA and the [exact package pair](support-matrix.md). This is a tested local deployment. An Internet domain, public identity provider, firewall and public release require their own configuration and acceptance.

## Contents

1. [Understand what is stored where](#1-understand-what-is-stored-where)
2. [Prepare an installation](#2-prepare-an-installation)
3. [Verify identity, certificates and packages](#3-verify-identity-certificates-and-packages)
4. [Start, check and stop services](#4-start-check-and-stop-services)
5. [Take a consistent backup](#5-take-a-consistent-backup)
6. [Practise an independent restore](#6-practise-an-independent-restore)
7. [Upgrade and roll back](#7-upgrade-and-roll-back)
8. [Revoke, uninstall and retain data](#8-revoke-uninstall-and-retain-data)
9. [Diagnose common installation failures](#9-diagnose-common-installation-failures)

## 1. Understand what is stored where

A container is a running service packaged with its dependencies. A volume keeps its data when that container is replaced. Rebuilding or stopping a container does not mean its database has been erased.

| Location | Purpose | Treatment |
|---|---|---|
| Repository `/Users/samin/Documents/ServerDrivenChat` | Source, guides, public schemas, signed release candidates and sanitized evidence | Can be reviewed; never put secrets here |
| Private state `/Users/samin/Documents/ServerDrivenChat-local/m24` | Compose settings, generated login details, TLS/approval/release private keys, launcher and backups | Restrict to the owner; protected backup |
| Docker PostgreSQL volume | Separate SDC and Keycloak databases | Retain; back up both together |
| Configured attachment directory | Committed user attachment bytes | Back up with the databases |
| `~/Library/Application Support/ServerDrivenChat/M24/vscode-user` | Isolated editor settings, Cline task history and extension secret storage | Retain unless the owner requests scoped deletion |
| `~/Library/Application Support/ServerDrivenChat/M24/vscode-extensions` | Isolated installed extension binaries | Must be separate from ordinary VS Code |
| Login keychain | Approved SSL trust for this CA; editor secret storage infrastructure | Package removal does not automatically remove CA trust |

`LOCAL-LOGIN.txt`, `login.json`, `compose.env` and private key files are credentials. Do not paste their contents into a chat, issue, screenshot or evidence file. The local user and Keycloak administrator are different accounts. Everyday sign-in uses the local user; realm administration uses the administrator.

The databases contain identity, authority and conversation data. A backup is sensitive even if its filename contains no secret. Use encrypted, access-controlled storage for copies taken off this machine. The generated state/backup directory is mode `0700`; generated secret/backup files are restricted. Do not make them world-readable to solve a permission error.

## 2. Prepare an installation

For the already provisioned machine, do not create a second state directory or rotate the existing identity. Check the existing services first. The paths below are the selected machine's actual paths; on another machine, deliberately select its paths and repeat acceptance rather than assuming these usernames exist.

For a new installation, prepare these items before asking a beginner to connect:

1. Docker Desktop installed and running.
2. The repository and locked build tools: Node 24/npm 11, Python for provisioning, and the tested Docker images. See the [maintainer guide](maintainer-guide.md).
3. Official signature-verified VS Code **1.140.0**, installed separately. The accepted copy is `~/Applications/ServerDrivenChat VS Code 1.140.app`. Do not replace the ordinary `/Applications` editor.
4. Both exact reviewed VSIX archives and the independently trusted release verification key.
5. A private writable state directory owned by the intended local user.
6. The public CA fingerprint, supplied through a trusted channel, and approval to trust this particular CA for SSL.
7. A native Cline model/provider configuration that already works locally. The server does not supply a replacement executor or provider account.

Run provisioning from the repository root:

```sh
python3 deploy/m24/provision-local.py --state /Users/samin/Documents/ServerDrivenChat-local/m24
deploy/m24/local.sh up
deploy/m24/local.sh status
```

Provisioning is idempotent: it retains known existing settings. It refuses an unknown partially populated directory. Investigate that refusal; do not empty the directory merely to get past it. The selected services use Compose project name `sdc-local`. `SDC_LOCAL_STATE` can select a different operator-managed state path for `local.sh`; do not point it at an unrelated deployment.

The public entry is HTTPS on **IPv4 loopback port 15943**. Internal HTTP is accepted only for the fixed `http://server:3000` origin on the private Docker network and its exact operator allowlist. Do not publish database, server, gateway or Keycloak ports to the LAN. Do not replace the fixed upstream with a URL supplied by a caller.

The user completes package installation, project trust, sign-in and **exact local task/control consent graphically**, following the [user guide](user-guide.md). Provisioning and an API key cannot bypass these steps. A separate VS Code profile alone shares binaries; the launcher selects separate user-data and extension directories.

## 3. Verify identity, certificates and packages

### Certificate trust

For the full beginner walkthrough, including obtaining the public file, creating a separate certificate lab, graphical import and runtime checks, read the [certificate guide](certificates.md).

A CA is a certificate authority: trusting it permits certificates issued by it to authenticate HTTPS. Check the public certificate's fingerprint before granting trust:

```sh
openssl x509 -in /Users/samin/Documents/ServerDrivenChat-local/m24/tls/ca.pem -noout -fingerprint -sha256
```

The selected M24 CA's recorded SHA-256 fingerprint is:

```text
6A:97:03:D4:EA:87:E4:2F:9F:86:A5:EB:2B:4C:9F:3A:19:EA:CF:83:47:DE:16:FD:C9:86:39:C9:84:B7:DB:5F
```

Compare with [M24 trust evidence](../../evidence/M24/persistent-local/resume-2026-10-10.json). A regenerated CA on another installation has a different fingerprint and needs its own review. In Keychain Access, use the selected certificate's **SSL** trust setting; do not grant unrelated trust categories or trust an unexpected certificate.

The browser, macOS and programming runtimes may use different trust stores. The launcher sets `NODE_EXTRA_CA_CERTS` to this installation's **public** `tls/ca.pem` for the isolated editor and extension hosts. Node clients also need that variable before they start. Python examples use an explicit SSL context. Do not use `curl -k`, `verify=False` or `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Check HTTPS with validation enabled:

```sh
curl --ipv4 --cacert /Users/samin/Documents/ServerDrivenChat-local/m24/tls/ca.pem https://localhost:15943/api/v1/health
```

Using `127.0.0.1` in place of `localhost` changes the configured origin/issuer/callback. Keep the exact `localhost` URL even when forcing IPv4.

### Release integrity and editor identity

From the repository root, with Node 24 on `PATH`:

```sh
deploy/m24/local.sh verify
codesign --verify --deep --strict --verbose=2 "$HOME/Applications/ServerDrivenChat VS Code 1.140.app"
```

The first command verifies the detached Ed25519 manifest signature and its referenced artifacts against the already trusted key at `<state>/signing/release-public.pem`. A new public key bundled alongside a suspicious package is not an independent trust anchor. Project signing is distinct from Microsoft Marketplace signing.

Check **Code → About Visual Studio Code** in the isolated editor: it must show 1.140.0. Compare both installed extension versions with the [matrix](support-matrix.md) and package hashes with the [manifest](../../evidence/M24/artifact-manifest.json). The stock extension ID is retained by maintained Cline, which makes physical isolation essential.

### Exact identity callbacks

The accepted native callback is `http://127.0.0.1:15945/callback`; the control-page callback is `https://localhost:15943/`. Do not add wildcard callbacks to make sign-in work.

Two narrowly scoped repairs are available for an existing state:

```sh
python3 deploy/m24/provision-local.py --state /Users/samin/Documents/ServerDrivenChat-local/m24 --refresh-vscode-launcher
python3 deploy/m24/provision-local.py --state /Users/samin/Documents/ServerDrivenChat-local/m24 --refresh-oidc-redirects
deploy/m24/local.sh up
```

Use the first only for launcher repair. It builds the native Mach-O launcher without rotating data/keys. Use the second for a verified missing exact control callback; it preserves existing callbacks and uses the retained identity administrator. Neither is a general reset. Close and reopen the isolated editor after a launcher environment change.

## 4. Start, check and stop services

```sh
deploy/m24/local.sh up
deploy/m24/local.sh status
```

`up` starts/recreates the configured services and waits for available healthchecks. `status` lists their state. SDC server, gateway and PostgreSQL have Docker healthchecks. Proxy and Keycloak do not; confirm their functional HTTPS responses as well:

```sh
curl --ipv4 --cacert /Users/samin/Documents/ServerDrivenChat-local/m24/tls/ca.pem https://localhost:15943/v2/health
curl --ipv4 --cacert /Users/samin/Documents/ServerDrivenChat-local/m24/tls/ca.pem https://localhost:15943/api/v1/health
curl --ipv4 --cacert /Users/samin/Documents/ServerDrivenChat-local/m24/tls/ca.pem https://localhost:15943/identity/realms/sdc/.well-known/openid-configuration
```

Expect successful HTTP responses; discovery must name the exact localhost identity issuer. A successful discovery response does not establish native permission or pairing. Verify the user workflow separately.

```sh
deploy/m24/local.sh stop
```

`stop` retains volumes, identity, history, attachments and credentials. Disconnect the bridge and let native work finish before planned downtime. A disconnected bridge cannot deliver a queued cancel. For immediate local control, use the native editor's controls while it is reachable. Starting Docker Desktop alone may not start services deliberately stopped by the backup command; the operator runs `local.sh up` afterwards.

For investigation, inspect the intended container's logs in Docker Desktop. Treat logs as potentially sensitive. Share only reviewed error codes, timestamps and selected identifiers. Full Compose configuration expands credentials; do not paste `docker compose config`, environment dumps, authentication callback URLs, bearer headers or raw request bodies into evidence.

## 5. Take a consistent backup

A consistent backup captures database records and attachment bytes from one stopped-writer state. Copying a live attachment folder and later dumping the database can produce references to missing files.

1. Announce downtime and finish/stop active native work locally.
2. Disconnect the bridge. Keep the native task/history intact.
3. From the repository root, run:

   ```sh
   deploy/m24/local.sh backup
   ```

4. The script stops proxy, gateway, server and Keycloak writers. PostgreSQL remains available to dump. It writes a private timestamped directory under `<state>/backups` containing `postgres.dump`, `identity.dump`, `attachments.tar.gz` and `SHA256SUMS`.
5. A directory ending in `.incomplete` is not a completed backup. Investigate a failed command before using it.
6. Verify the completed backup. Substitute the exact new directory name reported by the script:

   ```sh
   cd /Users/samin/Documents/ServerDrivenChat-local/m24/backups/m24-YYYYMMDDTHHMMSSZ
   shasum -a 256 -c SHA256SUMS
   ```

7. Save the matching source/release revision, signed manifest, image identities and protected configuration/key material. The script does **not** back up editor history, SecretStorage, CA trust or private configuration/keys. Protect those separately; never publish them with evidence.
8. Return to the repository and restart:

   ```sh
   cd /Users/samin/Documents/ServerDrivenChat
   deploy/m24/local.sh up
   deploy/m24/local.sh status
   ```

Run the functional health checks from section 4. Reconnect the same intended native task graphically if the owner wants delivery resumed. Do not silently grant a new binding or broader control selection.

## 6. Practise an independent restore

A backup is useful only if it restores. Practise into **new empty targets**, preserving the running installation. The following example is for the selected local PostgreSQL container and its configured database administrator. It restores two new test databases; it does not switch the server to them.

First verify backup checksums. Select an actual completed backup using `SDC_RESTORE_SET`; keep the files private. Check the container name with `local.sh status`. If `sdc-local-postgres-1` is not your selected instance, stop and adapt the example deliberately.

```sh
export SDC_RESTORE_SET=/Users/samin/Documents/ServerDrivenChat-local/m24/backups/m24-YYYYMMDDTHHMMSSZ
docker exec sdc-local-postgres-1 sh -ec 'createdb -U "$POSTGRES_USER" sdc_restore_m25_check'
docker exec sdc-local-postgres-1 sh -ec 'createdb -U "$POSTGRES_USER" keycloak_restore_m25_check'
docker exec -i sdc-local-postgres-1 sh -ec 'pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d sdc_restore_m25_check' < "$SDC_RESTORE_SET/postgres.dump"
docker exec -i sdc-local-postgres-1 sh -ec 'pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d keycloak_restore_m25_check' < "$SDC_RESTORE_SET/identity.dump"
```

`createdb` refuses a name that already exists. That is useful protection: choose a fresh test name rather than dropping an unknown database. `--no-owner` restores objects under the selected role; a production switch must use the intended configured roles. Do not add `--clean` or target the live database to get around an error.

Restore attachments to a fresh private **test folder**, not the live mount:

```sh
umask 077
mkdir "$SDC_RESTORE_SET/attachment-restore-check"
tar -xzf "$SDC_RESTORE_SET/attachments.tar.gz" -C "$SDC_RESTORE_SET/attachment-restore-check"
```

Validate the restored schema/migration history, owned sessions, device revocation state, identity realm/client/exact callbacks and attachment byte checksums. Record counts and pass/fail; avoid exporting user records or secrets. macOS `._` AppleDouble metadata is not application attachment content. An empty attachment backup demonstrates only an empty store restore. Use a known committed nonempty attachment to qualify its bytes.

The [M24 independent restore record](../../evidence/M24/persistent-local/final-database-restore.json) reports both databases, nine retained SDC migrations, real realm/client/callbacks, old device revocation and new native commands/events. Its final store was empty; earlier nonempty attachment restoration is separate evidence. M25 provides these instructions and does not claim a second restore was performed.

After successful verification, remove **only these explicitly created disposable test targets** if retention permits. Confirm the names before running:

```sh
docker exec sdc-local-postgres-1 sh -ec 'dropdb -U "$POSTGRES_USER" sdc_restore_m25_check'
docker exec sdc-local-postgres-1 sh -ec 'dropdb -U "$POSTGRES_USER" keycloak_restore_m25_check'
```

Remove the private test extraction folder separately after inspection. Keep the original backup. For an actual recovery, stop writers, choose replacement databases/attachment location, restore the matching protected configuration, validate there, and deliberately switch configuration. This guide does not authorize overwriting retained live state. A database dump without matching identity and key configuration is not a complete installation recovery.

## 7. Upgrade and roll back

An upgrade has three independently versioned parts: editor/native extensions, server/gateway images, and database/configuration. Compatibility must cover all three. A package that installs is not proof of safe workflow or migration rollback.

Before changing anything:

1. Record the installed host/pair, API version, signed manifest, image IDs and configuration revision.
2. Retain the previous trusted archives/images and verification key.
3. Finish native work, disconnect, and take/verify the consistent backup above.
4. Review release notes, native API compatibility and migration requirements.
5. Verify the new signed artifacts against the existing trusted key.

For a compatible companion update, use **Extensions → Install from VSIX** in the isolated editor, reload when prompted, verify its version, then reconnect the intended task graphically. A normal upgrade retains saved sign-in/device state. Do not use **Revoke and Forget** as a routine upgrade step. The [M24 lifecycle record](../../evidence/M24/persistent-local/package-lifecycle.json) distinguishes retained-pairing rollback from deliberately forgotten/fresh pairing.

For selected source/container changes, the operator's commands are:

```sh
deploy/m24/local.sh build
deploy/m24/local.sh up
```

`build` uses the current checkout. It does not select an older revision or verify native acceptance for you. Preserve the approved source/image identities and use the intended compatible revision before rebuilding. Recheck TLS/discovery, API authority and native workflow. Do not assume a new native pin inherits historical media/tool acceptance.

To roll back extensions, install the retained reviewed prior VSIX in the same isolated host and verify its version/fingerprint. To roll back services, select the retained compatible source/images and configuration, then restart. If schema changed, verify supported rollback against retained data first. The public authority migrations deliberately refuse destructive rollback when retained authority/history would be lost. Restore a matching backup into independent targets if required; never blindly downgrade the live schema.

The tested M24 rollback used a compatible server/gateway pair and companion 0.7.2 → 0.7.0 before returning to final 0.7.3. It does not establish arbitrary downgrade support. M26 will freeze and requalify the final release separately.

## 8. Revoke, uninstall and retain data

Follow the [user guide cleanup](user-guide.md#11-remove-credentials-and-uninstall) while the companion is still installed:

1. Finish native work and disconnect.
2. Run **Cline Bridge: Revoke and Forget Server Credentials** for the intended profile.
3. Read the exact profile/task context. Confirm **Revoke and forget**. If requested, the human performs sign-in.
4. Wait for success. Revocation happens before saved tokens/inbox deletion. Failure retains retry data and leaves delivery disconnected.
5. Revoke separately issued API keys through the authorized human management route.
6. Uninstall the companion and maintained Cline in the isolated Extensions view; reload and verify removal.

This removes selected device access and local saved tokens/inbox. It retains Cline history, other profiles, server audit/history, provider configuration, volumes and CA trust. The ordinary editor is outside the selected installation. Fresh reinstall/sign-in/pairing requires fresh local consent.

For service retirement, `local.sh stop` retains data. Decide the retention period and verify a protected backup before deleting volumes, private state or editor history. `docker compose down -v` is destructive and is not a routine stop/uninstall instruction. Remove this exact CA from Keychain only when it is no longer needed and the owner authorizes it. Removing packages alone is not credential revocation or data erasure.

## 9. Diagnose common installation failures

| Symptom | Check and action |
|---|---|
| Site cannot open | Docker Desktop running; selected Compose services running; functional proxy health; exact URL/port |
| Browser opens but bridge sign-in fails before the browser | Node trust differs from macOS trust. Verify public CA fingerprint and launcher `NODE_EXTRA_CA_CERTS`; restart the isolated host |
| Invalid redirect / login loops | Exact two callback allowlists, issuer/audience and fixed HTTPS identity backchannel; use the narrowly scoped refresh only for a confirmed missing callback |
| Editor signature fails | Stop installation in that host. Obtain the verified official exact host; do not bypass signature checks |
| Editor unresponsive / Documents access denied | Check the isolated paths and macOS selected-folder access. Do not widen to all Documents or use ordinary VS Code as a shortcut |
| Launcher rejected by LaunchServices | Refresh the native Mach-O launcher. The old shell-as-app wrapper is not the supported launcher |
| Gateway cannot reach server after container replacement | Selected nginx dynamic Docker DNS and exact private upstream; inspect current service state |
| Backup leaves site offline | Intentional stopped writers. Verify completed backup, then `local.sh up` and functional health |
| Credential forget fails | Preserve saved state, repair identity/network access, retry selected-profile cleanup; do not manually erase evidence needed for revocation |
| Database/storage capacity refusal | Preserve history and inspect bounded storage/admission; no automatic destructive purge policy exists |

For response/effect ambiguity, stalled operations and incident handling, use the [maintainer guide](maintainer-guide.md). Fix the cause and reconcile the original operation; do not enqueue a duplicate instruction merely because a request timed out.
