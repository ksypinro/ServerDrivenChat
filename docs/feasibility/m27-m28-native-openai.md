# Remaining M27 and M28: source research

> **Architectural amendment, 2026-10-08:** source findings remain valid research, but the native-first recommendations below are superseded by [DECISION-010](../decisions/010-server-owned-api-semantics.md) and the [server-owned execution plan](server-owned-api-plan.md). Public API history/tool/alias/budget semantics belong to the server; explicitly labeled estimates are permitted. This report does not impose mandatory native provider equivalence on the clarified SDC profile.

**Recorded:** 2026-10-08. **Scope:** research and implementation planning requested by the user. **Status:** M27 In Progress; M28 Not started. Read the [execution plan](m27-m28-execution-plan.md), [tracker](../../IMPLEMENTATION_TRACKER.md), [current native gate](../native-public-api-gate.md) and [research evidence](../../evidence/planning/m27-m28/README.md) together. This document proposes changes; it does not adopt a native revision or establish client compatibility.

## Recommendation

Finish M27 by adding a **graphically consented API generation mode to the existing Cline task/session**. That mode makes one model generation, imports the caller's selected context, returns structured caller tool calls without executing them, and exposes observed generation metadata. Keep the server authoritative for ownership, context lineage, idempotency and scheduling. FastAPI remains a facade. After the native contract and its affected race tests pass, implement M28 as two provider encoders over that same neutral contract.

Use **Roo Code v3.54.0, OpenAI Compatible**, as the primary named Chat Completions acceptance candidate. Use official Python and TypeScript SDKs as the Responses baseline. Continue v2.0.0-vscode is a secondary Chat candidate; its released adapter does not select Responses for an SDC base URL. These are source-informed test targets, not qualified clients. M30 still owns complete client → public gateway → server → real Cline acceptance.

Do not try to close the gate by concatenating history into a prompt, intercepting Cline tools as caller tools, using a stop hook as a tool yield, or truncating displayed output to simulate a cap. Those approaches lose required semantics. The feasibility of the proposed native mode is supported by source seams, but its implementation and real-host behavior remain unproved.

## What was inspected

Research used repository contracts, the exact upstream Cline tag, released client source, official OpenAI documentation and official SDK release documentation. Source URLs, commit IDs, byte hashes and limitations are recorded in the [manifest](../../evidence/planning/m27-m28/source-manifest.json). Public source was downloaded into a temporary research cache, without installing packages or changing app settings.

| Subject | Reviewed identity | What this establishes |
| --- | --- | --- |
| Upstream Cline | `v4.1.22` → commit `f58bc118bdeef1bd2813cd08e00d98bdcda96475`; Git tree `fda0e03f5759b4a526e85886b9cdacd503b9f486` | Source-level candidate seams and limitations |
| Adopted native build | Cline `sdc-m21.3` / `4.1.2203`, app-owned API `1.2`; companion `0.5.0` recorded by M23 | Existing recorded acceptance only |
| Current M27 candidate | Companion `0.6.0`, built but uninstalled/unaccepted | Transport/authority/category checkpoint; no provider semantic expansion |
| Roo Code | `v3.54.0`, commit `27001b2b5aa47b65e8a6ba1914e0f4216be0ebb0` | Concrete Chat request shape to test |
| Continue | `v2.0.0-vscode`, commit `03b05ef60c378ff06f9e39ada2e22c95fe9ef6ad` | Chat/Responses routing constraints in a released client |
| Official SDK candidates | Node `7.30.0`, Python `3.26.0`, released 2026-10-06 | Candidate M28 development test pins; no dependency adoption in this research |

Fresh tagged downloads match the prior cached `agent.ts`, `vscode-session-host.ts` and `vscode-runtime-builder.ts` byte-for-byte. This resolves their upstream source provenance. The historical M27 `cachedTreeSha` is the resolved **commit ID**, not the actual Git tree ID. Preserve the historical evidence and use the corrected identities in new records. Source equality does not prove that the frozen native bundle exports these features, or that a new build behaves correctly. The tag's VS Code manifest uses workspace Cline SDK packages; a candidate build must record the resolved workspace graph and bundle fingerprints. See the [pinned manifest](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/apps/vscode/package.json).

## Native findings and their consequences

### Context and instructions

The shared runtime config provides `initialMessages`, `systemPrompt`, `modelOptions` and `prepareTurn`. Its documentation explicitly limits `prepareTurn` to request projection; it does not replace the canonical transcript. The message role union is user/assistant/tool. These seams therefore do not prove preserved system/developer hierarchy or isolated canonical histories. [Pinned shared contract](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/sdk/packages/shared/src/agent.ts#L100).

The session orchestrator restores a conversation store, seeds runtime messages from canonical history and writes returned runtime messages back. Its legacy result derives finish state from runtime status. These are useful app-owned context seams, but need guarded API-mode import/export and a richer result contract. [Pinned orchestrator](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/sdk/packages/core/src/runtime/orchestration/session-runtime-orchestrator.ts#L578).

**Proposed design:** immutable API context snapshots belong to a principal, consented binding, model/auth profile and lineage. A generation imports one snapshot into the existing app session under the same effect-boundary authority checks as current commands. It exports the observed result into a successor snapshot. Keep local task history and unrelated client branches out of that selected context. Local edits/takeover invalidate the expected revision; do not merge them silently. Imported assistant/tool history is model content, never native control authority.

Represent privileged instructions separately in the neutral contract, preserving roles/order until the native provider adapter has applied a reviewed mapping. A provider supporting only one system string cannot automatically be advertised as supporting every combination of system/developer messages. Demonstrate the exact supported profile or reject that combination before admission. Responses `instructions` apply to the current request and must not carry over implicitly through `previous_response_id`. [Official instruction guide](https://developers.openai.com/api/docs/guides/text).

### Caller tools require a new generation outcome

The normal agent loop executes tools before continuing. Setting `maxIterations=1` still reaches tool execution and can subsequently fail at the iteration limit. A stop hook throws a controlled stop classified as aborted. The runtime also contains max-token recovery and request-retry paths; run results omit a separate provider finish reason. These mechanisms are not a caller-tool yield contract. [Pinned runtime](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/sdk/packages/agents/src/agent-runtime.ts#L831).

**Proposed design:** add an explicit API generation policy inside the existing app-owned runtime. Publish caller function definitions without executable native handlers. Disable local builtins, MCP tools, provider builtins, subagents, completion reminders and automatic multi-generation recovery for this policy. A structured function-call result finishes this generation normally; its context can remain pending caller results. The caller executes its own tools and returns addressed results in a subsequent request. The native generation must cause zero caller tool effects. The ordinary Cline task mode keeps its existing controls and permission flow.

This is a maintained native SDK/app change, not merely a companion wrapper. Do not instantiate a second external runtime or call model SDKs in FastAPI. Cline's internal provider gateway is part of the native application; it is distinct from the repository's public FastAPI gateway.

Official function calling is a caller-managed request/call/result/next-request flow. `tool_choice` constrains selection and `parallel_tool_calls=false` limits a generation to zero or one call; serial local execution is not equivalent. Strict schemas need actual enforcement, not a prompt saying “return JSON.” [Official function-calling guide](https://developers.openai.com/api/docs/guides/function-calling).

### Generation parameters depend on the actual adapter and authentication

The native config builder forwards a limited set including `maxTokensPerTurn`, temperature and reasoning options. That wiring alone does not prove every adapter honors them. The OpenAI vendor adapter conditionally forwards explicit output caps for API-key use and omits them for its ChatGPT OAuth endpoint. [Config builder](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/sdk/packages/core/src/runtime/config/agent-runtime-config-builder.ts#L145), [OpenAI adapter](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/sdk/packages/llms/src/providers/vendors/openai.ts#L33).

A registered-handler adapter also deserves separate review: the inspected path calls `createMessage` with system prompt, messages and tools without passing the generation options object; absent explicit done events it synthesizes stop/tool-calls on stream return. Do not qualify this path for caps or exact finish metadata from that signature. [Pinned registered-handler adapter](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/sdk/packages/core/src/services/llms/apihandler-agent-model-adapter.ts#L135).

**Proposed design:** capability evidence is keyed by native source/bundle/API version, provider adapter, authentication mode, selected native model and context policy. API aliases select these consented bindings; they do not authorize arbitrary model changes. Exclude unsupported profiles from the advertised generation capability. For a cap-capable profile, prove the request reaches the provider with the correct budget and that a tiny budget produces an observed length outcome without a hidden continuation. Modern OpenAI output budgets include reasoning as well as visible output. A gateway character limit cannot satisfy this. [Responses create contract](https://developers.openai.com/api/reference/python/resources/responses/methods/create).

Changing the user's authentication/model selection is a later graphical setup/adoption action, not an assumption in this research. If the selected profile cannot honor a required cap, M27 remains blocked for that profile until a lawful native path is implemented and accepted.

### Usage and counting need provenance

The VS Code host exposes accumulated session usage. Native runtime aggregation defaults absent usage fields to zero. Neither is sufficient to establish exact per-generation measured usage. Preserve field presence, provider request identity, generation identity, retry accounting and native model/auth provenance before any accumulation. [VS Code host](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/apps/vscode/src/sdk/vscode-session-host.ts#L233), [usage aggregation](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/sdk/packages/agents/src/agent-runtime.ts#L2265).

The shared counting utility is explicitly a character-based heuristic. It can support an internal estimate with that label; it cannot be exposed as an exact model request count. [Pinned token utility](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/sdk/packages/shared/src/llms/tokens.ts).

**Proposed design:** add an app-owned count capability using the selected native provider's real counting route or a proven model-specific tokenizer plus request framing, images and tool-schema accounting. The public gateway calls the server, which dispatches this authorized native capability; it does not call a different OpenAI model to obtain a substitute count. Validate count and usage independently, including cache/reasoning details when available. Missing counters remain unknown. If a public encoder cannot represent available metadata truthfully, reject that advertised profile rather than invent zeroes. OpenAI now documents model-aware input counting, including instruction and content inputs. [Official counting guide](https://developers.openai.com/api/docs/guides/token-counting).

Counting is a shared M27 prerequisite for the applicable M29 profile, even though this research focuses on M28. Do not defer its unresolved semantics by declaring the OpenAI work complete first.

### Provider streams need committed output

Current first-party output supports replacement revisions. A provider delta stream cannot retract earlier text. The API generation policy must expose ordered native text/tool fragments, observed finish state and a terminal snapshot with one consistent watermark. Native category metadata alone does not prove provider commentary/final-answer semantics.

**Recommended rollout:** first provide terminal-buffered SSE using the actual observed generation result. Emit a truthful stream with a complete text/tool argument fragment at terminal completion; document its delayed delivery. Then enable live deltas only for native profiles that prove append-only output and precise terminal metadata. Do not advertise token-level latency from buffered delivery. If output changes behind an emitted prefix, fail the stream explicitly and preserve the authoritative operation result; never append a second answer as correction.

Chat chunks need stable IDs/indexes, deltas, observed finish reason and the terminal sentinel. A usage-enabled final chunk can have empty choices; missing final usage on an interrupted stream is allowed. [Chat streaming contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events). Responses uses typed item/text/function-argument lifecycle events and sequence numbers. Its cursor must be distinct from the repository's session event revision. [Responses streaming contract](https://developers.openai.com/api/reference/resources/responses/streaming-events).

## M28 contract choices

The following are proposed compatibility profile decisions, not implemented behavior. Freeze them after M27 native evidence identifies supported semantics.

| Concern | Recommended M28 behavior | Acceptance consequence |
| --- | --- | --- |
| Paths | `/v1/models`, `/v1/models/{alias}`, `/v1/chat/completions`, `/v1/responses`, `/v1/responses/{id}`, applicable `/cancel` | Official SDKs use a custom `/v1` base URL and SDC keys |
| Chat history | Full request history is authoritative; preserve structured tool calls/results and ordered content | Editing/removing an earlier message cannot reuse stale native context |
| Responses history | Support explicit input and locally owned `previous_response_id`; no arbitrary native task IDs | Resolve parent under current principal/binding/profile; preserve item order and call IDs |
| Instructions | Request-specific privileged channel; no automatic previous instruction inheritance | A/B instruction swaps and omitted instructions have separate exact-context tests |
| Tool schemas | Function tools initially; implement required selection/parallel controls and native strict enforcement for stock Roo's ordinary tools | Unknown tools/builtins and unsupported schema modes fail before dispatch; non-strict support alone cannot qualify stock Roo |
| Generation | `n=1`; required caps and client temperature reach a verified native adapter | Conflicting cap fields, unsupported options and impossible budgets fail before admission |
| Usage | Only observed, attributed counters; preserve unknown details | No session totals, text estimates or zero-fill presented as measured usage |
| Images | Current supported PNG/JPEG via bounded validated bytes/owned uploads | Reject arbitrary URL fetches, unsupported files/audio/video/detail modes |
| Retention | Local durable response records, initially the existing seven-day operation window | Declare SDC retention explicitly; no OpenAI cloud retention/ZDR claim |
| `store=false` | Initially reject explicitly unless a reviewed nonretrievable response/audit design is implemented | Never accept it while retaining a retrievable response contrary to its semantics |
| Background | Recommend implementing server-owned durable `background=true` lifecycle | It queues native GUI execution; it does not introduce a background LLM executor |
| Cancellation | Only background Responses use the compatible cancel route; native control remains acknowledged/observed | Requesting cancellation cannot immediately claim a cancelled effect |
| Disconnect | Preserve accepted work per repository requirements; document this compatibility difference | Stable retry identity and retrieval are necessary; connection abort alone is not native cancellation |
| Errors | OpenAI envelope with stable code/parameter/request ID; no successful fake completion on blocked/uncertain work | SDK error classes and retries tested over real TCP |
| Unsupported features | Reject explicit unimplemented options, including remote builtins, opaque encrypted reasoning, hosted conversation objects, multiple choices, logprobs and strict response output formats | Required client options, including Roo's strict function tools, remain qualification blockers; optional unsupported features are declared |

Responses cancellation is documented only for `background=true` responses. Its response status family includes queued/in-progress/completed/incomplete/failed/cancelled. Implement a durable lifecycle mapping rather than returning a first-party operation body as a Response. [Official cancellation contract](https://developers.openai.com/api/reference/python/resources/responses/methods/cancel).

The repository explicitly preserves accepted work across first-party wait/disconnect. OpenAI's background guide distinguishes foreground connection lifetime from background persistence. Keep the repository guarantee and disclose the provider-profile difference; do not silently change cancellation semantics to satisfy endpoint shape. [Background guide](https://developers.openai.com/api/docs/guides/background), [local REST contract](../public-rest-api.md).

Manual Responses continuation must preserve all supported output items in order, including function calls and reasoning items where actually supported. Do not filter it down to assistant text, generate fake encrypted reasoning, or recast native progress as a supported reasoning artifact. Reject unsupported item types before dispatch. [Conversation-state guide](https://developers.openai.com/api/docs/guides/conversation-state), [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning).

Strict function/JSON output support is a separate native capability. Post-validation and retries do not establish generation-time strict enforcement. Initially reject required strict modes until that path is proved; a client that requires them remains unqualified. [Structured-output guide](https://developers.openai.com/api/docs/guides/structured-outputs).

For the nominated stock Roo profile, strict **function tools** are required: its common provider helper sets `strict:true` on ordinary tools (MCP tools are an exception). Consequently, add native strict-tool forwarding/enforcement to that profile's M27 spike and implementation. Until proved, Roo is blocked. A maintained caller patch opting into non-strict tools is an alternative declared profile, not stock Roo compatibility; silently removing strict at the gateway is unacceptable. [Released common tool helper](https://github.com/RooCodeInc/Roo-Code/blob/27001b2b5aa47b65e8a6ba1914e0f4216be0ebb0/src/api/providers/base-provider.ts#L27).

Defaults also matter: current official guidance says omitted function `strict` remains non-strict in Chat, while Responses attempts strict schema normalization with best-effort fallback. Until that behavior is implemented truthfully, require explicit `strict:false` in the supported Responses function profile and reject omission rather than silently downgrade it. [Function-calling strict defaults](https://developers.openai.com/api/docs/guides/function-calling#strict-mode).

## Client recommendation from released source

### Primary: Roo Code v3.54.0, OpenAI Compatible

The released provider accepts a custom base URL/key/model, sends system plus converted history, structured tools, tool choice, parallel-call selection, temperature and streaming usage. With `includeMaxTokens=true` it sends `max_completion_tokens`. The release documentation requires native tool calling without an XML fallback. That combination exercises the missing semantics directly. [Released provider](https://github.com/RooCodeInc/Roo-Code/blob/27001b2b5aa47b65e8a6ba1914e0f4216be0ebb0/src/api/providers/openai.ts#L155), [released tool protocol documentation](https://github.com/RooCodeInc/Roo-Code/blob/27001b2b5aa47b65e8a6ba1914e0f4216be0ebb0/apps/docs/docs/providers/openai-compatible.md#L56).

Proposed test configuration: OpenAI Compatible, SDC `/v1` URL, a scoped SDC key, a consented alias with no vendor-model-name heuristic triggers, native tools with proven strict-schema enforcement, streaming on, cap inclusion on with a small verified budget, and only the profile's supported temperature/image settings. Disable prompt caching/provider-specific thinking/R1/computer-use settings unless separately qualified. Capture actual wire requests from the installed release before finalizing settings; defaults and UI wiring remain an acceptance question.

Use a disposable caller workspace and a separate Cline target task/profile so the test cannot recursively dispatch into itself. The caller should read a fixture and propose a harmless edit under its own permissions; Cline API mode must show **zero** corresponding local tool effects. Client authorization does not grant the native task permission to run a same-named tool.

### Secondary: Continue v2.0.0-vscode, Chat only initially

The released adapter accepts `apiBase`, adds streaming usage and uses the OpenAI SDK. However, `shouldUseResponsesEndpoint` requires the exact official OpenAI base URL; setting `useResponsesApi=true` does not force it for an SDC URL. The normal core path selects that adapter. Consequently, do not recommend this release as a ready Responses client against SDC or disguise SDC aliases as vendor models to trigger routing. [Released adapter](https://github.com/continuedev/continue/blob/03b05ef60c378ff06f9e39ada2e22c95fe9ef6ad/packages/openai-adapters/src/apis/OpenAI.ts#L90), [released core selection](https://github.com/continuedev/continue/blob/03b05ef60c378ff06f9e39ada2e22c95fe9ef6ad/core/llm/llms/OpenAI.ts#L208).

Continue remains a useful second Chat candidate with explicit tool/image capabilities and no embeddings/autocomplete/rerank claim. Its alternate legacy Responses implementation requests encrypted reasoning and adds reasoning settings; that source is not proof the release's normal custom-endpoint path uses it. A future Responses client nomination must pass released routing and emitted-field review first.

### Responses baseline: official SDKs

Use Python `openai==3.26.0` and Node `openai@7.30.0` as initial candidate **test-only** pins, then verify their registry artifacts/transitive locks during M28 implementation. Exercise create, item/tool continuation, streaming helpers, retrieve, background cancel and error parsing with the real gateway. Neither SDK belongs on the gateway's native execution path. [Python release source](https://github.com/openai/openai-python/blob/4e152cdefe1844c2d5d78653310e9b9c0195c44e/README.md), [Node release source](https://github.com/openai/openai-node/blob/a4942ba48e999f9f637f81c5c925ed91b326343f/README.md).

Those releases document two automatic retries for selected failures and a ten-minute default timeout. Exact emitted headers and retry identity must be measured with these pins. Do not assume an SDK or client supplies a stable application idempotency key. A fresh request ID or identical text is not sufficient retry identity. Plan explicit SDC retry keys and client request correlation; identical intentional requests must remain distinct. A client unable to preserve retry identity needs a tested configuration with retries disabled, or it remains unqualified for the retry-safety profile.

The reviewed SDK transport sources make the idempotency-header facility optional; Python initializes its header name to `None`. Roo's reviewed call supplies no per-generation SDC key. Qualification therefore needs a wire-verified caller request adapter, potentially a declared maintained client patch. Disabling automatic retries alone does not make manual resends recoverable. [Node transport](https://github.com/openai/openai-node/blob/a4942ba48e999f9f637f81c5c925ed91b326343f/src/client.ts#L2289), [Python transport](https://github.com/openai/openai-python/blob/4e152cdefe1844c2d5d78653310e9b9c0195c44e/src/openai/_base_client.py#L472).

## Alternatives assessed

| Route | Assessment |
| --- | --- |
| Current text submit plus prompt-formatted history/tools | Rejected: loses context authority, role semantics, caller tool ownership and cap/usage guarantees |
| Hooks, `maxIterations=1`, stop before tools | Rejected as a complete solution: current loop/stop behavior does not yield a normal caller-tool result |
| App-owned API generation policy on the existing session/runtime | Recommended native implementation route; requires SDK/app changes and acceptance |
| Server/gateway direct model calls or separate headless runtime | Outside authorized architecture; cannot satisfy native execution requirement |
| Upgrade all Cline code to latest | Adds unrelated native changes and invalidates inherited evidence; prefer bounded patch on recorded source unless the spike proves an upgrade necessary |
| Implement endpoint encoders immediately | Useful only as future format fixtures; cannot unlock M28 before M27 passes |

## Remaining uncertainties

The most consequential unknown is which currently consented native provider/auth/model profile can honor caps, structured caller tools, exact usage and counting together. Source indicates candidate seams, not that full combination. Privileged-role projection, canonical task persistence, tool argument fragment fidelity, exact terminal provenance and local-edit restoration need a candidate native implementation and controlled graphical probes.

The research also does not establish Roo UI defaults, actual extension-package contents, deployed proxy flushing, live identity-provider behavior or new native race acceptance. Resolve these with the staged work and tests in the [execution plan](m27-m28-execution-plan.md). No downstream requirement, M23 gate, adoption review or M30 client acceptance is waived.
