# Cline server-driven workflow (M22)

> **Current user instructions:** Start with the [M24/M25 beginner manual](guide/README.md). This document preserves its historical milestone/pin and implementation details; its old package names are not the current installation target.

M22 is complete for the adopted local Cline 4.1.22 `sdc-m21.3` development build (extension 4.1.2203, API 1.2) and companion 0.4.0. The native app executes the model. The companion owns authenticated HTTP/SSE delivery, leases and durable inbox/outbox after the initiating model turn ends. See the [accepted walkthrough and ID linkage](../evidence/M22/walkthrough.md) and [verification](../evidence/M22/verification.json).

## User journey

Open the project in local VS Code and open its existing native Cline task. Configure a server profile through **Cline Bridge: Configure Server**, then choose the permitted control categories. Type **“Connect to my server and follow its instructions”** in Cline. Sign in in the browser, confirm the server pairing code and separately review the local task/workspace/server/control consent. Credentials stay in VS Code SecretStorage; the model tool receives only a profile and bounded connection result.

After Connect completes, send prompts from the authenticated server interface. Later turns run in the same native task and retain context without returning to the native composer. The app's permissions still apply. An approval becomes a server review with exact action/arguments/preview, request revision, native identity and digest. Select whole-action once or deny. **Decision recorded** means the server persisted it; **applied** requires a verified native receipt. Denial applies the decision without allowing the file effect. Narrowing, persistent grants and revocation are unavailable on this pin.

Answer a native clarification in the server interface. **Request stop** addresses its observed native turn and remains visible while a turn waits for input or approval; cancellation is confirmed by native abort evidence. Brief SSE interruptions reconnect the extension listener. Typing a new local prompt, switching tasks or reloading invalidates the binding and requires fresh local selection/consent. **Disconnect** immediately disables local dispatch and attempts authenticated server detach. It does not cancel an already running native turn; use Stop for that effect.

First-use sign-in/pairing must finish within the bounded Connect invocation. If it expires, its result is rejected and the user must explicitly retry after completing sign-in; credentials alone do not silently bind a task. M22 observed two bounded rejections before an explicit cached-sign-in retry succeeded. It does not claim automatic retry or a one-shot setup in slow UI conditions.

## Developer setup and verification

Developer setup may build packages, launch the isolated extension host and start a loopback fixture. These commands do not automate ordinary model operation or native permission decisions.

```sh
npm run build
node extensions/vscode/scripts/package-m22.mjs
# With the disposable PostgreSQL service running:
M22_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@127.0.0.1:55432/sdc_m06_test node scripts/m22-native-server.mjs evidence/M22-new-run
```

Packaging requires the preserved M21 native development directory and fingerprints; it reuses `dist/cline-4.1.22-sdc-m21.3` and creates `dist/sdc-cline-bridge-m22` / `dist/sdc-cline-bridge-0.4.0.vsix`. Run new acceptance into a separate evidence directory. Do not overwrite the closed M22 evidence. The historical M21 generator rejects companion 0.4.0 before writing historical artifacts.

Launch the reviewed directories in a disposable Extension Development Host. Use **Start/Finish M22 Acceptance Capture (Disposable Task)** only in `/private/tmp/sdc-m19-vscode-probe`. Capture is passive: it does not submit prompts, sign in or grant consent. The fixture waits for graphical commands, records actual HTTP/DB state and injects one bounded connection drop after continuity. It uses synthetic disposable identity, not a deployed OIDC realm. After saving the native capture as `live-vscode.json` in the run directory, validate:

```sh
node scripts/verify-m22-evidence.mjs evidence/M22-new-run
npm run test:m22
npm run test --workspace @server-driven-chat/control-ui
```

Set `M11_TEST_DATABASE_URL`, `M21_TEST_DATABASE_URL` and `M22_TEST_DATABASE_URL` to the disposable service to enable their real database checks. Without those variables their dependent suites skip. Shut down the fixture gracefully so it removes only its owned schema; restore the native model, disconnect and stop the test database afterward.

## Supported boundary

Local VS Code and the exact maintained Cline pin are supported. Installed stock Cline remains untouched. Other versions, Antigravity and remote hosts fail closed. Native API 1.2 and M19–M21 artifacts remain unchanged; companion 0.4.0 repairs cross-module workflow seams. M23 systematic hardening and native pending-approval failure acceptance subsequently passed with companion 0.5.0; see [hardening/recovery](cline-hardening.md). Release signing/distribution remains M24. See [Connect lifecycle](cline-connect.md), [native controls](cline-controls.md) and [DECISION-004](decisions/004-cline-extension.md).
