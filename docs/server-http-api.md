# Server HTTP/SSE API (M09)

The server package exposes `createApiServer` from `@server-driven-chat/server`. Supply the shared `ServerDatabase`, `AuthorizationService`, and configured `AuthenticationProvider`. Bind local installations to loopback; deployments must terminate TLS before this service and must not expose the test profile.

Every response includes an opaque `x-request-id`; clients may supply one. Errors use `{ "error": { "code", "message", "requestId", "retryable" } }`. Bearer credentials are read only from `Authorization` headers. They are never accepted in URLs or echoed in errors. Request JSON defaults to a 1 MiB cap. Pending commands default to 100 prompts and 1,000 controls per device, independently configured by `maxPendingPrompts` and `maxPendingControls`. Transactional admission serializes each lane; exact retries are accepted at capacity, while excess work returns retryable `429 QUEUE_FULL`. Applied/rejected acknowledgements release capacity; unknown or reconciliation-required outcomes retain it. SSE connection capacity defaults to 128 and returns `429 RATE_LIMITED` when full. Unsupported paths return 404, malformed JSON 400, size excess 413, stale/conflicting state 409, and unauthenticated/unauthorized requests 401/403.

## Implemented routes

| Route | Authority and behavior |
|---|---|
| `GET /v2/health` | Minimal version check. |
| `POST /v2/auth/oidc/start` | Starts provider-validated authorization-code/PKCE using an exact configured redirect URI; state, nonce and verifier are held server-side for five minutes. |
| `POST /v2/auth/oidc/exchange` | Consumes one state once, exchanges the matching code/verifier, verifies the ID/access token identity, registers the OIDC principal, and returns short-lived tokens. |
| `POST /v2/auth/oidc/refresh` | Refreshes tokens only when the supplied refresh token matches a user ID already linked to an OIDC identity. |
| `POST /v2/pairings` | Authenticated user starts short-lived device pairing with a caller-generated local secret; the server stores only its hash and never returns it. |
| `POST /v2/pairings/{id}/confirm` | Authenticated owner confirms the pairing code. |
| `POST /v2/pairings/{id}/local-confirm` | Companion's explicit local consent and secret activate the device; returns a device credential for Keychain storage. |
| `GET /v2/sessions` | Authenticated user lists only owned/member sessions, their role, and the latest binding/capability metadata used by the control interface. |
| `POST /v2/sessions/{sessionId}/turns` | User bearer token with prompt permission. Validates a protocol `turn.submit`, matches the active binding revision/lease, commits it to the prompt lane, then returns `202` with its durable sequence. |
| `POST /v2/sessions/{sessionId}/turns/{turnId}/controls` | User bearer token, current binding, matching control command. Request-specific approval commands require the owner approval role; administration commands require owner. |
| `GET /v2/devices/{deviceId}/commands?lane=prompt\|control` | Active device credential, one independent replayable SSE lane. `Last-Event-ID` takes precedence over `after`; omitted cursor begins at zero. Each SSE event ID is the durable lane sequence. |
| `POST /v2/devices/{deviceId}/events` | Active, bound device credential and validated protocol event. Deduplicates immutable event identity and responds only after commit. |
| `POST /v2/devices/{deviceId}/acks` | Active, bound device credential and durable monotonic command receipt/application status. Acknowledgement includes `sessionId`, `lane`, `laneSeq`, and `state` (`received`, `applied`, `rejected`, `unknown`, or `reconciliation_required`); status transitions cannot regress. |
| `POST /v2/devices/{deviceId}/lease/renew` | Device bearer credential and exact `sessionId`, `bindingRevision`, `leaseGeneration`. Renews only an active, unexpired binding. Expired leases transition to stale and require a new binding generation. |
| `POST /v2/devices/{deviceId}/dispatch` | Exact authenticated binding fence. A bounded SSE admission channel emits `dispatch.permit` and holds authority row locks until client closure or lease expiry. Native mutation guards must honor its deadline and cancellation. |
| `GET /v2/sessions/{sessionId}/snapshot` | User with view permission; one consistent database snapshot and replay watermark. |
| `GET /v2/sessions/{sessionId}/events?after=N` | User with view permission; independent live/replay SSE stream, event IDs are session sequence numbers. |
| `POST /v2/sessions/{sessionId}/approvals/{requestId}/decisions` | Session owner with an exact pending request; atomically records one winning decision/assertion and priority control command. 202 means recorded, not applied. Requires configured `ApprovalEngine`. |
| `POST /v2/devices/{deviceId}/decision-assertions/consume` | Active matching device consumes one signed, request-bound assertion once. Requires configured public key. |
| `POST /v2/attachments` | Session operator/owner uploads bounded raw binary using session, filename, MIME, length and SHA-256 headers; returns a pending upload ID. Requires configured `AttachmentService`. |
| `POST /v2/attachments/{attachmentId}/commit` | Upload owner commits only matching content checksum; safe identical retries return the existing committed record. |
| `GET /v2/attachments/{attachmentId}` | Authorized session member or active bound device retrieves committed content with checksum/length metadata. |
| `POST /v2/devices/{deviceId}/attachments/{attachmentId}/staging-receipts` | Active bound device durably records a capability-checked adapter staging receipt. |

SSE sends `retry: 3000`, disables proxy buffering where supported, emits comment heartbeats on a configurable 15-second default, and polls durable storage using bounded batches (100 records). A cursor ahead of the current durable watermark returns `409 CURSOR_AHEAD`. The current store retains full history, so there is no expired-cursor condition yet; if retention is introduced, it must return `410 CURSOR_EXPIRED` and require snapshot resynchronization. `429` bounds concurrent streams. Backpressure pauses a stream until the socket drains or closes; it does not enqueue an unbounded in-memory backlog. Prompt and control lane polls query independent sequence spaces and streams, so prompt backlog does not block control delivery. Clients should add jitter to the server's retry hint and cap reconnect backoff at 30 seconds; the server does not own bridge reconnect policy.

Device event and acknowledgement POSTs include the current binding revision and lease generation. The server rejects expired or fenced envelopes with HTTP 409 (`CONFLICT` for transactional storage fences, `BINDING_CHANGED` for renewal identity changes). Device/binding/credential validation is locked in the same transaction as event/ack commit; expiry is evaluated after lock waits and again before commit admission. User roles are rechecked under transaction locks when admitting commands. Lease TTL defaults to 60 seconds; a renew response includes both database-derived expiry and server time to avoid client/server clock skew.

## M11–M13 extensions

Session creation and a separate heartbeat endpoint remain future work. The M15 native shell supplies local dispatch disable; server-side remote disable does not claim immediate native enforcement. M11's transactional decision engine and bridge request revalidation are described in [approvals.md](approvals.md); M12's same-cut transcript projection is described in [transcript-projection.md](transcript-projection.md); M13's binary transfer/staging behavior is described in [attachments.md](attachments.md). Configure signing keys and private attachment storage outside the repository. Device lease renewal and expiry fencing are implemented in M10.

The M14 same-origin control interface is served from the built `control-ui/dist/` directory by this HTTP server. It uses a PKCE authorization-code flow configured with `VITE_OIDC_ISSUER` and `VITE_OIDC_CLIENT_ID`; access tokens remain in tab memory, and API authorization remains authoritative. `GET /v2/sessions` provides the caller's visible sessions and latest binding metadata. The UI uses authenticated fetch-based SSE (no token in a URL), refreshes snapshots after events/reconnect, and keeps server-recorded decisions distinct from native application evidence.

The M15 SwiftUI companion uses the server-mediated `POST /v2/auth/oidc/start` and `/exchange` routes with its exact configured `sdccompanion://auth` redirect. Device pairing uses authenticated `POST /v2/pairings` and `/confirm`, followed by a separate local-consent `POST /v2/pairings/{id}/local-confirm`. The local pairing challenge is caller-generated, stored hashed on the server, excluded from the pairing response, and consumed once. See [the macOS companion guide](companion.md) for its fake-adapter boundary and local disable behavior.

## Live authorization and explicit skips

Each stream reauthenticates its original bearer token and rechecks current access on polling and delivery. Revoking a role, expiring a token, or rotating/revoking a device credential closes the existing stream as well as denying reconnect. A failure after SSE headers closes the connection; no subsequent unauthorized payload is sent.

Device lane sequences span all bindings. Obsolete records are represented by durable `command.skipped` frames with `{deviceId,lane,laneSeq,commandId,reason:"obsolete_binding"}`; their SSE ID equals `laneSeq`. They expose no obsolete session payload. The server records terminal rejection and retains the immutable skip for replay. The bridge persists it before advancing its receipt cursor. Active records for other bindings remain ordinary device feed records and are routed through the shared local inbox.

`dispatch.permit` contains `{sessionId,bindingRevision,leaseGeneration,leaseExpiresAt,serverTime}`. Both transport metadata schemas are exported under `protocol/schemas/v2.0/`; they are server-owned route metadata, separate from user commands and native event envelopes. A permit is not an approval grant. Its transaction uses the same row locks as generation changes and credential revocation; a takeover committed first rejects admission, while one arriving after admission waits for channel release. The channel is bounded by the current lease. The bridge additionally imposes a 10-second request/channel bound and native mutation guard.

## Planned public gateway extension — not implemented

The user adds a FastAPI facade that calls these authenticated HTTP/SSE services; it does not replace them. [DECISION-009](decisions/009-fastapi-public-api.md) and [research/catalog](feasibility/public-api.md) define M27–M30, durable operations/results, public scoped credentials, desktop control and OpenAI/Anthropic profiles. New internal server contracts/authorization routes are required; the existing 202 turn response is command metadata, not an LLM result. All new APIs are Not started. Device routes retain their device-only authority and cannot be exposed as user-control bypasses.
