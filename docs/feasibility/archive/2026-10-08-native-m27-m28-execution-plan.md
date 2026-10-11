# M27 completion and M28 execution plan

**Recorded:** 2026-10-08. **Authority:** user-requested research/planning; runtime implementation is not performed by this amendment. **Current state:** M27 In Progress, M28 Not started. This plan preserves M27.1/M27.2/M27.3 and all milestone IDs. Read the [source research](../m27-m28-native-openai.md), [requirements](../../../requirements.md), [DECISION-009](../../decisions/009-fastapi-public-api.md) and [tracker](../../../IMPLEMENTATION_TRACKER.md).

## Execution order and exit gates

Implement remaining work under **M27 only**, including the common neutral generation contract and server/gateway first-party changes it needs. Close M27 with a separate reviewed native adoption and real changed-seam/affected M23 acceptance. Start M28 only after M27 passes and a new implementation instruction. The order after M28 remains M29 → M30 → M24 → M25 → M26. Planning both milestones does not bypass this dependency or mark M28 started.

| Stage | Deliverable | Exit gate |
| --- | --- | --- |
| M27-N1 | Bounded native semantic spike and exact capability profile | Existing app session can import isolated context, yield caller tools without effects, enforce required strict tools/cap and expose observed metadata; count route identified |
| M27-N2 | Neutral/native contract and explicit graphical API-mode consent | Reviewed schemas, authority/cancellation boundaries, role/tool/history policies and profile digest |
| M27-N3 | Native generation/context/tool/metadata implementation | Native unit/conformance checks plus bounded graphical probes; no replacement executor |
| M27-S1 | Durable server context/generation/continuation and replay records | Transactional ownership/idempotency/all-ingress serialization/restart tests |
| M27-G1 | First-party capability/validation/result contract refresh | FastAPI still only relays the existing server; unsupported fields rejected before admission |
| M27-A1 | Separate package fingerprints/adoption and affected acceptance | Real native evidence and inherited race/artifact checks; every required gate resolved |
| M28-O1 | Frozen OpenAI endpoint/field/error profile | Every accepted field has a verified native or implemented server meaning |
| M28-O2 | Models and Chat sync/SSE encoders | Official SDK parsing plus stateful server/gateway tests |
| M28-O3 | Responses input/items/continuation/retrieval | Principal-scoped lineage, request-specific instructions, truthful lifecycle |
| M28-O4 | Background cancellation, retention and provider event ledger | Durable/restart-safe behavior and explicit unsupported modes |
| M28-O5 | Official SDK/client request fixtures and integration | Exact SDK pins/locks; primary client field captures; no fixture-only native claim |
| M28-O6 | Contract freeze and M30 handoff | Focused/root checks pass; source/native/parser/client evidence layers separated |

Labels N/S/G/A refine the remaining M27 children; they are work packages, not additional release milestones. O labels are planned M28 work packages. Some internal checks can run independently, but native semantics freeze before downstream encoders rely on them.

## M27-N1: reduce feasibility risk first

Time-box the first source/build spike to approximately **two to four engineering days**, as a planning estimate. Use a separate candidate build based on Cline commit `f58bc118bdeef1bd2813cd08e00d98bdcda96475`. Revalidate source/lock provenance before building. Do not overwrite frozen M19–M23 packages or the stock installation. The spike runs only through the existing native graphical task/session.

Answer these questions with small tests before broad implementation:

1. Can the app host import/export a caller context atomically without adding local task history, environment details, completion nudges or automatic compaction?
2. Can its actual provider adapter preserve the supported privileged instruction roles and pass caller function definitions, selection mode, parallel-call constraint and stock Roo's required strict-schema flag? Can the native provider enforce that strict function schema during generation?
3. Can one native generation return structured calls and finish metadata before any tool executor runs? Verify with an instrumented executor that rejects invocation, plus a disposable file-effect marker.
4. Does the selected provider/auth/model receive a tiny explicit output budget and stop with observed length metadata, without retries that expand the generation?
5. Can raw measured usage and trustworthy text/tool/finish events be captured before legacy flattening/defaults? Which details are absent?
6. What exact native counting route covers text, privileged instructions, tools and supported images? A heuristic-only answer leaves counting blocked.

Record evidence per profile. If a question fails, identify the smallest app-owned SDK/provider change needed and update the estimate. A negative spike does not finish M27. Do not switch the user to a new model/authentication mode automatically. If the proposed bounded patch cannot provide required semantics, record the concrete blocker and present a revised native proposal for review.

## M27-N2/N3: contract and native implementation

### Proposed neutral records

Keep OpenAI spelling/encoding in FastAPI. Introduce reviewed vendor-neutral generation/context types in `protocol/` and `adapters/core/`; names below are design concepts, not adopted wire spelling. Preserve existing v2.0 messages and requirement IDs. Review version negotiation before exposing a new wire/native contract; reject a stale API 1.2 peer rather than coercing a new request into text submit.

| Record | Necessary data and invariants |
| --- | --- |
| Generation request | Operation/command identity; binding epoch and expected conversation revision; context snapshot/digest; ordered role/content items; request-specific privileged instructions; caller tools; enforced generation options; profile digest |
| Context snapshot | Principal/consented binding/profile ownership; immutable parent/version/digest; normalized content and media ownership; pending call IDs; native import/export receipt; retention boundary |
| Native generation event | Generation/model-request identity; monotonic event sequence; content/tool item identity; observed fragments with raw argument text when available; finish/usage presence and provenance |
| Generation result | Native accepted/applied evidence; authoritative snapshot/watermark; observed finish category; caller calls; measured usage; partial/uncertain flags; successor context identity |
| Count request/result | Same authorized profile/context framing; exact supported tokenizer/provider identity; measured count and supported content scope; no substituted model or estimate presented as exact |
| Capability profile | Native source/bundle/API fingerprints, adapter/auth/model identity, supported roles/tools/options/counting/media/stream policy and limits; digest frozen at admission and rechecked before effect |

The exported capability must distinguish ordinary native agent mode from API generation mode. Consent is graphical and task/profile-specific. Revocation, native permission loss, model/auth change, local takeover or stale revision prevents mutation at the effect boundary. Use `AdapterMutationContext.assertAuthority()` immediately before context import, model dispatch and any persistent context commit; honor cancellation throughout. Controls preserve their existing addressed request/action/revision/expiry checks.

### One existing runtime, one generation

Add an explicit API policy to the existing app-owned host/runtime, with a rich native generation result. Use the selected app model and its own provider adapter; do not create a public executor. The API policy publishes caller schemas without local executors, returns the first model generation and disables hidden agent iterations, local/MCP/provider tools, plugin/subagent execution, automatic completion nudges, empty-answer retries and max-token continuation.

For the stock Roo target, forward and enforce strict function schemas at the actual native model adapter. Preserve schema semantics and supported constraints; an SDK tool-description type alone does not prove enforcement. Post-validation or a second repair generation cannot substitute. If the selected provider lacks this capability, that profile cannot qualify stock Roo; implement a suitable consented native path or explicitly nominate and accept a maintained non-strict caller variant.

Model transport retry policy must distinguish a provably undispatched request from an unknown/partially observed effect. Once native dispatch might have happened, persist uncertainty and reconcile; do not launch a replacement generation automatically. A returned tool call normally completes the operation even though its context awaits caller results. This releases the generation reservation; it does not grant a different caller access to that continuation.

### Context selection and instruction rules

For Chat, import the complete supplied history as this request's context. Allocate a new branch or verify an exact known snapshot; never guess a shared branch from common text. A history edit/removal uses a new immutable version. For Responses, the server resolves an authorized parent snapshot and appends supported input items. Request-specific instructions are rebuilt for each generation, independently of parent lineage.

Do not append hidden task history, native environment prompts or unrelated output to API context. Keep graphical task status visible while separating API branch history from normal local history. Restoration after a failed generation must be deliberate and evidenced; restoring a revision number alone is insufficient. Local edits interrupt API authority and require reconciliation/reconsent; they must not silently become the next caller's context.

Preserve caller call IDs, item IDs, tool names, raw argument strings when observed, result content/error status and ordering. Validate name/ID uniqueness and unresolved-result correspondence. Imported full history can contain caller-supplied historical calls/results as content; only a server-owned pending continuation can grant the next addressed result transition. Text never creates privileged control metadata.

Bound context size, branch count, item/tool/schema count and nesting, argument/result bytes, media count and lifetime. Native context overflow fails explicitly. Do not silently truncate or compact API history. Counting/import must use the same framing as generation.

### Metadata and output

Capture raw provider/model events before aggregation. Distinguish absent usage from observed zero and session totals from generation totals. Retain model request provenance and observed finish reason, including length/filter/error/abort. Unknown completion remains `completion_unverified`/uncertain in the neutral operation state; it cannot become a successful provider stop.

For the first correct implementation, buffer mutable native output until a verified terminal snapshot and offer documented terminal-buffered delivery. Enable incremental delivery only after append-only text/tool argument behavior is proven for that profile. Persist before publication; final snapshots agree with the emitted prefix and watermark. Do not derive tool calls by parsing ordinary assistant prose or expose hidden reasoning from an inferred category.

## M27-S1/G1: extend the existing checkpoint

Reuse `server/src/public-api/`, the existing command/ack/lease machinery, binding scheduler and gateway internal HTTP path. The existing first-party text checkpoint stays useful, but a provider generation needs richer durable records than text plus a final transcript category.

Proposed server migration: context snapshots/lineage, generation metadata and pending caller-call/result records; optionally an ordered neutral generation event ledger. M28 owns OpenAI object IDs/encoded replay unless a neutral server ledger already supplies that distinction. Do not place OpenAI-specific roles/object shapes in shared protocol or native modules.

| Transaction boundary | Required behavior |
| --- | --- |
| Admission | Authenticate live key; authorize principal/current consented binding; validate profile and payload; resolve owned context; reserve all-ingress native slot; persist immutable original request/command and idempotency identity atomically |
| Dispatch | Recheck binding epoch, lease, context revision and profile; existing durable device inbox/tombstones remain authoritative |
| Terminal settlement | Store observed result, successor context and pending calls consistently with a terminal watermark; unknown receipts cannot invent completion |
| Tool-result continuation | Validate parent ownership/profile/calls; record each addressed result once; duplicate identical result is idempotent, changed result conflicts; no local execution |
| Replay/restart | Retrieve original result/events and lineage after worker/native disconnect; no replacement command for uncertain effect |
| Key rotation/revocation | A new authorized key for the same principal may retrieve owned records only with current binding/profile authorization; revocation stops live access and stale dispatch |
| Retention/capacity | Preserve unresolved operations/tombstones; refuse new capacity instead of evicting pending state; expiry never authorizes automatic re-execution |

Use two clients with distinct secrets and identical conversation prefixes to prove isolation. Include GUI/native input races, multiworker admission, local takeover between admission/import/dispatch/commit, device receipt continuity and model/profile change while queued. Branches share the same existing native inbox/scheduler; they do not create a task pool to evade serialization.

Update first-party OpenAPI, capability discovery and result contracts to reflect these semantics. Validate every option at both public and authoritative server boundaries before reservation/dispatch. Preserve upload/commit checks and loopback/authentication. PNG/JPEG must be owned and validated; do not fetch arbitrary caller URLs with local credentials. Gateway contains no database, native socket or model SDK execution.

## M27-A1: finish the milestone

Build a separate maintained native revision and companion with exact locks, source patch, SDK graph, bundle/addon/package hashes and a candidate manifest. Review the API/profile change and adoption; graphical setup installs/selects the candidate only as part of the authorized native acceptance procedure. The old source cache and fresh tag review do not constitute adoption.

Required real-host matrix:

| Test | Passing evidence |
| --- | --- |
| H1 history isolation/edit | Two caller contexts do not leak; edited earlier message changes the actual imported context; local history remains excluded |
| H2 privileged roles | Actual provider request preserves the declared roles/order; current instructions are replaced/omitted correctly |
| T1 caller ownership | Actual model emits a structured harmless tool call; native executor/file markers show zero effects; caller result produces the next generation |
| T2 controls | None/auto/required/named choice, parallel false and required strict function schemas are honored for the advertised profile; unsupported modes fail before native dispatch |
| G1 cap/usage/count | Small real native cap produces observed length; measured usage matches its generation; exact count route/framing covers the declared media/tools |
| S1 stream/final | Text/tool IDs/fragments and terminal watermark agree; replacement/failure is handled without a false finish; buffering policy recorded |
| A1 authority/races | Local takeover/task/model/profile switch, lease/key revocation and cancellation at each mutation boundary prevent stale effects |
| R1 recovery | Reload/lost native result/storage failure preserve original command and uncertainty; replay cannot repeat a generation/tool effect |
| I1 inherited flow | Existing Connect, text/images, approvals/questions/cancel and affected M23 hardening still pass for the candidate |

Record actual native/provider/model/auth/host versions, exact input/output links and exclusions. Privacy-sensitive request capture must redact credentials and use disposable content; do not add prompt snippets to general logs. If a required row is unsupported, M27 stays In Progress. After the rows pass, freeze the neutral contract and then issue a completion record. Full provider-route/named-client qualification remains M30.

## M28 implementation details

### O1: endpoint and option policy

Freeze the [research profile table](../m27-m28-native-openai.md#m28-contract-choices) into a versioned field matrix. Every explicit property is implemented with semantics or rejected. Unknown keys, incompatible fields and unsupported non-null options fail with a parameter-specific OpenAI error before server admission. Null/omitted/default distinctions are intentional and tested; a documented default is not permission to silently ignore an explicit option.

Advertise only aliases the caller can use, tied to current consented native profiles. Model discovery cannot imply vendor account access, hosted models, embeddings or arbitrary native model selection. SDKs use an SDC key and the SDC `/v1` base URL.

Core accepted profile targets: text, supported owned images, full Chat history, Responses item history/local parent IDs, privileged instructions, caller function definitions/results, supported tool choice/parallel controls, required strict function tools for stock Roo, one generation, enforced output budget, client sampling options that the native profile actually supports, observed usage and stable finish/output. Strict response JSON/output guarantees, opaque reasoning, builtins, hosted conversation objects, audio/files and other optional modes remain explicit errors until independently qualified. A required client field cannot be dismissed as optional merely because the implementation lacks it.

In the initial non-strict function profile, Responses tools require explicit `strict:false`; reject omitted strict unless the official normalization/fallback semantics are implemented and native strict enforcement is available. Chat's omitted strict has a different default. Capture the primary client's actual tool definitions, including any strict flag supplied by its common provider helper, before qualification. [Official defaults](https://developers.openai.com/api/docs/guides/function-calling#strict-mode).

Released source already establishes that Roo's common helper supplies `strict:true` for ordinary tools. The non-strict profile therefore cannot qualify stock Roo. Resolve native strict function enforcement in M27 for this target, and test the exact generated schemas during M28/M30; a caller patch requires a separately declared profile. [Roo common helper](https://github.com/RooCodeInc/Roo-Code/blob/27001b2b5aa47b65e8a6ba1914e0f4216be0ebb0/src/api/providers/base-provider.ts#L27).

### O2: Chat encoder

Create a provider-specific module under `api-gateway/sdc_gateway/` with typed sync/chunk/error models and normalization. Route normalized requests through the neutral generation path. Return a real completion only after observed settlement; do not return the first-party 202 operation body. A bounded sync timeout returns a documented error plus SDC recovery identity without cancelling accepted work or inventing an answer.

Stream stable `chat.completion.chunk` objects, preserving call indexes/IDs/names and argument strings. Finish maps only observed native categories: stop → stop; budget stop → length; structured caller calls → tool_calls; supported filter → content_filter. Native error/cancel/unknown becomes an error, not stop. Emit the requested measured usage chunk and `[DONE]` only according to the frozen terminal policy. Interrupted streams cannot emit fake successful completion.

### O3/O4: Responses and lifecycle

Normalize input strings/messages/function-call/function-output items without flattening their structure. Map output items with separate response ID, output item ID and call ID. Resolve `previous_response_id` in server-owned lineage with current principal/binding/profile authorization. Invalid, expired, cross-principal, stale-binding or unresolved parents fail deterministically; never dispatch a fresh task as a fallback. Do not implement a hosted `conversation` object implicitly.

Implement recommended `background=true` as durable server orchestration of the same native GUI generation. Responses create returns a typed queued/in-progress object, not an LLM execution process in FastAPI. Retrieval observes queued/in-progress/completed/incomplete/failed/cancelled state. Cancellation of queued work uses existing skipped-command continuity; cancellation after native acceptance uses addressed controls and waits for observed outcome. A completed result wins a racing cancel; a recorded cancel alone is not cancelled. Cancellation of a foreground Response is explicitly rejected by the compatible route; first-party cancellation remains separately documented.

Use a persisted provider event projection with deterministic IDs/order and a typed Responses lifecycle. Item/part/text/function-argument events precede their done events; exactly one terminal outcome is observed. Sequence numbers are response-local and independent of session output revisions. Preserve emitted data across restarts; profile/encoder version changes cannot rewrite an existing response's replay. Response retrieval and stream replay remain live-authorized.

Initially support the local durable retention profile and reject `store=false` explicitly. Declare the seven-day local window and expiry behavior; do not promise OpenAI cloud retention. A later `store=false` implementation needs a separate reviewed content-retention/audit/retry design, not merely hiding GET while keeping an undocumented response indefinitely. Background/stateless combinations follow that explicit profile.

### O5: retry identity and client qualification

Use official Python `3.26.0` and Node `7.30.0` as candidate development test pins. Verify registry artifacts, resolve exact transitive locks and commit manifest/lock changes when implementation begins. They parse and call the public gateway in tests; FastAPI still does not execute models.

Generation POSTs need an immutable logical request key to guarantee replay across timeout/restart. The inspected SDK transport has an optional idempotency-header facility; its base configuration does not by itself prove an application key reaches the wire. Roo's reviewed provider call also does not supply a per-generation SDC key. Therefore, **stock Roo is a semantic acceptance candidate with an unresolved retry integration**, not an already safe drop-in client.

Source anchors: [Node optional header](https://github.com/openai/openai-node/blob/a4942ba48e999f9f637f81c5c925ed91b326343f/src/client.ts#L2289), [Python default/header wiring](https://github.com/openai/openai-python/blob/4e152cdefe1844c2d5d78653310e9b9c0195c44e/src/openai/_base_client.py#L472), [Roo request](https://github.com/RooCodeInc/Roo-Code/blob/27001b2b5aa47b65e8a6ba1914e0f4216be0ebb0/src/api/providers/openai.ts#L172). Verify the installed client's actual SDK dependency separately; the independently nominated SDK test pins do not establish Roo's dependency version.

Preferred qualification route: supply a key once per logical generation through the caller's request adapter, keep it through SDK retries, persist/reuse it for recovery and assign a new key to a new intentional request. The official SDK tests use explicit request headers. Roo may need a bounded, declared maintained caller-transport patch if its installed release has no per-request integration point. Record that candidate's exact patch/package fingerprint; do not claim stock-release support.

If a keyless compatibility mode is considered, define its reduced guarantee explicitly. Reject known automatic retry attempts before new admission, preserve accepted unknown work and expose recovery through the first-party API. Retry counters, static custom headers and payload hashes are not unique logical request identities. Disabling SDK retries does not solve application-level manual resends; do not claim full recoverable exactly-once behavior for that mode. No heuristic deduplication that merges two intentional identical requests.

Capture Roo's actual released request fields with a read-only loopback fixture in implementation, then qualify tools/history/cap/temperature/usage together. Continue is secondary Chat; its reviewed release does not route Responses to a custom base URL. Official SDKs cover M28 Responses; a named Responses coding client needs separate source/route qualification if later advertised. M16–M18 remain Deferred; testing a caller does not resume Codex native integration.

### O6: tests and handoff

| Suite/layer | Required cases |
| --- | --- |
| Format fixtures | Sync Chat/Responses shapes; text/tool/mixed output; unknown usage; length/filter/error; Unicode and split arguments; SDK parsing/helpers |
| Validation/no dispatch | Strict tools on an unqualified profile, unsupported response formats/builtin/opaque reasoning/options; conflicting caps; invalid history/results/images; `n>1`; unauthorized alias; verify command count remains zero |
| Real server/PostgreSQL | Context/parent ownership; original-key replay/conflict; two workers; result/cancel race; retrieval/expiry/key rotation; failure between ledger commits |
| Real FastAPI/TCP | Error envelopes/statuses, flushing/buffering policy, disconnect, backpressure, malformed upstream frames, live revocation, restart replay and no double execution |
| Stateful tools | Multiple calls, reversed addressed results, exact duplicate result, changed duplicate, missing/unknown call ID, history edits, no native tool effects |
| SDK transport | Explicit key plus timeout/retry/409/429/5xx/lost response; fresh request versus replay; foreground errors/background polling/cancel; candidate SDK default retry settings |
| Native regression | M27 frozen native profile still honors actual history/tools/caps/usage/finish; affected M23 protections preserved |
| M30 handoff | Exact client/settings/patch and native/server/gateway pins; public-route smoke fixture results kept separate from real caller effects and native evidence |

Run focused package checks as each stateful seam changes; then root `npm run build`, `npm run lint`, `npm test` with applicable disposable integration URLs. Use Node 24/npm 11. Run `swift test --package-path companion` if companion/shared cross-language seams change. Preserve and verify M19–M23 artifacts; run affected native/repair suites rather than interpreting empty modules as evidence. Record exact commands, versions, pass/skip/failure counts and cleanup. No implementation tests are claimed by this planning amendment.

M28 completion requires the frozen matrix, both endpoint families, required history/tools/options/lifecycle behavior, exact official SDK parsing/integration and resolved semantic/retry limitations for each advertised profile. Full installed named-client acceptance remains M30. A parser-only fixture cannot finish native compatibility or release acceptance.

## Requirement traceability

| Requirement | Planned implementation and acceptance |
| --- | --- |
| FR-19–FR-22 | Preserve first-party M27 checkpoint; S1/G1 extend server authority/operations/aliases and typed REST without a gateway bypass |
| FR-23 | O1–O6 model discovery, Chat/Responses formats, errors, lifecycle and official SDK checks |
| FR-24 | N1/N3 resolve shared truthful counting/provenance; provider-specific Messages/version semantics remain M29 |
| FR-25 | N2/N3/S1 history/instructions/lineage; H1/H2 plus O3 ownership/edit/expiry tests |
| FR-26 | N3/S1 caller-owned calls/results; T1/T2 and stateful addressed-result tests |
| FR-27 | N1/N3 caps/usage/count/finish/output; G1/S1 and O1/O2/O4 no-dispatch/stream/terminal tests |
| FR-28 | G1/O5/O6 exact OpenAPI/SDK/client profiles; full named public/native route and caller effects remain M30 |
| FR-01–FR-18 | A1 retains inherited native authority, approvals, Connect, scheduling, storage/recovery and graphical workflow gates |

## Estimates and decisions to freeze during implementation

Planning estimate after the spike: roughly **three to six engineering weeks for remaining M27** and **one-and-a-half to three weeks for M28**, assuming an existing consented profile can satisfy counting/caps and the maintained native build is reproducible. These are effort ranges, not delivery dates. Native counting, instruction projection, provider/auth constraints and real-host races can extend them. Re-estimate after N1; prioritize correctness before client/UI polish.

Implementation must record the chosen native model/auth profile, role mapping, context import/export/restoration policy, counting provenance, stream buffering policy, local retention/background behavior and retry-key/client integration in reviewed contract/adoption records. The recommendations above provide concrete defaults; they do not require a permission round-trip to begin authorized source work. A new native adoption/install and any unresolved product-scope choice must be concrete and reviewable before approval. Required gaps cannot be waived by changing a capability label.

**Next concrete implementation action:** M27-N1 on the recorded upstream source, preserving the existing native installation and packages, followed by N2/N3/S1/G1/A1 under M27. M28 remains gated.
