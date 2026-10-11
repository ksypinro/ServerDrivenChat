# API, SDK and coding-client guide

This guide is for someone writing an integration. First complete the graphical [user guide](user-guide.md): an existing native Cline task must be selected and locally consented. An API request cannot install Cline, select a different native task or bypass native permission. All example requests go to the existing application through the server.

An **API** is an application's structured interface. **REST** uses ordinary HTTP requests with JSON. **SSE** keeps a connection open to receive events. An **SDK** wraps these requests in a programming language. The restricted OpenAI/Anthropic formats here are service profiles, not connections to those vendors' hosted models.

## Contents

- [1. Addresses and prerequisites](#1-addresses-and-prerequisites)
- [2. Sign-in and scoped credential ownership](#2-sign-in-and-scoped-credential-ownership)
- [3. Discover the session and read its capabilities](#3-discover-the-session-and-read-its-capabilities)
- [4. First-party prompt and desktop event flow](#4-first-party-prompt-and-desktop-event-flow)
- [5. Retries, timeouts and operation states](#5-retries-timeouts-and-operation-states)
- [6. Questions, stop, disable and approvals](#6-questions-stop-disable-and-approvals)
- [7. Images and artifacts](#7-images-and-artifacts)
- [8. Runnable Node SDK and REST examples](#8-runnable-node-sdk-and-rest-examples)
- [9. History, instructions, tools and response lineage](#9-history-instructions-tools-and-response-lineage)
- [10. Provider streaming, budgets and errors](#10-provider-streaming-budgets-and-errors)
- [11. Pinned Aider text/whole-file profile](#11-pinned-aider-textwhole-file-profile)
- [12. Schema reference and extension work](#12-schema-reference-and-extension-work)

## 1. Addresses and prerequisites

| Interface | Accepted local base URL | What you use it for |
|---|---|---|
| Browser control UI | `https://localhost:15943` | Everyday graphical messages/control |
| First-party REST/SSE | `https://localhost:15943/api/v1` | Sessions, snapshots, events, commands, operations, credentials, attachments and generations |
| OpenAI SDK | `https://localhost:15943/openai/v1` | Chat Completions and Responses profile |
| Anthropic SDK | `https://localhost:15943/anthropic` | SDK appends `/v1/messages`, `/v1/models` and `/v1/messages/count_tokens` |

Use the public TLS address from the client. Do not target `http://server:3000`, `gateway:8000`, the PostgreSQL database or a private native socket. The container HTTP hop is an operator-fixed allowlisted origin on an isolated network, not a client-configurable bypass.

Before making a request, obtain:

1. A live graphically consented native binding, with the required control categories.
2. An owner-issued **SDC scoped credential** and its credential ID/expiry. It is an `sdc_api_…` secret, not an OpenAI or Anthropic API key.
3. The authorized `sessionId`, discovered through `/sessions`. Its key is also fenced to a particular `bindingId`.
4. The approved public CA configuration for your client runtime.
5. A stable request key for each intentional generation/prompt. Save it before the first send.

The model/provider account Cline already uses stays configured in Cline. The API key authorizes access to that task; it does not select an upstream vendor/model or provide a replacement model account.

## 2. Sign-in and scoped credential ownership

There are three distinct credentials. Do not interchange them.

| Credential | Held by | Purpose |
|---|---|---|
| Human access/refresh token | Authorized browser/native sign-in client | Human-owner management such as issuing/revoking caller keys and server pairing |
| Device credential | Companion SecretStorage | Authenticated bridge delivery/lease/event return |
| Public `sdc_api_…` key | Authorized API consumer | The selected session/binding and a restricted scope subset |

The graphical browser UI has **no public API-key management panel** in this release. A human-owner integration/operator uses the existing public management endpoints. Do not search for an undocumented button or copy the companion's saved device token.

### Human browser sign-in for an integration

The following is a protocol sequence for a developer-built sign-in UI, not a terminal workaround for native consent:

1. Register an exact callback with the identity/server operator. The current companion callback is `http://127.0.0.1:15945/callback`; the current control-page callback is `https://localhost:15943/`. Do not invent a wildcard or reuse an already listening callback in a second application.
2. `POST /api/v1/auth/signin/start` with `{"redirectUri":"<exact registered callback>"}`. Retain the returned state and open `authorizationUrl` in the user's browser.
3. The user enters their existing local credentials in the real identity page. Do not send passwords in prompts or API JSON.
4. At the registered callback, verify state and call `POST /api/v1/auth/signin/exchange` with `{"state":"<original state>","code":"<returned code>"}`. The server owns the PKCE verifier, nonce and provider validation. Do not log callback URLs/code/state or returned tokens.
5. Keep human tokens in the client's protected credential storage. Refresh through `/api/v1/auth/signin/refresh` using its `userId` and refresh token. An inactive/expired refresh requires browser reauthentication.

The native companion performs server pairing and a **separate graphical local confirmation**. `/pairings` and `/confirm` do not replace that confirmation; no public local-confirm bypass is offered by the gateway. CORS is not enabled for arbitrary websites: a cross-origin browser application needs an explicit reviewed integration, rather than adding a wildcard.

### Issue a caller key

With the human owner's bearer token, `POST /api/v1/credentials`:

```json
{
  "sessionId": "YOUR_DISCOVERED_SESSION_ID",
  "label": "My text client",
  "scopes": ["view", "prompt"],
  "expiresAt": "A_FUTURE_ISO_8601_UTC_TIME_WITHIN_30_DAYS"
}
```

These capitalized strings are placeholders; substitute real values before sending. The session must have an active binding. Every key must include `view`; scopes must be unique. Use a short expiry appropriate to the intended work. The secret is revealed **once**. Save the separate `credentialId`, expiry and binding/session metadata so you can revoke and diagnose it later; listing keys never returns the secret/hash.

| Scope | Permits within the already authorized session | Does not permit |
|---|---|---|
| view | Discovery/read/history/results/events | Prompt or authority changes |
| prompt | Prompt/generation and supported answer/cancel controls | Native tools automatically allowed |
| approve | Supported exact approval decisions, when enabled/qualified | Persistent/narrowed grants |
| administer | Supported session administration | Delegating credentials, pairing, membership management or device revocation with a caller key |

The effective permission is the intersection of the owner's role, caller scopes, active binding/lease, locally consented categories and native capability. Granting `approve` does not enable a locally disabled approval category.

### Rotate or revoke a key

The human owner lists metadata with `GET /api/v1/credentials`, issues a replacement explicitly, then calls `POST /api/v1/credentials/{credentialId}/revoke` with `{}` for the old key. Caller keys cannot delegate keys or revoke devices. Device revocation uses the owner's `POST /api/v1/devices/{deviceId}/revoke` route; the companion's graphical forget command also removes its selected saved secrets/inbox.

Revocation blocks future authorized use; it does not undo or automatically abort an already admitted native effect. A replacement key has a different principal. It cannot retrieve old key-owned operation/generation/conversation IDs just because it points to the same task. Plan recovery before rotation; the authorized human owner retains access to the task transcript.

## 3. Discover the session and read its capabilities

Send `Authorization: Bearer <SDC credential>` to the first-party API. The following endpoints are reads:

- `/health`: server health only; not proof that a native task is ready.
- `/identity`: current credential kind, scopes and session association.
- `/sessions`: authorized sessions, not every user's tasks.
- `/sessions/{sessionId}` and `/capabilities`: current binding, lease and capability reasons.
- `/sessions/{sessionId}/snapshot`: coherent session/bindings/interactions/projection and watermark.
- `/sessions/{sessionId}/transcript`: versioned transcript projection with explicit partial/repair information.
- `/models`: authorized first-party binding aliases, such as `sdc.<bindingId>`.

Provider discovery exposes the restricted `sdc-default` alias only when authorized. Use it with a session-scoped key. A human first-party generation request also needs an explicit `sessionId`. `providerReady: false` describes raw native export limits; inspect the separate `serverPolicy` and gateway profile matrix rather than treating that flag as a universal provider failure.

Shared task view includes its existing history. Different scoped API conversation IDs do not erase or isolate Cline's hidden underlying task history.

## 4. First-party prompt and desktop event flow

### Submit one intended prompt

`POST /api/v1/sessions/{sessionId}/prompts` with a bearer credential, `Content-Type: application/json`, a retained `Idempotency-Key`, and optionally `Prefer: wait=30`:

```json
{
  "model": "sdc-default",
  "content": [{"type": "text", "text": "Do not use tools or change files. Reply READY only."}],
  "delivery": "queue"
}
```

A `202` response means the operation is retained and may still be running. `200` after a bounded wait can represent completed, rejected or reconciliation state; inspect `status`, not HTTP success alone. Save `operationId`, `commandId`, `promptId`, `turnId`, binding revision/lease generation and the request key.

Retrieve `/operations/{operationId}` with the **same principal**. The operation separates `commandState`, terminal evidence and completed/partial output. `result.answer` is a convenience selection after verified native completion, not the last text currently visible in the task.

### A desktop client's update loop

There is no new desktop frontend in this release. A developer can implement this loop over the public API:

1. Fetch the authorized snapshot. Read `watermark.sessionSeq`.
2. Subscribe to `/sessions/{sessionId}/events?after=<that decimal sequence>`, or set decimal `Last-Event-ID`.
3. Parse **complete SSE frames** across arbitrary network chunks. Ignore heartbeat comments; process event data and decimal IDs. A network chunk is not necessarily one event.
4. Apply the versioned event to your projection. Outputs can be partial or replaced; do not blindly append every text fragment.
5. Save the last fully processed event sequence with your local projection. Do not advance the cursor before durable application.
6. Reconnect from that cursor after interruption. A cursor ahead/gap is an explicit conflict; fetch a new consistent snapshot and reconcile instead of inventing missing events.
7. Handle capability/authority changes independently from prompt waits. A revoked/expired key may lose reads or stream access; closing a stream does not cancel retained work.

The first-party stream contains native protocol event records. Provider streams below instead serialize terminal committed results. Do not use provider token deltas to reconstruct the first-party native transcript.

## 5. Retries, timeouts and operation states

An **idempotency key** names one intention. Generate/save it once before the first submission, then reuse it with the identical normalized body, same principal and intended original context when retrying. Use a new key for a genuinely new submission, even if the wording is identical. Keys accept 1–128 letters/digits or `._:-`.

| Outcome | What it means | Next action |
|---|---|---|
| queued / dispatching | Retained/admitted, not yet terminal | Read the original operation; do not submit a second intention |
| running | Native work observed | Wait/stream, or explicitly cancel the observed turn if appropriate |
| waiting_for_input / waiting_for_approval | Exact pending interaction needs handling | Inspect current snapshot and capability; answer/decide once with exact IDs |
| completed | Verified terminal native completion and frozen result | Consume completed items/answer and watermark |
| failed / rejected | Inspect reason and terminal/pre-effect evidence | Repair readiness/unsupported input before a new deliberate submission |
| cancelled | Cancellation outcome reported with evidence | Inspect backend/native receipts if actual stop matters |
| reconciliation_required | Effects/outcome uncertain | Do not replay; inspect native task and retained evidence |
| Request timeout, lost HTTP reply, gateway disconnect/502 | You stopped waiting; admission may already have happened | Retrieve the saved operation/response or retry the same body/key; do not generate a replacement key |
| Changed body with same key | Identity conflict | Restore the original body for recovery; use a new key only for a new intention |
| `410 OPERATION_EXPIRED` | Retrieval period expired, original key retained as a tombstone | Reconcile original work; expiry is not permission to rerun it |

Public-enabled sessions allow one outstanding prompt across GUI, REST and provider ingress. An `applied` command does not release that lane: actual terminal or pre-effect rejection evidence is needed. Controls use a separate lane/capacity so a waiting prompt does not itself disable them. An unknown native effect can intentionally keep new prompts blocked.

Operations/generations/conversations have seven-day retrieval retention. Server records and authority have additional capacity limits; no automatic history deletion/archival policy is implemented. [Full limits](support-matrix.md#5-limits-and-accounting).

## 6. Questions, stop, disable and approvals

Read the current snapshot first. Copy the exact pending interaction's native `turnId`, `requestId`, revision, action digest, offered choice and expiry. Never guess IDs from a displayed short label.

### Question answer

`POST /sessions/{sessionId}/controls`:

```json
{
  "type": "input.respond",
  "commandId": "YOUR_STABLE_COMMAND_UUID",
  "turnId": "CURRENT_OBSERVED_TURN_ID",
  "requestId": "CURRENT_PENDING_REQUEST_ID",
  "requestRevision": 1,
  "answer": "Blue"
}
```

The revision `1` is illustrative; use the actual current value. The answer must be nonempty text. Reuse the command ID for the same addressed retry. A local answer or task switch can invalidate the pending request.

### Observed-turn stop

```json
{
  "type": "turn.cancel",
  "commandId": "YOUR_STABLE_COMMAND_UUID",
  "turnId": "CURRENT_OBSERVED_TURN_ID",
  "reason": "User requested stop"
}
```

The returned `state: recorded` and `nativeApplied: false` do not confirm cancellation. Read `/sessions/{sessionId}/commands/{commandId}`, operation state and native terminal evidence. Session disable instead uses `type: session.disable`, the stable command ID and nonempty `reason`, with administer authority. Local companion Disconnect is the immediate offline delivery fence.

### Exact approval decision

Only a separately enabled/qualified approval binding can use `/sessions/{sessionId}/approvals/{requestId}/decisions`. The default current local profile has approvals disabled. A complete structural example is:

```json
{
  "decisionId": "YOUR_STABLE_DECISION_UUID",
  "requestRevision": 1,
  "actionDigest": "CURRENT_ACTION_DIGEST",
  "choiceId": "deny",
  "grantedPermissions": [],
  "policyRevision": "YOUR_REVIEW_POLICY_REVISION",
  "expiresAt": "UTC_TIME_NO_LATER_THAN_THE_CURRENT_REQUEST_EXPIRY"
}
```

Use only a currently offered choice, the actual revision/digest and a documented client review-policy revision. The supported native effects are whole-action once and deny; grants are empty for this route. The server signs the authorized reviewer identity. Recorded/identical decision status is separate from a native applied receipt. [Exact historical executable driver](../../scripts/m30-native-firstparty.mjs); do not run that destructive disposable probe as a normal client.

## 7. Images and artifacts

The public image flow is upload → commit → submit a reference. It does not download arbitrary remote media.

1. Compute SHA-256 over your PNG/JPEG bytes.
2. `POST /api/v1/attachments` with the raw bytes, bearer credential, MIME content type, `X-Session-ID`, `X-File-Name` and `X-Content-SHA256: sha256:<64 lowercase hex characters>`.
3. Save the returned `attachmentId`; upload admission alone is not a native delivery receipt.
4. `POST /attachments/{attachmentId}/commit` with `{"sha256":"sha256:<the same digest>"}`.
5. In first-party `content`, use `{"type":"image","attachmentId":"<id>","mimeType":"image/png"}` or JPEG.
6. For provider profiles, use `sdc-attachment://<attachment UUID>?mime=image/png` or `image/jpeg` in the supported image URL/reference field.

Attachment ownership, session, checksum, MIME, retention and aggregate byte limits are checked. Native staging is a separate validated receipt. External URLs, data/base64 URLs and provider file IDs are rejected. Downloads use the authorized `/attachments/{attachmentId}` route. The current native-media evidence/pin limits are in the [matrix](support-matrix.md#3-media-and-control-boundaries); M25 does not widen them.

## 8. Runnable Node SDK and REST examples

These are developer clients. They do not configure a model executor or grant native permissions. Run them from the repository with its locked Node **24**/npm **11** dependency installation; package versions are `openai 7.30.0` and `@anthropic-ai/sdk 0.132.1`.

Have the owner save the scoped key in a private file outside the checkout, accessible only to that user (mode `0600`). Do not put a secret literal into a command/history or an example file. The examples read `SDC_KEY_FILE` and do not print it. The example file below is a path you must replace with your actual protected file:

```sh
export SDC_ORIGIN=https://localhost:15943
export SDC_KEY_FILE=/absolute/private/path/my-sdc-key.txt
export NODE_EXTRA_CA_CERTS=/Users/samin/Documents/ServerDrivenChat-local/m24/tls/ca.pem
export SDC_SESSION=YOUR_DISCOVERED_SESSION_ID
```

`NODE_EXTRA_CA_CERTS` contains the **public CA path**, not a private key. Set it before starting Node. Certificate validation stays enabled. Do not use `NODE_TLS_REJECT_UNAUTHORIZED=0` or an insecure fetch client.

### Read a first-party snapshot

```sh
node docs/guide/examples/rest-text.mjs snapshot
```

This prints only summary IDs, binding states and watermark, rather than the whole task history.

### Submit and retrieve a first-party operation

```sh
export SDC_REQUEST_KEY=m25-rest-EXAMPLE-UNIQUE-1
node docs/guide/examples/rest-text.mjs prompt
# Save the returned operationId, then substitute it here:
export SDC_OPERATION=YOUR_RETURNED_OPERATION_ID
node docs/guide/examples/rest-text.mjs operation
```

Choose a unique safe key before a new intention. Do not blindly reuse these example literals across unrelated work. The example sends the fixed text-only `M25-REST` prompt, bounded-waits for up to 30 seconds and prints the current operation. If still running, retrieve it; do not send a new request just to wait.

### OpenAI Chat, Responses and Anthropic Messages

```sh
export SDC_REQUEST_KEY=m25-chat-EXAMPLE-UNIQUE-1
node docs/guide/examples/sdk-text.mjs chat

export SDC_REQUEST_KEY=m25-responses-EXAMPLE-UNIQUE-1
node docs/guide/examples/sdk-text.mjs responses

export SDC_REQUEST_KEY=m25-anthropic-EXAMPLE-UNIQUE-1
node docs/guide/examples/sdk-text.mjs anthropic
```

Each is a separate intention and needs its own key. Each asks for an exact harmless text reply and disables automatic SDK retries so you can inspect recovery explicitly. If a run fails ambiguously, retain its original key/body. Changing a mode changes the body and is not a retry.

The clients use `X-SDC-Context-Mode: shared-task` because they address an existing graphical task. The default `exclusive` mode reserves a stateful binding for one server-owned conversation. A server conversation is not an isolated fresh native Cline context.

### Python SDK configuration

The exact locked test consumers are OpenAI **3.26.0** and Anthropic **1.12.1** in `api-gateway/uv.lock`. A client must configure an HTTPX verified SSL context for the private CA; do not assume Python uses macOS or Node trust automatically:

```python
import ssl
import httpx
from openai import OpenAI
from anthropic import Anthropic

ca_context = ssl.create_default_context(
    cafile="/Users/samin/Documents/ServerDrivenChat-local/m24/tls/ca.pem"
)
# sdc_key and original_request_key come from your protected credential/request store.
openai_client = OpenAI(
    api_key=sdc_key,
    base_url="https://localhost:15943/openai/v1",
    http_client=httpx.Client(verify=ca_context, trust_env=False),
    max_retries=0,
    default_headers={"X-SDC-Context-Mode": "shared-task"},
)
result = openai_client.responses.create(
    model="sdc-default", input="Reply briefly without tools or file actions.",
    extra_headers={"Idempotency-Key": original_request_key},
)
print(result.output_text)

# For a separate intended Messages request, use a different saved request key.
anthropic_client = Anthropic(
    api_key=sdc_key,
    base_url="https://localhost:15943/anthropic",
    http_client=httpx.Client(verify=ca_context, trust_env=False),
    max_retries=0,
    default_headers={"X-SDC-Context-Mode": "shared-task"},
)
# Close both clients when finished; their HTTP clients own connection resources.
openai_client.close()
anthropic_client.close()
```

This configuration snippet leaves credential/request retrieval to your application; it is not a complete sign-in utility. Python fixtures are distinct from the current Node/native acceptance. The runnable Node examples are checked against the current deployment; see [M25 verification](../../evidence/M25/README.md).

## 9. History, instructions, tools and response lineage

The TypeScript server owns canonical API history, instructions, tool IDs/results, aliases, response lineage and budgets. Provider field spelling stays at the FastAPI boundary; persisted policies remain neutral.

For Chat or Messages continuations, preserve the exact previous canonical messages/results and append the new input. For Responses, use the current head's `previous_response_id` and new input. For first-party generations, continue through `parentId` plus new input, or `conversationId` plus complete canonical history. Do not edit earlier history, rewind or branch an old head on the reserved stateful binding; those requests conflict. Current Responses instructions are used for the current turn; previous instructions are not automatically reapplied.

Caller functions, when qualified, are **proposals** with server-issued IDs. Your caller validates the intended effect, executes it under its own permissions, and supplies an addressed success/error result. Repeated identical results are idempotent; changed results or foreign IDs conflict. An observed native Cline tool is never a caller function. The exact API 1.3 tool-denial boundary and server publication guards need binding qualification; the default M24 binding withholds the profile.

“Strict” caller-schema validation means the server validates before publishing a call. It does not promise native strict JSON decoding or a vendor's full structured-output implementation. Malformed replies/selection/parallel violations fail as backend contract errors, not fabricated successful calls.

## 10. Provider streaming, budgets and errors

The OpenAI/Anthropic profiles are **terminal-buffered**. Native partial/replaced text stays internal until an immutable server result is committed; provider SSE then emits deterministic chunks. This avoids publishing speculative content that later needs retraction. Do not describe it as live vendor-token streaming.

| Profile | Supported recovery/terminal behavior |
|---|---|
| Chat | Role/content/function deltas, finish reason, optional final usage, then `[DONE]` on success. Failure/cancel/deadline sends an error and closes without a success finish or `[DONE]`. Retry the original request/key after loss |
| Responses | Created/progress and committed output events. Retrieve original ID; `stream=true&starting_after=<sequence>` or `Last-Event-ID: <response ID>:<sequence>` replays deterministic scoped events. Cancellation is an error event, not invented completion |
| Anthropic | Message/content block events for committed output. An error closes without `message_stop`. Supply exactly one bearer or `x-api-key` credential and wire version `2023-06-01` |

Responses supports background work and `/responses/{id}/cancel` only for a background response. First-party `/generations/{id}/cancel` also applies to background generations. Public cancellation/limit settlement can precede actual backend stop: inspect `sdc.backend_status`/`backendStatus` and native evidence.

Python OpenAI 3.26.0's `get_final_response()` expects a `response.completed` event. For incomplete/failed/cancelled streams, inspect typed terminal events or retrieve the original response instead of treating a missing accumulator result as a new intention.

Standard token counters contain **estimated server policy units** (`sdc-text-v1`), not provider billing or native tokenizer output. A 1,024-unit image allowance is an estimate. Native hidden context, reasoning/cache and actual costs are unknown. The default input/output/deadline policy is 32,768/8,192 units/600 seconds. Output clipping/deadline settlement is not a hard limit on native generation or billing.

| HTTP/code class | Meaning and response |
|---|---|
| 400/422 invalid or unsupported fields/options | Correct the schema; unsupported options are refused before dispatch |
| 401 authentication / 403 forbidden | Expiry/revocation/scope/owner boundary; do not keep sending the same secret indefinitely |
| 404 resource unavailable | Absent or outside caller ownership; do not enumerate another user's IDs |
| 409 conflict, including context/key/native readiness | Reconcile the original request/history/binding; inspect exact code/message |
| 410 expiry | Original identity retained as tombstone; do not rerun by inventing a key |
| 413/415 | Body/media size or encoding/type rejected |
| 429 | Rate or relay/storage capacity; bounded backoff with original key/body |
| 501 or capability/native-policy error | Capability absent/unverified; changing a prompt is not a native permission grant |
| 502/network timeout | Upstream outcome may be ambiguous; recover original operation/key |

Inspect each returned error envelope. First-party errors have SDC codes; provider profiles use their declared error shapes. Supported options are listed in the [field matrix](support-matrix.md#4-request-field-matrix). Unknown fields are not silently ignored.

## 11. Pinned Aider text/whole-file profile

This is a **historically accepted developer client subset**, not a new current-M24 Aider/TLS claim. Aider 0.86.2 on Python 3.12.15 passed two local whole-file edits for each text profile through its exact repository shim and settings. Aider itself applied the edits; Cline emitted no new native tool activity. [Client matrix](../../evidence/M30/client-matrix.json).

Use `tests/clients/aider/sdc_aider.py` and `model-settings.yml` after `uv sync --locked` in that directory. Do not use an unmodified client: it omits `Idempotency-Key` and sends unsupported temperature. The shim preserves one key through the same in-process send/retry and assigns a different key to a later submission. It loses that recovery identity on process loss; ambiguous process-loss retry is not accepted.

The tested invocation shape is shown below. It writes the selected local file, so use a disposable project/file and deliberate local authorization. `OPENAI_API_KEY` holds a scoped **SDC** key. For local TLS, `SSL_CERT_FILE` is the approved public CA file for Python's default verified context; do not disable verification. Endpoint substitution to the M24 TLS target requires its own client acceptance before expanding the support claim.

```sh
# Developer setup: in tests/clients/aider, using its locked Python 3.12.15 environment.
# Set OPENAI_API_KEY securely in the child environment, never as a command literal.
export SSL_CERT_FILE=/absolute/path/to/the/approved/public-ca.pem
./.venv/bin/python sdc_aider.py \
  --model openai/sdc-default \
  --openai-api-base https://localhost:15943/openai/v1 \
  --model-settings-file model-settings.yml \
  --config empty-config.yml --env-file /dev/null \
  --edit-format whole --no-git --no-stream --no-auto-commits \
  --no-auto-lint --no-suggest-shell-commands --no-check-update \
  --no-analytics --no-notifications \
  --chat-history-file /absolute/disposable/project/chat.history.md \
  --input-history-file /absolute/disposable/project/input.history \
  /absolute/disposable/project/example.py
```

This interactive variant keeps local edit confirmation. The original disposable acceptance additionally used `--yes-always` for specifically authorized test-file effects; that is not needed for beginner use. For the Messages variant use `--model anthropic/sdc-default`, remove `--openai-api-base`, set `ANTHROPIC_API_BASE=<origin>/anthropic` and supply only `ANTHROPIC_API_KEY` to that child. Restore the same chat history deliberately for turn two. The [original client README](../../tests/clients/aider/README.md) and [runner](../../scripts/m30-aider-native.mjs) retain the exact tested flags/topology.

## 12. Schema reference and extension work

[Generated OpenAPI](../../api-gateway/openapi.json) is the request/response reference. M25 captured the deployed gateway schema and verified it equals the checked-in schema: [deployed OpenAPI](../../evidence/M25/deployed-openapi.json). It has 42 paths; reading a schema does not establish native behavior.

The local proxy publishes the product/provider routes, not a documented Swagger/OpenAPI browser endpoint. Open the checked-in JSON file or render it in your development tooling. `/openapi.json` on the product origin is not advertised as a public schema route. An operator can regenerate the schema from the pinned gateway container; see the [maintainer guide](maintainer-guide.md#4-maintain-schemas-and-guides).

New fields, client features, tool qualification and independent native sessions need explicit implementation/acceptance. Do not enable them through documentation or assume full vendor-product compatibility. Current [first-party](../public-rest-api.md), [OpenAI](../openai-api-profile.md) and [Anthropic](../anthropic-api-profile.md) specifications retain deeper contract detail.
