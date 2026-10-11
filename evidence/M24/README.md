# M24 implementation and acceptance

**Status:** Done for the selected local deployment/package target. [Final acceptance](persistent-local/final-acceptance.json) records the exact pins and limits. **Selected target:** persistent local Docker at `https://localhost:15943`; isolated signed VS Code 1.140.0 on macOS arm64, Cline 4.1.2204/API 1.3 and companion 0.7.3. M25/M26 remain Not started.

The real Keycloak 26.4.7/PostgreSQL identity, private CA/TLS proxy, scoped API credentials, SSE/replay, service replacement and independent two-database restore passed on the selected target. Secrets remain outside the checkout. [Local runbook](../../deploy/m24/LOCAL.md), [verification](verification.json) and [persistent lifecycle](persistent-local/lifecycle.json) record the commands and limits.

The [fresh quiesced restore](persistent-local/final-database-restore.json) retained actual realm/callbacks, revoked authority and native history in separate test databases. [Final health](persistent-local/final-health.json) verifies the retained loopback services. Ordinary Cline is [unchanged](persistent-local/ordinary-cline-preserved.json).

The graphical native journey passed same-task prompts/output, question answering and addressed cancellation. Official OpenAI Chat/Responses and Anthropic SDK text calls passed through HTTPS → FastAPI → server → the existing consented Cline task. Usage is explicitly a server estimate. [GUI receipts](persistent-local/native-gui-receipts.json) and [SDK results](persistent-local/native-sdk.json) retain exact IDs and earlier readiness refusals.

Graphical rollback to 0.7.0 retained valid pairing and reconnected. The final 0.7.3 adds the missing selected-profile **Revoke and Forget Server Credentials** command. An expired refresh first failed safely, then browser reauthentication completed revocation and removal of only the selected saved user/device tokens and SQLite inbox. [Cleanup evidence](persistent-local/credential-cleanup.json). Both isolated extensions were uninstalled graphically, the Installed view became empty, and both signed VSIXs were reinstalled graphically with matching hashes and retained Cline history. [Package lifecycle](persistent-local/package-lifecycle.json). Fresh real sign-in/pairing and explicitly approved local consent passed. [Final 0.7.3 SDK checks](persistent-local/native-sdk-final.json) and [applied receipts](persistent-local/native-final-receipts.json) passed on the reinstalled pair; the bridge was then disconnected.

Node 24.19.0 build/lint and root checks passed: 125 passed, 55 optional database skips. Latest focused cleanup/reauthentication and provisioning passed 7/7; real HTTP 2/2, earlier auth/HTTP 10/10 and Swift 8/8. The unchanged gateway's historical 54-check suite remains valid evidence; no new host gateway rerun is claimed.

[Manifest](artifact-manifest.json), [detached signature](artifact-manifest.sig), [verification key](release-public.pem) and [notice review](upstream-notice-review.json) record unchanged native hashes, project MIT/upstream Apache-2.0 and bundled notices. Signing ownership is the local operator's project Ed25519 integrity key. No Marketplace signature, public upload, Internet production deployment or M26 soak is claimed.

## Historical checkpoints

The following entries describe earlier states and are superseded by the current result above.

### Graphical resumption checkpoint — 2026-10-10

The project CA is now trusted in the user's login keychain for SSL only. Its SHA-256 fingerprint matched the previously approved fingerprint, and certificate-verified HTTPS to `https://localhost:15943/health` returned 200 when explicitly resolved to the deployment's IPv4 loopback address. All five persistent Docker services remain healthy and only port 15943 on `127.0.0.1` is published.

Graphical acceptance is still blocked. The installed VS Code is 1.141.0 and fails code-signature verification; the manifest's tested support target is 1.140.0. LaunchServices rejects the generated `.app` wrapper because its executable is a shell script. Direct process launch attempts did not produce a verified isolated UI. macOS TCC logs show the app cannot read the pre-created data and extension directories under Documents. The extension directory remains empty. No VSIX installation or native permission grant occurred. The next step needs a valid signed isolated VS Code host and a scoped way for it to access this project; broad Documents access has not been granted. Details and commands are in [persistent resumption evidence](persistent-local/resume-2026-10-10.json).


### VS Code host probe — 2026-10-10

The M24 target is VS Code 1.140.0. Microsoft's official release page lists the Apple-silicon download ([release notes](https://code.visualstudio.com/updates/v1_140)). The downloaded DMG checksum verified, but running `Code` directly from the mounted image exited with SIGABRT during app registration. A temporary app copy then failed signature verification and was moved to Trash. The installed 1.141.0 app also fails signature verification and was left untouched. The generated `.app` wrapper uses a shell script as its executable and LaunchServices rejects it. No valid isolated graphical host is available, so neither VSIX was installed.

macOS TCC denies VS Code access to the pre-created profile and extension directories under Documents. The approved project CA is now trusted in the user's login keychain for SSL only; certificate-verified IPv4 loopback health returns 200. A new macOS Files & Folders permission has not been granted. Full details are in [resumption evidence](persistent-local/resume-2026-10-10.json).


### Launcher source repair — 2026-10-10

The generator now creates an arm64 Mach-O launcher and ad-hoc signs its app bundle. `--refresh-vscode-launcher` rebuilds only that app in already provisioned state. The focused provisioning test passed 1/1 and verified the native binary/signature; it ran under Node 25.9.0, not the required Node 24. This fix is in the repository but has not been applied to the private local state or launched. The VS Code host and macOS folder-access blockers above remain.


### Verified host and installed pair — 2026-10-10

The official Microsoft 1.140.0 Apple-silicon DMG SHA-256 matched the previously recorded checksum. `hdiutil` verification, deep code-signature verification after copying, and the app version check passed for the separate `~/Applications/ServerDrivenChat VS Code 1.140.app`; the ordinary system app was untouched. The private M24 launcher was refreshed to a signed Mach-O entry point. It now targets that verified host and stores its profile/extensions under `~/Library/Application Support/ServerDrivenChat/M24`, avoiding the earlier Documents watcher denial.

Cline 4.1.2204 was installed from VSIX through the isolated editor's Extensions UI. The companion 0.7.0 VSIX was installed with the exact editor CLI after its graphical picker stalled. Both packages appear in the isolated Extensions view and CLI listing. Focused provisioning passed 1/1 on Node 25.9.0; root build/lint passed and `npm test` passed 119 with 55 optional database skips after allowing loopback fixtures. Release signature and both VSIX checksums verify. Node 24 was unavailable; gateway, Swift and PostgreSQL integration suites were not rerun. No workspace was opened, no native task/control binding was granted, and M24 remains In Progress. Opening only the repository in the isolated host awaits explicit macOS folder-access approval; fresh native consent and graphical upgrade/rollback/uninstall/credential-cleanup gates follow. See [verification](verification.json) and [resumption evidence](persistent-local/resume-2026-10-10.json).
