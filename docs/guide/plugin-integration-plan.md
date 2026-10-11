# Engineering plan for additional native extensions and clients

**Research/design, 11 October 2026.** This plan answers the user's request for migration analysis. It does not implement a new adapter, resume Codex M16–M18, change accepted native pins or start M26. Use the [Cline migration guide](cline-version-migration.md) for an upstream port and [extension comparison/setup guide](other-vscode-plugins.md) for configuration details.

## 1. Architectural contract to preserve

The native application executes the LLM. SDC owns authenticated commands, durable operations, scheduling, service aliases, normalized API history/instructions, caller-tool lineage and versioned usage estimates. The bridge checks local binding/lease authority; the native adapter checks authority again at its effect boundary. FastAPI translates provider formats and has no direct database/native execution access.

A new extension therefore plugs into the app side of the system. A new named API client plugs into the gateway side. Those workstreams solve different problems and can be accepted independently for explicit subsets.

The neutral [adapter contract](../../adapters/core/src/index.ts) covers `probe`, `attach`, `inspect`, `submit`, `subscribe`, `respondInput`, `resolveApproval`, `cancel`, `revoke` and `detach`. Unsupported operations must be reported honestly. The wire contract remains protocol **2.0** unless a separately reviewed change requires otherwise.

## 2. Reuse versus new implementation

| Area | Reusable responsibility | New work for a native backend |
|---|---|---|
| `protocol/`, `adapters/core/` | Neutral identity, outcomes, request/decision/event schemas | Add neutral fields only if the existing contract truly cannot express a requirement |
| `server/` | Identity, transactions, authorization, leases, operations, admission, durable history | Register/qualify exact backend capability subsets; preserve owner/device checks inside writes |
| `bridge/` | Durable SQLite inbox/outbox, replay, acknowledgements and scheduling | Provide an actual supported host/runtime for these primitives, not merely nominal code reuse |
| `api-gateway/` | REST/provider normalization and rejection | Consumer-specific conformance if exposing the new backend through the existing profiles |
| `control-ui/` | Existing graphical session/control workflow | Honest backend labels/capabilities; retain explicit consent and exact request evidence |
| Native integration | Cline implementation is app-specific | New supported app-owned interface, identity and effect mapping |
| VS Code companion | Common profile/identity/transport ideas | Refactor Cline-specific activation/dependency/labels carefully, or deliver a separate app companion |
| Packaging/evidence | Versioned manifests/signatures, test procedures | New exact artifacts, host/runtime/license provenance and fresh native lifecycle acceptance |

Proposed paths such as `adapters/codex-vscode/` or `adapters/claude-code/` are design suggestions; those implemented packages do not exist today. Do not put vendor UI/RPC/provider details into server, bridge core or protocol. TypeScript consumers must depend inward through the neutral contract.

## 3. Discovery gate before promising an implementation

For each selected extension, write a versioned capability record with these questions:

1. Can reviewed code attach to the **existing selected graphical conversation**, without spawning an agent or taking a private app connection?
2. Can it obtain stable installation/window/workspace/conversation identity and a process generation?
3. Can it observe idle versus busy, user echoes, partial/replaced/completed output and local changes?
4. Can a remote prompt retain command identity across cancellation, timeouts and native submission?
5. Can it observe the complete pending action and resolve only that captured request while preserving local decisions and permissions?
6. Can it answer questions and cancel the addressed turn with trustworthy outcomes?
7. Can it stage authenticated attachments without handing unverified URLs to the model?
8. Can it recover output cursors and uncertain effects without resubmitting blindly?
9. Can it host the existing durable bridge or an explicitly reviewed equivalent meeting the same SQLite/recovery requirements?
10. Can the user connect/disconnect/revoke graphically, with private credentials and a reviewable scope?

Classify each answer as **documented primitive**, **source-reviewed**, **fixture-tested**, **native-tested**, **unsupported** or **unknown**. These are separate evidence levels. A documented method with the right name is not a native pass.

**Gate outcome:** proceed only for an implementable declared subset. If supported attachment is absent, seek vendor support or explicitly revise the product scope. An accessibility fallback needs its own selected permitted mechanism, identity locks, completeness limits and native tests. Generic clipboard/button automation cannot satisfy atomic approval semantics by assertion.

## 4. Codex native feasibility sequence

1. Select the official IDE extension version, its bundled runtime, editor and platform. Read its official support interfaces for that exact version.
2. Seek a supported app-owned route to its existing local IDE thread. Evaluate whether a documented attach mechanism is genuinely available to an external companion, authenticated and authorized for that thread.
3. Keep the documented app-server protocol as a candidate mapping, not authorization to launch or connect to another runtime. No `codex exec`, new app-server, SDK session or private socket may stand in for the selected IDE conversation.
4. Prove two addressed prompts and output continuity in one disposable existing IDE chat, then local takeover and wrong-thread refusal.
5. Map native permission/question/cancellation categories. A hook is one possible observation/decision seam, not the full input/output bridge.
6. Only after route proof, implement a neutral adapter and graphical companion, then durability, races, permissions, packaging and client acceptance.

The [official app-server](https://learn.chatgpt.com/docs/app-server) and [hook documentation](https://learn.chatgpt.com/docs/hooks) establish useful primitives, but this research did not establish external attachment to the official IDE session. The existing [desktop feasibility](../feasibility/codex.md) remains historical. An IDE integration requires a separate host-specific record; it must not inherit the desktop report's pass/fail labels.

## 5. Claude Code native feasibility sequence

Current official [mods surface documentation](https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run) makes an in-process mod a credible candidate in the VS Code chat panel. The [API](https://code.claude.com/docs/en/plugins/mods/api), [reference](https://code.claude.com/docs/en/plugins/mods/reference) and [event documentation](https://code.claude.com/docs/en/plugins/mods/events) provide session/prompt/turn/tool primitives. This is materially stronger than an MCP-only tool connection, but remains untested here.

### Phase A — Read-only discovery

Use an exact official extension build in a disposable graphical host. Obtain its documented generated API types and plugin validation output without reverse engineering private extension protocols. Record extension/runtime version and plugin policy. Check how session ID, root/cwd, process lifetime and active surfaces map to local binding identity. Observe a harmless locally entered turn and its output events.

Start with observation only. Review which lifecycle events fire on clear/resume/branch/reload; do not assume a `session.start` event signals every conversation change. Capture local takeover and generation changes explicitly.

**Deliverable:** a supported-interface matrix, exact type/schema provenance, sanitized event samples and an unsupported/unknown list.

### Phase B — Graphical local connection and input

Design a user-visible local Connect flow. Mods cannot draw their own pane in the VS Code chat panel according to the reviewed surface table, so prove a supported consent surface there: a native command/interaction, or a separately reviewed companion mechanism. Do not silently reuse consent from a terminal or another conversation.

Use the mod's app-owned session API for the selected conversation; do not submit via an unrelated CLI. Preserve source attribution for remote prompts rather than presenting an automated prompt as an unqualified human action.

A particular concern is queued input: the documented `$.prompt.submit` waits for idle and resolves when a turn starts. The adapter must prevent a queued command from taking effect after lease loss, revocation, session change or local takeover. An authority check only before enqueueing is insufficient. Inspect the selected build's supported cancellation/effect hook semantics. If there is no way to fence the eventual effect, this submission route fails the contract even if its happy path works.

**Deliverable:** two same-session server prompts, command/echo mapping, cancellation-before-effect and wrong-session refusal, with native receipts or explicit unknown outcomes.

### Phase C — Durable bridge hosting

The mods environment is not an ordinary Node extension module: its documented API provides access to files/network/processes rather than ambient Node APIs. The existing bridge's SQLite and HTTP/SSE code cannot be assumed to run unchanged inside it. [Mods runtime API](https://code.claude.com/docs/en/plugins/mods/api#reach-files-processes-and-the-network).

Resolve this as an explicit feasibility item. Establish an allowed host for the existing durable bridge and an intentional authenticated app-owned integration boundary, or demonstrate a compliant durable implementation in the supported runtime. Do not start a new agent to solve bridge hosting. Do not replace file-backed transactional inbox/outbox with an in-memory map, ordinary JSON file or unexamined plugin key/value store.

The reviewed network primitive returns a buffered response. Prove SSE delivery/reconnect or an approved equivalent public transport before relying on a long-lived stream. Maintain session/epoch checkpoints, tombstones, bounded queues and scheduling by durable device inbox. Keep defaults of 60-second leases/20-second renewal and conservative deadlines.

**Deliverable:** crash/restart, receipt/output replay, authority fencing and storage failure tests using real persistent storage, plus real native spot checks.

### Phase D — Questions, cancellation and permissions

Begin with the restricted prompts subset until additional categories pass. For each category, record captured native turn/request identity, complete action material, supported decisions and the actual effect evidence. Inspect `$.turn.abort` for exact addressed-turn/cancellation semantics; a method name alone proves none of those properties.

Treat tool hooks/mod decision mechanisms with care: their power does not authorize bypassing native deny rules or organization policy. Before remote approval can be advertised, prove preserved policy, whole-action scope, exact callback identity, expiration, duplicate/stale/digest rejection and local/remote single-winner resolution. Conventional PermissionRequest payloads alone do not provide all required identity/coverage. Unsupported native prompt classes remain local and clearly unavailable remotely.

**Deliverable:** native race and permission matrix; no remote approvals if any required safety property is unresolved. Caller tools require a separate effect-ownership gate.

### Phase E — Distribution and adoption

Package the exact bridge/plugin artifacts; record their public source/license and manifest fingerprints, native host/runtime version and organization/plugin settings. Verify installation, update behavior, scoped credential cleanup and rollback in the selected graphical host. Vendor extension signing and project plugin integrity are separate claims.

Run the shared/new-adapter conformance and native/client acceptance matrix before publishing support. A future Claude Code subset may be narrower than Cline; advertise only what passed.

## 6. Named-client gateway workstream

This workstream keeps the existing Cline backend and makes a pinned extension act as a client of SDC's provider facade. Its blockers differ from native attachment:

1. **Capture:** observe sanitized harmless client requests at a test endpoint. Record transport, fields, model/background aliases, headers and retry identity. Do not collect secrets or real project content.
2. **Classify:** map each required feature to current SDC normalization, a supported client setting, an explicit new profile feature or unsupported behavior.
3. **Identity:** prove a durable logical send ID. Retries of one operation reuse it; two identical intentional sends use different IDs. Payload hashing/random-per-attempt/static-session keys are not substitutes.
4. **Tool ownership:** API consumer executes issued tool calls; backend native tools are denied for that turn. Preserve native client permissions and issued call/result identity. Do not turn Cline tool activity into caller-owned calls.
5. **Semantics:** preserve retention/context/history/lineage, errors, cancellation and deterministic estimated accounting. Reject unsupported fields before native dispatch.
6. **Native acceptance:** test text, a permissioned file operation, native denial, recovery and process-loss ambiguity through the actual pinned extension and real deployment.
7. **Declare:** record exact named client/profile/version/platform, supported fields and exclusions. Official SDK fixture success is not acceptance of the agent extension.

A client compatibility layer, if needed, belongs at the public HTTP/provider boundary with durable neutral operation semantics owned by the TypeScript server. It must not gain direct database/native access, invent generation semantics or silently broaden credentials. Provider-specific configuration stays outside shared packages.

## 7. MCP tool workstream

An SDC MCP wrapper is an optional proposed tool facade, not implemented. It can offer authorized read/submit/operation tools over the existing public API, with TLS/authentication and narrowly scoped keys. It cannot establish external native control merely because Codex/Claude can call it.

Implement read-only discovery first, then explicit write tools with stable call-to-operation identity, retry tests, size bounds, owner/session restrictions and clear cancellation outcomes. Prevent a tool's synchronous call from waiting on its own busy backend task. Review tool descriptions against prompt-injection and accidental cross-binding routing; model-supplied IDs never establish authority.

No database migration, new frontend or executor is inherently required for a thin MCP facade. Actual requirements depend on the selected authenticated transport and durable write identity. A future implementation still needs an explicit instruction and its own checks.

## 8. Acceptance and stop conditions

Use the [native matrix](cline-version-migration.md#6-minimum-native-acceptance-matrix), then add target-specific event/permission cases. Include two independent bindings, local changes, epoch restart, duplicate/changed controls, revoked device, stale lease, unknown effect and queue/resource failures. Graphical install/sign-in/selection/consent/cleanup must correspond to the exact tested artifacts.

Stop a proposed route when it needs a replacement executor/private app channel, cannot fence a pending mutation, cannot distinguish native tasks/requests, suppresses native permission rules, cannot establish durable retry identity, or relies on fabricated native output/tool/token claims. Report the failed or unknown requirement directly; do not relabel it as an optional exclusion to close a full-support claim.

## 9. Choosing and estimating the next effort

| Choice | Relative engineering uncertainty | First concrete deliverable |
|---|---|---|
| One nearby upstream Cline source port | Lowest of the full-backend alternatives; still needs source and native lifecycle review | Immutable target and seam-by-seam diff |
| Cline-derived fork | Depends on how far native/runtime/permissions differ | Fork identity/license/API comparison |
| Claude Code native mod | Promising documented primitives; effect fencing/durable hosting/consent unresolved | Read-only exact-build feasibility report |
| Official Codex native backend | Supported existing-IDE attachment unresolved | Vendor-supported route proof |
| Codex/Claude as SDC model clients | Stable retry identity and agent dialect/tool ownership unresolved | Sanitized exact-client request and retry capture |
| SDC MCP tool facade | Narrower integration goal; cannot replace native lifecycle | Read-only authenticated wrapper design/test |

These are relative assessments from code/documentation, not measured schedules. Estimate days/cost only after selecting the exact target and completing the first gate; a promised full implementation date would hide the unresolved route dependencies.

The next instruction should specify the desired role, exact extension/version or fork, platform/editor, required control categories and whether caller tools are required. Implement one bounded effort at a time. Preserve M24/M25/M26 as Done for their recorded local release subsets and Codex M16–M18 as Deferred until explicit implementation resumption. See the [frozen release report](../../evidence/M26/README.md); completing that release does not authorize new plugin implementation.
