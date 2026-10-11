# M27 first-party REST contract

> **Current integration guide:** [API/client walkthrough](guide/api-guide.md), [exact field/client matrix](guide/support-matrix.md) and [M24 final deployment](../evidence/M24/persistent-local/final-acceptance.json). The current base is `https://localhost:15943`; historical loopback examples and milestone pins below retain their original context.

> **Implementation status (2026-10-10):** [DECISION-010](decisions/010-server-owned-api-semantics.md) assigns public conversation/tool/alias/budget/accounting policies to the server. M27–M30 are Done for their recorded subsets. [M30 acceptance](../evidence/M30/README.md) covers real Cline first-party/provider text, media, controls, exact API 1.3 caller-tool ownership, recovery and pinned Aider text edits. M24 is complete for the selected local deployment; Internet production remains outside its acceptance.

Recorded 2026-10-08. M27 is **Done** under [DECISION-010](decisions/010-server-owned-api-semantics.md), including real native connection/control/history/media/recovery acceptance. Server-owned composition/history/tools/estimated-budget policies are implemented below. The historical API 1.2 Cline binding withholds caller tools; the separately adopted M30 API 1.3 candidate passed exact disposable native effect ownership. M24 accepted the selected persistent local deployment; no Internet production claim is made.

## Ownership and authentication

Clients call `/api/v1` on FastAPI. It forwards only the client's bearer identity over bounded HTTP/SSE to `/v2/public` on the TypeScript server. Browser-mediated sign-in and server-side pairing use the existing `/v2/auth/oidc` and `/v2/pairings` seams. The gateway has no database driver, credentials of its own, operation cache, model SDK, native socket or executor. TLS verification is enabled; redirects, environmental proxies and automatic POST retries are disabled.

Human identity comes from the existing provider verification. The human owner can issue a random `sdc_api_` caller credential, revealed once, stored as SHA-256, expiring within 30 days. Its immutable owner, session, **consented binding** and subset of `view`, `prompt`, `approve`, `administer` restrict access. Every key includes `view`. Keys cannot pair devices, delegate keys, change memberships or revoke devices. Rotation means issue a new key and explicitly revoke the previous one; old operation IDs remain owned by their original principal.

Authorization is rechecked before/after reads, during waits/streams, inside write transactions and at native dispatch. A key cannot follow a replacement binding. An offline original binding's operation remains observable until a new binding replaces its authority; the human owner retains the authorized transcript. This profile controls a shared existing task: granting task view also grants its history. It does **not** provide independent underlying task histories or provider isolation. Public operation and conversation IDs remain scoped to the issuing credential; a second credential on the same task cannot retrieve them by ID.

A dispatch permit now names `commandId`. The server holds the credential/binding/session authority through the short admission window, bounded to 10 seconds and any earlier credential/lease expiry. Revocation linearizes against an admitted native mutation; it does not retroactively cancel native work. Public-enabled sessions reject old companions that omit the command fence. Companion **0.6.0** and frozen Cline API 1.2 have the recorded M27 native acceptance; historical packages are preserved. [M30's disposable acceptance](../evidence/M30/README.md) additionally passed first-party, OpenAI and Anthropic text/image/streaming requests and pinned Aider 0.86.2 whole-file edits on the installed Cline binding. Its unresolved gates remain explicit there.

## Routes and schemas

[Generated OpenAPI](../api-gateway/openapi.json) freezes the actual request schemas. The earlier research route names were provisional. The final M27 names use `/credentials` and `/auth/signin`; M28 adds `/openai/v1`, and M29 adds `/anthropic/v1`. See the [OpenAI profile](openai-api-profile.md) and [Anthropic profile](anthropic-api-profile.md).

| Route under `/api/v1` | Contract |
|---|---|
| `GET /health` | Minimal upstream health, no inference/readiness claim |
| `GET /identity`, `/capabilities` | Caller scope; declared baseline field matrix and bounds |
| `POST /auth/signin/start`, `/exchange`, `/refresh` | Existing browser OIDC/PKCE flow; synthetic tests do not establish a live realm |
| `POST /pairings`, `/pairings/{id}/confirm` | Human server confirmation; native graphical local confirmation remains required |
| `POST /credentials`, `GET /credentials`, `POST /credentials/{id}/revoke` | Human owner management; list never reveals secret/hash |
| `GET /sessions`, `/sessions/{id}`, `/sessions/{id}/capabilities` | Authorized task/binding/capability discovery, including offline state |
| `GET /models`, `/models/{id}` | `sdc.<bindingId>` aliases of consented tasks; no arbitrary upstream model switching |
| `GET /sessions/{id}/snapshot`, `/transcript` | Consistent durable snapshot and revision-aware transcript projection; `needsRepair` is explicit |
| `GET /sessions/{id}/events` | SSE replay of complete versioned events; native output can be replaced |
| `POST /sessions/{id}/prompts` | Typed text/committed PNG/JPEG submission with mandatory `Idempotency-Key` |
| `GET /operations/{id}` | Original principal's durable status/result; no previous-turn answer |
| `POST /sessions/{id}/controls` | Exact text question answer, observed-turn cancellation or disable; client-stable `commandId` |
| `POST /sessions/{id}/approvals/{requestId}/decisions` | Exact revision/digest/choice/expiry; server signs reviewer identity; whole-action `allow_once`/`deny` only |
| `GET /sessions/{id}/commands/{commandId}` | Recorded command and separate observed acknowledgement; no inferred native effect |
| `POST /devices/{id}/revoke` | Human owner revocation; native cancellation is not claimed |
| `POST /attachments`, `/attachments/{id}/commit`, `GET /attachments/{id}` | Private checksummed PNG/JPEG bytes, explicit commit, owner/session checks; native staging is a separate receipt |

Prompt request:

```json
{"model":"sdc.<consented-binding-id>","content":[{"type":"text","text":"Explain the authentication boundary."}],"delivery":"queue"}
```

Send `Authorization: Bearer <SDC credential>`, `Idempotency-Key: <stable caller key>` and optionally `Prefer: wait=30`. The gateway rejects unknown fields, unsupported roles/history/tools/options, wrong content types and unknown controls before forwarding. The server repeats preflight before admission. Cline question answers require nonempty text. Whole-action approval rejects narrowed/persistent grants before dispatch. Unsupported native capabilities do not become prompt hints.

## Operations, retries and results

Migration [008](../server/migrations/008_public_operations.sql) atomically stores normalized request fingerprint, caller identity/key, original operation/command/prompt/turn IDs, binding/revision/lease, admission watermark and expiry alongside the command. Identical retries return original work across processes/restarts. Changed content conflicts. An expired key remains a tombstone (`410 OPERATION_EXPIRED`), never authorization to generate a replacement command.

The first successful public admission activates a durable one-outstanding-prompt policy for that session. It examines prior GUI/low-level work too, and all subsequent ingress shares the same transactional guard. `applied` command acknowledgement does not release the reservation: verified terminal turn evidence or pre-effect rejection is required. Uncertain effects remain blocked for reconciliation. Controls have independent lanes and relay/rate capacity.

A response is `202` with current operation state and `Location`, or `200` if the bounded wait observes a settled state. Settled includes rejected/reconciliation states; inspect `status`, not the HTTP code alone. States are queued, dispatching, running, waiting_for_approval, waiting_for_input, completed, failed, cancelled, rejected and reconciliation_required. Native rejection before `turn.started` settles from acknowledgement or rejection events. Lease loss, disabled/stale bindings and uncertain acknowledgements never imply success/cancellation.

Results contain completed assistant `items`, `partialItems`, observed `toolActivity`, terminal evidence and a watermark. The convenience `answer` is the last completed assistant text item **after verified turn completion**. It makes no stronger native final-category claim. Optional opaque `nativeCategory` preserves app-observed metadata. Completed results freeze at their terminal event watermark, so later revisions/history cannot mutate an earlier result. Observed Cline tools are activity, never caller-owned function calls.

Timeout/disconnect stops waiting, not accepted work. Recover with the identical prompt/key or the original operation ID. Explicit cancellation addresses an observed native turn and remains recorded until an acknowledgement/native event establishes its outcome. Approval signing similarly records a decision, not a native allow/deny effect. If authority is withdrawn during a read/wait, `401` or `403` may win according to the observed authentication/authorization boundary.

## Bounds, replay and rollback

JSON is bounded to 1 MiB before decode; prompts contain 1–32 blocks. PNG/JPEG upload and aggregate prompt image bytes are capped at 10 MiB, with existing native binding staging limits still enforced. Gateway body receipt is bounded to 15 seconds. Compressed request bodies are rejected. Results/relays are capped at 36 MiB; SSE frames at 1 MiB plus envelope overhead. Upstream connect/pool/write/read timeouts are 5/5/10/35 seconds. Waits cap at 30 seconds; the server allows 64 waiters and 64 public streams per process. Gateway allows 64 ordinary relays plus 32 reserved control relays per process, within its 128-connection pool. Worker counts multiply local resource caps; database admission/key-rate state remains shared.

The server permits 120 requests/minute per principal per normal/control bucket independently. It retains at most 100 credential records per owner and 10,000 operation records per session; operation retrieval/key tombstone retention is seven days. Capacity refuses new records rather than evicting unresolved work. Existing M23 command/event/file budgets also apply. Archival requires a reviewed policy; no silent eviction is implemented.

SSE honors decimal `Last-Event-ID` (or `after`). Cursor ahead/gaps return an explicit conflict; a midstream gap/authorization withdrawal closes the stream. Backpressure has a five-second server drain deadline. Gateway forwarding flushes complete frames immediately, including heartbeats, and closes upstream resources on disconnect. Transcript replacements remain versioned first-party events; there are no invented token deltas or provider finish markers.

[Rollback](../server/migrations/rollback/008_public_operations.sql) is transactional and tested for an unused schema. It refuses any retained key/operation/authority/admission state. Used installations require a reviewed preserving migration, not deletion of accepted history. Public HTTPS, live identity, proxy flushing, clean graphical install, upgrade/rollback packaging and measurements remain M24/M26 work.

## Desktop consumer journey

Use browser sign-in, server-side pairing and the existing explicit native Connect selection/consent. Discover the binding and capability report; obtain an owner-issued scoped key if needed. Fetch a snapshot, then subscribe from its watermark. Submit a prompt with a stable key. Consume states, transcript revisions and exact pending interaction cards independently of prompt waiting. Submit addressed decisions/answers/cancel commands; retain command/operation IDs and distinguish recorded, applied and terminal outcomes. Resume using snapshot/replay after reconnect or explicit reconciliation. The [M30 native record](../evidence/M30/README.md) shows this REST/SSE journey and the precise Aider text subset; no new desktop app is implied.

For a locally consented task, set `SDC_API_BASE` to the gateway's `/api/v1` root (for example `http://127.0.0.1:8000/api/v1`), and set `SDC_KEY`, `SDC_SESSION` and a fresh `SDC_REQUEST_KEY` in the calling shell. The key must remain unchanged when retrying this exact prompt; use a new key for the next intentional submission. Run the long-lived SSE command in a separate terminal. These commands make no native permission decision:

```sh
curl -fsS -H "Authorization: Bearer $SDC_KEY" "$SDC_API_BASE/sessions"
curl -fsS -H "Authorization: Bearer $SDC_KEY" "$SDC_API_BASE/sessions/$SDC_SESSION/snapshot"
curl -N -H "Authorization: Bearer $SDC_KEY" "$SDC_API_BASE/sessions/$SDC_SESSION/events?after=0"
curl -fsS -X POST "$SDC_API_BASE/sessions/$SDC_SESSION/prompts" \
  -H "Authorization: Bearer $SDC_KEY" -H "Idempotency-Key: $SDC_REQUEST_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"model":"sdc-default","content":[{"type":"text","text":"Reply READY only."}],"delivery":"queue"}'
```

Read the returned `operationId` with `GET /operations/{id}` and inspect `status` and native evidence. For a question or approval, copy the exact pending request ID, revision, choice and action digest from the current snapshot into the typed control/decision body in [OpenAPI](../api-gateway/openapi.json); never reuse a stale decision after a local answer, disconnect or reload. The [M30 first-party driver](../scripts/m30-native-firstparty.mjs) is the executable reference for addressed question, signed allow/deny, cancellation, SSE replay and revocation.

## Server-owned composition profile (M27 implementation)

`POST /api/v1/generations` accepts a required `Idempotency-Key` and a normalized request. Scoped caller keys select their consented session internally through `sdc-default`; human credentials supply `sessionId`. Defaults: `instructions=""`, `contextMode="exclusive"`, no tools, `toolChoice="auto"`, `parallelTools=false`, `background=false`, and budget `{inputUnits:32768,outputUnits:8192,deadlineSeconds:600}`. History contains ordered `{role:"user"|"assistant"|"tool",content:string}` messages, optional committed user `images`, server-issued assistant `calls`, and addressed tool-result `callId`.

The server admits history and the original native command in one PostgreSQL transaction. `GET /api/v1/generations/{id}` retrieves the durable response and separately reports `backendStatus`; `GET /api/v1/conversations/{id}` retrieves canonical history/version. Continue a conversation with `conversationId` plus the complete canonical history and new input, or with `parentId` plus new input. Parent continuations use only the current request's instructions. Editing/rewinding/branching old context, foreign tool IDs and independent histories on a reserved stateful binding return `CONTEXT_CONFLICT`. Explicit `shared-task` mode acknowledges shared underlying task context. This composition profile does not guarantee a backend privileged-role hierarchy or erase hidden native history.

Each completed response appends an immutable history version. A response is committed only from verified native completion and completed assistant output; the answer policy selects the last completed assistant item. Native categories and tool activity remain observable in the underlying operation. Provider-native output classification is not assumed.

Caller tools use `{name,description?,schema,strict}` definitions and a bounded JSON Schema 2020-12 subset with no references, untrusted regular expressions, coercion or repair. The backend must return the versioned `sdc-tool-v1` envelope. Published calls are actual schema-validated proposals with durable `callId` values; the caller executes them. `strict` denotes server publication validation. Malformed replies/selection/parallel violations fail as `BACKEND_CONTRACT_ERROR`. All schemas are validated before dispatch. Identical addressed results are idempotent; changed results conflict. Caller-tool execution is never inferred from native activity. **The default native profile withholds caller tools** (`CALLER_TOOL_POLICY_UNQUALIFIED`) until an exact binding has reviewed native permission/effect evidence. A configuration entry is an operator qualification prerequisite, not native proof by itself.

Accounting is explicitly **estimated** using `sdc-text-v1`: ceiling of Unicode code-point count divided by four over the composed input, with 1,024 assumed units per supported image. Output accounts separately for observed assistant text and delivered text/caller arguments. Native hidden history, reasoning, cache and billing remain unknown. Estimates are service policy units, not native tokenizer counts. Real request/attachment/record limits remain separate.

Output quota/deadline termination is persisted even when the native backend remains running. Text truncation preserves Unicode; caller calls publish atomically or are withheld. The server requests addressed cancellation when capability/authority and an observed turn permit it. Queued cancellation intent is durable and reconciled once addressable. No receipt implies native stop; the common prompt lane remains reserved until actual terminal/reconciliation evidence. `POST /api/v1/generations/{id}/cancel` is available only for background responses. Polling reconciliation runs in the server and survives gateway loss/restart, using only retained original authority with live key/role fences.

Records are retained for seven days; original retry identities remain tombstones after expiry. No provider cloud storage, zero-retention or cost guarantee is implied. Unsupported generation settings are rejected before admission. M27 current-companion native acceptance passed; M28 and M29 supply OpenAI and Anthropic encoders over these policies. M30 validates those routes against the installed Cline task and named coding clients. The `/capabilities` native profile describes raw native export limitations; its `providerReady: false` is not a verdict on the separately declared gateway profile.
