# DECISION-010 — Server-owned API semantics and interchangeable backends

**Status:** Accepted architectural/scope clarification by explicit user instruction, 2026-10-08. **Specification:** 2.4; wire remains 2.0. **Implementation:** documentation/planning amendment only. M27 In Progress, M28–M30 Not started. This supersedes the mandatory provider-native expansion in DECISION-009 and the earlier M27/M28 execution plan; preserve historical source findings and acceptance.

## User intent and ownership

The user clarifies that public APIs expose this project's server. Consumers should not depend on which application supplies its input/output: initially Cline inside VS Code, potentially another application through a future adapter. The user explicitly permits server-defined model names and assumed token budgets. This changes the previous native-provider-equivalence gate, while retaining truthful accounting and actual native execution.

Use **client → FastAPI → existing TypeScript server → neutral adapter/bridge → existing graphical application**. The server owns public conversations/history, instruction composition, response lineage, caller-tool definitions/call IDs/results, aliases/routing, budget/count estimates, durable operations/replay, authorization and scheduling. FastAPI owns public validation/provider encoders and calls that server; it has no database/native bypass or model executor.

Cline supplies the consented task input/output/control connection. Native model execution, local history/tools/credentials and permissions remain application-owned. Public server history and native local history are distinct records. A native SDK single-generation mode, tokenizer or constrained decoder is not required merely to expose server capabilities. Backend changes need a concrete transport/control/safety justification.

Future adapters use the same neutral boundary. Backend selection is internal to authorized server routing. Service aliases such as `sdc-default` identify server policies, not real vendor models/accounts. Codex M16–M18 remain Deferred; this design does not implement or resume them.

## Declared SDC compatibility profile

The public provider-shaped interfaces are an **SDC task-backed profile**. Their execution/accounting semantics belong to the server. Familiar JSON/API shapes do not establish exact vendor behavior; document differences without requiring clients to understand Cline internals.

- **Histories/instructions:** store principal-scoped normalized history and compose backend input centrally. With a stateful backend, dedicate a consented binding to one API conversation or explicitly expose shared-task semantics. Separate database histories cannot erase hidden backend context. Rewinds/branches require a suitable authorized binding or a neutral context error; never silently mix contexts.
- **Caller tools:** compose a versioned reply envelope, parse/validate actual backend replies, assign durable public call IDs and return proposals for caller execution. Native activity is separate. Malformed/unknown calls, schema/selection/parallel violations fail before caller effects. Never fabricate calls or add a caller executor to Cline. Backend permission/control policy must prevent unintended native effects; qualify it or withhold that tool profile.
- **Strict tools:** server validation can guarantee published arguments conform; invalid backend output fails. Declare this as server-validated output, not native constrained decoding. A strict flag has this tested SDC meaning or is rejected. The blanket requirement to add native strict decoding for Roo is withdrawn.
- **Budgets/counts:** a deterministic versioned estimate can enforce admission, context/output byte limits, deadlines and delivered-output quotas. Budget exhaustion may request cancellation; actual backend stop is observed separately. Estimated limits are not upstream generation/billing guarantees.
- **Usage:** prefer attributable observed counters; otherwise return explicitly identified estimates of server-visible input/output with estimator/version/scope metadata. Do not invent cache/reasoning/billing counters. If a standard field cannot communicate this honestly, use a documented SDC extension/profile or reject exact-accounting mode.
- **Streaming/finish:** persist committed server output, buffer mutable native revisions when necessary and distinguish server budget termination from native completion. Missing completion, failure and uncertainty cannot become verified success.

Genuine model settings such as temperature cannot be implemented by relabeling policy; reject unsupported settings before dispatch using service-level errors. No generic full OpenAI/Anthropic or stock-client parity claim follows from the profile name.

## Milestones and acceptance

M27 finishes first-party REST plus common server conversation/tool/budget/result policies, with real server/database/HTTP tests and affected native connection/authority acceptance. Exact native provider history/role/cap/tokenizer/strict-decoding support is no longer a universal prerequisite. Server isolation, tool ownership, honest estimates, observed effects and native permissions remain required.

M28 implements OpenAI-shaped models/Chat/Responses over the server contract, including explicit accounting/limits, response IDs, streams and SDK/error/retry checks. M29 applies the same server policies to Messages/counting; counts may be labeled estimates. M30 qualifies exact client/server/backend configurations on the real public route. Clients requiring semantics outside this profile remain unqualified; they do not automatically require redesigning Cline.

Keep M27 → M28 → M29 → M30 → M24 → M25 → M26, M24 dependencies M23/M30, all IDs FR-19–FR-28, and historical artifacts/evidence. No milestone is marked Done here. No runtime, dependencies, native adoption/install or deployment changes occur.

The [server-owned execution plan](../feasibility/server-owned-api-plan.md) is authoritative. The [prior plan](../feasibility/m27-m28-execution-plan.md) and [source report](../feasibility/m27-m28-native-openai.md) are historical where their recommendations conflict. The [tracker](../../IMPLEMENTATION_TRACKER.md) records current scope/status.
