# DECISION-009 — FastAPI REST and provider-compatible APIs in the first release

> **Current scope amendment:** [DECISION-010](010-server-owned-api-semantics.md), accepted by user clarification on 2026-10-08, assigns public history/tools/aliases/budgets/accounting to the server and permits labeled estimates. It supersedes the mandatory native-provider semantic expansion below. Original decision/history remains preserved; M27–M30 are Done for their recorded scopes, M24 is In Progress, and M25–M26 remain Not started.

**Status:** Accepted requirements/scope amendment by user instruction on 2026-10-08. **Implementation:** M27–M30 Done for their recorded scopes as of 2026-10-10; M24 is In Progress with repository deployment/package artifacts, while M25–M26 remain Not started. **Scope:** new M27–M30 and amended M24–M26. **Specification:** 2.4; bridge wire protocol remains 2.0 with reviewed optional capability fields.

## User instruction and work authorization

The user adds a FastAPI REST interface to the current Cline release, for programmatic control and a future desktop client, plus OpenAI-compatible and Anthropic-compatible public interfaces so coding assistants can use the connected Cline plugin. The user then explicitly limits this turn to appending the plan, research and documentation. This record authorizes neither implementation now nor native package adoption, credentials, app changes, publication or production deployment.

## Architecture

Use the path **client → FastAPI gateway → existing TypeScript server → VS Code companion → native Cline task**. Return observed output through the same path. Do not type/click the HTML form, directly call a private extension endpoint, replace the server, or start a CLI/headless/provider executor.

The future Python gateway lives in `api-gateway/` or a documented equivalent, owns typed public validation/OpenAPI and provider response encoders, and uses bounded authenticated HTTP/SSE to the existing server. Exact supported Python and dependency versions are selected, pinned and locked at M27 after a current support review; no dependencies are introduced in this planning amendment.

The TypeScript server remains the owner of authorization, API credentials/service principals, durable operations and idempotency, scheduling/admission, result projection, attachments, approvals and audits. Required new internal HTTP/database contracts are implemented in their owning modules. The gateway has no database access and no separate source of truth. Native controls and model/tool execution remain app-owned. Provider-specific formats do not enter shared vendor-neutral packages as vendor dependencies.

Human setup retains graphical sign-in, pairing and local binding/control consent. The newly requested programmatic workflow is an explicit addition to the previous GUI-only operation constraint; the GUI remains supported. A future desktop frontend can consume the REST/SSE contract but is not an implementation deliverable in this release. The standalone SwiftUI app remains preserved and its distribution remains deferred.

## Required interfaces

- First-party REST: identity/scoped credentials, pairing's server side, discovery/capabilities/model aliases, sessions/transcript/events, prompts, durable operation status/results/replay, exact questions/approvals/cancel, disable/revocation and supported attachments.
- OpenAI profile: model discovery, Chat Completions, Responses creation/retrieval and applicable cancellation, with correct response/error/SSE formats and explicit field-level support.
- Anthropic profile: model discovery, Messages, applicable counting, authentication/version headers and correct response/error/SSE formats.
- Desktop-ready API contracts/examples and real named coding-client qualification for each advertised profile. Generic API-format compatibility does not imply compatibility with every coding assistant or the actual Codex/Claude desktop products.

Use independent provider base URLs, provisionally `/openai/v1` and `/anthropic` with Anthropic SDK `/v1` paths, to avoid conflicting models/pagination schemas. Final mounts and all request/response schemas are frozen before implementation. Compatibility credentials are SDC credentials, not vendor account keys. `model` identifies a scoped SDC native binding/profile, not proof of arbitrary upstream model selection.

## Semantic and security gates

Consult [the source-grounded research](../feasibility/public-api.md). Existing native text/control capability is sufficient for first-party task control; it does not establish stateless history isolation, privileged system/developer instructions, arbitrary client tools/results, per-request generation parameters/token caps, token usage/counting or stable provider streaming.

M27 first freezes the native/provider field matrix and resolves required gaps through reviewed app-owned APIs and explicit native consent. M28/M29 must honor or reject each field before native dispatch; unsupported required behavior stays a release blocker, not a silently ignored option. Client tool calls require caller execution ownership, structured call IDs and addressed continuation; Cline tool activity cannot be passed off as the same contract. Never fabricate usage, token limits, terminal success or instruction authority. A maintained-pin expansion requires its own reviewed adoption and real native acceptance.

Preserve exact request/action approvals, delegated roles, live revocation, binding/lease/task fences, replay/retention limits, bounded streams/waiters, native permissions and app-only execution. Public means documented/authenticated/TLS-exposed, not anonymous. Store public-key/operation identity and scheduling in server transactions; a gateway-local lock does not serialize clients/workers. Timeout/disconnect does not implicitly cancel accepted native work or authorize retrying an uncertain send.

## Milestones and release sequence

Append, without renumbering the existing register:

| ID | Deliverable | Dependencies | Initial status |
|---|---|---|---|
| M27 | Native API gap review, FastAPI first-party REST and durable server operation/auth contracts | M23 | Not started |
| M28 | OpenAI-compatible Chat Completions and Responses | M27 | Not started |
| M29 | Anthropic-compatible Messages and discovery/counting profile | M27, M28 | Not started |
| M30 | Real public API/Cline, SDK/coding-client and desktop-contract acceptance | M27, M28, M29 | Not started |

Remaining order: **M27 → M28 → M29 → M30 → M24 → M25 → M26**. M24 now depends on M23/M30 and packages/deploys the gateway too; M25 covers the API/client handoff; M26 freezes/tests all required API and native profiles against FR-01–FR-28. M16–M18 remain Deferred. The 30-row register contains 20 Done, seven Not started and three Deferred; 27 milestones are in the release.

This scope change does not retroactively claim M23 tested new API/native changes. Apply affected shared/native hardening when those changes exist. Production signing/TLS/identity, exact app/version/platform, latency trials and one-hour soak remain required. The implemented SDK/client profile and every limitation must link to versioned evidence.

## Sources of truth

[Requirements](../../requirements.md), [tracker](../../IMPLEMENTATION_TRACKER.md), [research and target API catalog](../feasibility/public-api.md), [prior Cline-first decision](008-cline-first-release.md), [existing HTTP routes](../server-http-api.md) and [native hardening limits](../cline-hardening.md). This record amends DECISION-002/006/007/008 for the public gateway; their prior implementation/history remains intact.


## M27 implementation amendment — 2026-10-08

The subsequent user instruction authorizes M27 implementation. Its first-party server/gateway checkpoint and exact dependency locks are now present; the original planning statements above remain historical. [Current REST/OpenAPI contract](../public-rest-api.md) freezes the implemented consolidated routes (operations include results; session snapshot/events carry interactions and replay; addressed controls share `/controls`). [Native semantic gate](../native-public-api-gate.md) remains blocked, so M27 is In Progress. M28/M29/M30 and production deployment remain unstarted; cached SDK seams and fixtures do not establish new native support.
