# M27/M28 plan: server-owned APIs over backend connections

**Revised:** 2026-10-08 by user instruction. **Authority:** [DECISION-010](../decisions/010-server-owned-api-semantics.md), requirements 2.4. **Status:** M27 and M28 Done under the declared profiles. Supersedes the native-first recommendation in the [previous execution plan](m27-m28-execution-plan.md) and [source report](m27-m28-native-openai.md). Their source findings remain historical evidence.

## Architecture and ownership

`API client → FastAPI → existing TypeScript server → neutral adapter/bridge → Cline inside VS Code`

The server owns API histories, instruction composition, caller-tool state, aliases, budget/accounting policies and response objects. The backend supplies an authorized input/output/control connection. Future backends use the same adapter contract; consumers keep the service API, credentials and aliases. Cline remains the first-release backend; Codex implementation remains Deferred.

| Layer | Responsibility |
| --- | --- |
| FastAPI | Public REST/provider-shaped HTTP validation, JSON/error/SSE encoders and bounded authenticated server calls |
| TypeScript server | API conversation/history/instructions, caller tools/results, aliases/routing, operations/idempotency, budget/count estimates, lifecycle/replay/retention and scheduling |
| Adapter/bridge | Addressed input/output/control translation, task/binding/revision/lease/authority fences, observed native acceptance/finish and declared stateful context behavior |
| Graphical application | Model execution, native local history/tools/credentials and permissions |

No Cline SDK generation mode or tokenizer is a blanket M27 prerequisite. Preserve native effect/permission safeguards and real acceptance of changed connection seams. Optional model controls require actual adapter support; silently ignoring them remains unacceptable.

## Work packages

| Package | Deliverable | Gate |
| --- | --- | --- |
| M27.1 / S1 | Common server conversation/context/tool/budget/adapter profile | Neutral semantics, service aliases, explicit limits/estimate provenance |
| M27.2 / S2 | Durable conversations, lineage and binding routing | Ownership, original retry identity, all-ingress scheduling, restart and context isolation |
| M27.2 / S3 | Server tool envelope/parser/schema/call-result ledger | Actual validated proposals, caller execution, no native tool activity recast as caller calls |
| M27.2 / S4 | Estimates, admission/output quotas and committed results | Deterministic estimator; source/scope labels; public quota versus actual backend stop |
| M27.3 / G1 | First-party REST/OpenAPI/service capability refresh | Gateway remains facade; neutral errors and truthful advertised profile |
| M27 / A1 | Current API → real Cline connection and affected authority/recovery acceptance | Native I/O/controls and server policies work; new native adoption only for an actual necessary adapter change |
| M28 / O1 | OpenAI-shaped SDC field/profile freeze | Every accepted field implemented by server/adapter policy or explicitly rejected |
| M28 / O2 | Models and Chat sync/SSE | SDK parse/integration, history/tools/estimated budgets |
| M28 / O3 | Responses create/lineage/retrieve/background/cancel | Durable server identities/context and observed controls |
| M28 / O4 | Replay/errors/retention/SDK/client handoff | Stable IDs/retry keys, declared approximations/differences and exact profiles |

Finish M27 before M28 starts on a new implementation instruction. Then M29 → M30 → M24 → M25 → M26. This amendment changes plans, not runtime/status.

## S1/S2: conversations and routing

Extend `server/src/public-api/` and its migrations with API conversation identity/owner, immutable history versions, current instructions, authorized binding route, operation/result lineage, pending caller calls/results, budget profile and accounting provenance. Keep provider request/object spellings in FastAPI. Change `protocol/` and `adapters/core/` only for connection data actually needed across the wire, with versioned schema review.

Alias example: `sdc-default`. Resolve it internally to an authorized policy and consented backend binding. Public discovery returns service names/capabilities; it does not require native task/model identifiers or claim vendor account/model access.

Admission atomically authenticates the live key, resolves owned context, validates profile/history/version, reserves the common native lane and persists original command/idempotency identity. Controls retain independent capacity. Recheck authority/revision at dispatch. Unknown native effects remain uncertain; retries never launch a replacement command.

For a stateful backend, reserve one consented binding per API conversation or declare shared-task semantics. Two independent database histories must not reuse one hidden-history-bearing native task. Initially reconcile append-only caller history with canonical server history. An unsupported edit/rewind/branch returns `context_conflict` or routes to an already authorized fresh binding. Do not automatically create task pools or assume a prompt erases native context. These are internal routing constraints with neutral public errors.

Compose bounded backend input from current instructions, selected server history, supported media and optional caller-tool envelope. Escape delimiters and treat caller content as data; control authority remains outside text. The server defines instruction precedence in its template. This is an SDC composition profile, not an unproved guarantee of native privileged-role hierarchy. Test actual behavior and reject unsupported exact modes.

## S3: caller tools in the server

Clients supply function definitions to the server. Compose a versioned response envelope for final text or proposed calls. Parse the backend's actual reply through bounded JSON/schema validation; verify names/arguments/tool-choice/parallel constraints; assign stable public call IDs and persist before publishing.

Publish only valid proposals. Unknown tools, malformed JSON, invalid arguments, absent required calls or excess parallel calls fail with `backend_contract_error`. Do not invent calls or silently drop/repair required fields. A declared server-validated `strict:true` profile ensures published arguments validate; an invalid backend reply can fail the operation. It does not claim constrained decoding. Clients requiring that stronger behavior are outside the profile until supported.

The caller executes its tools. Accept addressed results into an immutable ledger: identical duplicate is idempotent, changed duplicate conflicts, unknown/foreign call fails. Continue through a new server operation with results in composed context. Neither Cline nor FastAPI executes caller tools.

Native Cline tool activity remains separate. Permissions/control policy must prevent unintended native effects in the delegated caller-tool profile. Prompting alone cannot prove that. Qualify a disposable binding with restrictive native permissions and effect markers. If unsafe, withhold this profile or add the minimal neutral adapter policy capability required; do not automatically demand a provider-native SDK rebuild.

## S4: accounting and budgets

Proposed initial policy: `sdc-text-v1`, `ceil(Unicode code-point count / 4)` over defined server-visible text scopes. Freeze inclusion of instructions/history/tool envelopes. Proposed supported-image allowance: configurable 1,024 estimated units per image, explicitly an assumption. Real byte/media/record limits protect resources independently. These are server policy choices, not claims about a native tokenizer.

Persist usage source, estimator/version/scope, input/output estimates and budget policy. Prefer attributable observed counters when available; session totals are not per-call usage. Hidden native context, reasoning, cache and billing remain unknown. Provider-shaped numeric usage may contain estimates under the documented SDC profile with metadata/header such as `X-SDC-Usage-Source: estimated`. First-party results expose full provenance. Verify SDK extension parsing; never present estimated usage as exact vendor billing.

Enforce pre-dispatch context/admission estimates, real byte/deadline limits during collection and a delivered-output quota. Buffer mutable output until observed terminal state where needed. Emit text at valid Unicode boundaries. Tool calls publish atomically only if a complete valid proposal fits; never cut JSON into a callable fragment.

On quota exhaustion, persist a server budget outcome, stop publishing more public output and request addressed native cancellation when possible. Continue observing actual native completion/uncertainty. Public response termination and backend settlement are separate: keep the native lane reserved until safe settlement. Account separately for backend text observed and output delivered. No upstream generated-token/cost guarantee is made.

## G1/A1: M27 completion

Refresh first-party OpenAPI/docs with owned conversations, caller tools, service aliases, estimate provenance, budgets and neutral errors. Preserve existing credential/operation/watermark/replay/control/attachment guarantees. Current shared-task behavior remains explicit; new fields are planned, not retroactively implemented.

Obtain real API → server → Cline evidence for input echo, result/context, supported image, exact allow/deny/question/cancel, local takeover/revision races, pending disconnect/reload, key revocation and original-key restart/retry. The existing uninstalled companion 0.6.0 still needs affected authority/category acceptance. Preserve frozen native artifacts. Any actual adapter change still needs reviewed adoption/testing; a new native revision is not a blanket prerequisite.

M27 passes when the declared server contract and actual backend I/O/control route pass. Exact native output caps, tokenizer, privileged-history import and strict decoder no longer independently block it under DECISION-010. Unsafe tool effects, covert context mixing, misleading accounting or unresolved effect uncertainty still block the affected advertised feature.

## M28 implementation details

Add provider modules under `api-gateway/sdc_gateway/`; normalize requests into the common server contract and encode durable results. Freeze mounts during implementation; current runtime has no provider routes. SDKs use SDC keys and the service base URL.

| Surface | Server-defined behavior |
| --- | --- |
| Models | Authorized service aliases such as `sdc-default`; no vendor-model impersonation |
| Chat | Supported ordered history/instructions/functions/results, one public response, sync/chunks/call IDs, server budget outcomes, labeled accounting |
| Responses | Server-owned response/parent/item/call IDs, current instructions, lineage/retrieval, supported durable background lifecycle and addressed cancellation |
| Streams | Committed persisted output, stable IDs/sequences, terminal-buffered delivery initially; no mutable revision recast as irrevocable delta |
| Options | Server schema/selection/strict validation/budgets; actual model sampling/opaque reasoning/builtins unsupported unless implemented, rejected before dispatch |
| Retry/retention | Original-command ledger, stable logical-request key, explicit local retention/background/store policy; no receipt presented as an answer |

Use researched official SDK releases as candidate test pins; reverify registry artifacts/versions and lock during implementation. SDKs are test consumers, not executors. Roo Code is a caller-tool candidate; its strict functions can use the declared server validation profile. Retry-key integration and real native/caller effects still need proof. Continue is secondary Chat; official SDKs remain the Responses baseline. No stock-client acceptance is claimed here.

## Verification and traceability

| Requirement | Tests |
| --- | --- |
| FR-19–FR-22 | Real server/database/HTTP auth/operations/aliases/routing/fences; no gateway bypass |
| FR-23 | M28 model/Chat/Responses sync/error/SSE/lineage SDK parsing plus real gateway/server tests |
| FR-24 | M29 Messages/counting under declared estimate/observed policy, version/auth/block/client checks |
| FR-25 | Canonical server history, owned routes, current instructions, rewind errors and two-client stateful-backend isolation |
| FR-26 | Actual envelope parsing/schema/selection, addressed result duplicates/conflicts, no caller/native double effects |
| FR-27 | Estimator determinism/scopes, quota/deadline/cancel races, missing counters, honest public/native outcomes and committed output |
| FR-28 | Exact client/SDK/settings/profile versions; M30 real public/native/caller route and effects |
| FR-01–FR-18 | Inherited Connect/permissions/storage/approval/recovery/graphical workflow and affected M23 gates |

Test malformed/invalid strict envelopes, publication only after validation, interleaved histories, native edits, budget stop while backend runs, lost/racing cancellation, crash between command/result commits, SDK retry defaults, original-key replay and intentional identical new requests. Fixtures establish parser/policy behavior; graphical evidence establishes backend behavior/effects.

Implementation runs focused checks then root build/lint/tests with applicable disposable databases, and Swift checks when its modules change. This amendment validates documentation only. Re-estimate effort after the server contract/routing/tool-policy spike; the earlier native-rebuild estimate is superseded.

**Implementation checkpoint (2026-10-08):** S1/S2/S3/S4/G1 are implemented under the declared profile; caller tools remain withheld on unqualified native bindings. A1 current-companion graphical connection/authority acceptance remains open. Automated evidence is in [M27 server-owned evidence](../../evidence/M27/server-owned/README.md). The user authorized M27 then M28; complete A1 before starting M28. API ownership stays in the server.

**M27 completion (2026-10-08):** A1 passed real public/native text/history/image, addressed signed controls, retry/revocation/restart and pending local/disconnect/reload fences on companion 0.6.0 with unchanged Cline API 1.2. See [completion evidence](../../evidence/M27/restart-media-run/README.md). Caller-tool native qualification is withheld under the declared profile; actual pre-dispatch rejection is verified. M28 is authorized next.


**M28 completion (2026-10-08):** O1–O4 implemented and verified with exact pinned official Node/Python SDK consumers, real HTTP/PostgreSQL server/gateway state and explicitly scripted native output. Model discovery, Chat/Responses lifecycle/lineage/tool/result/quota/replay/retention/authority/original-key retry checks pass. See [M28 evidence](../../evidence/M28/README.md) and [the declared profile](../openai-api-profile.md). Real Cline caller-tool qualification remains withheld; full public/native/named-client acceptance remains M30 after M29. Both user-authorized milestones are complete; later work requires a new instruction.
