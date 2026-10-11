# M29 implementation plan: Anthropic Messages over the SDC server

**Prepared:** 2026-10-08, Asia/Dhaka. **Status:** planning only; M29 remains Not started. **Prerequisites:** M27 and M28 are Done. **Authority:** [DECISION-010](../decisions/010-server-owned-api-semantics.md), requirements 2.4 / FR-24–FR-27. A subsequent implementation instruction starts M29. Full native/named-client qualification remains M30.

## 1. Outcome and ownership

Expose the same server capabilities through an Anthropic-shaped `sdc-anthropic-v1` profile:

`API consumer → FastAPI → TypeScript server → neutral bridge/adapter → consented application`

The server owns histories, current instructions, caller tools/results, budgets, estimates, authorization, durable operations and scheduling. FastAPI owns Anthropic request normalization, response/error encoding and SSE. The application supplies existing I/O and controls and executes the model. Consumers use the server alias `sdc-default` and SDC credentials; they do not select an upstream Claude model or need to know which backend application is attached.

M29 should deliver discovery, synchronous Messages, streamed Messages and input counting. It should reuse M27/M28 policies and close the two small neutral contract gaps identified below. It should not introduce a model executor, vendor dependencies into shared TypeScript packages, a native patch, a new desktop frontend, or an Anthropic account dependency.

## 2. Verified starting point and remaining work

| Existing artifact | Reuse in M29 | Remaining work |
| --- | --- | --- |
| `server/src/public-api/policy.ts` | Bounded generation validation, composed input, Unicode estimate/quota, validated caller proposals | Read-only counting service; optional neutral tool-result outcome |
| `server/src/public-api/conversations.ts` | Scoped canonical histories, append-only continuation, call ledger, committed results, durable cancellation | Preserve caller tool failure status without altering historical successful results |
| `server/src/public-api/http.ts` | Auth/rate/alias/attachment/generation routes | Neutral input-count HTTP route and reusable media validation |
| `api-gateway/sdc_gateway/openai_http.py` | Bounded upstream client, wait/poll/heartbeat, fresh authority checks, capacity lifecycle | Extract provider-neutral HTTP helpers; retain OpenAI encoding separately |
| `api-gateway/sdc_gateway/app.py` | Shared 64 normal / 32 control slots, body bounds, first-party API | Mount Anthropic and select correct error envelopes throughout middleware/handlers |
| `api-gateway/sdc_gateway/models.py` | Neutral generation/history/tool/budget models | Typed count request/result and optional tool-result outcome |
| M28 official SDK tests and `tests/helpers/m28-gateway-server.mjs` | Real gateway/server/PostgreSQL with scripted native output | Anthropic SDK fixtures; isolate shared helpers without relabeling simulation as native evidence |

[M27 evidence](../../evidence/M27/restart-media-run/verification.json) establishes the real Cline connection/control/media/recovery profile. [M28 evidence](../../evidence/M28/verification.json) records 163 root tests, 34 gateway checks and eight Swift tests. Those results are a baseline to preserve, not a prediction of M29 results.

The current native caller-tool profile is unqualified and withheld. M29 must continue refusing execution requests with caller tools on that binding before native dispatch. Tool normalization and round trips can be tested on an explicitly qualified simulation binding. This distinction must appear in the published profile and M30 handoff.

## 3. Proposed public routes and headers

| Route | Purpose | Authority/effects |
| --- | --- | --- |
| `GET /anthropic/v1/models` | Scoped service aliases, Anthropic pagination envelope | View; no native command |
| `GET /anthropic/v1/models/{model}` | Retrieve `sdc-default` descriptor | View; other aliases fail |
| `POST /anthropic/v1/messages` | Wait for a committed Message or deliver its SSE blocks | Prompt; original retry key required |
| `POST /anthropic/v1/messages/count_tokens` | Estimate normalized server-visible input | View; no generation/admission/native effects |

Set official SDK base URL to `http://127.0.0.1:8000/anthropic`; SDKs append `/v1/...`. Using `/anthropic/v1` as the SDK base would risk a duplicated version segment and must be covered by tests. The SDKs accept custom base URLs; verify the exact pinned clients' URL construction. [Python SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/python), [TypeScript SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript).

Header policy:

- Accept `x-api-key: <SDC scoped key>` or `Authorization: Bearer <SDC scoped key>`. Reject duplicate or simultaneous credential mechanisms to prevent ambiguous principal selection. Translate the selected credential into the server's existing Bearer authentication; do not forward it to Anthropic. The current official API supports both mechanisms. [Authentication overview](https://platform.claude.com/docs/en/api/overview).
- Require `anthropic-version: 2023-06-01`, the explicitly supported wire version. Missing or other versions fail with a structured error before dispatch. A nonempty `anthropic-beta` fails because this profile implements no beta features. Version support is independent of SDK package versions. [Version policy](https://platform.claude.com/docs/en/api/versioning).
- Require a caller-supplied stable `Idempotency-Key` for Messages generation, using the existing 1–128 character pattern. Counting and discovery require no retry key.
- Preserve `X-SDC-Context-Mode`, default `exclusive`, with explicit `shared-task` for the existing graphical task. Generate/validate request correlation IDs; emit `request-id` and error `request_id` without revealing credentials or prompts.
- Advertise `X-SDC-Profile: sdc-anthropic-v1`, `X-SDC-Usage-Source: estimated`, `X-SDC-Stream-Delivery: terminal-buffered`, and `Cache-Control: no-store`. Expose the durable generation identity and first-party `Location` after admission.
- Reject semantic workspace/user-profile/beta headers that the server does not implement. Explicitly document SDK transport/telemetry headers as diagnostic metadata rather than model controls. Keep browser CORS and graphical consent policies inherited.

No separate Messages retrieval, batch, cloud file, or background route is planned. Retries use the same Messages request/key; durable retrieval/control uses the existing first-party generation API. Internally select common `background: true` so accepted work remains reconcilable and first-party generation cancellation is available after disconnect. The Messages HTTP call still waits or streams; this internal durable-operation policy does not introduce Anthropic background execution or another executor.

## 4. Request and normalization contract

Freeze `MessagesRequest`, `CountTokensRequest`, response/error models and nested discriminated content types before route implementation. Reject unsupported fields before generation admission, with strict Boolean/integer checks and redacted validation errors.

| Anthropic surface | Planned SDC behavior |
| --- | --- |
| `model` | Only the caller-authorized `sdc-default` service alias |
| `messages` | User/assistant text and supported blocks mapped to canonical neutral history |
| Top-level `system` | String or ordinary text blocks, composed as current server instructions |
| `max_tokens` | Required integer 1–8,192; delivered-output estimate quota. Reject zero/cache warming |
| `stream` | Boolean selecting JSON or terminal-buffered SSE |
| `tools` | Custom name/description/input-schema/optional strict policy; server validation |
| `tool_choice` | `auto → auto`, `none → none`, `any → required`, named `tool → {name}` |
| `disable_parallel_tool_use` | Invert into neutral `parallelTools`; honor Anthropic's documented default false |
| Assistant `tool_use` | Actual server-issued ID/name/object arguments; must match committed canonical history |
| User `tool_result` | Addressed string/text-block result plus success/error outcome, preserved in server history/ledger |
| Images | Committed SDC PNG/JPEG references through URL-source blocks; authenticated first-party upload/commit beforehand |

The top-level instruction and content rules come from [Messages](https://platform.claude.com/docs/en/api/messages/create). Function choice shapes come from [tool definitions](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) and [official choice types](https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/src/anthropic/types/tool_choice_auto_param.py). Strict custom tool fields are confirmed in [official tool types](https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/src/anthropic/types/tool_param.py). These wire shapes do not create native privileged roles or constrained decoding.

Canonical ordering is an explicit restriction: assistant output is text followed by tool calls; user tool results precede any new user text. Join adjacent text parts deterministically. Preserve distinct turns rather than silently adopting vendor turn-merging behavior. Reject unsupported interleaving, tool-result media and assistant prefill before dispatch. An initial supplied history is caller data; subsequent assistant text/calls must replay the exact committed server history.

Images use `{type: "image", source: {type: "url", url: "sdc-attachment://<UUID>?mime=image/png"}}`, or JPEG. This is a declared SDC URI convention, not a claim of arbitrary Anthropic image transport parity. Arbitrary external URLs, base64 data and provider file references remain unsupported. Do not add gateway-side network fetching or silently discard content parts.

Reject sampling (`temperature`, `top_p`, `top_k`), nonempty stop sequences, thinking/reasoning/signature blocks, prompt caching, output configuration/structured decoding, citations/documents/search blocks, server tools/computer tools/MCP/container options, provider service tiers and opaque semantic metadata. Empty stop-sequence lists may be accepted as an explicitly documented no-op; other rejected controls must not be silently coerced to defaults. New source fields are outside the profile until implemented and tested.

Use the existing stateful history rules: one exclusive conversation per consented binding; continue exact canonical full history; reject rewinds, independent histories, foreign ownership and branches. Shared-task mode declares hidden native context unknown. A local takeover/native revision change is a neutral context/authority conflict, not an invitation to reset or replace the application.

## 5. Two required neutral server additions

### 5.1 Read-only input counting

Add a neutral method such as `PublicInputCountService.count(user, request)` and `POST /v2/public/input-counts`. Expose a typed first-party `/api/v1/input-counts` route alongside the Anthropic encoder. Do not implement a second estimator in Python.

The count request contains model/history/instructions/tools/choice/parallel/context policy, without generation-only output/deadline/stream options. Apply the same bounded normalization/schema validation and `composeRequest`/`estimateText` as generation. The Anthropic count SDK supports `tool_choice`, so use identical choice/parallel defaults in both routes. [Official count request type](https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/src/anthropic/types/message_count_tokens_params.py).

Authorize the scoped alias/session and validate committed image ownership, MIME and expiry inside a consistent read transaction. Recheck credential authority at response publication. Reuse/factor attachment validation so counting and generation cannot disagree. Count arbitrary caller-supplied input without settling pending generations or enforcing conversational admission: the result is an estimate, not a guarantee that the next generation will be admitted.

Audit both generation and prompt ingress when extracting media validation: the existing prompt handler visibly checks attachment metadata, while the generation handler delegates to `ConversationService`. Prove that all generation paths enforce the same checks; do not assume a successful valid-image test proves foreign-image rejection. A confirmed inherited security regression must reopen its affected gate and be fixed before M29 completion. Counting tool schemas can succeed on an unqualified tool binding because it executes nothing; that must never advertise tool execution readiness.

Return neutral `{inputUnits, source, estimator, scope, hiddenNativeContext, imageAllowanceUnits, admissionChecked: false}`. The gateway encodes `input_tokens` plus `sdc` provenance. Count all server-visible composed text, schemas, current instructions and the fixed 1,024-unit image allowance. Preserve `sdc-text-v1`'s four-Unicode-character estimate; hidden context, provider tokens and costs remain unknown. The Anthropic endpoint shape counts supplied input, without generating a message; SDC deliberately labels its estimate. [Counting API](https://platform.claude.com/docs/en/api/messages/count_tokens).

Counting must not create conversations, generations, commands, call results or cancellation decisions, and must not call `generate`, `generation` or `reconcile`. Rate/audit bookkeeping is allowed; domain state stays unchanged. Requests over generation's input allowance can still return their bounded estimate, with `withinInputBudget: false`; malformed/oversized input fails. Testing should compare count and actual generation input usage for the same supported normalized request, including tool choices, Unicode and images, while testing state changes separately.

### 5.2 Caller tool error outcomes

Anthropic tool results include `is_error`; existing neutral history retains only content/call ID. Dropping that Boolean would lose caller intent. [Official tool-result type](https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/src/anthropic/types/tool_result_block_param.py).

Extend neutral tool history with an optional `resultStatus: "error"`; absence means the historical successful result. Normalize `is_error: false`/absent to absence, preserving old canonical histories and retry fingerprints. Allow the new field only on tool results. Compose it as caller data in server input and include it in immutable result comparison. A retry changing success/error status must conflict even when text is identical.

Keep historical `public_caller_tools.result` JSON strings readable. New error entries can use a tagged neutral JSON object inside the existing JSONB column; explicitly distinguish both representations and cover restart/restore. No migration is expected if existing JSONB can retain this information, but confirm constraints first. If storage must change, append a guarded migration rather than editing migrations 008/009.

The first-party neutral model exposes the outcome; OpenAI remains backward compatible with its current successful-result shapes. Cross-profile continuation that cannot faithfully represent an existing error outcome must fail explicitly. Do not reinterpret native tool activity as an API caller result.

## 6. Messages response, usage and streaming

Use stable `msg_<generation UUID>` IDs and preserve neutral call IDs in `tool_use.id`; do not invent Anthropic vendor identities. Responses contain assistant text and validated tool-use object blocks. Discovery returns an SDC display name, epoch creation time marked unknown, active service lifecycle, null vendor line/capabilities/token-window metadata and SDC limits/provenance. Pagination must be deterministic for the one visible alias, including empty results, limits and validated cursors. [Model reference](https://platform.claude.com/docs/en/api/models/list).

| Common server outcome | Messages result |
| --- | --- |
| Verified committed text | `stop_reason: end_turn` |
| Validated caller proposals | `stop_reason: tool_use` |
| Delivered output quota | `stop_reason: max_tokens`, with explicit SDC quota/native-cap distinction |
| Deadline, failure, cancellation, reconciliation uncertainty | Structured error; no successful Message terminal |

`stop_sequence` is null because actual sequence stopping is unsupported. Do not fabricate refusal/pause/context-window reasons from native prose. Map standard `usage.input_tokens`/`output_tokens` to the labeled server estimates. Preserve complete server provenance in `sdc`; optional cache/reasoning/provider counters stay absent/null. A known initial stream delivery of zero output is allowed only as a truthful interim delivered counter; never invent native token usage.

SSE sequence: `message_start`, indexed block start/deltas/stop for text and validated function JSON, cumulative `message_delta` usage/stop reason, then `message_stop`. Tool blocks begin with empty input and reconstruct committed object arguments through bounded `input_json_delta.partial_json`. Use `ping` while awaiting server settlement; no OpenAI `[DONE]`. These event details follow [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming).

Buffer mutable native output until commitment. Generate immutable JSON and SSE from the same result. Reauthenticate while waiting and before every frame; enforce response/frame bounds. An error after HTTP 200 emits `event: error` and closes without `message_stop`. An SDK accumulator must never turn that into a successful final Message. Disconnect releases gateway slots but leaves the server operation durable.

No standalone Anthropic SSE replay cursor is advertised. Repeating the original request/key reconstructs the same result; durable operation retrieval/replay remains first-party. Never copy Responses cursor rules into Messages without an explicit SDC extension contract.

## 7. HTTP reliability and error handling

Extract provider-neutral upstream/wait/capacity primitives into `provider_http.py`; keep `openai_profile.py`/Anthropic encoding separate. Neutral helpers should raise a common typed HTTP error, which each profile encodes. Avoid installing a global handler that lets the last mounted provider override another provider's exceptions.

Integrate provider routing into body-size/encoding/timeout errors, FastAPI validation, authentication and capacity failures. Anthropic errors use `{type: "error", error: {type, message}, request_id}` plus an explicit SDC error code/provenance extension. Map 400/422 to invalid request, 401 auth, 403 permission, 404 missing, 409 conflict, 410 retained-operation expiry, 413 too large, 429 rate/capacity and 5xx failure/timeout. Preserve meaningful server status rather than converting every failed request into 200. [Errors and SDK retry policy](https://platform.claude.com/docs/en/api/errors).

The gateway performs no automatic mutation retries. Official SDK transient retries must retain the caller's original idempotency key. Test losing the first upstream response after committed admission: multiple HTTP attempts must still produce one server generation/native command. Also prove an intentional new key can create a distinct identical request where routing permits it.

All first-party/OpenAI/Anthropic traffic shares existing counters. A stream holds its normal slot through completion/close; counting uses normal capacity and cannot consume reserved controls. Budget for poll and per-frame auth requests within the server's 120/minute principal limit. Worst-case blocks/deltas must be bounded; rate exhaustion yields an honest stream error and recoverable durable ID, not a replacement generation. Do not create new provider-local databases, locks, credentials or schedulers.

## 8. Ordered implementation work packages

| Step | Work and likely files | Acceptance before next step | Rough effort |
| --- | --- | --- | --- |
| M29.1 | Freeze profile, exact SDK pins, schemas; `docs/anthropic-api-profile.md`, dependency manifests/locks | Every field/header/outcome has implemented or rejected semantics; official SDK URL/stream behavior understood | 4–6 h |
| M29.2 | Neutral count service/HTTP/models and tool-error outcome; `server/src/public-api/{counting,policy,conversations,http}.ts`, gateway neutral models | Counts cause no execution/history/ledger effects; estimate parity, media/auth races, legacy/error result retries pass | 8–12 h |
| M29.3 | `anthropic_profile.py`, `anthropic_contract.py`; typed requests, normalization, aliases/pagination, count encoding | Golden normalized requests; lossless supported content; unsupported fields fail before admission | 8–12 h |
| M29.4 | `provider_http.py`, `anthropic_http.py`, app middleware/error integration; JSON/SSE | Sync/stream final equality, typed tool blocks/usage, error EOF, authority/capacity/disconnect behavior; M28 unchanged | 8–12 h |
| M29.5 | `api-gateway/tests/test_anthropic_profile.py`, `tests/m29-server-policy.test.mjs`, official SDK TCP consumers/shared fixture helpers | Real HTTP/PostgreSQL stateful and default-retry tests; pinned SDK sync/stream/accumulators/errors/counting/discovery pass | 12–18 h |
| M29.6 | Generated OpenAPI, examples, evidence/validator, tracker/handoff; complete inherited checks | Evidence and limits match actual results; no regression; M29 completion gate below | 6–10 h |

Estimate: **46–70 engineering hours**, roughly **6–9 focused development days**, excluding M30 real native/client qualification and production deployment. This is a planning estimate, not a promised calendar date. Re-estimate after M29.1 if a pinned SDK/helper or required field cannot represent the declared profile.

Candidate pins verified in registries on 2026-10-08: Node `@anthropic-ai/sdk` **0.132.1**, Python `anthropic` **1.12.1**. Reverify at implementation start, choose exact tested pins and commit npm/uv lock updates. Node 24/npm 11 and Python 3.13.16 remain the repository runtimes. SDKs are test consumers only; no SDK tool runner or vendor inference call. The Python candidate uses `httpx2`; confirm coexistence with the gateway's HTTPX 0.28.1 and the pinned OpenAI consumers before changing locks. [Registry/source record](../../evidence/planning/m29/sources.json).

## 9. Required verification matrix

| Area | Essential cases |
| --- | --- |
| Headers/auth | SDK-generated headers and base URL; missing/wrong version; beta refusal; duplicate/dual credentials; revoked/expired/wrong-scope key; redacted errors |
| Validation | Nested unknown fields, exact Boolean/integer types, sampling/cache/thinking/builtins refusal, malformed schema/calls, ordering/prefill refusal; zero commands on rejection |
| Text/state | Sync, Unicode and empty completion; exact second-turn history/current system; two callers, edit/rewind/foreign call conflicts; gateway/server restart and original IDs |
| Caller tools | Auto/none/any/named choice, parallel default/disable, strict schema failure, multi-call object reconstruction, success/error results, duplicate/missing/changed results, historical ledger compatibility; actual unqualified binding refusal |
| Media | PNG/JPEG committed reference count/generation parity; wrong MIME, owner/session, pending commit, expiry and unsupported source failures |
| Counts | Same normalization/defaults as generation; deterministic schema/system/image estimate; over-budget indication; no command/history/result/cancel changes; concurrent revocation/image expiry |
| JSON/SSE | Both official SDKs parse sync and raw streams; high-level text/final-message accumulators; block indexes and reconstructed tool objects; cumulative estimate counts; pings; error without successful terminal |
| Budgets | Unicode quota, deadline/cancel races, late native content after public settlement, no fake native cap/cache counters; first-party backend settlement distinguished |
| Recovery | Lost admission response with default SDK retries; retry key conflicts, expiry tombstones, stream disconnect/original replay, foreign response access and live stream revocation |
| Capacity | Shared first-party/OpenAI/Anthropic slots; control still works when normal pool is full; stream cancellation/EOF releases slots; bounded frames/rate behavior |
| Regression | M27 server/native evidence remains valid; all M28 SDK/gateway checks and inherited shared/native tests pass |

Use isolated PostgreSQL schemas and actual TCP Uvicorn consumers for both official SDKs, explicitly labeling scripted native events. Do not auto-run caller tools; the test caller manually executes a deterministic pure fixture function and returns its result. No remote messages, real provider key or model account are needed for M29 automated checks.

Implementation verification commands include `npm ci`, focused server/M29 tests, gateway `uv sync --locked` and pytest, root build/lint/tests with all applicable database variables, and companion checks required by repository guidance. Run PostgreSQL Docker restart acceptance separately from parallel integration suites, as learned in M28. Regenerate OpenAPI; expected path count is 42 if the current 37 routes plus four Anthropic paths and one neutral first-party count path remain the frozen layout. Do not use a path count alone as contract evidence.

## 10. Completion gate and M30 handoff

Mark M29 Done only when all four advertised Anthropic routes and the neutral count path work, official pinned SDKs consume their successful/error/stream shapes, supported history/tools/outcomes remain lossless, counting is server-owned and effect-free, original-key stateful tests pass, and M27/M28/inherited regressions pass. Any required supported field silently ignored, successful terminal emitted on failure, fabricated exact usage or duplicate command keeps the milestone incomplete.

Save `evidence/M29/{verification,commands,sources,cleanup}.json`, exact logs, schema/profile/source/lock hashes and SDK examples. Document acceptance scopes and all retained failed probes. Record fresh native acceptance only if actual native changes occur; do not change or re-adopt Cline merely to satisfy vendor field shapes.

Handoff to M30 must enumerate the exact SDKs/profile/options and which real clients still require qualification. It must state that current native caller-tool safety remains withheld, estimates are server policy, hidden shared-task context is unknown, and terminal buffering trades latency for immutable output. M30 owns actual public-route/native/client effects; M24 owns production TLS/identity/packages and deployment. M29 completion does not imply either gate is closed.

Planning evidence is in [the research record](../../evidence/planning/m29/sources.json) and [documentation validation](../../evidence/planning/m29/validation.json). This plan changes no runtime files, locks, native grants, installed packages or milestone implementation status.

## Implementation status amendment — 2026-10-08

The user authorized implementation following this plan. M29 is In Progress under [M29-START-001](../../IMPLEMENTATION_TRACKER.md#m29-start-001--anthropic-profile-implementation-started). Exact Node `@anthropic-ai/sdk` 0.132.1 and Python `anthropic` 1.12.1 test consumers are now locked; neither SDK executes models. Implementation has added the neutral `/input-counts` service and route, status-sensitive caller-tool results, the Anthropic gateway routes and typed response contracts, the generated OpenAPI snapshot, and focused server/gateway acceptance. M29 remains incomplete until the final declared checks and evidence are recorded.

**Completion amendment — 2026-10-08:** M29 passed its declared checks and is Done under [M29-DONE-001](../../IMPLEMENTATION_TRACKER.md#m29-done-001--anthropic-profile-and-server-counting-complete). Results, limits, exact dependency hashes and cleanup are recorded in [evidence/M29](../../evidence/M29/README.md). M30 remains a separate user-authorized milestone.
