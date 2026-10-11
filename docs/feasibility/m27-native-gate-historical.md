# M27 native semantic gate

> **Superseded gate, 2026-10-08:** [DECISION-010](../decisions/010-server-owned-api-semantics.md) replaces the mandatory native-provider expansion below with a server-owned API profile and neutral backend connection. M27 remains In Progress. Server isolation/tools/budget estimates/results and real native input/output/control acceptance remain required; native tokenizer/strict decoding/generation-mode support are no longer blanket blockers. Read the [active server-owned plan](server-owned-api-plan.md); this body and original M27 evidence retain their historical scope.

**Status: blocked / M27 In Progress.** Cline 4.1.22 `sdc-m21.3` (4.1.2203), app-owned API 1.2 is the unchanged adopted native pin. Companion 0.6.0 is only a newly built, uninstalled candidate. M28/M29 remain Not started. Required unsupported behavior is not waived by a working REST facade.

## Source review and frozen outcomes

[Native API](../../adapters/cline/src/native-api.ts) exposes exact bind/snapshot/subscribe, text/image submit, addressed controls and Connect. Its `submit` accepts command ID, text, attachment IDs and expected conversation revision; it has no caller history, privileged instructions, external-tool continuation, generation parameters or usage/counting fields. [Native patch](../../adapters/cline/src/native-patch.ts) dispatches through the existing app session. [Adapter](../../adapters/cline/src/index.ts) observes native messages/phases and now preserves an opaque category through [OutputItem](../../protocol/src/contracts.ts). These signatures and native fingerprints are recorded in [gate evidence](../../evidence/M27/native-gate-review.json).

Cached upstream SDK source investigated during the earlier native work has `AgentRuntimeConfig.initialMessages`, `systemPrompt`, `modelOptions`, `prepareTurn`, hooks and tool definitions; the VS Code session host has app-owned session send and accumulated usage. These are **candidate seams**, not API 1.2 exports or proof that the adopted installed task can atomically honor public requests. `prepareTurn` explicitly projects the provider request without replacing canonical session history. Session-total accumulated usage does not prove this public operation's usage. A custom local tool's executor does not establish a caller-owned pause/result protocol. No inferred SDK capability is advertised as native support.

| Field/behavior | M27 classification | Required outcome |
|---|---|---|
| Existing-task text, PNG/JPEG, permissions and exact controls | native-supported for inherited pin | Original M19–M23 proof remains; fresh public/native journey belongs to M30 |
| Consented binding alias; durable operation/key/watermark | gateway-defined | Real server/HTTP tests pass; alias does not choose arbitrary vendor models |
| Same native task continuation | native-supported | Explicit shared task history; no independent caller-context claim |
| Arbitrary full history / isolated provider conversations | unsupported **blocker** | Reviewed native context allocation/reconciliation; unchanged prefixes, branches and local edits must be addressed; explicit graphical task-mode consent |
| Per-request system/developer instructions | unsupported **blocker** | Native privileged instruction lifecycle/replacement, task/turn ownership and consent; user-text framing is insufficient |
| Caller tool definitions / structured call IDs / addressed results | unsupported **blocker** | App-owned external-tool mode, pause before effect, original caller execution ownership, durable addressed continuation; suppress double/local execution |
| Generation caps and provider-required maximum output tokens | unsupported **blocker** | Native model-specific enforcement at generation; output truncation and prompt hints are insufficient |
| Sampling, stop, structured output, multiple choices | unsupported | Reject every option before dispatch; any required named-client field remains a blocker |
| Attributed token usage | unsupported **blocker** | Native per-run model provenance and accurate input/output/cache semantics across native iterations; no zeros/session totals masquerading as a provider call |
| Applicable model-specific token counting | unsupported **blocker** | Real app-owned counting or a reviewed declared profile; never character estimates or invented Claude tokenization |
| First-party revision streaming | native-supported plus gateway-defined relay | Real TCP replay/flushing/revocation tests pass; item replacements are explicit |
| Stable provider text streaming / final answer semantics | unverified **blocker** | Terminal-watermark freezing and preserved categories are implemented prerequisites; selected native/category granularity and provider encoders still need qualification |

The [field matrix](../../evidence/M27/native-field-matrix.json) and REST OpenAPI freeze the first-party profile. `providerReady` is false. History/messages/instructions/tools/limits/sampling/response-format fields outside this profile fail before admission. Provider encoders, official provider SDKs and named coding clients are intentionally unstarted M28–M30 work.

## Exact unblock work

Implement and review an **app-owned** native API expansion that resolves the required rows above under explicit task/profile consent. Review its tagged upstream SDK/model implementations, per-request lifecycle, arbitrary history rejection/branching rules, local changes and cancellation, resource bounds, tool result IDs/replay, token cap enforcement and usage/counting provenance. A task/model that cannot honor a required field must remain unavailable to that provider profile.

Build a separate maintained native revision without overwriting the adopted M21 archive or stock installation. Record new source/bundle hashes and an explicit adoption record, then obtain real graphical native evidence for the changed seams and affected M23 races. Pure fixtures, prompt-generated tool JSON, an MCP mailbox, a private socket or a new provider executor cannot close this gate. The current M27 companion artifact only transports authority/category changes; installing it alone will **not** resolve these provider semantics.

No native expansion has been implemented/adopted/tested in this checkpoint. That is outstanding M27 work, not a user scope exclusion or a passed negative-feasibility gate. The parent stays In Progress until those required implementations and affected acceptance pass; M28/M29 cannot begin merely because REST requests succeed against fixtures.

## 2026-10-08 research amendment

The user requested deep research and planning for remaining M27 together with M28. The [source report](m27-m28-native-openai.md) and [execution plan](m27-m28-execution-plan.md) recommend a consented single-generation policy inside the existing app-owned Cline session, neutral server-owned contexts/continuations, then OpenAI encoders after M27 acceptance. Required gates and statuses remain unchanged.

Fresh GitHub tag review resolves `v4.1.22` to commit `f58bc118bdeef1bd2813cd08e00d98bdcda96475`, actual tree `fda0e03f5759b4a526e85886b9cdacd503b9f486`. The previously cached shared agent contract and VS Code host/builder files match fresh tagged bytes. This resolves candidate source provenance, not adopted bundle/native support. The older evidence's `cachedTreeSha` names the commit, not the actual Git tree; retain that historical record and use the corrected identities in [new research evidence](../../evidence/planning/m27-m28/source-manifest.json).

The inspected agent loop cannot yield caller tools simply through `maxIterations=1` or stop hooks. Its OpenAI OAuth adapter omits explicit output caps; counting is heuristic; legacy usage/finish projections need richer provenance. Roo Code v3.54.0 is the primary Chat acceptance candidate, with a retry-key integration gap; Continue's reviewed release restricts Responses routing to the official OpenAI base URL. Official SDKs are the proposed M28 Responses baseline. No package installation, native adoption, model call or implementation test occurred in this research amendment.

Roo's released common helper sets `strict:true` on ordinary function tools. Native strict function enforcement is therefore required for the nominated stock-client profile and belongs in the M27 spike/gate; a non-strict maintained caller variant needs separately declared acceptance. The gateway must not silently drop the flag.
