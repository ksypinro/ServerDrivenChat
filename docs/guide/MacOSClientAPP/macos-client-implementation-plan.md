# Building the proposed macOS client: implementation and onboarding plan

**11 October 2026 — design only.** No Mac client, helper, new callback, installation or native grant was created by this analysis. This plan uses the current accepted Cline/companion/backend as its reference. A future implementation requires a new instruction and its own acceptance; it does not reopen completed milestones or begin M26.

Start with the [architectural design](macos-client-architecture.md). This document is for developers and operators turning that design into a product. Numbered stages below are **proposed development stages**, not new milestone numbers. Existing end users should continue using the [current graphical guide](../user-guide.md).

## 1. Decide what the first app promises

Use this initial product statement:

> “Connect this Mac app to an already configured ServerDrivenChat installation, open its isolated VS Code backend, sign in, choose a connected Cline task and chat through the public API.”

Add managed local startup after this works. Add full first-install automation after startup/recovery works. A first release of the new app should not promise unattended provider login, task creation, consent, arbitrary Cline versions or automatic approval.

Make these explicit decisions before implementation:

| Decision | Recommended initial choice | Why |
|---|---|---|
| UI/platform | SwiftUI with AppKit integrations; proposed macOS 15 minimum | Matches current project's Swift platform conventions |
| Chat API | First-party `/api/v1` REST/SSE | Direct access to sessions, interactions and operation evidence |
| Native backend | Exact accepted VS Code 1.140.0 / Cline 4.1.2204 API 1.3 / companion 0.7.3 | Avoids unqualified backend changes |
| Initial setup | Attach to preprovisioned local deployment | Separates client correctness from installer complexity |
| Ordinary credentials | Session-scoped view/prompt key after human sign-in | Easy scope inspection/revocation; retain principal ownership boundaries |
| Native permissions | Prompts/questions/cancel only; approvals disabled | Matches the current local consent |
| Persistence | Separate SQLite request/projection journal and Keychain secrets | Safe restart/replay without borrowing device state |
| Background execution | Foreground app, services independent | No privileged/login helper needed initially |
| Full manager distribution | Evaluate Developer ID route before implementation | Docker/process/file access needs a deliberate distribution design |

Do not choose a gateway service alias to switch the underlying LLM. `sdc-default` identifies an authorized binding for a scoped key; the model provider remains configured in Cline.

## 2. Proposed code organization

The following is a proposed package layout; these paths do not exist yet:

```text
macos-client/
  App/                         SwiftUI entry point, scene and navigation
  Sources/ClientCore/
    Configuration/             nonsecret installation and server profiles
    Authentication/            browser session, callback validation, refresh
    Credentials/               app-owned Keychain implementation
    HTTP/                      typed first-party client, errors and limits
    Sessions/                  discovery, capabilities, binding selection
    Operations/                request journal, controls and result tracking
    Events/                    bounded SSE parser and projection reducer
    Persistence/               SQLite migrations and atomic transactions
    Setup/                     local inspection, launcher, lifecycle manager
    Diagnostics/               allowlisted redacted export
  Tests/                       contracts, stateful recovery and UI journeys
```

Keep all native-client presentation types outside `protocol/`, `server/`, `bridge/` and neutral adapter packages. Provider format changes do not belong in the Mac app's protocol model. Do not alter the maintained native patch merely to create a Swift screen.

Suggested interfaces, expressed as responsibilities rather than implemented source:

| Interface | Main operations | Concurrency/authority rule |
|---|---|---|
| `InstallationStore` | Load/save chosen endpoint, paths, version manifest, mode | Persist no credentials; canonicalize selected paths |
| `LocalSetupManaging` | Inspect, start selected services, observe progress, stop deliberately | Serialized actor; allowlisted local operations only |
| `BackendLaunching` | Verify target, open isolated launcher, show setup checklist | Main-thread macOS launch; never bypass local consent |
| `Authenticating` | Start browser attempt, exchange callback, refresh once, sign out locally | One attempt/refresh per profile; ephemeral state validated |
| `CredentialStoring` | Store/load/delete own tokens by origin and principal | Keychain errors explicit; no bridge namespace access |
| `PublicAPIProviding` | Discover, fetch snapshot, submit/retrieve prompt, controls, attachments | Request-specific bearer; typed errors, bounded payloads |
| `IntentJournaling` | Prepare original intent, attach returned IDs, resolve outcome | Durable write before dispatch; no automatic identity replacement |
| `SessionStreaming` | Stream/replay from committed cursor | One reader per selected session; cancellation stops reader only |
| `ProjectionPersisting` | Snapshot replace, event upsert, cursor transaction | Atomic projection/cursor; preserve unresolved intent ledger |

Inject URLSession transport, clock, UUID generator, journal and launcher abstractions so stateful races can be tested. Production authority remains the server/native boundary; these interfaces are client organization, not new authorization mechanisms.

## 3. Register the Mac app's sign-in callback

### Why this needs an operator change

The current local deployment registers these exact callbacks:

- `vscode://server-driven-chat.sdc-cline-bridge/auth` for the extension.
- `http://127.0.0.1:15945/callback` for the existing local callback path.
- `https://localhost:15943/` for the control page.

None is the proposed Mac app's callback. Do not take over the bridge callback or its listener port. The historical standalone Swift companion's `sdccompanion://auth` value is also not a ready-made callback for this current deployment.

### Proposed registration steps

1. Choose a stable product bundle identifier belonging to the app publisher. Select a corresponding callback, such as the **placeholder** `com.example.sdcclient://auth/callback`. Replace it with the real product identifier before use.
2. Configure the app's URL handling and authentication-session callback using the selected SDK's supported API. Validate scheme, host, path, expected state, attempt expiry and one-time consumption. Do not forward arbitrary incoming URLs into the exchange route.
3. Add that exact URI to Keycloak's existing `sdc-native` client's valid redirect URIs, preserving current entries. Keep public-client authorization code flow and S256 PKCE; do not enable password grants or wildcard redirects.
4. Add the identical URI to `SDC_OIDC_REDIRECT_URIS` in the selected private server configuration, preserving the existing entries. Recreate/restart the selected server through the operator's controlled procedure so it loads that allowlist.
5. For repeatable future provisioning, implement the new callback in reviewed source/configuration handling based on [provision-local.py](../../../deploy/m24/provision-local.py) and [local_oidc.py](../../../deploy/m24/local_oidc.py). The current `--refresh-oidc-redirects` option implements the existing control-page callback, not an arbitrary new callback argument.
6. Updating an exported realm file alone does not prove an already persistent realm changed. Inspect the running realm and server configuration through operator tooling, without exporting secrets into app logs/evidence.
7. Verify the new app sign-in and recheck both existing VS Code and control-page sign-ins. Callback configuration changes must not strand the existing device.

The current broker has one configured client ID. A separate OIDC registration per app is an alternative architecture requiring broker changes; the public request has no `clientId` field. Do not allow the client to choose arbitrary issuer/backchannel URLs.

RFC 8252 describes external browser/native redirect patterns, including loopback. However, this server currently uses an exact redirect allowlist. A random loopback callback port is not automatically supported here. If adopting loopback instead of a custom scheme, implement/test the server policy explicitly and avoid the existing 15945 listener. [OAuth native-app specification](https://datatracker.ietf.org/doc/html/rfc8252).

### Exact existing sign-in exchange

The following JSON examples are **schema examples with placeholders**, not commands to execute. Prefix routes with the selected first-party root. Do not include a bearer credential in an unauthenticated start/exchange request unless the contract requires it.

`POST /auth/signin/start`:

```json
{"redirectUri":"com.example.sdcclient://auth/callback"}
```

The server returns `authorizationUrl`, `state`, `expiresAt`. Save the pending attempt in memory, validate the returned HTTPS identity origin against the selected deployment, and open it with `ASWebAuthenticationSession`. A production issuer may differ from the API origin, so use operator-approved identity configuration rather than a blanket same-host assumption.

After the callback passes validation, `POST /auth/signin/exchange`:

```json
{"state":"ORIGINAL_SERVER_STATE","code":"ONE_TIME_CALLBACK_CODE"}
```

Store returned `userId`, `accessToken`, optional `refreshToken` and `expiresAt`. Call `/identity` with the human bearer to confirm the API identity. Do not log the response body or the browser callback.

When refresh is available, `POST /auth/signin/refresh`:

```json
{"userId":"RETURNED_USER_ID","refreshToken":"OWN_SAVED_REFRESH_TOKEN"}
```

Serialize refresh requests per profile. Preserve/replace refresh tokens according to the returned response; do not assume a missing new token invalidates an existing valid one. On invalid refresh, prompt sign-in. Never retry a prompt as a new intention because authentication changed.

**Current broker limitation:** pending attempts live in the TypeScript server process, expire after five minutes and are consumed before exchange completes. Restart/process loss or a lost exchange response can require a fresh sign-in. A multi-replica deployment would need same-instance routing or a separately reviewed shared-attempt design. The selected local deployment uses one server process. This limitation is visible in [the HTTP implementation](../../../server/src/http/index.ts).

Local sign-out deletes this app's saved tokens and closes its stream. There is no public SDC global-logout endpoint in the present contract. Deleting a refresh token locally does not prove the identity provider session or other apps' tokens were revoked. Display those distinctions; do not silently revoke the native device.

## 4. Create session-scoped chat access

After human sign-in:

1. `GET /identity` and `/capabilities` for account/API information.
2. `GET /sessions`; select a user-authorized session with a current usable binding.
3. `GET /sessions/{session_id}` and `/sessions/{session_id}/capabilities`; inspect readiness and effective actions.
4. Issue an owner-authorized key only after selecting that session.

`POST /credentials`, authenticated with the **human** bearer:

```json
{
  "sessionId":"SELECTED_SESSION_ID",
  "label":"Mac client — selected session",
  "scopes":["view","prompt"],
  "expiresAt":"2026-10-12T12:00:00Z"
}
```

The expiry above is illustrative; compute a future time at issuance. Current server policy permits at most 30 days and requires `view`, unique allowed scopes and an active authorized binding. Recommend a much shorter configurable lifetime for routine app use. Store returned `credentialId`, `credential` and expiry in Keychain under this app's namespace.

The secret is returned once. If the response is lost or Keychain storage fails, do not assume credential creation has a documented idempotency key. Use human credential listing and nonsecret metadata to reconcile/revoke orphan issuance before issuing another. Avoid giving multiple installations an indistinguishable label.

A scoped key cannot mint/revoke credentials or pair devices. Use human owner authorization for `GET /credentials` and `POST /credentials/{credential_id}/revoke`. Rotation changes the scoped principal. Existing operations created under the old key cannot be assumed accessible with its replacement; resolve or explicitly preserve uncertainty before retiring it. Never copy old unresolved requests into the new principal.

## 5. Build the first-party client against the actual contract

[Checked-in OpenAPI](../../../api-gateway/openapi.json) matches the recorded [deployed schema](../../../evidence/M25/deployed-openapi.json). Generate types or implement a small typed client from that schema; test behavior against server code too. Schema success alone cannot establish native behavior.

| Relative route | Method | App purpose | Special handling |
|---|---|---|---|
| `/health` | GET | Verified public service probe | Process/container status is a separate local check |
| `/identity`, `/capabilities` | GET | Identity and global information | Use explicit credential context |
| `/sessions` | GET | Authorized session list | Not a native task creation route |
| `/sessions/{session_id}` | GET | Binding/lease/native metadata | Native metadata is extensible; avoid guessed fields |
| `/sessions/{session_id}/capabilities` | GET | Effective actions | Refresh after authority changes/refusals |
| `/models` | GET | Authorized service aliases | Scoped `sdc-default` is a binding alias |
| `/sessions/{session_id}/snapshot` | GET | Coherent projection/interactions/watermark | Replace projection atomically |
| `/sessions/{session_id}/transcript` | GET | Transcript view | Follow documented replacement/revision semantics |
| `/sessions/{session_id}/events` | GET SSE | Replay/live updates | Decimal cursor, authenticated headers |
| `/sessions/{session_id}/prompts` | POST | One text/image prompt intention | Mandatory stable `Idempotency-Key` |
| `/operations/{operation_id}` | GET | Original outcome | Same principal; inspect terminal evidence |
| `/sessions/{session_id}/controls` | POST | Answer, cancel, disable | Stable command ID and addressed current interaction |
| `/sessions/{session_id}/commands/{command_id}` | GET | Control acknowledgement | Recorded is not native applied |
| `/attachments` | POST bytes | Stage owned image | MIME/session/filename/SHA headers |
| `/attachments/{attachment_id}/commit` | POST | Commit checksum | Required before reference submission |
| `/attachments/{attachment_id}` | GET | Authorized download | Bounded bytes and sensitive content policy |

No route in this table starts Docker, installs an extension, configures Cline's provider or creates local native consent. Do not add undocumented `/start`, `/launch-cline` or `/new-native-task` calls in the Swift transport.

### Text request

With the scoped bearer, content type JSON and original UUID in `Idempotency-Key`, `POST /sessions/{session_id}/prompts`:

```json
{
  "model":"sdc-default",
  "content":[{"type":"text","text":"Do not use tools or change files. Reply READY only."}],
  "delivery":"queue"
}
```

Optionally request `Prefer: wait=30`; the UI still needs operation/event recovery. Do not add temperature, arbitrary model name or unsupported provider fields. Persist the exact intended body before the first request. Raw text can carry native context from earlier task activity; do not label it an independent context-free generation.

Implement response states explicitly: `queued`, `dispatching`, `running`, `waiting_for_input`, `waiting_for_approval`, `completed`, `failed`, `cancelled`, `rejected`, `reconciliation_required`. HTTP success can contain rejection/uncertainty. Expired operation retrieval has a retained-key tombstone; never interpret 410 as authorization to execute it again.

### Question answer

`POST /sessions/{session_id}/controls`:

```json
{
  "type":"input.respond",
  "commandId":"STABLE_COMMAND_UUID",
  "turnId":"OBSERVED_NATIVE_TURN_ID",
  "requestId":"CURRENT_QUESTION_ID",
  "requestRevision":1,
  "answer":"Blue"
}
```

Read the actual current IDs/revision from the snapshot/protocol event. `1` is just a schema example. Save command identity before submitting; a retry addresses the same question revision. Local native action may invalidate it while the request is in flight.

### Stop request

```json
{
  "type":"turn.cancel",
  "commandId":"STABLE_COMMAND_UUID",
  "turnId":"OBSERVED_NATIVE_TURN_ID",
  "reason":"User requested stop"
}
```

This uses the same controls route. Read the command and original operation to learn what happened. A transport cancellation in URLSession is unrelated to native cancellation. Session disable instead requires `administer`, `type: session.disable`, a stable command ID and nonempty reason; do not issue an administer key merely for a Stop button.

The default app should show disabled/unavailable approval action with “Open backend.” If later implementing enabled/qualified approvals, use the exact [decision contract](../api-guide.md#6-questions-stop-disable-and-approvals), current digest/revision/offered choice/expiry and a reviewed client policy. This design does not enable approvals on the current binding.

### Image request, later

Select a PNG/JPEG, compute `sha256:<64 lowercase hex>`, and send raw bytes with `Content-Type`, `X-Session-ID`, `X-File-Name`, `X-Content-SHA256`. Save returned attachment ID, commit the same SHA through the commit route, then include `{ "type":"image", "attachmentId":"...", "mimeType":"image/png" }` in prompt content. Upload acceptance is not proof of native staging. See the [image contract](../api-guide.md#7-images-and-artifacts) and exact support matrix before shipping this screen.

## 6. Persistence and recovery algorithms

### Proposed journal records

`InstallationProfile`: local ID, normalized public origin, approved identity origin, mode, selected paths, compatibility manifest reference, public CA identity.

`CredentialReference`: profile ID, human user ID, credential ID/kind, Keychain account reference, scopes, session/binding association, expiry. Store the actual secret only in Keychain.

`SubmissionIntent`: local UUID, profile/session/principal, binding context observed at preparation, original key/body/digest, prepared timestamp, send uncertainty, returned operation/command/prompt/turn IDs, last observed status and terminal evidence reference.

`Projection`: profile/principal/session, native item IDs/revisions, interaction state, snapshot watermark and committed event cursor. Keep projection changes and cursor advancement transactional.

`ControlIntent`: stable command/decision identity, exact addressed interaction/turn, original body, receipt/outcome. Controls also need crash recovery.

Draft data and transcript are sensitive; choose retention and backup behavior explicitly. Never store refresh/API tokens in these records. Separate journal storage from `bridge/src/storage/`'s durable device inbox.

### Submission recovery pseudocode

```text
on explicit Send:
    verify current UI readiness; server remains final authority
    create new local intent and request UUID
    commit original body, principal, session and observed context to journal
    dispatch original request with original key
    attach returned operation identity durably
    follow operation and session events until authoritative resolution

on transport failure or app restart:
    locate unresolved original intent
    if operation ID known and original principal usable:
        retrieve original operation
    else if original principal and intended original context remain recoverable:
        retry identical original request with same key
    else:
        display reconciliation required; do not create replacement intention
```

Do not automatically retry 4xx semantic refusals as new prompts. Respect rate/admission errors and documented retry timing where provided. Token refresh may repair authentication for the **same** principal; rotating to a new scoped key does not.

### SSE recovery pseudocode

```text
fetch authorized coherent snapshot
transaction: replace local projection and set snapshot sessionSeq
open authenticated events stream after committed decimal cursor
for each complete bounded frame:
    ignore heartbeat comment frames
    validate envelope and sequence
    skip already committed duplicate
    transaction: apply versioned event and advance cursor
on disconnect:
    back off with jitter and reconnect after committed cursor
on replay gap/conflict or repair requirement:
    obtain new snapshot; reconcile pending intents; replace projection
```

Use an incremental byte parser with limits before decoding unbounded lines. Handle chunk splits inside UTF-8 characters, `id`, `event` and multiline `data`. Never put bearer tokens in a query string. On profile/account switch, cancel the old reader and route late results by their original profile/principal rather than the currently visible view.

Suggested reconnect delay is an app policy, for example one second increasing to 30 seconds with jitter. It is not a server contract. Pause reconnect storms during sustained auth failures or sleep; resume with identity/capability refresh and original cursor after wake.

Important current limits: JSON request 1 MiB; native event frame about 1 MiB plus envelope; frozen result aggregate 36 MiB; public image aggregate 10 MiB PNG/JPEG; operation/generation/conversation retrieval seven days. Use the [full current limits](../support-matrix.md#5-limits-and-accounting) rather than these figures as a parser substitute. Versioned token estimates/quotas are server policy, not native provider billing measurements.

## 7. Implement local setup only after API correctness

### Preprovisioned installation path

1. User selects the installation's launcher and necessary configuration/state locations through UI.
2. Verify host signature/version, selected isolation directories, current signed VSIX manifest and reviewed public CA. A manifest is trusted only when its signature is verified against an independently trusted project public key, not a key downloaded beside it.
3. Open only the selected launcher/workspace. Request folder access narrowly; do not broaden macOS permissions as an automatic repair.
4. Display native setup checklist: Workspace Trust → provider configuration → task selection → companion profile → human sign-in → pairing → local control review.
5. After the Mac app's own sign-in, poll authorized session discovery with bounded backoff during setup. Offer manual refresh. Listing nothing is not permission to create a fake binding.
6. Inspect returned state/capabilities and load snapshot/SSE. Require real native acceptance before advertising Chat ready.

### Managed local startup path

Use existing deployment/provisioning as the reference, then implement a product coordinator rather than invoking arbitrary user-supplied shell text:

- Resolve verified executable/config paths; use `Process` argument arrays and explicit environment, never `sh -c` concatenation.
- Keep secrets in existing operator-managed private files. Do not read/echo them into app UI; do not place credentials on command-line arguments or in environment diagnostics.
- Select only the owned Compose project and reviewed configuration. Validate loopback bindings and private upstream allowlist.
- Inspect Docker engine first. Opening Docker Desktop can require the user's first-run setup; a launch success is not readiness.
- Serialize start/stop/upgrade/backup under an installation lock. Avoid running migrations/restores concurrently with startup.
- Start detached, observe bounded progress and inspect verified `/health` after service health. A timeout leaves a possibly running project; reconcile instead of blindly force-recreating it.
- Preserve existing state. Partial initialization should stop with an actionable repair path, not delete or regenerate databases/keys.
- Set the public CA environment only for the selected isolated editor process/extension hosts. Ensure process reuse has not retained the wrong environment.
- Keep background work independent of chat-window lifetime. Stop only the selected project's services after separate review of outstanding work.

The existing reference launcher is a compiled Mach-O app on macOS, not a shell script pretending to be an app bundle. Keep a future launcher signed and verifiable. Fail closed on an invalid host rather than falling back to the ordinary editor silently.

Full clean installation adds downloads, checksum/provenance review, path/folder access, certificate trust, package installation, first-run provider configuration, persistent identity provisioning, recovery from interrupted setup and distribution notices. Do not hide all that behind one unqualified “Install” button.

## 8. Proposed development stages and deliverables

| Stage | Build | Exit evidence |
|---|---|---|
| A — client foundations | Typed HTTP models, nonsecret profiles, Keychain abstraction, journal | Contract parsing and cross-profile isolation checks |
| B — human login | Registered callback, system browser, exchange/refresh/logout | Real Keycloak sign-in, invalid/expired callback rejection, existing callback regression |
| C — text chat | Session selection, scoped key, snapshot, stable prompt, operation display | One real harmless native text turn and same-key recovery without a duplicate |
| D — updates and controls | SSE reducer/replay, question answer, observed-turn stop | Native question/cancel receipts, restart/sleep/stream-gap recovery |
| E — guided backend setup | Exact launcher/manifest inspection, checklist, session discovery | Selected editor remains isolated; fresh human native consent observed |
| F — selected local startup | Docker/project coordinator and bounded health diagnosis | Existing state retained; interrupted start reconciled; scoped shutdown |
| G — optional features | Qualified images, composed generations or approval UI | Fresh affected exact-pin native/client qualification |
| H — client distribution | Signed app/helper, notices, updater, clean-host install/rollback | Client-specific distribution/lifecycle/recovery evidence |

Stages can be subdivided for development, but keep dependencies in this order. Do not mark a working preview using a fake adapter as a real Cline acceptance. No time estimate is implied; implementation scope depends especially on installer/distribution choices.

## 9. Test and acceptance matrix

Tests below are for a future implementation, not checks run during this documentation task.

| Area | Required meaningful scenarios |
|---|---|
| Authentication | Correct registered callback, wrong state/host/path, expired/replayed code, user cancellation, refresh race, server restart during attempt, lost exchange reply, Keychain failure |
| HTTP contract | Exact supported fields; unsupported options rejected; auth/scopes/ownership errors surfaced; bounded error/response parsing; real HTTPS validation |
| Prompt identity | Reply lost before/after admission, crash before saving response, same-key identical retry, body conflict, new deliberate identical text gets new key, rotation preserves uncertainty |
| SSE | Byte/UTF-8 splits, CRLF/LF, comments/multiline data, duplicates, replacements, cursor gap, oversized frame, auth withdrawal, sleep/wake, switching session during delivery |
| Native authority | Real connected exact pair, revoked device, lease loss, stale interaction, local takeover/task switch, two-session isolation, app capability refusal before effect |
| Controls | One current question answer, stale revision refusal, observed-turn cancellation with separate recorded/applied/terminal evidence; disabled approval UI |
| Storage/privacy | Projection/cursor transaction failure, corrupted journal recovery, account/origin partitioning, no secret diagnostics, local cache deletion leaves server/native history intact |
| Local lifecycle | Engine unavailable, port collision, partial setup refusal, start timeout with already-running services, invalid host signature, wrong extension directory, shared Docker engine retained |
| Distribution | Verified update artifacts, clean install, compatible rollback, uninstall preserves unrelated apps/history, explicit selected-key cleanup, macOS folder/trust requests scoped |

Begin real native tests with a disposable Cline task and harmless text. File/tool effects, additional control categories, replacement backends and software/trust changes need explicit reviewed scope. Record exact app/editor/Cline/companion/API/server/gateway versions, artifact hashes, endpoint identity, grants and observed receipts. Separate fixture tests from real-host tests and say what was not exercised.

## 10. Beginner acceptance walkthrough for the future app

A developer can use this script for a novice participant after implementing the app:

1. Launch the app and select the prepared installation. Explain “server handles messages; VS Code/Cline does the work.”
2. If offered managed local startup, read the displayed scope and start the selected services. Wait for verified Server reachable.
3. Open the backend using the app. Confirm it is the isolated VS Code window, with the exact extensions.
4. Follow native provider/project/task setup. Enter provider secrets only in the provider/native flow.
5. Connect the selected task through the bridge. Enter SDC password only in the browser. Read and approve only the intended native categories.
6. Return to the Mac app, sign it in through its own browser flow and choose the visible authorized session.
7. Send a harmless message and distinguish Accepted/running from Completed. Confirm Cline shows the corresponding work.
8. Answer an actual current native question through the app. Request stop on an observed turn and inspect the eventual outcome.
9. Disconnect the network or quit/reopen the app during a request. Confirm original-intention recovery without a second native prompt.
10. Sign out of the app. Confirm the backend is not silently shut down and other profiles' tokens/history were not erased.

Record where the participant gets stuck. A developer successfully following their own checklist is not a beginner usability test.

## 11. Changes needed in this repository

| Area | Necessary for basic app? | Proposed change |
|---|---|---|
| New Mac client code | Yes | New app/client modules; own UI, API models, journal and Keychain |
| OIDC callback deployment config | Yes for native app browser login | Exact new redirect in server/Keycloak, app URL handling, regression checks |
| Existing public chat API | No new endpoint required for basic chat | Consume existing contract; fix only demonstrated compatibility defects |
| Cline maintained patch | No | Preserve current adopted native API and hashes |
| Companion extension | No for checklist/manual setup | Optional future narrow nonsecret setup handoff only after review |
| Server startup API | No | Same-user local coordinator; no new unauthenticated lifecycle HTTP route |
| Neutral protocol/adapters | No for UI alone | Preserve vendor-neutral dependency boundaries |
| New native task API/provider-secret API | Not part of initial app | Separate feasibility/security/native acceptance if later requested |
| Release scope/tracker | Design only now | Later explicit implementation scope; preserve existing IDs/statuses |

The practical first result is a native Mac chat window that uses the existing APIs and existing consented backend. The later setup coordinator can make preparation easier without replacing that backend or bypassing its consent.

[Research/contract audit](../../../evidence/research/macos-client-2026-10-11/README.md) documents the sources and limits of this proposal. No runtime test, app implementation or client acceptance is claimed here.
