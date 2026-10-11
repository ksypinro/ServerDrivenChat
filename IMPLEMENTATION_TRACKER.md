# Implementation Tracker and Logbook

Created: 2026-10-04 · Baseline: [requirements.md](requirements.md), version 2.0; current specification 2.4 / wire protocol 2.0  
Purpose: implement one milestone at a time and preserve enough verified context for another model to continue.

## 1. Tracker

### 1.1 Product outcome and fixed constraints

The first final release controls an existing **Cline task inside local VS Code**, using the adopted Cline native package and companion extension plus the required shared server/control UI. **Codex M16–M18 are Deferred** and excluded from this release’s dependencies and acceptance. No standalone Codex/macOS companion installer is required. Preserve completed shared work and all historical Codex research/checkpoints. [DECISION-008](docs/decisions/008-cline-first-release.md) records the user’s 2026-10-08 scope change.

The user subsequently requires a **FastAPI public REST gateway**, OpenAI-compatible and Anthropic-compatible API profiles, and contracts usable by a future desktop client. [DECISION-009](docs/decisions/009-fastapi-public-api.md) appends M27–M30 before M24–M26 without renumbering history. M27 is Done under [DECISION-010](docs/decisions/010-server-owned-api-semantics.md), with server-owned policies and real native connection/control/media/recovery acceptance. M28 and M29 implement the OpenAI-shaped and Anthropic-shaped profiles. M30 is Done for its recorded disposable API/native/client subsets. See [REST contract](docs/public-rest-api.md), [OpenAI profile](docs/openai-api-profile.md), [Anthropic profile](docs/anthropic-api-profile.md), [native compatibility gate](docs/native-public-api-gate.md) and [M30 evidence](evidence/M30/README.md). A new desktop frontend and standalone SwiftUI distribution remain outside this release.

The Cline acceptance journey is: open project and Cline → prompt “Connect to my server and follow its instructions” → installed Connect tool performs authorized pairing/binding → persistent bridge listens → server prompts appear in the same task → output and approvals return to the server → subsequent prompts continue that task. The connection survives the end of the initiating model turn. Initial installation, pairing, and any required native permission grants remain explicit graphical steps.

The Connect tool is an additional implementation requirement from the subsequent conversation; M02, M04, and M21 formalize it. A prompt alone does not install the integration.

- The existing app executes the LLM. No replacement CLI, headless agent, provider SDK session, or separately launched app-server.
- Installation/sign-in/pairing/native selection and local consent remain graphical; authenticated REST/SSE operation is explicitly added alongside the GUI. Developer CLI tooling remains separate. The FastAPI gateway calls the existing server and does not host an app/model executor.
- Shared protocol, persistence, permissions, and transport modules must not depend on Codex or Cline UI internals.
- SSE plus HTTPS POST is the baseline. Additional apps/transports, automatic approval policies, and persistent global grants are future scope.
- Approval decisions address exact native requests. Chat text is never a permission grant.
- Report unsupported or uncertain behavior explicitly. A fake adapter does not establish real-app support.

### 1.2 How to operate this tracker

**Allowed statuses:** `Not started` → `In Progress` → `Done`; `Deferred` is permitted only by an explicit product scope decision. Deferred work is unfinished and excluded from the active release, never treated as Done. Record its prior state and resume condition. The register below is the authoritative status record.

1. Work in numerical order within the active release scope by default, **one milestone at a time**; skip explicitly Deferred milestones. Dependencies name the minimum completed contracts required; they are not permission to implement several milestones together.
2. Read [AGENTS.md](AGENTS.md), the relevant requirements sections, the logbook's current handoff, and prerequisite completion entries before changing code.
3. Confirm dependency artifacts and tests actually exist. Mark the selected row `In Progress` and record the actual model/effort in a working log entry.
4. Implement only that milestone's boundary. Use the fake adapter or fixtures for later components; each milestone must have a demonstration/test that does not require unfinished downstream features.
5. If blocked, retain `In Progress` and document the blocker and exact unblock condition. Unstarted active dependents remain `Not started`. A blocked required milestone remains In Progress; only an explicit user scope decision permits Deferred. Do not report unfinished work as Done.
6. Mark `Done` only after its acceptance checks pass, evidence is saved, and its completed walkthrough/handoff is written. Update the register's completion-entry link and the current handoff together.
7. Stop at the milestone boundary. Starting the next milestone requires a new instruction unless the user explicitly authorized a sequence.

Discovery milestones may finish with a documented negative finding. Their dependents still require a usable integration route. A feasibility report is not evidence of a working adapter. If a route is unavailable, record the product decision needed; do not silently substitute another runtime or relax a completion gate.

Preserve completed entries. Corrections get dated amendments. If a later change breaks an earlier acceptance criterion, reopen the affected milestone as `In Progress`, describe the regression, and revalidate its dependents. Split unexpectedly large work into explicitly tracked submilestones before proceeding; the parent stays incomplete until all required children pass.

### 1.3 Model and effort guidance

The recommendations below are workload estimates, not completion guarantees. Official guidance favors GPT-6.1 Sol for complex coding, Luna for focused repeatable work, and Astra for the hardest workflows. Model availability and UI labels vary. [OpenAI model guidance](https://learn.chatgpt.com/docs/models).

| Label in this tracker | Model ID | Use |
|---|---|---|
| GPT-6 Luna | `gpt-6-luna` | Bounded implementation from fixed contracts, documentation |
| GPT-6.1 Sol | `gpt-6.1-sol` | Default implementation, integration, and state-machine work |
| GPT-6 Astra | `gpt-6-astra` | Difficult failure analysis and cross-component verification |

Efforts are `Low`, `Medium`, and `High`; Low may appear as **Light** in the desktop UI. The selected effort must be supported by the model. Recommendations reflect documentation and models exposed to this chat on 2026-10-04; recheck availability when a milestone starts. If Luna struggles with a contract ambiguity, move to Sol Medium/High. If Sol cannot resolve a cross-system failure, use Astra High. Record the reason and actual model in the logbook; model changes do not change requirements or permissions. No automatic delegation is required.

### 1.4 Milestone register

Dependencies refer to stable outputs, not unfinished code. Details and acceptance gates follow the register.

| ID | Milestone | Dependencies | Suggested model | Effort | Status | Completion entry |
|---|---|---|---|---|---|---|
| M01 | Codex app-control feasibility | None | GPT-6.1 Sol | High | Done | [M01-DONE-001](#m01-done-001--codex-feasibility-research-complete) |
| M02 | Cline integration and Connect feasibility | None | GPT-6.1 Sol | High | Done | [M02-DONE-001](#m02-done-001--two-host-cline-feasibility-complete) |
| M03 | Architecture decisions and repository foundation | M01, M02 | GPT-6.1 Sol | Medium | Done | [M01-M10-REPAIR-001](#m01-m10-repair-001--revalidated-completion) |
| M04 | Versioned protocol and schemas | M03 | GPT-6.1 Sol | High | Done | [M01-M10-REPAIR-001](#m01-m10-repair-001--revalidated-completion) |
| M05 | Adapter SDK and deterministic fake app | M04 | GPT-6.1 Sol | Medium | Done | [M01-M10-REPAIR-001](#m01-m10-repair-001--revalidated-completion) |
| M06 | Server persistence and migrations | M04 | GPT-6.1 Sol | High | Done | [M01-M10-REPAIR-001](#m01-m10-repair-001--revalidated-completion) |
| M07 | Bridge persistence and recovery primitives | M04, M05 | GPT-6.1 Sol | High | Done | [M01-M10-REPAIR-001](#m01-m10-repair-001--revalidated-completion) |
| M08 | Identity, pairing, and session authorization | M06, M07 | GPT-6.1 Sol | High | Done | [M01-M10-REPAIR-001](#m01-m10-repair-001--revalidated-completion) |
| M09 | Server HTTP/SSE command and event API | M06, M08 | GPT-6.1 Sol | High | Done | [M01-M10-REPAIR-001](#m01-m10-repair-001--revalidated-completion) |
| M10 | Bridge scheduler, connections, and leases | M05, M07, M09 | GPT-6.1 Sol | High | Done | [M01-M10-REPAIR-001](#m01-m10-repair-001--revalidated-completion) |
| M11 | Approval engine and permission ledger | M08, M10 | GPT-6.1 Sol | High | Done | [M11–M13-DONE-001](#m11m13-done-001--approval-projection-and-attachment-milestones-complete) |
| M12 | Transcript projection and snapshots | M04, M06 | GPT-6 Luna | High | Done | [M11–M13-DONE-001](#m11m13-done-001--approval-projection-and-attachment-milestones-complete) |
| M13 | Attachments and artifact transfer | M05, M08, M09 | GPT-6.1 Sol | Medium | Done | [M11–M13-DONE-001](#m11m13-done-001--approval-projection-and-attachment-milestones-complete) |
| M14 | Server control interface | M09, M11, M12, M13 | GPT-6.1 Sol | Medium | Done | [M14-DONE-002](#m14-done-002--server-mediated-sign-in-and-control-interface-complete) |
| M15 | Graphical companion shell | M08, M10, M11 | GPT-6.1 Sol | High | Done | [M15-DONE-001](#m15-done-001--graphical-companion-shell-complete) |
| M16 | Codex binding, prompt input, and output | M01, M05, M10, M15 | GPT-6.1 Sol | High | Deferred | [RELEASE-SCOPE-001](#release-scope-001--cline-only-first-release-plan) |
| M17 | Codex approvals and active-turn controls | M11, M16 | GPT-6.1 Sol | High | Deferred | [RELEASE-SCOPE-001](#release-scope-001--cline-only-first-release-plan) |
| M18 | Codex pilot acceptance | M13, M14, M17 | GPT-6.1 Sol | High | Deferred | [RELEASE-SCOPE-001](#release-scope-001--cline-only-first-release-plan) |
| M19 | Cline task binding and event bridge | M02, M05, M10 | GPT-6.1 Sol | High | Done | [M19-DONE-001](#m19-done-001--cline-existing-task-bridge-complete) |
| M20 | Cline approvals and active-turn controls | M11, M19 | GPT-6.1 Sol | High | Done | [M20-DONE-001](#m20-done-001--cline-native-controls-complete) |
| M21 | Prompt-triggered Connect tool | M02, M08, M19, M20 | GPT-6.1 Sol | High | Done | [M21-DONE-001](#m21-done-001--native-prompt-triggered-connect-complete) |
| M22 | Cline server-driven workflow acceptance | M13, M14, M21 | GPT-6.1 Sol | High | Done | [M22-DONE-001](#m22-done-001--native-server-workflow-complete) |
| M23 | Shared/Cline recovery, isolation, and race hardening | M06, M07, M10, M11, M13, M22 | GPT-6 Astra | High | Done | [M23-DONE-001](#m23-done-001--cline-hardening-complete) |
| M24 | Cline packaging and server/gateway deployment | M23, M30 | GPT-6.1 Sol | Medium | Done | [M24-DONE-001](#m24-done-001--selected-local-deployment-and-graphical-package-lifecycle-complete) |
| M25 | Cline user guide and maintainer handoff | M24 | GPT-6 Luna | Low | Done | [M25-DONE-001](#m25-done-001--beginner-manual-and-maintainer-handoff-complete) |
| M26 | Cline/API release conformance and soak gate | M23, M24, M25, M30 | GPT-6.1 Sol | High | Done | [M26-DONE-001](#m26-done-001--frozen-local-clineapi-release-qualified) |
| M27 | Server API contract and FastAPI first-party REST | M23 | GPT-6.1 Sol | High | Done | [M27-DONE-001](#m27-done-001--server-owned-rest-and-native-connection-complete) |
| M28 | OpenAI-compatible Chat Completions and Responses | M27 | GPT-6.1 Sol | High | Done | [M28-DONE-001](#m28-done-001--openai-profile-and-official-sdk-verification-complete) |
| M29 | Anthropic-compatible Messages and discovery/counting | M27, M28 | GPT-6.1 Sol | High | Done | [M29-DONE-001](#m29-done-001--anthropic-profile-and-server-counting-complete) |
| M30 | Public API, native Cline and coding-client acceptance | M27, M28, M29 | GPT-6.1 Sol | High | Done | [M30-DONE-001](#m30-done-001--public-api-native-and-client-acceptance-complete) |

### 1.4.1 First-release scope and remaining sequence

**Release scope:** Cline in local VS Code plus the shared server/control interface. Starting baseline is the adopted Cline 4.1.22 `sdc-m21.3` / API 1.2 and companion 0.4.0; M24/M26 declare and verify the exact release versions/platform. Stock Cline, Antigravity, remote hosts and other platforms are not implicitly supported. M16–M18 retain their design below as deferred future work; M16 previously In Progress, M17/M18 previously Not started. Resume only by explicit user instruction with an established integration route.

**Remaining sequence:** None authorized. M26 frozen Cline/API verification is Done for the selected local subsets. M24 deployment and M25 guides/handoff are Done for the selected local target. The new IDs are appended; this explicit dependency order supersedes numerical execution order. M23 remains Done for its recorded native pin; future API/native changes need affected hardening. All 27 first-release milestones are Done for their declared subsets, plus three Deferred in the 30-row register. M27–M30 have passed their declared gates. Publication and later milestones remain separate.

### 1.5 Milestone specifications

All paths below are **planned locations**, not claims that files exist. M03 chooses the concrete language/framework layout and records any equivalent paths. Every completed milestone also satisfies the common completion gate in section 1.6.

#### M01 — Codex app-control feasibility

**Boundary:** investigate the installed desktop app, without building the server or replacing the app runtime. Requirements §§1, 3.1, 5, 9.1.

**Deliver:** `docs/feasibility/codex.md`, a version/platform capability matrix, and sanitized probe evidence under `evidence/M01/`. Evaluate supported app-owned attachment first, accessibility second. Record identity, input, output, approvals, questions, stop, foreground, and restart behavior separately.

**Pass:** demonstrate a harmless prompt in the selected existing conversation and observe its reply; inspect a genuine pending approval in a disposable task and establish the available response mechanism. Record unsupported/unknown operations and whether request-switch races can be prevented. Choose an evidence-backed route or document why none is viable. A negative finding completes research only; M16/M17 cannot start without a usable route or explicit scope decision.

#### M02 — Cline integration and Connect feasibility

**Boundary:** inspect the exact installed Cline/VS Code versions and upstream extension interface. Per the 2026-10-04 user request, also test Cline inside Antigravity IDE as a separate host. This does not include Antigravity’s native agent. Requirements §§3.2, 9.2 plus the prompt-triggered connection journey.

**Deliver:** `docs/feasibility/cline.md`, native-task/ask identity mapping, an integration-route decision, and a Connect-tool design. Establish how a call is bound to its originating task, how the bridge keeps running after the turn, and which API additions are required.

**Pass:** demonstrate existing-task input and observable output, identify genuine ask/approval state, and distinguish stock API support from proposed changes. Decide whether a supported API, upstream extension addition, or explicitly adopted maintained build is required. Do not claim button helpers provide atomic approvals. No native runtime substitution. Missing approval or task-origin support becomes a named gate for M19–M21.

#### M03 — Architecture decisions and repository foundation

**Boundary:** choose implementation technologies once, based on M01/M02, then establish buildable module boundaries. Requirements §§4, 14.

**Deliver:** `docs/decisions/` records for language/runtime, server/UI, macOS companion, Cline extension packaging, transactional stores, authentication provider, testing, and distribution. Create `protocol/`, `server/`, `bridge/`, `companion/`, `adapters/`, `extensions/`, and `tests/` or documented equivalents. Pin dependencies/toolchains; add build, lint, and test commands; update README and stale AGENTS.md guidance.

**Pass:** a fresh setup builds the empty modules and runs a minimal cross-module smoke check. Shared code has no vendor dependencies. Record exact commands and stack choices so later models do not select new frameworks independently. Product operation must remain GUI-only.

#### M04 — Versioned protocol and schemas

**Boundary:** data contracts and pure validation; no networking. Requirements §§5–8, 10.2.

**Deliver:** schemas/types for capabilities, binding, commands, outputs, approvals, grants, attachments, errors, and replay; adapter operation contracts; canonical action-digest test vectors. Specify revisions, lane cursors, expiry, idempotency, and state transitions. Add the bounded `bridge.connect`/disconnect tool contract and reconcile this addition into requirements.md.

**Pass:** valid/invalid fixtures cover every public message. Reject mismatched identity, altered digests, unknown control types, and nonempty grants on deny/cancel. Canonicalization produces identical hashes for the defined equivalent inputs. Document compatibility/version rules. Later milestones consume these contracts rather than inventing payloads.

#### M05 — Adapter SDK and deterministic fake app

**Boundary:** platform-neutral adapter interface plus a test double. Requirements §§5, 9.

**Deliver:** `adapters/core/`, `adapters/fake/`, and reusable conformance fixtures. Fake app supports scripted turns, partial/replaced output, pending questions/approvals, cancellation, local resolution, and unsupported capabilities. Inject clock and fault controls.

**Pass:** replaying a fixture produces deterministic events; the adapter contract preserves native identity and explicit unknown outcomes. A fake suspended turn can receive control while normal prompts remain queued. No vendor app or server is required. Clearly label every fake result as simulated.

#### M06 — Server persistence and migrations

**Boundary:** transactional storage, independent of HTTP. Requirements §§6.1, 7.3, 11.

**Deliver:** repositories/migrations for users/devices, sessions/bindings, commands, events, interactions, decisions, grants, attachment metadata, and audit records. Implement atomic deduplication, lane sequences, UI replay watermarks, and conditional state updates.

**Pass:** concurrent identical writes create one logical record; conflicting payloads fail. Transaction rollback and restart preserve accepted data. Snapshot/watermark reads are consistent. Migration and restoration tests run against the selected real store, not only mocks.

#### M07 — Bridge persistence and recovery primitives

**Boundary:** local durable state, without a live connection. Requirements §11.

**Deliver:** inbox/outbox, native ID mappings, contiguous receipt cursors, pending application attempts, decision consumption records, and restart inspection interfaces in `bridge/storage/`.

**Pass:** crash before/after persistence never advances a cursor past missing work. Unacknowledged output survives restart; duplicates do not create new logical work. An uncertain external action becomes reconciliation-required instead of an automatic retry. Use the fake adapter and fault injection.

#### M08 — Identity, pairing, and session authorization

**Boundary:** authentication and authorization services; graphical screens arrive later. Requirements §§4, 8.1, 10.2.

**Deliver:** short-lived pairing with local/server confirmation, device credentials in secure local storage, session roles, ownership checks, credential rotation/revocation, and authenticated decision-assertion primitives. Implement with the authentication provider chosen in M03.

**Pass:** wrong/expired/reused pairing codes fail; a viewer cannot prompt or approve; another device/user cannot access a bound session. Revoked credentials fail on reconnect. Derive reviewer identity from authentication. Tests use disposable accounts/keys and redact secrets.

#### M09 — Server HTTP/SSE command and event API

**Boundary:** transport and durable delivery, using a scripted bridge client. Requirements §10.

**Deliver:** versioned endpoints, separate prompt/control SSE lanes, authenticated event ingestion/acks, replay, heartbeat/backoff behavior, bounded queues, and documented error responses. Wire persistence and authorization from earlier milestones.

**Pass:** response success follows durable persistence; disconnect/replay neither loses nor duplicates records. Approval/control delivery remains available during prompt backlog. Test fragmented UTF-8/SSE framing, stale cursors, unauthorized access, and limit rejection. Vendor app integration is unnecessary here.

#### M10 — Bridge scheduler, connections, and leases

**Boundary:** the persistent non-LLM control loop. Requirements §§4, 6.2, 10, 11.

**Deliver:** outbound connections, durable consumption, one normal turn per binding, independent control dispatch, lease renewal/fencing, local disable, and restart reconciliation. Expose a small service API for the companion and VS Code host.

**Pass:** a blocked fake turn still receives cancel/input/approval commands. Retry does not resubmit uncertain work. Expired leases stop new dispatch; a stale owner cannot mutate. Local disable works offline. No pending model tool call is needed to keep listening, and ordinary completion does not invalidate the server's own queued prompts.

#### M11 — Approval engine and permission ledger

**Boundary:** shared decision validation and lifecycle; native adapters are added later. Requirements §§7–8.

**Deliver:** request normalization, digest verification, one-winning-decision transaction, device-bound assertions, bridge revalidation, application-attempt tracking, grant ledger, expiry, and supported revocation. Keep received/recorded/applied/executed outcomes distinct.

**Pass:** allow/deny/cancel follow fake native semantics. Reject stale revision, changed action, wrong session, broader grant, replay, expired decision, and unauthorized reviewer. Local resolution wins over stale remote action. A crash after native response yields reconciliation. Server expiry never claims to revoke a native grant. State tests cover concurrent asks and reviewers.

#### M12 — Transcript projection and snapshots

**Boundary:** deterministic output reconstruction. Requirements §6.3.

**Deliver:** a reducer/projector for item creation, deltas, replacements, completion, artifacts, and interaction state; consistent snapshots with replay watermark; partial/unknown evidence labels.

**Pass:** fixture replay reconstructs the same transcript after duplicate/reordered deliveries and browser reconnect. Reject wrong-base deltas and request repair; never append final text twice. Self-contained approvals can surface despite a transcript gap. Tests require storage/fixtures, not a browser or real model.

#### M13 — Attachments and artifact transfer

**Boundary:** authorized binary content and adapter staging. Requirements §§6.2–6.3, 10.2.

**Deliver:** upload/commit/download, checksums, MIME/size limits, ownership, retention/cleanup, staging receipts, artifact references, and adapter capability validation.

**Pass:** wrong owner, corrupt checksum, unsupported type, and oversize content fail explicitly. Verify the selected adapter receives exactly the committed content through the fake contract. Interrupted uploads recover or expire cleanly. App-specific attachment confirmation remains M16/M19 work; unsupported types are never silently omitted.

#### M14 — Server control interface

**Boundary:** user-facing web UI over existing services. Requirements §12.

**Deliver:** sign-in, device/session selection, prompt queue, transcript, artifact controls, approval/question panels, stop/disable, connection status, and capability limitations. Render action/diff/scope/expiry evidence and each decision stage distinctly.

**Pass:** browser tests with the fake app cover two turns, approval/denial, clarification, cancellation, refresh recovery, and role restrictions. Untrusted transcript HTML cannot execute controls. A recorded decision never displays as applied. Unsupported buttons are unavailable with an explanation.

#### M15 — Graphical companion shell

**Boundary:** macOS lifecycle and UI, backed by the fake adapter. Requirements §§1.1, 4, 12.

**Deliver:** installable development app, sign-in/pairing, app/session picker, capability display, connection indicator, local disable, secure settings, and supported startup/shutdown handling. Surface native accessibility/screen-permission setup where needed.

**Pass:** launch and pair without a terminal; connect/disconnect and restart using graphical controls. Local disable immediately blocks new dispatch. The host stays alive after an LLM turn ends; app shutdown/sleep states are accurate. Packaging polish/signing belongs to M24.

#### M16 — Codex binding, prompt input, and output

**First-release scope:** Deferred by [DECISION-008](docs/decisions/008-cline-first-release.md). Retain this future Codex specification; it is not a Cline release gate.

**Boundary:** first real vendor adapter using the approved M01 route. Requirements §§3.1, 9.1.

**Deliver:** exact conversation selection/binding, input-readiness checks, message-echo verification, output observation, capability probing, and supported attachment staging. Use shared runtime and projection contracts.

**Pass:** two server-originated turns appear in the same existing desktop conversation and retain context. Switching windows/tasks or finding a local draft prevents accidental submission. Output provenance/partial/completion status matches evidence. No replacement LLM process is launched. Pending approvals may be observed but are not answered until M17.

#### M17 — Codex approvals and active-turn controls

**First-release scope:** Deferred by [DECISION-008](docs/decisions/008-cline-first-release.md). Retain this future Codex specification; it is not a Cline release gate.

**Boundary:** native approval/question/cancel translation. Requirements §§7–9.1.

**Deliver:** request-specific detection, exact decision mapping, supported grant semantics, local-resolution observation, and recovery of pending interactions where possible.

**Pass:** demonstrate genuine allow and deny paths in disposable app work, clarification, supported cancellation, and changed/stale-request rejection. Confirm application separately from execution outcome. If an operation cannot be implemented safely through the chosen route, record the limitation and required scope decision; do not mark a required full-control feature Done based only on detection.

#### M18 — Codex pilot acceptance

**First-release scope:** Deferred by [DECISION-008](docs/decisions/008-cline-first-release.md). Retain this future Codex specification; it is not a Cline release gate.

**Boundary:** integrated pilot validation and fixes confined to the established Codex path. Requirements §1.3 and the Codex portion of §15.

**Deliver:** reproducible GUI walkthrough, pilot support matrix, acceptance trace/video or screenshots, and process/integration evidence under `evidence/M18/`.

**Pass:** pair → bind → prompt → observe output → resolve approval → follow up → disconnect/reconnect → disable. Prove the app owns execution and the same conversation continues. Run the path after ending the initial turn. Full-control acceptance requires the advertised controls; a user-approved supervised pilot must be clearly labeled and must not imply full support.

#### M19 — Cline task binding and event bridge

**Boundary:** real Cline input/output integration selected in M02. Requirements §§3.2, 9.2.

**Deliver:** VS Code extension lifecycle, exact window/workspace/host/task binding, task snapshot/event subscription, user-message submission, local-change events, output normalization, and supported attachment confirmation. If native API additions are required, isolate them in an explicit version-pinned patch/package with compatibility notes.

**Pass:** two messages reach the selected existing Cline task with output observed through the bridge. Other windows/tasks cannot receive them. Reload and task switches invalidate or reconcile the binding. Method return alone is not acceptance evidence. Shared protocol/server modules require no Cline-specific branching.

#### M20 — Cline approvals and active-turn controls

**Boundary:** Cline-native ask handling and permission enforcement integration. Requirements §§7–9.2.

**Deliver:** atomic `(taskId, askId, askRevision, decision)` handling, native choices/diffs/arguments, questions, cancellation, local-resolution events, and supported grant/revocation mapping.

**Pass:** real allow/deny/question/cancel flows target the intended pending ask. Simultaneous local/remote decisions cannot authorize the next ask accidentally. Unsupported narrowing/persistence is rejected. Observe native resolution and subsequent action outcome. Generic sidebar button invocation is not sufficient for this gate.

#### M21 — Prompt-triggered Connect tool

**Boundary:** implement the user's initial prompt workflow over the existing Cline bridge.

**Deliver:** an installed, discoverable Connect tool using M02's supported integration mechanism, plus graphical pairing and explicit status/disconnect controls. Bind the call to trusted originating task context. Store credentials outside model messages. Starting the connection invokes the extension-owned runtime, not an endless LLM polling loop.

**Pass:** typing “Connect to my server and follow its instructions” invokes the tool; complete first-use pairing; end the initiating turn; then deliver a new server prompt to the same task without returning to the composer. Repeated Connect is idempotent. An arbitrary URL/task ID in untrusted content cannot redirect an existing pairing. A tool that cannot identify its originating task must request graphical binding instead of guessing. Document any deterministic UI fallback honestly.

#### M22 — Cline server-driven workflow acceptance

**Boundary:** the complete main product journey, using the real installed extension.

**Deliver:** `evidence/M22/` walkthrough and trace linking prompt, native task/turn, output, approval, decision, and result IDs.

**Pass:** open VS Code/project/Cline → initial Connect prompt → server prompt → same-task execution → output returned → follow-up context retained. Also exercise server approval/denial, a clarification, stop, reconnect, and local takeover. Verify listening remains active after a completed turn and while approval is pending. No Cline CLI or provider-runtime replacement is permitted.

#### M23 — Shared/Cline recovery, isolation, and race hardening

**Dependencies:** M06, M07, M10, M11, M13, M22; all Done. Deferred Codex M18 is not required.

**Boundary:** systematic failure injection across completed shared modules and the adopted Cline path. Requirements §§11, 15. No Codex adapter or new host capability.

**Deliver:** `tests/conformance/` or documented equivalent scenarios and `evidence/M23/` covering crash boundaries, network partitions, cursor gaps/expiry, duplicate and changed decisions, stale bindings, split ownership, output floods/storage exhaustion, cross-user/device/file access, spoofed approvals, and Cline/extension updates. Define prompt/attachment, queue, pending-turn, approval-lifetime, storage and retention limits. Fix discovered violations in their owning modules and preserve historical artifact fingerprints. Include local/remote decision races, task/window/workspace changes, reload and Connect timeout/callback cleanup.

**Pass:** accepted work survives or is explicitly reconciled; uncertain native effects never replay blindly. Controls remain responsive under backlog; offline disable is bounded by lease expiry. Unsupported grants retain honest lifetime/revocation reporting. Run real Cline spot checks for effects/races mocks cannot prove, including pending approval at disconnect/reload and local takeover; keep local consent and native permission enforcement. Shared regressions pass. Record unresolved required failures as release blockers; M22's bounded SSE reconnect alone does not close M23.

#### M24 — Cline packaging and server/gateway deployment

**Dependencies:** M23, M30.

**Boundary:** distribute the Cline plugin and required shared server/control UI; no new app capability. A standalone SwiftUI/Codex companion app or DMG is deferred with Codex.

**Deliver:** reviewed versioned maintained-Cline and companion VSIX packages, graphical installation and compatibility/error/status controls, exact platform/host/API/version fingerprints, licenses/provenance and release integrity/signing/distribution prerequisites. Provide server/database/HTTPS deployment configuration with real intended OIDC setup, credential/configuration steps, migrations/backup, upgrade/rollback and uninstall/credential-cleanup procedures. Define publication/infrastructure ownership; preserve stock installation and original development artifacts.

**Pass:** a clean supported test user installs the reviewed pair, opens an existing Cline task, signs in/pairs, selects controls and operates via GUI without terminal steps. Test the intended TLS proxy for SSE flushing/reconnect and control delivery; validate actual identity configuration, not the synthetic acceptance provider. Upgrade retains valid state or explicitly re-pairs; rollback and uninstall/secret/data cleanup are demonstrated. Missing signing credentials, real identity or infrastructure remain named blockers. Broad publication or deployment to a destination requires the user's instructions. Do not claim Marketplace approval or production success from local unsigned packages.

**API amendment to M24:** distribute/package the FastAPI gateway and locked runtime with required server migrations. Validate public identity/scopes, provider base URLs and actual proxy flushing/timeouts/body/stream limits through gateway → server → Cline; include gateway backup/upgrade/rollback/cleanup. M30 must pass before packaging; all original native/graphical gates remain.

#### M25 — Cline user guide and maintainer handoff

**Dependencies:** M24.

**Boundary:** document the verified Cline/server/gateway release and API/client integration; preserve Codex research as deferred history.

**Deliver:** graphical Cline installation/Connect/approval/question/stop/recovery guides; exact supported-version/platform matrix; architecture and package ownership map; diagnostics, backup/restore, upgrade/rollback, uninstall and incident runbooks; updated README/AGENTS.md and exact developer checks. Clearly distinguish the maintained native package from stock Cline and state unsupported grant/host behavior. Mark Codex M16–M18 Deferred rather than supported or release blockers.

**Pass:** a clean supported user follows instructions without undocumented or terminal product steps. Every support claim links to evidence and version. Cross-check entry points, commands, sign-in/consent, limits and uninstall behavior against the M24 packages/deployment. Developer tooling remains separate. No new architecture or app capabilities in this milestone.

**API amendment to M25:** include generated OpenAPI, desktop REST/SSE and SDK/coding-client guides, exact field/client support matrix, operations/errors/retries/blocked controls, credential rotation/revocation and history/alias/tool ownership. Test against the M24 deployment; no new desktop implementation or implied vendor-product compatibility.

#### M26 — Cline/API release conformance and soak gate

**Dependencies:** M23, M24, M25, M30. No deferred Codex milestone required.

**Boundary:** freeze and validate the Cline/API release candidate against requirements 2.3, its graphical journey and programmatic/provider contracts. Codex workflows are explicitly excluded by scope decision, not falsely reported as passed.

**Deliver:** `evidence/M26/` versioned release report and frozen fingerprints; FR-01–FR-28 traceability for Cline/shared/API behavior; declared support/unsupported/deferred matrix; fresh-install, upgrade/rollback and real Cline/API/client acceptance; measured latency/load results and final maintainer handoff. Verify attachments on the release candidate; historical M19 PNG evidence alone cannot prove a changed package. Record Node 24/npm 11 and locked Python clean installation/build/type/test checks, plus applicable Swift regressions if affected.

**Pass:** all in-scope shared suites and the real installed Cline workflow pass for declared versions/platform: graphical install/pair/Connect, initiating turn completion, subsequent same-task prompts/output/context, attachments, exact allow/deny/question/cancel, reconnect, takeover and local disable. M23/M24 failure and deployment gates remain satisfied. Run at least three healthy-network latency trials and a one-hour idle/active soak; verify p95 server-to-bridge control delivery below 500 ms (excluding model time), approval visibility within one second of bridge observation, and no starvation under the defined 10 MiB backlog. Report topology, limits, failures and distributions; never infer a pass. Unresolved required failures keep M26 In Progress. Any post-freeze code/package change requires affected checks and native revalidation. Final release claims cover Cline only.

**API amendment to M26:** extend traceability to FR-01–FR-28 and freeze gateway/server/SDK/client/native fingerprints. Include real provider sync/SSE/errors/history/tools, credentials/revocation, isolation and wait/retry/restart/blocked controls in the production and load/soak topology. Report gateway latency separately from model runtime and existing bridge targets. Required fidelity gaps cannot be silently excluded. Changed pin/seams require affected native/hardening checks.

#### M27 — Server API contract and FastAPI first-party REST

**Dependencies:** M23. **Status:** Done. Requirements §10.3, FR-19–FR-22 and shared server semantics FR-25–FR-27. [DECISION-010](docs/decisions/010-server-owned-api-semantics.md) supersedes mandatory native-provider expansion; read the [active plan](docs/feasibility/server-owned-api-plan.md).

**Boundary:** expose the existing server through FastAPI; server owns public history/instructions/tools/aliases/budgets/results behind neutral backend adapters. Cline supplies existing consented I/O/control. No new executor/frontend or automatic Codex resumption. Keep M27.1 contract/policy, M27.2 durable server operations/state and M27.3 gateway/control validation. First-party operations plus server conversations/history/tools/estimated-budget policies are implemented and tested; real connection/authority acceptance passed under the declared profile.

**Deliver:** server-owned conversations/history/lineage, instruction composition, caller-tool reply parser/schema/call-ID/result ledger, service aliases/routing, deterministic labeled estimates and admission/output quotas; extend existing auth/idempotency/results/replay/control/media contracts and OpenAPI. Gateway has no database/native/model bypass. Preserve exact existing locks and bindings. Native tokenizer, generation mode and strict decoder are not blanket requirements.

**Pass:** real server/database/HTTP tests prove immutable original retries, ownership/context isolation, tool/result validation and no double effects, versioned estimate provenance, budgets versus actual backend settlement, all-ingress scheduling/restart/revocation and exact controls. Obtain real native I/O/current-companion authority/category acceptance and affected M23 checks. Separate server histories must not leak through a shared stateful task. Any actual adapter change needs its own adoption/evidence. Estimated output quotas cannot be called guaranteed native generation/billing caps.

**Complete:** S1–S4/G1/A1 under the [revised plan](docs/feasibility/server-owned-api-plan.md); [M27-DONE-001](#m27-done-001--server-owned-rest-and-native-connection-complete) records the actual scoped gate. The prior native SDK spike recommendation is historical and superseded by explicit user instruction.

#### M28 — OpenAI-compatible Chat Completions and Responses

**Dependencies:** M27. **Status:** Done. Requirements FR-23, FR-25–FR-27.

**Boundary:** OpenAI-shaped SDC profile/encoders over the common server policies. Service aliases hide backend selection; declared accounting/output-budget semantics can be estimated. Model execution remains in the existing application.

**Deliver:** model discovery, Chat sync/chunks, Responses create/lineage/retrieve/background/applicable cancel, error/finish/SSE and local retention. Normalize history/instructions/functions/results into server state. Publish estimate source/scope and server budget outcome; distinguish native completion. Reject unsupported true model settings/stronger semantics before dispatch. No fake usage, ignored flags or full vendor parity claim.

**Pass:** pinned official SDKs parse sync/Chat chunks/finish/DONE, Responses lifecycle/items/tools/errors. Stateful real server/gateway checks prove context/alias ownership, schema/tool-choice/result handling, estimated accounting/quota semantics, output replacements, cancellation/expiry and original-key retries. M30 owns complete real public/native/named-client acceptance.

**Verified/handoff:** [M28 evidence](evidence/M28/README.md), [OpenAI profile](docs/openai-api-profile.md), [active M28 plan](docs/feasibility/server-owned-api-plan.md#m28-implementation-details). Roo Code is a source-informed tool-client candidate; native strict decoding is no longer a prerequisite for the declared server-validation profile. Retry-key integration and actual caller/native effects remain unproved. Continue is secondary Chat; official SDKs provide the Responses baseline. SDK pins Node 7.30.0/Python 3.26.0 are registry-verified and locked as test consumers. M27 passed and the user explicitly authorized M28. M30 still owns actual named-client/native tool qualification.

#### M29 — Anthropic-compatible Messages and discovery/counting

**Dependencies:** M27, M28. **Status:** Done. Completion: [M29-DONE-001](#m29-done-001--anthropic-profile-and-server-counting-complete). Requirements FR-24–FR-27.

**Boundary:** Anthropic-shaped SDC profile over the same server history/tools/budget/accounting policies; no Claude model/account identity claim.

**Deliver:** model discovery, Messages sync/blocks/SSE, SDC key/version policy, server history/instructions/caller tool results and labeled observed/estimated counts/usage/budgets. Preserve declared local retention/retry semantics and reject unsupported vendor options before dispatch.

**Pass:** pinned official SDKs parse headers/base URL/sync/errors/block/message-delta/stop streams; real integration tests prove common server policy, caller ownership, estimate provenance, public quotas versus native settlement and original-key retries. Counts may be estimates per DECISION-010; exact native tokenizer/cap fidelity is not a blanket gate. M30 qualifies real named clients under the declared profile.

**Implementation plan:** [M29 detailed work packages and acceptance](docs/feasibility/m29-implementation-plan.md), researched 2026-10-08. Six ordered steps cover profile/pins, neutral counting/tool-error outcomes, normalization/discovery, sync/SSE, official SDK/stateful checks, and evidence/regression handoff. Completed under M29-DONE-001.

#### M30 — Public API, native Cline and coding-client acceptance

**Dependencies:** M27, M28, M29. **Status:** Done. Requirements FR-19–FR-28 plus inherited FR-01–FR-18. Completion: [M30-DONE-001](#m30-done-001--public-api-native-and-client-acceptance-complete).

**Boundary:** prove gateway → server → installed maintained Cline and declared provider integrations. No new desktop GUI or deferred Codex implementation.

**Deliver:** `evidence/M30/` native IDs/effects/traces, locked SDK/client/native profiles, OpenAPI examples/desktop reference journey and exact supported/unsupported matrix. Select named coding-client/version targets for each advertised profile before testing; Aider is a documented OpenAI-base-URL candidate, not an accepted pass or automatic requirement. Tool-using clients need full addressed tool-loop proof. Changed native/shared seams get affected M23 regressions/native checks.

**Pass:** real API-submitted echo/answer/two-turn context/image, exact allow/deny/question/cancel, pending disconnect/reload/local takeover, restart/same-key retry, cross-client/task isolation and concurrent ingress policy. Official SDKs and named coding clients use public routes without private interfaces or a substitute runtime. Prove the DECISION-010 server profile's tool ownership/schema validation, labeled accounting estimates, public budgets and composed instructions, keeping native effects/settlement distinct; fixtures alone cannot establish these. Desktop REST/SSE covers supported controls and accurate blocked/uncertain states. Required declared-profile failures remain blockers; M24 owns production identity/TLS/distribution and M26 owns frozen/soak gates.

**Implementation plan:** [M30 ordered native/API/client acceptance plan](docs/feasibility/m30-implementation-plan.md), prepared 2026-10-09. Client retry identity and real caller-tool effect ownership are explicit gates; named client candidates are not accepted versions yet.

### 1.6 Common completion gate

A milestone is Done only when all applicable conditions hold:

- Its declared in-scope artifacts and public contracts exist; no acceptance criterion depends on a future stub. Explicitly Deferred milestones are excluded from this release, not treated as completed.
- Focused tests and the stated demonstration pass, with exact commands or GUI steps and results recorded.
- Existing affected checks still pass; mocks, native evidence, and unverified observations are distinguished.
- Scope changes and architecture decisions are documented; no silent protocol drift or relaxed permissions.
- Required failures are fixed. Optional limitations identify affected capabilities and follow-up ownership.
- Its log entry explains behavior, files, decisions, evidence, and next integration point.
- The register and current handoff agree. Record a commit SHA if Git exists; otherwise record changed paths and evidence without inventing a commit.

### 1.7 Requirement coverage and handoff prompt

The following coverage is for the Cline-only first release. Codex-specific §§3.1/9.1 and M16–M18 are Deferred; app-neutral FR-01–FR-17 still apply. FR-18 covers the graphical Cline journey, with Codex as future scope. FR-19–FR-28 add public/provider APIs; their native semantic gates are not already established by M23.

| Requirement group | First-release implementation owners | Final Cline/shared proof |
|---|---|---|
| FR-01, FR-06, FR-07: delivery/replay/responsive controls | M09, M10 | M23, M26 |
| FR-02, FR-03, FR-08, FR-16: identity/context/order/takeover | M04, M10, M19, M21 | M22, M23, M26 |
| FR-04, FR-09: output and status | M12, M14, M19 | M22, M26 |
| FR-05, FR-11: deduplication/durability | M06, M07, M10, M11 | M23, M26 |
| FR-10, FR-14, FR-15: questions/approvals/permissions | M11, M20 | M22, M23, M26 |
| FR-12, FR-13: consent/disable/app-only execution | M02, M08, M10, M19, M21 | M22, M23, M24, M26 |
| FR-17: attachments | M13, M19 | M19, M23, M26 |
| FR-18 and initial Connect prompt | M14, M19–M22 | M24, M25, M26 |
| FR-19–FR-22: FastAPI, operations, scoped public authority and aliases | M27; server/auth/bridge owning modules | M30, M24, M26 |
| FR-23: OpenAI-compatible models/Chat Completions/Responses | M28 | M30, M24, M26 |
| FR-24: Anthropic-compatible models/Messages/counting | M29 | M30, M24, M26 |
| FR-25–FR-27: history/instructions, client tools, truthful generation/usage/streams | M27 native gate, M28, M29 | M30, M26 |
| FR-28: desktop API contracts and real coding-client qualification | M27–M30, M25 | M30, M24, M26 |

Copy this prompt when assigning a milestone to another model:

> Implement MXX from IMPLEMENTATION_TRACKER.md only. Read AGENTS.md, requirements.md, DECISION-008/009, the current handoff, and prerequisite log entries. Use the Cline-only first-release scope; M16–M18 are Deferred and excluded from its dependencies/acceptance. Verify prerequisite artifacts, then set MXX to In Progress. Follow its scope and completion checks, preserve app-only execution, and use fake adapters only where specified. If blocked, record the exact blocker and next action. On completion, write the detailed walkthrough and evidence, update the tracker and current handoff, and stop before the next milestone. Report actual model/effort and what was verified; do not assume undocumented prior work.

## 2. Logbook

### 2.1 Current handoff — update after every work session

| Field | Current value |
|---|---|
| Last updated | 2026-10-11 16:58 +06:00 (Asia/Dhaka); M26-DONE-001 |
| Completed milestones | M01–M15, M19–M30: all27in-scope milestones Done for declared subsets; M16–M18 Deferred |
| Active milestone | None; M26 complete |
| Next milestone | None authorized; new work requires a bounded instruction |
| Repository state | Exact frozen local Cline4.1.2204/API1.3/companion0.7.3, official VS Code1.140.0/macOSarm64 and five accepted Docker image IDs; product files/packages/images unchanged; no Git metadata |
| Verified implementation | Current real HTTPS/Keycloak/native sync/SSE/context/PNG/JPEG/Aider/once/deny/question/cancel/restart/takeover and live-key local-disable passed. Actual native hour20turns, bridge hour60controls, independent monitor120samples; zero final faults. |
| Current baseline | Requirements2.4/wire2.0; DECISION008/009/010; default caller tools withheld; same signed pair graphical lifecycle reused from M24 |
| Checks | Node24.19/npm11.12 clean root182/0skips, locked Python3.13.16 gateway54, Swift8, Aider shim2; signatures/freeze/docs audit passed. Three60-control trials p95<119ms;10MiB backlog p95~116ms; native approval83/156ms. Gateway admission/model-inclusive completion reported separately. |
| Final state | Native bridge disconnected, task/history and stock editor retained; approvals disabled/Auto-approveNone; zero unrevokedM26keys; disposable PostgreSQL stopped; five persistent services healthy with verifiedHTTPS/OIDC200. |
| Corrections retained | Owner-token expiry cleanup recovered/retested; first bridge soak pool crash from overlapping test DB restart followed by full replacement hour; preliminary monitor expected takeover/restart faults; detached snapshot checker corrected to authoritative durable command count. |
| Limits | One real Cline task; two-binding adversarial isolation is simulated native/realHTTP/PostgreSQL. Only exact local NodeSDK/Aider shim text profiles; current caller functions withheld; estimates not native generation/billing. No new platform/client/app/public production/publication claim. |
| Evidence | [M26 report](evidence/M26/README.md), [verification](evidence/M26/verification.json), [gate audit](evidence/M26/gate-audit.json), [traceability](evidence/M26/traceability.md), [handoff](evidence/M26/HANDOFF.md) |
| Next concrete action | Stop at completed milestone boundary. Use the verified guides; recut/requalify affected gates only under a new bounded instruction when changing pins or expanding support. |

M01/M02 are Done as feasibility research; M03–M10 are revalidated Done after audit repairs; M11–M15 are Done with focused acceptance. The explicit Cline-only first-release decision defers Codex M16–M18 and removes their release dependencies. M19–M21 passed their separate adopted local-pin acceptance. M22 is Done after a real graphical server/native journey and independent linkage validation. The server issued six turns and four controls; exact signed allow/deny receipts and file effects, blue clarification, addressed native abort, reconnect and local takeover passed. A failed approval attempt and bounded first-use Connect retries remain recorded honestly. Repairs span approval HTTP validation, live dispatch state, native receipts/revisions, delegated capability metadata and Stop visibility. The unchanged native package and original M19–M21 archives were hash-verified. Solar is restored, the composer empty, the bridge disconnected/server binding detached, all five test tabs closed, fixture listeners/schema gone and PostgreSQL stopped. Xcode access approval historically used **Allow this conversation**, not Always allow. No production Codex attachment or real-app native approval route is established.

### 2.2 Logbook writing rules

Keep the walkthrough in this document and link larger sanitized logs/screenshots/fixtures from `evidence/MXX/`. Use relative links once files exist. Do not paste credentials, access tokens, private user prompts, or unrelated app history. Record versions, relevant configuration names, and IDs needed to reproduce the result with disposable data.

Use timestamps with timezone, preferably `YYYY-MM-DD HH:MM +06:00 (Asia/Dhaka)`. Record actual start/end times when known; do not invent them. Preserve chronological working entries and append a completion entry when the milestone passes. If a session stops early, write a checkpoint before handing off; completion-only logs are insufficient for recovery.

Record model and effort from the actual session configuration when available. If either cannot be verified, write `Unrecorded` rather than copying the suggested settings as though they were used.

A useful log explains what happened and why. Record decisive failures and fixes, not every transient tool call. Link each test claim to output or a reproducible demonstration. Clearly label `Passed`, `Failed`, `Not run`, and `Unsupported`; unsupported required functionality is not a passed test.

### 2.3 Entry index

Historical working checkpoints and completed milestone entries follow. Add a row for each checkpoint/completion/amendment as work occurs. Use stable entry IDs such as `M01-CHECKPOINT-001`, `M01-DONE-001`, and `M01-AMENDMENT-001`; link the tracker row to the latest valid completion entry.

| Entry ID | Milestone | Timestamp | Kind | Outcome | Link |
|---|---|---|---|---|---|
| M26-DONE-001 | M26 | 2026-10-11 16:58 +06:00 (Asia/Dhaka) | Completion | Frozen local release, current native/media/client controls, latency/backlog and actual-hour soaks passed | [Entry](#m26-done-001--frozen-local-clineapi-release-qualified) |
| M24-DONE-001 | M24 | 2026-10-11 10:38 +06:00 (Asia/Dhaka) | Completion | Selected local deployment, exact final signed pair and graphical lifecycle accepted; M25/M26 Not started | [Entry](#m24-done-001--selected-local-deployment-and-graphical-package-lifecycle-complete) |
| M24-CHECKPOINT-007 | M24 | 2026-10-10 14:25 +06:00 (Asia/Dhaka) | Diagnosis | Hang attributed to host memory exhaustion, not the watcher `EPERM`; `EPERM` is a separate macOS Documents-folder privacy denial; VS Code self-updated 1.140.0 → 1.141.0 | [Entry](#m24-checkpoint-007--isolated-vs-code-hang-diagnosed) |
| M24-CHECKPOINT-006 | M24 | 2026-10-10 13:50 +06:00 (Asia/Dhaka) | Investigation | Private folder available; sanitized VS Code logs show extension-folder watcher `EPERM` and repeated UI/extension-host hangs; causal root remains unconfirmed | [Entry](#m24-checkpoint-006--isolated-vs-code-startup-investigation) |
| M24-CHECKPOINT-005 | M24 | 2026-10-10 13:32 +06:00 (Asia/Dhaka) | Resumption | Docker recovered; signature/native hashes verified; installation/CA approvals received; folder access and unresponsive isolated workbench block native acceptance | [Entry](#m24-checkpoint-005--deployment-recovery-and-approved-graphical-installation) |
| M27-DONE-001 | M27 | 2026-10-08 21:31 +06:00 (Asia/Dhaka) | Completion | Done for declared server-owned profile; native effects/recovery accepted, unqualified caller tools withheld | [Entry](#m27-done-001--server-owned-rest-and-native-connection-complete) |
| M01-CHECKPOINT-001 | M01 | 2026-10-04 22:31 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; input/output verified, approval pending | [Entry](#m01-checkpoint-001--desktop-metadata-and-blocked-ui-probe) |
| M01-CHECKPOINT-002 | M01 | 2026-10-04 22:39 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; report saved, native approval and external route unverified | [Entry](#m01-checkpoint-002--capability-report-and-approval-gate) |
| M01-CHECKPOINT-003 | M01 | 2026-10-04 22:45 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; native hook candidate documented, live route unverified | [Entry](#m01-checkpoint-003--supported-hook-candidate) |
| M02-CHECKPOINT-001 | M02 | 2026-10-04 23:06 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; two-host source assessment and Connect design saved; live access blocked | [Entry](#m02-checkpoint-001--two-host-source-assessment-and-live-access-blocker) |
| M02-CHECKPOINT-002 | M02 | 2026-10-05 08:01 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; live window access verified for both IDEs; execution probes pending | [Entry](#m02-checkpoint-002--live-ide-access-verified) |
| M02-CHECKPOINT-003 | M02 | 2026-10-05 08:11 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; initial prompt echoes verified; provider sign-in required | [Entry](#m02-checkpoint-003--isolated-task-input-and-provider-authentication) |
| M02-DONE-001 | M02 | 2026-10-05 08:16 +06:00 (Asia/Dhaka) | Completion | Done; both-host text continuity and native approvals verified; API/Connect route decided | [Entry](#m02-done-001--two-host-cline-feasibility-complete) |
| M01-CHECKPOINT-004 | M01 | 2026-10-05 08:25 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; host-tool text results reconfirmed, native approval/manual setup pending | [Entry](#m01-checkpoint-004--app-owned-controls-and-native-approval-reassessment) |
| M01-CHECKPOINT-005 | M01 | 2026-10-05 08:31 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; native marker write completed automatically, approval gate open | [Entry](#m01-checkpoint-005--automatic-native-file-write) |
| M01-CHECKPOINT-006 | M01 | 2026-10-05 08:39 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; Ask for approval user-confirmed; automatic write consistent with boundary permissions | [Entry](#m01-checkpoint-006--permission-mode-semantics-confirmed) |
| M01-CHECKPOINT-007 | M01 | 2026-10-05 08:49 +06:00 (Asia/Dhaka) | Plan | In Progress; bounded approval probe and research closure plan saved | [Entry](#m01-checkpoint-007--bounded-completion-plan) |
| M01-CHECKPOINT-008 | M01 | 2026-10-05 11:23 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; exact native probe unsupported, route assessment saved, no retry | [Entry](#m01-checkpoint-008--completion-plan-execution-stopped-at-native-gate) |
| M01-CHECKPOINT-009 | M01 | 2026-10-05 12:34 +06:00 (Asia/Dhaka) | Preparation | In Progress; user-proposed Xcode app-access capture prepared, not dispatched | [Entry](#m01-checkpoint-009--xcode-app-access-recording-prepared) |
| M01-DONE-001 | M01 | 2026-10-05 12:51 +06:00 (Asia/Dhaka) | Completion | Done as research; native app-access request and supervised response verified; external route unestablished | [Entry](#m01-done-001--codex-feasibility-research-complete) |
| M01-AMENDMENT-001 | M01 | 2026-10-05 13:13 +06:00 (Asia/Dhaka) | Closure audit | Done reaffirmed; stale probe language removed; no remaining M01 action | [Entry](#m01-amendment-001--final-closure-audit) |
| M03-CHECKPOINT-001 | M03 | 2026-10-05 (time unrecorded) | Checkpoint | In Progress; prerequisites reconciled, runtime/platform choices underway | [Entry](#m03-checkpoint-001--foundation-started) |
| M03-DONE-001 | M03 | 2026-10-05 13:58 +06:00 (Asia/Dhaka) | Completion | Done; architecture records, workspace build/lint/smoke and SwiftPM check passed | [Entry](#m03-done-001--architecture-and-repository-foundation-complete) |
| M04-CHECKPOINT-001 | M04 | 2026-10-05 17:15 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; M03 handoff verified, M04 contract design underway | [Entry](#m04-checkpoint-001--protocol-work-started) |
| M04-DONE-001 | M04 | 2026-10-05 17:52 +06:00 (Asia/Dhaka) | Completion | Done; protocol v2.0 contracts, schemas, validators, Connect contract, and test vectors passed | [Entry](#m04-done-001--versioned-protocol-and-schemas-complete) |
| M05-CHECKPOINT-001 | M05 | 2026-10-05 20:10 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; SDK contracts and simulator implemented; conformance verification underway | [Entry](#m05-checkpoint-001--adapter-sdk-work-started) |
| M05-DONE-001 | M05 | 2026-10-05 20:12 +06:00 (Asia/Dhaka) | Completion | Done; typed SDK, deterministic fake, queue/control/fault behavior and conformance suite passed | [Entry](#m05-done-001--adapter-sdk-and-fake-app-complete) |
| M06-CHECKPOINT-001 | M06 | 2026-10-05 20:12 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; M04 contracts and M03 store decision reconciled, implementation underway | [Entry](#m06-checkpoint-001--server-persistence-work-started) |
| M06-DONE-001 | M06 | 2026-10-05 21:45 +06:00 (Asia/Dhaka) | Completion | Done; PostgreSQL migrations/repositories and real PostgreSQL concurrency, rollback, snapshot, and restart checks passed | [Entry](#m06-done-001--server-persistence-and-migrations-complete) |
| M07-CHECKPOINT-001 | M07 | 2026-10-05 20:52 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; M06 and SQLite ownership reconciled, local storage implementation underway | [Entry](#m07-checkpoint-001--bridge-storage-work-started) |
| M07-DONE-001 | M07 | 2026-10-05 20:57 +06:00 (Asia/Dhaka) | Completion | Done; durable bridge storage, crash-boundary and restart recovery tests passed | [Entry](#m07-done-001--bridge-persistence-and-recovery-complete) |
| M08-CHECKPOINT-001 | M08 | 2026-10-05 21:27 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; provider, pairing, role and assertion implementation underway; disposable PostgreSQL test available | [Entry](#m08-checkpoint-001--identity-and-authorization-work-started) |
| M08-DONE-001 | M08 | 2026-10-05 21:38 +06:00 (Asia/Dhaka) | Completion | Done; OIDC/PKCE, two-sided pairing, role and credential enforcement, Keychain vault, and signed assertion checks passed | [Entry](#m08-done-001--identity-and-authorization-complete) |
| M09-DONE-001 | M09 | 2026-10-05 22:01 +06:00 (Asia/Dhaka) | Completion | Done; authenticated HTTP/SSE command/event API and PostgreSQL acceptance passed | [Entry](#m09-done-001--http-sse-command-and-event-api-complete) |
| M10-CHECKPOINT-001 | M10 | 2026-10-05 22:16 +06:00 (Asia/Dhaka) | Checkpoint | In Progress; bridge runtime, durable dispatch, and lease implementation underway | [Entry](#m10-checkpoint-001--bridge-scheduler-and-lease-work-started) |
| M10-DONE-001 | M10 | 2026-10-05 22:42 +06:00 (Asia/Dhaka) | Completion | Done; independent control scheduling, offline disable, lease fencing, recovery and retries passed | [Entry](#m10-done-001--bridge-scheduler-connections-and-leases-complete) |
| M11–M13-CHECKPOINT-001 | M11–M13 | 2026-10-06 21:24 +06:00 (Asia/Dhaka) | Sequential implementation checkpoint | Code/docs implemented in order; workspace build/lint pass; acceptance evidence pending | [Entry](#m11m13-checkpoint-001--sequential-implementation) |
| M11–M13-DONE-001 | M11–M13 | 2026-10-06 21:40 +06:00 (Asia/Dhaka) | Completion | M11–M13 Done; focused database/filesystem/bridge acceptance and integrated suite pass | [Entry](#m11m13-done-001--approval-projection-and-attachment-milestones-complete) |
| M14-CHECKPOINT-001 | M14 | 2026-10-06 (time unrecorded) | Work started | In Progress; M09/M11–M13 prerequisites verified, implementing same-origin control UI | [Entry](#m14-checkpoint-001--server-control-interface-started) |
| M14-DONE-001 | M14 | 2026-10-06 22:14 +06:00 (Asia/Dhaka) | Completion | Done; Chrome owner/viewer workflow and PostgreSQL role/session index checks passed | [Entry](#m14-done-001--server-control-interface-complete) |
| M14-AMENDMENT-001 | M14 | 2026-10-06 22:16 +06:00 (Asia/Dhaka) | Reopen | Browser-only mocked sign-in did not establish first-user OIDC registration; server PKCE exchange must pass before M14 closes | [Entry](#m14-amendment-001--oidc-sign-in-flow-reopened) |
| M14-DONE-002 | M14 | 2026-10-06 22:24 +06:00 (Asia/Dhaka) | Completion after amendment | Server-mediated first-user OIDC registration, one-time exchange, Chrome UI, session roles and API pass | [Entry](#m14-done-002--server-mediated-sign-in-and-control-interface-complete) |
| M15-CHECKPOINT-001 | M15 | 2026-10-06 22:24 +06:00 (Asia/Dhaka) | Work started | Prerequisites rechecked; native GUI and lifecycle implementation underway | [Entry](#m15-checkpoint-001--graphical-companion-shell-started) |
| M15-DONE-001 | M15 | 2026-10-06 22:52 +06:00 (Asia/Dhaka) | Completion | SwiftUI development app launched and UI state/lifecycle verified; pairing API and secure storage checks passed | [Entry](#m15-done-001--graphical-companion-shell-complete) |
| M16-CHECKPOINT-001 | M16 | 2026-10-06 23:23 +06:00 (Asia/Dhaka) | Route gate recheck | Current official App Server docs and the documented local socket did not establish attachment to the existing desktop conversation; M16 remains blocked before implementation | [Entry](#m16-checkpoint-001--codex-attachment-route-gate-rechecked) |
| M19-CHECKPOINT-001 | M19 | 2026-10-06 (time unrecorded) | Route gate | Cline-first priority; maintained API adoption needed | [Entry](#m19-checkpoint-001--cline-priority-and-current-api-gate) |
| M19-CHECKPOINT-002 | M19 | 2026-10-07 (time unrecorded) | Implementation | Pinned native API and companion preparation; acceptance pending | [Entry](#m19-checkpoint-002--pinned-native-api-patch-implementation-started) |
| M19-CHECKPOINT-003 | M19 | 2026-10-07 (time unrecorded) | Adoption and native acceptance | Patch adopted; fixtures/regressions pass; native probe underway | [Entry](#m19-checkpoint-003--maintained-patch-adopted-and-native-host-loaded) |
| M19-CHECKPOINT-004 | M19 | 2026-10-07 (time unrecorded) | Native acceptance | Two bridge text turns, continuity, foreign-selection rejection, task switch and reload pass; image test pending | [Entry](#m19-checkpoint-004--native-text-continuity-and-isolation-pass) |
| M19-CHECKPOINT-005 | M19 | 2026-10-07 07:27 +06:00 (Asia/Dhaka) | Native acceptance attempt | UI input/capture unreliable; native PNG still pending | [Entry](#m19-checkpoint-005--final-png-attempt-blocked-by-unreliable-ui-input) |
| M19-DONE-001 | M19 | 2026-10-07 07:48 +06:00 (Asia/Dhaka) | Completion | Final native two-turn PNG/continuity, isolation and lifecycle evidence passed | [Entry](#m19-done-001--cline-existing-task-bridge-complete) |
| M01-M10-AUDIT-001 | M01–M10 | 2026-10-05 23:02 +06:00 (Asia/Dhaka) | Review amendment | M04/M05/M07/M09/M10 reopened; acceptance suites pass but review probes expose defects | [Entry](#m01-m10-audit-001--requirements-and-completion-review) |
| M01-M10-REPAIR-001 | M01–M10 | 2026-10-06 00:16 +06:00 (Asia/Dhaka) | Completion/amendment | Done; all findings repaired, Node 24 and dependent acceptance pass | [M01-M10-REPAIR-001](#m01-m10-repair-001--revalidated-completion) |

| M20-DONE-001 | M20 | 2026-10-07 08:43 +06:00 (Asia/Dhaka) | Completion | Done; exact native allow/deny/local race/question/cancel passed; cleanup verified | [Entry](#m20-done-001--cline-native-controls-complete) |

| M21-CHECKPOINT-001 | M21 | 2026-10-07 (time unrecorded) | Work started | In Progress; trusted-origin native tool and graphical pairing implementation underway | [Entry](#m21-checkpoint-001--connect-implementation-started) |

| M21-CHECKPOINT-002 | M21 | 2026-10-07 09:08 +06:00 (Asia/Dhaka) | Implementation | Fixture/transport checks pass; new native package/pairing approval pending | [Entry](#m21-checkpoint-002--implementation-ready-for-native-acceptance) |
| M21-DONE-001 | M21 | 2026-10-07 19:21 +06:00 (Asia/Dhaka) | Completion | Done; native Connect/pairing, post-turn server continuity and disconnect passed | [Entry](#m21-done-001--native-prompt-triggered-connect-complete) |

| M22-CHECKPOINT-001 | M22 | 2026-10-07 (time unrecorded) | Work started | In Progress; capability/revision seams and native acceptance identified | [Entry](#m22-checkpoint-001--workflow-acceptance-started) |
| M22-DONE-001 | M22 | 2026-10-08 00:27 +06:00 (Asia/Dhaka) | Completion / shared repair amendment | Done; full graphical native journey, independent receipts/effects and cleanup passed | [Entry](#m22-done-001--native-server-workflow-complete) |

| RELEASE-SCOPE-001 | M16–M18, M23–M26 | 2026-10-08 00:38 +06:00 (Asia/Dhaka) | Product scope amendment | Cline-only first release; Codex Deferred; M23 dependency and M26 gates updated | [Entry](#release-scope-001--cline-only-first-release-plan) |
| M23-CHECKPOINT-001 | M23 | 2026-10-08 00:48 +06:00 (Asia/Dhaka) | Work started | In Progress; recovery/isolation/race audit and conformance checks underway | [Entry](#m23-checkpoint-001--cline-hardening-started) |
| M23-DONE-001 | M23 | 2026-10-08 03:07 +06:00 (Asia/Dhaka) | Completion | Done; final Node 24 hardening, real pending-approval disconnect/reload/local takeover, independent validation and cleanup passed | [Entry](#m23-done-001--cline-hardening-complete) |
| PUBLIC-API-SCOPE-001 | M24–M30 | 2026-10-08 07:51 +06:00 (Asia/Dhaka) | Research / requirements amendment | FastAPI/REST/OpenAI/Anthropic added to release; implementation Not started | [Entry](#public-api-scope-001--public-api-research-and-release-plan) |
| M27-CHECKPOINT-001 | M27 | 2026-10-08 08:00 +06:00 (Asia/Dhaka) | Work started | In Progress; explicit implementation instruction and required native field review | [Entry](#m27-checkpoint-001--public-api-implementation-started) |
| M27-CHECKPOINT-002 | M27 | 2026-10-08 08:54 +06:00 (Asia/Dhaka) | Implementation / blocked native gate | First-party server/gateway tests pass; parent In Progress pending required native expansion and acceptance | [Entry](#m27-checkpoint-002--first-party-rest-implemented-native-gate-open) |
| M27-M28-RESEARCH-001 | M27, M28 | 2026-10-08 09:19 +06:00 (Asia/Dhaka) | Source research / execution plan | Required native gates preserved; M27 In Progress, M28 Not started; released client and SDK candidates researched | [Entry](#m27-m28-research-001--native-semantics-and-openai-execution-plan) |
| SERVER-API-OWNERSHIP-001 | M27–M30 | 2026-10-08 19:18 +06:00 (Asia/Dhaka) | User architecture/scope clarification | Server owns public semantics; service aliases/labeled estimates permitted; native-first prerequisite superseded | [Entry](#server-api-ownership-001--server-owned-semantics-and-backend-independence) |
| M29-REVIEW-001 | M29 | 2026-10-09 (time unrecorded) | Post-completion review and repair | Malformed input, alias visibility, usage encoding and OpenAPI repaired; 52 gateway checks passed | [Entry](#m29-review-001--post-completion-anthropic-contract-repair) |
| M30-PLAN-001 | M30 | 2026-10-09 (time unrecorded) | Implementation planning | Ordered real Cline/API/SDK/client acceptance and request-key/tool-effect gates; M30 Not started | [Entry](#m30-plan-001--real-api-native-and-client-acceptance-plan) |
| M30-START-001 | M30 | 2026-10-09 08:18 +06:00 (Asia/Dhaka) | Work started | In Progress; prerequisite evidence and exact client/native pins under review | [Entry](#m30-start-001--public-api-native-and-client-acceptance-started) |
| M30-CHECKPOINT-001 | M30 | 2026-10-09 (time unrecorded) | Client wire spike / native gate | Aider request identity and contract checks pass; real Cline binding remains open | [Entry](#m30-checkpoint-001--named-client-wire-spike-and-native-connection-gate) |
| M30-CHECKPOINT-002 | M30 | 2026-10-09 19:46 +06:00 (Asia/Dhaka) | Disposable native API and SDK acceptance | Provider text/streams/media and first-party controls passed; Aider coding client and recovery/isolation gates remain open | [Entry](#m30-checkpoint-002--native-provider-and-first-party-acceptance) |
| M30-CHECKPOINT-003 | M30 | 2026-10-09 (Asia/Dhaka) | Named client/retry acceptance | Aider text edits, completed-retry durability and same-binding isolation passed; caller tools remained open | [Entry](#m30-checkpoint-003--named-text-clients-and-durable-retryisolation) |
| M30-CHECKPOINT-004 | M30 | 2026-10-10 (Asia/Dhaka) | Native candidate prepared | API 1.3 tool-denial source/stateful checks passed; graphical adoption still open | [Entry](#m30-checkpoint-004--exact-native-caller-tool-denial-candidate-prepared) |
| M30-CHECKPOINT-005 | M30 | 2026-10-10 (Asia/Dhaka) | Caller-result denial repair | Continuation policy and readiness tests passed; real native gate remained open | [Entry](#m30-checkpoint-005--caller-result-denial-and-readiness-repair) |
| M30-CHECKPOINT-006 | M30 | 2026-10-10 (Asia/Dhaka) | Real candidate caller-tool ownership | Native effect-denial loop passed; pending recovery/isolation still open | [Entry](#m30-checkpoint-006--real-candidate-caller-tool-ownership) |
| M30-DONE-001 | M30 | 2026-10-10 11:14 +06:00 (Asia/Dhaka) | Completion | Real first-party/SDK/Aider/native caller-tool/recovery acceptance, two-binding stateful isolation and cleanup passed | [Entry](#m30-done-001--public-api-native-and-client-acceptance-complete) |

### M01-CHECKPOINT-001 — Desktop metadata and blocked UI probe

- Timestamp: 2026-10-04 22:31 +06:00 (Asia/Dhaka).
- Model/effort: Unrecorded; the recommended settings were not assumed to be actual settings.
- Status: In Progress. No prerequisite milestones.
- Baseline: documentation-only repository; no Git metadata observed. Read AGENTS.md, requirements §§1, 3.1, 5, 9.1, and M01's acceptance criteria.
- Verified environment: /Applications/ChatGPT.app, bundle com.openai.codex, version 26.930.31730 (12947), macOS 26.5.1, ARM64.
- UI probe: cua.getApp("com.openai.codex") was refused by Computer Use for safety reasons. No accessibility tree or screenshot was returned. No alternate UI technology was used to bypass that restriction.
- Evidence: [Environment](evidence/M01/environment.json), [Computer Use restriction](evidence/M01/computer-use-restriction.json).
- Authorized fallback: the user explicitly permitted a disposable app chat and two harmless text prompts. Built-in app tools delivered both prompts and observed completed replies with context continuity. Detailed transcript evidence will be saved separately.
- Remaining gate: a genuine pending native approval and its response mechanism have not been observed. A manual app probe was requested because the permitted tools cannot inspect the approval UI.
- Next action: save the app-owned tool trace, complete the capability matrix, and record native approval evidence if the user provides it.
- No app permissions, approval settings, connections, or model-runtime processes were changed by this agent.

### M01-CHECKPOINT-002 — Capability report and approval gate

#### Execution record and boundary

- Timestamp: 2026-10-04 22:39 +06:00 (Asia/Dhaka). Initial environment inspection began at 2026-10-04 22:27 +06:00; this is a checkpoint, not a completion time.
- Actual model/effort: Unrecorded. No subordinate agents or alternate LLM runtimes used.
- Milestone: M01 In Progress; no prerequisites. Requirements §§1, 3.1, 5, 7–9 and tracker completion gates remain authoritative.
- Repository: documentation-only starting state; resulting changes are this tracker, `docs/feasibility/codex.md`, and sanitized `evidence/M01/` files. No application implementation added. AGENTS.md and requirements.md unchanged.

#### Walkthrough and observations

The installed host is `/Applications/ChatGPT.app`, bundle `com.openai.codex`, version 26.930.31730 (12947), on macOS 26.5.1 ARM64. Bundle identity was read without launching another process. Computer Use refused the app for safety reasons before any accessibility tree or screenshot was available; no alternate technology bypassed that refusal.

After explicit human authorization, `create_thread` created **M01 disposable app-control probe** in the local repository project. The first text-only turn returned `M01-APP-INPUT-OK`. A follow-up through `send_message_to_thread` addressed that existing native chat and returned `M01-CONTEXT-7K4P CONTINUITY-OK`, recalling the earlier marker. `wait_threads` reported both turns completed; `read_thread` confirmed the disposable prompts/replies. Probe turns used no tools. This proves app-owned addressed input, final output, completion records, and conversational continuity, with the scope limited to tools available inside this chat.

Native chat: `01a107bf-812f-7082-8fc3-978ac74a289f`; host: `local`. Turn IDs are preserved in the sanitized trace. Observed durations: 8,558 ms and 4,730 ms. No performance benchmark or desktop UI echo verification is claimed.

The official Remote documentation supports an app-only remote workflow through vendor clients; it does not establish our custom server's interface. App Server documentation supplies request-bound approval semantics, but no authorized external attachment to this running desktop instance was established. Static bundle inspection found URL schemes and a Chromium `scripting.sdef`; its generic browser commands do not establish conversation or native approval control. No scripting action executed.

#### Verification and evidence

| Check | Result | Evidence |
|---|---|---|
| Version/platform metadata | Passed | [environment.json](evidence/M01/environment.json) |
| Accessibility entry | Refused by tool policy; no UI evidence | [computer-use-restriction.json](evidence/M01/computer-use-restriction.json) |
| Two app-owned turns and continuity | Passed within host-tool scope | [app-owned-conversation-probe.json](evidence/M01/app-owned-conversation-probe.json) |
| Native approval methods in exposed tools | None found; product-wide availability unverified | [available-app-tools.json](evidence/M01/available-app-tools.json) |
| Static scripting declarations | Inspected; runtime untested | [scripting-dictionary-summary.json](evidence/M01/scripting-dictionary-summary.json) |
| Published interface review | Research only | [source-review.json](evidence/M01/source-review.json) |
| Genuine native approval capture/response | Not run / Unverified | [native-approval-checkpoint.json](evidence/M01/native-approval-checkpoint.json) |
| Version-specific capability classification | Recorded, no production capabilities enabled | [capability-matrix.json](evidence/M01/capability-matrix.json) |
| Documentation/evidence consistency | Passed: JSON parses, report links resolve, tracker has two sections and consistent milestone statuses | [documentation-validation.json](evidence/M01/documentation-validation.json) |

The user replied “Approve for me” to the proposed graphical approval probe. The final available status showed the chat idle, its second text turn completed, and no tool marker. No genuine pending approval had been captured. The current app-tool surface has no native approval resolver; the agent therefore did not apply an approval, send a third prompt, or alter permissions. This status snapshot is not exhaustive native approval enumeration. “Approval pending” in checkpoint 001 means the **approval check remained unfinished**, not that a real dialog was observed.

#### Decisions, limitations, and recovery

The report retains the existing-app boundary and gates Codex implementation on a usable attachment or permitted accessibility route. An in-chat tool is not a persistent external bridge; a remembered marker is not a native approval. Streaming, questions, stop/steering, foreground behavior, restart, and atomic request-switch protection remain unverified separately. No approval settings changed, no Full Access enabled, no services/ports started, and no credentials saved. The disposable chat remains available for the approval probe; no cleanup or archive performed. `native-approval-marker.txt` was not created.

#### Exact unblock condition and next action

Obtain a permitted native inspection/response surface, or user-conducted sanitized graphical evidence. Follow the bounded probe in [codex.md](docs/feasibility/codex-investigation-history.md#remaining-acceptance-probe-and-handoff): task-specific permission mode if available, only the disposable marker target, exact native choices/identity/scope, and confirmed resolution. An automatically allowed write is not evidence of approval. Do not expand to unrelated paths merely to trigger a dialog. Record whether stale decisions can be rejected and classify unsupported behavior.

Update the report, evidence, capability matrix, and handoff after that probe. Re-evaluate M01's explicit pass criteria before marking Done; there is no completion entry yet. M02–M26 remain Not started. M16/M17 additionally require a usable route or explicit product-scope decision even after discovery completes.

### M01-CHECKPOINT-003 — Supported hook candidate

- Timestamp: 2026-10-04 22:45 +06:00 (Asia/Dhaka); actual model/effort Unrecorded. User requested another attempt and practical next steps.
- Official documentation confirms Computer Use excludes automating ChatGPT itself. No repeated blocked UI action, permission widening, or workaround attempted.
- New candidate: Codex's documented native `PermissionRequest` hook can invoke a connected MCP handler and accept a bounded decision. Hooks need trust. Desktop plugin installation is documented; graphical hook review/trust in this installation is still unverified.
- This is documentation research, not a live callback or approval result. No plugin/hook installed, no third probe message sent, and no settings changed. Current capability classifications remain unchanged.
- Updated [feasibility report](docs/feasibility/codex-investigation-history.md#follow-up-investigation--supported-hooks), [sources](evidence/M01/source-review.json), and [capability matrix](evidence/M01/capability-matrix.json).
- Next M01 probe: graphical installation/trust; genuine callback identity and action; bounded allow/deny, stale decisions, and failure fallback. External input into an idle existing chat needs separate proof; a hook does not supply that route or justify permanent model polling.
- M01 remains In Progress. M02–M26 remain Not started. If the external Codex route is unavailable, the product decision is to retain a restricted Codex scope or prioritize Cline feasibility with explicit authorization.

### M02-CHECKPOINT-001 — Two-host source assessment and live access blocker

#### Execution record and scope

- Checkpoint: 2026-10-04 23:06 +06:00 (Asia/Dhaka). Actual model/effort: Unrecorded; no delegation used.
- User instruction: continue M02 and try both Antigravity IDE and VS Code. Interpreted within M02 as Cline in both IDEs; Antigravity's native agent is a separate adapter investigation.
- Status: M02 In Progress. It has no milestone dependencies, so the user's move from incomplete M01 is valid. M01 remains In Progress; M03–M26 were not started.
- Baseline: requirements v2.0, AGENTS.md, M02 boundary/pass criteria, and M01 checkpoints read. No runtime implementation existed. No Git commit produced.

#### Walkthrough and findings

Installed metadata now reports VS Code 1.140.0 with Cline 4.1.22, and Antigravity IDE 2.5.5 (embedded editor 1.107.0) with Cline 3.83.0. Both extension IDs are `saoudrizwan.claude-dev`. Earlier preflight observations of VS Code 1.137.0 and absent Cline are superseded by this session's filesystem evidence; the agent did not install or update either product. Installed bundles were fingerprinted, and the public export snippets were inspected without loading the extension runtime.

Computer Use was attempted for both exact bundle IDs. Each reported that access was not approved. The user said access was enabled for both; both retries still returned the same refusal. Resetting the tool session and retrying each app also failed. No accessibility tree, screenshot, live task, prompt, or approval was obtained. No alternative UI technology or private control interface bypassed the refusal. This is a present tool-access blocker, not evidence that Cline itself cannot run.

Official release source was fetched read-only at pinned commits: 4.1.22 `f58bc118bdeef1bd2813cd08e00d98bdcda96475`, and 3.83.0 `80783b62cb0aad6e9061a6616dade1582ab5174d`. Corresponding export code matches the observed four-operation shape in both installed bundles. It targets the current task; no expected task/request/revision accompanies input or approval helpers. Internal ask-response schemas also omit request-bound resolution. A companion-side check followed by a generic button call cannot close that race.

The implementations differ internally. Version 3.83.0 has classic task/ask state, separate taskId/ulid, and timestamp-based message identity. Version 4.1.22 uses an app-owned SDK controller/session, internal event subscriptions, richer turn state, and a native pending approval resolver carrying tool input and tool-call identity. Those internals are candidates for an upstream integration API; they are not public companion exports and were not invoked.

Connect origin was traced to the MCP wire boundary. In 3.83.0 the task ulid reaches telemetry, while the outgoing tools/call contains tool name and arguments. The inspected 4.1.22 SDK client similarly sends name/arguments and uses the execution context's cancellation signal locally. No trusted task identity reaching an ordinary MCP server was established. The Connect design therefore requires host-injected origin context, not a model-authored taskId.

#### Artifacts and contracts

| Artifact | Purpose |
|---|---|
| [cline.md](docs/feasibility/cline.md) | Per-host findings, native identity mapping, public API gaps, proposed app-owned interface, and M02-G1–G5 gates |
| [cline-connect.md](docs/feasibility/cline-connect.md) | Trusted Connect origin, graphical pairing, persistent listener, typed input/output, and approval decision lifecycle |
| [environment.json](evidence/M02/environment.json) | Installed metadata, activation declarations, public API excerpts, bundle fingerprints |
| [ui-access.json](evidence/M02/ui-access.json) | Initial, post-user-confirmation, and fresh-session access refusals for each IDE |
| [source-manifest.json](evidence/M02/source-manifest.json) | Immutable source URLs and SHA-256 hashes; no reproducible-build claim |
| [source-findings.json](evidence/M02/source-findings.json) | Bounded, traceable static findings M02-F01–F08 |
| [capability-matrix.json](evidence/M02/capability-matrix.json) | Each IDE evaluated separately, all live capabilities unverified |
| [live-probe-plan.md](evidence/M02/live-probe-plan.md) | Reproducible harmless input/output and native file-approval probes |
| [documentation-validation.json](evidence/M02/documentation-validation.json) | Passed JSON/link/status checks and verification of 31 downloaded source hashes; no live-app claim |

The proposed interface exposes binding, filtered snapshots/events, task-addressed prompt submission, atomic request resolution, cancellation, and trusted Connect registration. This is a feasibility-level proposal; M04 still defines concrete schemas. Neither public button helpers nor private webview messages were adopted as an unattended approval API. A separately maintained Cline build has not been approved or installed.

#### Verification, limits, and handoff

- Passed static checks: installed metadata read; bundle hashes saved; pinned source fetched; export, approval, event, and MCP-origin paths inspected. These are research checks, not app acceptance tests.
- Not run: both live same-task conversations, genuine native approvals, native decision application, foreground tests, restart/reconnect, and request-switch tests. Model/provider setup in each IDE is unverified.
- No permissions/auto-approval/provider settings changed; no services/ports started; no API tokens, user task history, or screenshots saved. No CLI or separately launched LLM runtime used.
- Temporary downloaded source is under `/private/tmp/serverdrivenchat-m02-source`; it is a disposable inspection cache. Future models can reproduce it from the saved manifest; it is not required for operating the app.
- Exact unblock condition: a permitted Computer Use entry must return the intended IDE's live state, or the user supplies sanitized results from the documented graphical probes. A settings confirmation without successful access is insufficient.
- Next action: execute the two-host live probe plan, update native identity/capability evidence and route decision, then re-evaluate M02's pass criteria. Do not mark Done from source analysis alone. M19–M21 additionally need a supported/adopted request-bound integration API even if supervised UI probes succeed.
- The current handoff and milestone register reflect M02 In Progress. No completion entry exists. M03 must reconcile both incomplete feasibility milestones and product-route decisions before implementation foundations are selected.

### 2.4 Working checkpoint template

Copy this template for interrupted work. Replace placeholders with observed facts.

```markdown
### MXX-CHECKPOINT-001 — Short description

- Timestamp and timezone:
- Model and effort actually used:
- Milestone status: In Progress
- Starting baseline: branch/commit, or file-state description if no Git
- Prerequisite entries read:
- Work completed this session:
- Files changed and why:
- Contracts/decisions established:
- Checks run and evidence paths:
- Current failures or uncertainties:
- Blocker and exact condition needed to proceed:
- Running processes/app state, ports, and cleanup needed:
- Uncommitted or incomplete edits:
- Next concrete action:
- Changes needed in the current handoff:
```

### 2.5 Completed milestone walkthrough template

Copy this template only after the milestone's completion gate passes. Keep the walkthrough detailed enough for a model with no chat history to understand and extend the result.

```markdown
### MXX-DONE-001 — Milestone title

#### Execution record

- Started / completed, with timezone:
- Model(s) and effort(s) actually used:
- Baseline and resulting commit, or exact changed-file inventory:
- Requirement sections and prerequisite entries:
- Final milestone status: Done

#### Outcome and walkthrough

Explain the completed behavior from user action to observed result.
Describe the main code path, state transitions, persistence boundaries,
and interactions with earlier modules. Include a concrete disposable-data example.
For app milestones, identify the app/version, native conversation/task,
integration route, and proof that the existing app executed the work.

#### Files and public contracts

| Path | Purpose/change | Contract consumed by later milestones |
|---|---|---|

Document exported APIs, schemas, migrations, configuration names/defaults,
and error behavior. Never include credential values.

#### Decisions and rationale

Record selected options, evidence, important rejected alternatives,
and links to architecture decisions. State any requirement changes explicitly.

#### Verification and logs

| Check | Exact command or GUI steps | Environment/fixture | Expected | Actual | Result | Evidence |
|---|---|---|---|---|---|---|

Include relevant test output and a concise ordered trace. For approvals,
distinguish request capture, decision recording, native application, and action result.
Label fake-adapter evidence separately from real-app evidence.

#### Failures encountered and fixes

Describe root causes, fixes, and the verification that ruled out recurrence.
Record any remaining limitation with its affected capability and follow-up owner.
Do not leave required failed checks here while claiming completion.

#### Recovery and operational notes

Explain restart/retry/rollback behavior applicable to this milestone,
stored state, migration effects, and cleanup. Note running processes and
whether a fresh session must re-pair or reopen an app.

#### Handoff to the next milestone

- Artifacts/interfaces now safe to rely on:
- Exact developer setup and verification commands:
- Next milestone and first concrete action:
- Assumptions to preserve:
- Known limitations or external dependencies:
- Tracker status, entry index, and current handoff updated:
```

### 2.6 Decision and amendment templates

Use a short entry for a decision affecting multiple milestones; retain the full rationale in `docs/decisions/` once that directory exists. Use amendments to correct earlier claims without erasing history.

```markdown
### DECISION-001 — Decision title

- Timestamp, model/effort, and triggering evidence:
- Decision and rationale:
- Alternatives considered:
- Affected requirements, contracts, and milestone IDs:
- User direction/approval, if required for this decision:
- Migration and revalidation required:
- Decision-record path:

### MXX-AMENDMENT-001 — Correction title

- Timestamp and author/model:
- Earlier entry being corrected:
- New evidence and corrected conclusion:
- Affected milestones and statuses:
- Fix and verification, or outstanding next action:
```

### M02-CHECKPOINT-002 — Live IDE access verified

- Recorded: 2026-10-05 08:01 +06:00 (Asia/Dhaka). Model/effort: Unrecorded.
- Scope: retry Computer Use access to the two exact bundle identifiers in separate invocations and verify returned window state.
- Passed: `cua.getApp("com.microsoft.VSCode")` returned a live window tree and succeeded again on a subsequent call. Its sparse tree was supplemented by `getScreenshot()`, which showed the Welcome screen.
- Passed: `cua.getApp("com.google.antigravity-ide")` returned a live workbench tree including the Cline webview, task input, model selector, and Plan/Act controls. This proves visible Cline UI, not successful inference.
- The tool did not report whether a desktop approval prompt appeared or whether an “Always allow” grant was saved. Written authorization is not treated as proof of persistence. No bypass, app settings changes, prompts, file edits through Cline, or native approval decisions were performed.
- Updated [UI access evidence](evidence/M02/ui-access.json), [capability matrix](evidence/M02/capability-matrix.json), and [feasibility report](docs/feasibility/cline.md). Historical denials remain recorded. Unrelated workspace/profile/history details and screenshots were not stored.
- Next: run the [live probe plan](evidence/M02/live-probe-plan.md) in isolated disposable tasks/workspaces for each host. Same-task input/output, native approval details and resolution, and app-owned API adoption remain separate checks. M02 stays In Progress; M01 and downstream milestone statuses are unchanged.

### M02-CHECKPOINT-003 — Isolated task input and provider authentication

- Recorded: 2026-10-05 08:11 +06:00 (Asia/Dhaka). Model/effort: Unrecorded.
- User asked to finish M02 and reports both IDEs are Always allowed in Codex Computer Use settings. Both apps returned live state; this is distinct from the user-reported saved permission setting.
- Prepared isolated folders under `/private/tmp/serverdrivenchat-m02-probes/` and opened each in a new native IDE window, preserving existing projects and tasks. VS Code Restricted Mode disabled Cline. Asked for security-setting confirmation; user explicitly approved trusting only the two probe folders. Granted that scope through each IDE, with no parent-folder trust or Cline auto-approval changes.
- Entered and submitted the first planned harmless prompt into Cline in both hosts. Each native task transcript echoed the exact prompt. Both showed the configured `cline:cline-free/deepseek-v4.1-flash` provider and the native error “Whoops looks like you're logged out – click below to sign in,” with Sign in, Retry, and Start New Task controls. No assistant answer was produced.
- Started Antigravity's native Sign in to Cline flow; no usable authentication page was observed, and window selection changed to an existing project. No prompt was sent into that project. Requested graphical provider setup in the probe windows from the user; credentials are not requested in chat.
- Evidence: [VS Code](evidence/M02/vscode/live-probe.json), [Antigravity](evidence/M02/antigravity/live-probe.json). Transient ScreenCaptureKit capture failures and focus/element changes were handled by fresh UI observations. No alternate UI technology, CLI/model runtime, private sockets, or credential extraction was used.
- Results: app access, Cline UI activation, and initial input echo Passed; first assistant reply blocked by authentication; same-task follow-up and native approval Not run. No approval marker was created. Native task IDs are not exposed by the observed UI and were not fabricated from webview IDs.
- Next: complete graphical Cline sign-in in both probe windows, select Retry in each existing task, then run continuity and bounded file-approval probes. M02 remains In Progress; missing API/Connect capabilities remain named downstream gates, and other milestone statuses are unchanged.

### M02-DONE-001 — Two-host Cline feasibility complete

#### Scope, environment, and prerequisites

Recorded: 2026-10-05 08:16 +06:00 (Asia/Dhaka). Model/effort: Unrecorded. No Git commit produced; this checkout has no Git metadata. The user requested completion of M02, confirmed saved Computer Use permissions, explicitly approved trust for only the two disposable folders, and completed provider sign-in graphically. M01 remained In Progress; M02 has no milestone dependencies. No downstream code was started.

Hosts: VS Code 1.140.0 with Cline 4.1.22; Antigravity IDE 2.5.5 (embedded editor 1.107.0) with Cline 3.83.0. Successful UI model selectors were `cline:stealth/space-bunny-alpha` and `cline:cline-free/muse-spark-1.3-contributor` respectively. Provider/model changes were performed by the user between sessions, not by the agent. Both probe tasks used Act mode; the existing auto-approve summaries were Read, Commands, Web Fetch, MCP. No file-edit auto-approval was enabled.

#### Walkthrough and verified results

1. Selected each existing probe window through Computer Use and verified its workspace/task header before acting. Earlier failed authentication attempts were retained in evidence. VS Code exposed Retry; it resumed the original task. Antigravity's original probe task already showed the successful first response after user sign-in/retry.
2. Observed exact `M02-INPUT-OK` replies with native `COMPLETED` status in both tasks. Submitted the planned follow-up in each same task, observed its echo, and received exact `M02-CONTEXT-6R8Q CONTINUITY-OK` replies with `COMPLETED`. No New Task or task-switch action occurred between these turns. Native task IDs were not exposed by the observed UI; the authoritative identity mapping is from pinned source, not inferred from a title/webview ID.
3. Submitted the bounded native file-edit prompt for only `m02-approval-marker.txt` with `M02 APPROVAL PROBE` plus newline. Both IDEs opened a New File preview and Cline's genuine “wants to create a new file” card. Expanded the code block to inspect full proposed content. Both offered Save and Reject; ordinary assistant consent text was not counted as approval evidence.
4. Confirmed both marker files were absent before resolution. Rechecked the live Antigravity request, then selected Reject. Its preview closed and Cline completed with a denied-action response. Independent filesystem inspection confirmed the marker remained absent.
5. In VS Code, reviewed the file/card and selected Save. The preview switched to the saved file editor, native approval controls disappeared, and Cline completed with a success response. Independent filesystem inspection confirmed exactly `b'M02 APPROVAL PROBE\n'`. Permission acceptance and action outcome are recorded separately.
6. Updated both host evidence records, the capability matrix, report, Connect design context, probe procedure, source/access amendments, and this handoff. Parsed evidence JSON and checked local links/status consistency. No CLI or separately launched LLM runtime executed either task.

| Acceptance criterion | Result and evidence |
|---|---|
| Exact installed interface/version assessment | Passed: installed fingerprints, pinned source manifest, static API/identity analysis |
| Existing-task input and observable output in both hosts | Passed via native UI: exact first/follow-up echoes and completed replies |
| Genuine approval state and available response mechanism | Passed: full one-file proposal, Save/Reject controls, native resolution, independent file outcomes |
| Stock support distinguished from proposed API | Passed: four current-task helpers do not export binding/snapshot/events or atomic request-bound resolution |
| Origin-bound Connect and persistent listener design | Delivered: host-trusted origin outside model arguments; extension-owned listener after turn returns; no runtime substitution |
| Integration route decision | Upstream versioned Cline API addition required; maintained build only after explicit adoption |

#### Files and implementation decisions

- [VS Code evidence](evidence/M02/vscode/live-probe.json) and [Antigravity evidence](evidence/M02/antigravity/live-probe.json): historical authentication attempt, exact transcript results, pending approval details, decisions, lifecycle, and before/after file checks.
- [Capability matrix](evidence/M02/capability-matrix.json), [access trace](evidence/M02/ui-access.json), and [source findings](evidence/M02/source-findings.json): completed discovery status with dated amendments preserving old failures.
- [Cline feasibility](docs/feasibility/cline.md), [Connect design](docs/feasibility/cline-connect.md), and [probe procedure](evidence/M02/live-probe-plan.md): final route, native identity mapping, reproducible steps, and downstream ownership.
- [Validation](evidence/M02/documentation-validation.json): focused documentation/evidence checks; earlier source-hash validation remains historical, not rerun or claimed as new app testing.

Select an app-owned upstream API addition as the route. The companion must bind commands to trusted task identity, export filtered snapshots/events, and resolve exact pending interactions atomically against request revision/action digest. Connect requires host-derived origin; ordinary MCP arguments are model-controlled and do not establish it. Run the SSE/POST listener in the extension service while the host is alive and let Connect return promptly. No custom build was adopted or installed, no public API helper was invoked live, and no server/bridge exists yet.

#### Limitations, cleanup state, and next handoff

M02 is Done as feasibility discovery. Native UI control is demonstrated; unattended server control is unimplemented. M19 owns programmatic identity/binding/output, M20 owns atomic approval/question/cancel controls, M21 owns trusted Connect origin and persistent delivery, and M22/M23 own server workflow/recovery/race proof. UI button success does not close these gates. Partial-output behavior, stop/clarification, restart/reload, automated stale-decision races, and foreground-independent delivery were not formally tested.

Both disposable tasks/windows and the narrowly trusted probe folders remain available. VS Code's marker exists with verified bytes; Antigravity's marker is absent. No approval remains pending. No broader permissions, Cline auto-approval settings, credentials, or unrelated project files were changed by the agent.

M01 remains In Progress; M03–M26 remain Not started. Before M03, finish or explicitly reconcile M01's external Codex route/native approval scope. M03 must decide Cline API adoption and packaging without treating M02's UI demonstration as a production adapter. Stop at the completed M02 boundary.

### M01-CHECKPOINT-004 — App-owned controls and native approval reassessment

- Recorded: 2026-10-05 08:25 +06:00 (Asia/Dhaka). Model/effort: Unrecorded. User requested a check of M01 similar to the completed M02 probes. No new chat was created or message dispatched.
- Read the prior M01 report, tracker gates and evidence. Installed Info.plist still identifies `com.openai.codex`, version 26.930.31730 (12947). The original marker is absent. `read_thread` reconfirmed the two completed disposable text turns and exact replies; returned chat state `notLoaded` is not a native approval enumeration.
- Rechecked the current app-tool inventory: no native approval enumerator/resolver, task-permission setter, or external companion endpoint is exposed by this surface. This is a scoped inventory finding, not a claim that the entire product lacks those features.
- Fetched official Computer Use safety guidance, Hooks, App Server, Remote connections and security/approval documentation. The self-app automation restriction remains documented; M02 IDE permissions do not override it. No redundant forbidden UI retry or alternate bypass was attempted.
- PermissionRequest hooks offer an invocation callback for allow/deny/defer, not permission-subset editing. Session/turn/tool metadata does not by itself uniquely address the pending approval. Graphical trust and live callback correlation remain unverified. The documented Unix-socket transport does not establish running-desktop attachment; no socket scan/connection or separately launched runtime was used.
- Asked the user to select a task-specific native file-review mode if available and explicitly authorize one bounded marker prompt in the existing disposable chat. Human-supplied sanitized UI evidence is needed because this tool surface cannot inspect native Codex approvals. No Full Access, hook trust bypass, credentials, global grants, or app setting edits were performed.
- Saved [reassessment evidence](evidence/M01/reassessment-2026-10-05.json) and [reviewable probe procedure](evidence/M01/live-probe-plan.md); updated the report, capability matrix and current handoff. Historical checkpoints and M02 completion are preserved.
- M01 remains In Progress: app-owned text input/output Passed; genuine native approval capture/response Not run; external companion route Unverified. Await the human setup response, then continue the exact probe without unrelated actions. M03–M26 remain Not started.

### M01-CHECKPOINT-005 — Automatic native file write

- Recorded: 2026-10-05 08:31 +06:00 (Asia/Dhaka). Model/effort: Unrecorded. User followed the manual instructions and reported “it wrote automatically.” No message was sent to another chat by this agent.
- `read_thread` returned the user-submitted bounded prompt and completed turn `01a109e5-c6f4-7312-aca5-ee03e85989a2` in the original disposable chat. The native `fileChange` item `exec-865533f0-7fed-482a-8188-15463c3bdc5c` completed an addition of only `evidence/M01/native-approval-marker.txt`; its diff contains the marker plus newline. The chat is idle. This item ID identifies the completed edit, not a captured approval request.
- Independent file check: exact `b'M01 APPROVAL PROBE\n'`; SHA-256 `4eb01ce53f43a18a796593baa37f030036f171f4615207734a7e5365e01f1b07`. Native file creation and observable action outcome Passed. No shell-command item appears in the returned probe turn.
- Native approval capture/response is Not demonstrated: the user saw an automatic write, and no pending native request was captured. The task permission mode is unreported; do not infer Full Access or a specific preset. No extra operation, external path, global grant, hook, or alternate UI technology was used to force an approval.
- Saved [automatic-write evidence](evidence/M01/automatic-write-probe.json); amended the native checkpoint, capability matrix, report and probe procedure. The earlier absent-marker checks remain historical evidence.
- Requested the exact permission/access menu labels and current selection, with no setting change or new prompt yet, to determine whether a bounded native file-approval mode exists in this app. The external companion/idle-input route remains a separate gate.
- M01 remains In Progress; M02 remains Done; M03–M26 remain Not started. No Git metadata/commit exists. Preserve the marker as sanitized evidence.

### M01-CHECKPOINT-006 — Permission mode semantics confirmed

- Recorded: 2026-10-05 08:39 +06:00 (Asia/Dhaka). Model/effort: Unrecorded. The user reports Ask for approval selected; the other menu choices are Approve for me and Full access. This is direct human evidence, not independently inspected UI or sandbox configuration.
- Fetched official sandboxing and Auto-review documentation. Ask for approval can allow actions within configured boundaries automatically; Approve for me delegates eligible requests to a reviewer without widening the sandbox; Full access removes sandbox restrictions. The automatic marker write is consistent with the reported mode, rather than evidence of a failed approval mechanism.
- Corrected the active probe procedure: an already writable project marker does not reliably trigger native approval. No explicitly read-only or per-edit review mode was reported. Keep Ask for approval; do not repeat this test or widen its scope to manufacture an approval. No settings, hooks or app permissions were changed, and no new message or operation was dispatched.
- Saved [mode evidence](evidence/M01/permission-mode-observation.json), amended the automatic-write/checkpoint evidence, and updated [Codex feasibility](docs/feasibility/codex.md) and the [probe plan](evidence/M01/live-probe-plan.md). Earlier checkpoints preserve what was unknown at their observation time.
- Design implication: the server must relay actual native requests and distinguish already-permitted execution, reviewer type, decision recorded, native decision applied and action completed. Neither a server consent record nor a completed fileChange item supplies a missing pending native request.
- Next: establish an explicitly scoped native approval test or supported inspection/response interface, plus the separate external companion attachment route. These are not verified by menu labels. M01 remains In Progress; M02 Done; M03–M26 Not started.

### M01-CHECKPOINT-007 — Bounded completion plan

- Recorded: 2026-10-05 08:49 +06:00 (Asia/Dhaka). Actual model/effort: Unrecorded. User requested analysis and a plan to finish M01, and correctly identified ordinary workspace edits as already permitted.
- Reconciled the M01 acceptance text with the discovery-milestone rule. A working external companion is not required to complete negative feasibility research. The genuine native approval/available response mechanism remains a required demonstration. Earlier handoff language conflated research completion with implementation readiness; this entry clarifies it without changing the acceptance criterion.
- Saved the [five-step completion plan](docs/feasibility/m01-completion-plan.md): retain baseline, request one stdout-only native escalation, inspect/resolve the real request, finalize the scoped route decision, and close artifacts/logbook. The proposed app-native command is `/usr/bin/printf 'M01-NATIVE-APPROVAL-OK\n'`, with explicit escalation, no persistent prefix rule, and no fallback/retry. Only the executable's existence was checked; the probe was not dispatched or executed.
- The new command probe needs user submission or explicit authorization to message the existing disposable chat. This is distinct from the earlier file-only probe. Current Computer Use self-app restrictions require human capture/response of the native dialog; no alternate automation bypass is proposed.
- Rechecked official sandbox and native approval documentation. The probe is conditional on effective native tool/policy support; menu labels alone cannot guarantee an approval prompt. An automatic result cannot satisfy this gate, and the plan explicitly stops rather than manufacturing evidence.
- If native inspection/response succeeds but no external route is established, M01 can finish as research with that scoped negative finding. M16/M17 remain gated; M03 needs a usable route or an explicit product-scope decision. No product order or acceptance gate was silently changed.
- M01 remains In Progress, M02 Done, M03–M26 Not started. No app setting, grant, runtime, or hook changed.

### M01-CHECKPOINT-008 — Completion-plan execution stopped at native gate

- Recorded: 2026-10-05 11:23 +06:00 (Asia/Dhaka). Actual model/effort: Unrecorded for this execution and the probe; the GPT-6.1 Sol / High recommendation was not assumed to be active. User instructed execution of the [completion plan](docs/feasibility/m01-completion-plan.md), authorizing its specified delivery once. No delegation or new chat was used.
- Step 1 Passed: read the existing disposable chat and preserved its two exact completed text replies, continuity, native automatic file-change evidence and human-reported permission selection. Both existing marker files contain exactly `M01 APPROVAL PROBE` plus newline and SHA-256 `4eb01ce53f43a18a796593baa37f030036f171f4615207734a7e5365e01f1b07`.
- Step 2 stopped as Unsupported: sent the exact fixed stdout-only escalation prompt to **M01 disposable app-control probe**, thread `01a107bf-812f-7082-8fc3-978ac74a289f`. Turn `01a10a84-242b-7120-b6ad-f5bea731312f` completed in 7,056 ms. Its final report states effective approval policy `never` and tool instructions prohibiting `sandbox_permissions`; it did not run the command. `read_thread` returns no commandExecution or fileChange item in that turn. This is a probe-agent policy report plus host-observed non-invocation, not an independently inspected configuration, native denial or pending approval.
- The earlier Ask for approval UI selection remains direct human evidence. The discrepancy is unexplained; no policy inheritance, Full Access or UI setting is inferred. Step 3 Not run: no request, choice labels, native decision, stdout or exit status exists in the observed probe evidence. No fabricated request ID, chat-consent substitute, retry, fallback, extra escalation, setting change or hook installation was used.
- Step 4 Completed: bounded review of official App Server, hooks, Vendor Remote, sandbox and Computer Use guidance plus current app-tool metadata. Saved [route decision](evidence/M01/integration-route-decision.json): no usable external route established within the assessed interfaces and current constraints. Built-in host input/output passes; desktop App Server attachment, hook trust/live response, vendor custom-server access and third-party accessibility remain unverified. Required vendor integration: authorized attachment, addressed idle input, observable events and request-bound decisions.
- Step 5 Checkpoint saved: [native probe provenance](evidence/M01/native-approval-probe.json), [current inventory](evidence/M01/tool-inventory-2026-10-05.json), [evidence index](evidence/M01/README.md), capability matrix, native checkpoint, source review, report, probe procedure, executed plan and this handoff. [Validation](evidence/M01/documentation-validation.json) records JSON/local-link/status/marker checks. No runnable build, server, companion, adapter or Git metadata is present.
- M01-DONE-001 withheld because the required genuine native approval/available response mechanism was not demonstrated. M01 remains In Progress; M02 Done; M03–M26 Not started. Production capabilities remain disabled. M16 needs supported input/output attachment; M17 needs request-bound controls and atomic stale-request protection.
- Next: a supported genuine pending approval and inspected response mechanism, or explicit user approval of a discovery-only criterion revision. The current plan's bounded probe is stopped and must not be retried automatically. Before selecting a Codex implementation path, M03 requires the product decision to obtain supported integration, approve revised supervised scope, or defer Codex and prioritize Cline. No product order or acceptance gate changed.

### M01-CHECKPOINT-009 — Xcode app-access recording prepared

- Recorded: 2026-10-05 12:34 +06:00 (Asia/Dhaka). Actual model/effort: Unrecorded. The user proposed `Can you enable xcode App Access for codex?` as a way to obtain a native approval and asked to prepare for recording.
- Prepared [Xcode app-access evidence record](evidence/M01/xcode-app-access-probe.json) and updated the [procedure](evidence/M01/live-probe-plan.md) and [index](evidence/M01/README.md). No prompt dispatched or app-access call made in this preparation. Existing unsupported command evidence is preserved without retry.
- Capture in the existing disposable probe chat: native heading, exact Xcode target/action, offered labels and scope, request/item IDs only if exposed, then the human's one-time choice or decline and returned tool outcome. Do not select Always allow, interact with projects, build, edit, run commands or change settings. Already-granted access or an unavailable tool is an explicit stop result.
- App-access approval is a separate native permission category. A genuine request plus verified local resolution may satisfy feasibility's pending-approval/response demonstration; preparation alone does not. It cannot prove command escalation, Codex self-app control, external attachment or atomic remote resolution.
- M01 In Progress; M02 Done; M03–M26 Not started. No production capability enabled. The user must provide sanitized pending UI evidence because this chat cannot inspect the Codex approval screen.

### M01-DONE-001 — Codex feasibility research complete

#### Scope, environment and prerequisites

Recorded: 2026-10-05 12:51 +06:00 (Asia/Dhaka). Actual model/effort: Unrecorded for the recording session and app probe. GPT-6.1 Sol / High remains the recommendation, not a verified configuration. M01 has no milestone prerequisites. The user requested execution of the completion plan, proposed native app access as an alternative, supplied the pending screenshot and successful-response report, and explicitly confirmed the actual button selected. The recording agent performed read-only chat inspection and documentation updates; it did not request new app access or automate the native approval.

Recorded host baseline: ChatGPT desktop bundle `com.openai.codex`, version 26.930.31730 (12947), macOS 26.5.1 ARM64. No installation change was reported and no new version check was required. The original text baseline used **M01 disposable app-control probe**, thread `01a107bf-812f-7082-8fc3-978ac74a289f`. The user supplied the new native approval from **Create M01 approval probe**, thread `01a109ef-ba1d-7512-8442-181392ae57eb`, another existing disposable M01 chat in the same workspace. No new chat was created here.

#### Walkthrough and verified results

1. Preserved and cross-referenced the original two-turn host-tool baseline: `M01-APP-INPUT-OK` and `M01-CONTEXT-7K4P CONTINUITY-OK` in one addressed conversation, with completed turn records. Retained the automatic native file-edit result; both existing marker files preserve their exact bytes and digest.
2. Delivered the completion plan's fixed stdout-only command prompt once in the original probe chat. The probe reported escalation unavailable under its effective policy and returned no commandExecution item. This attempt remains Unsupported; no fallback, retry, command output or native decision is asserted.
3. Prepared the user-proposed Computer Use app-access record. The user independently submitted a retry prompt for Xcode-beta in the second existing disposable M01 chat. Retrieved the exact submitted prompt and completed turn `01a10acb-d558-7c10-ab7b-6af39afaf854` through `read_thread`.
4. Inspected and saved the supplied pending screenshot. Native Computer Use state reads Awaiting approval and “Allow ChatGPT to use Xcode?”; exact controls are Always allow, Deny (Esc) and Allow this conversation (Return icon). The screenshot exposes no native request ID. These are native controls, not assistant consent text.
5. Asked which button was actually used. The user explicitly answered **Allow this conversation**. The prompt's intention to use Always allow was superseded by this actual-selection report. No saved persistent grant is inferred or verified.
6. The transcript contains two separate `cua.getApp("Xcode-beta")` calls with completed status: `call_5aoXCIGK51X2DjQLXSEMh3lD` (31,150 ms) and `call_myYndjeq4MT9ejC81ck0v8im` (98 ms). The full turn completed in 49,573 ms. The final agent report describes Welcome to Xcode, Xcode Version 27.0 beta. Raw window output is not included in the retrieved transcript; its title/version remain attributed to that report. Screenshot, actual human decision and successful tool completion establish a supervised local response mechanism.
7. Finalized the scoped route decision: no usable external route established within the assessed interfaces and current constraints. Retained disabled production capabilities and named vendor/integration prerequisites. Updated report, matrix, probe record, procedure, evidence index, executed plan, native checkpoint and tracker/handoff together; validated evidence and local links.

| Acceptance criterion | Result and evidence |
|---|---|
| Existing-conversation input and observable reply | Passed: original two-turn app-owned baseline with exact continuity reply |
| Genuine pending native approval | Passed: user-supplied native Xcode app-access screenshot, full target and offered choices |
| Available response mechanism inspected | Passed: native local controls; human confirmed Allow this conversation; access tool calls completed |
| Remaining capabilities classified | Delivered: host-scoped passes; unverified streaming/control/recovery/external/atomic capabilities remain disabled |
| Integration route decision | Delivered: scoped negative finding; no universal impossibility claim |
| Artifacts and handoff consistent | Passed: JSON, local links/anchors, statuses, screenshot hash and unchanged markers checked |

The existing tracker criterion does not require the approval to be a shell escalation. The genuine app-access request and supervised response satisfy its pending-approval/response requirement without removing any gate. The original command-specific stdout/exit checks did not pass and remain historical. A second allow/deny conformance test is outside this discovery scope.

#### Files, provenance and limitations

- [App-access record](evidence/M01/xcode-app-access-probe.json) and [pending screenshot](evidence/M01/xcode-app-access-pending.png): actual prompt/chat/turn/tool identities, exact native choices, human decision, completed tool statuses and attributed window report. Screenshot SHA-256: `12aceb74819b258a5b22c4a83cfde52502567ec149fa2a2e1e087ab82fa4b4a5`.
- [Command attempt](evidence/M01/native-approval-probe.json): preserved unsupported result, no invocation or approval evidence. It is not rewritten as successful.
- [Capability matrix](evidence/M01/capability-matrix.json), [route decision](evidence/M01/integration-route-decision.json), [report](docs/feasibility/codex.md), [plan](docs/feasibility/m01-completion-plan.md), [procedure](evidence/M01/live-probe-plan.md), [index](evidence/M01/README.md) and [validation](evidence/M01/documentation-validation.json): completed research with explicit production limits and historical amendments.

No native approval request ID, atomic resolver or raw request-specific resolution event is exposed by this evidence. MCP tool-call IDs identify calls, not approval requests. Local human response plus successful tool completion cannot prove server-controlled approval, stale-decision rejection, native command escalation, persistent/global grants or access to Codex itself. No external attachment, question/cancel race, streaming subscription, restart or recovery was tested. No server, companion, adapter or replacement runtime was built. This checkout has no runnable build or Git metadata; no commit produced.

#### Cleanup state and next handoff

The observed disposable approval turn completed and its chat is idle. Conversation-scoped Xcode access was selected by the human; no persistent grant or setting change was made by the recording agent. Both marker files remain exactly `M01 APPROVAL PROBE` plus newline, SHA-256 `4eb01ce53f43a18a796593baa37f030036f171f4615207734a7e5365e01f1b07`. The screenshot is preserved as supplied evidence. No new approval or probe was initiated in this recording turn.

M01 and M02 are Done as feasibility research. M03–M26 remain Not started; no production capability is enabled. Before M03 selects a Codex implementation path, the user must choose supported integration, revised supervised scope, or deferring Codex and prioritizing Cline. M16 requires usable input/output attachment; M17 requires request-bound native controls and atomic stale-request protection. Research completion does not remove these gates. Stop at the M01 boundary.

### M01-AMENDMENT-001 — Final closure audit

- Recorded: 2026-10-05 13:13 +06:00 (Asia/Dhaka). Actual model/effort: Unrecorded. User requested definitive M01 closure and reminded us that native app-access approval had already been demonstrated.
- Audited the exact M01 and common completion criteria against [closure-audit.json](evidence/M01/closure-audit.json). Re-read both completed baseline turns and the two completed Xcode-beta access calls through app-owned read tools. The original screenshot hash and actual human selection **Allow this conversation** are preserved. Installed app version/build remains 26.930.31730/12947. No new prompt, app-access request, setting change or runtime was required.
- All M01 acceptance checks are satisfied. The existing criterion permits a scoped negative route finding. The final decision is no-go for an unattended custom-server Codex pilot on currently evidenced interfaces; this is not a universal impossibility claim or unfinished approval demonstration. M16 owns external attachment/input/output, M17 native request-bound remote controls, and M23 race/recovery conformance. None was implemented or started here.
- Corrected misleading active wording: the old report contained next-hook/next-approval instructions alongside completion. Preserved it in [investigation history](docs/feasibility/codex-investigation-history.md), rewrote the [current report](docs/feasibility/codex.md) and [probe procedure](evidence/M01/live-probe-plan.md) around final evidence, and updated the plan, index, route assessment, capability matrix and handoff. The native screenshot proves a real local request; it does not prove a hook callback or remote resolver. Official documentation distinguishes direct human Computer Use app approvals from automatic tool review.
- [Final validation](evidence/M01/documentation-validation.json) checks JSON, local links/anchors, evidence digests, baseline/call IDs, criterion mapping and all milestone statuses. No build/test runtime exists in this documentation-only milestone; no Git commit is invented.
- M01 **Done; investigation closed; zero required actions remaining**. M01-DONE-001 remains its valid completion entry. M02 Done; M03–M26 Not started. No acceptance criterion relaxed and no production capability enabled. Reopen M01 only for material new integration evidence, interface changes or revised requirements, rather than repeating a passed approval probe.

### M03-CHECKPOINT-001 — Foundation started

- Recorded: 2026-10-05 (time unrecorded). Actual model/effort: Unrecorded.
- User explicitly instructed implementation of M03. Read repository guidance, M03 acceptance criteria, current handoff, M01-DONE-001/M01-AMENDMENT-001, M02-DONE-001, and their technical findings.
- Prerequisites exist: M01 and M02 are Done. Their gates remain: no external Codex attachment or atomic remote approval is established; Cline needs an upstream app-owned API addition. Neither blocks architecture decisions or neutral buildable module boundaries.
- Baseline inventory confirmed documentation/evidence only, with no source, README, package metadata, tests, or Git metadata.
- Host tools observed: Node 25.9.0, npm 11.12.1, Swift 6.4.0, Xcode 27.0. Corepack and global TypeScript are unavailable. Selected Node runtime is Node 24 LTS; npm workspaces avoid a package-manager bootstrap dependency.
- Started recording language/runtime, server/UI, companion, Cline packaging, stores, auth provider, and test/distribution decisions under `docs/decisions/`.
- No product workflow, app behavior, credentials, host permissions, or production capability changed. Exact model/effort remains Unrecorded.

### M03-DONE-001 — Architecture and repository foundation complete

#### Execution record

- Started: 2026-10-05 (time unrecorded). Completed: 2026-10-05 13:58 +06:00 (Asia/Dhaka). Model/effort actually used: Unrecorded.
- Baseline: documentation and M01/M02 evidence only; no Git metadata. No commit exists.
- Prerequisites: M01-DONE-001 plus M01-AMENDMENT-001 and M02-DONE-001. M01 remains a scoped negative external-route finding; M02 requires an adopted upstream Cline API addition.
- Final milestone status: Done.
- Changed file inventory: root `README.md`, `AGENTS.md`, `.gitignore`, `.nvmrc`, `package.json`, `package-lock.json`, `tsconfig.base.json`; workspace manifests/sources for `protocol/`, `server/`, `bridge/`, and `adapters/core/`; `companion/Package.swift` and its source/test; `extensions/vscode/README.md`; `tests/module-smoke.test.mjs`; seven decision records in `docs/decisions/`; and [verification evidence](evidence/M03/verification.json).

#### Outcome and walkthrough

Established a pinned, buildable workspace foundation without implementing future milestone behavior. The TypeScript workspaces compile to ESM. `bridge`, `server`, and `adapter-core` depend inward on the vendor-neutral protocol package only. The smoke imports each compiled public entry point and verifies the dependency direction. A second assertion reads each workspace manifest and rejects non-first-party dependencies in shared packages. The SwiftPM `CompanionCore` library is intentionally smaller than the later SwiftUI graphical app; XCTest verifies only that its package builds and exports its module identity.

Selected Node.js 24 LTS, npm 11 workspaces, TypeScript 5.9.3, strict NodeNext/ES2023 compilation, Swift 6.2+ / SwiftPM, Fastify 5 for the future server transport, React 19 + Vite 8 for the future same-origin GUI, PostgreSQL 18 server storage (subsequently reconciled by M06 to PostgreSQL 17 per DECISION-005), SQLite 3 local durable storage, Keycloak behind OIDC authorization-code + PKCE, a first-party VSIX, Node's built-in test runner, XCTest, and Developer ID/notarized DMG distribution. Full rationale and ownership appear in the [decision index](docs/decisions/README.md).

The Cline extension directory is a documented packaging seam only. M02's missing task-addressed public API and atomic native resolver remain explicit gates; this foundation does not call private APIs. M01's lack of an established external Codex route likewise remains unchanged. No protocol schemas, adapters, listeners, GUI, database schemas, auth setup, credentials, or production capabilities were implemented.

#### Files and public contracts

| Path | Purpose | Contract for later milestones |
|---|---|---|
| `protocol/` | Neutral TypeScript package shell | M04 adds versioned contracts; no wire type is asserted yet |
| `server/` | Neutral server package shell | M06/M09 add persistence and HTTP/SSE behavior |
| `bridge/` | Client-side bridge package shell | M07/M10 add durable work and connection/scheduling behavior |
| `adapters/core/` | Vendor-neutral adapter package shell | M04/M05 define operation contracts and conformance |
| `companion/` | SwiftPM companion core package | M15 adds the GUI/lifecycle; M07 owns local storage |
| `extensions/vscode/` | Cline VSIX package boundary documentation | M19–M21 depend on adopted supported Cline app-owned API |
| `tests/module-smoke.test.mjs` | Cross-module build/dependency-direction smoke | Tests only M03 wiring, not product behavior |
| `docs/decisions/001–007` | Accepted architecture decisions and rationale | Later milestones consume these choices instead of choosing frameworks anew |

#### Verification

| Check | Command | Result |
|---|---|---|
| Lockfile clean install | `npm ci` | Passed; lockfile installed 5 packages. Host Node 25.9 emitted expected `EBADENGINE` warning because the project selects Node 24. |
| TypeScript build | `npm run build` | Passed; protocol, server, bridge, adapter-core compiled. |
| TypeScript lint/type-check | `npm run lint` | Passed for all four workspaces. |
| Cross-module smoke | `npm test` | Passed 2 checks; test script builds before importing compiled modules. |
| Swift companion package | `swift test --package-path companion` | Passed; package built with Swift 6.4 and XCTest passed. |

Full environment, command outcomes, and scope limits are recorded in [evidence/M03/verification.json](evidence/M03/verification.json). The first smoke attempt was started concurrently with the build and failed because `dist/` had not yet been produced. The test script now builds before running the smoke, and the prescribed sequential checks passed. The host's Node 25 is outside the selected Node 24 range, so execution under Node 24 is not yet evidenced; use `.nvmrc` before development on this host. This does not invalidate successful buildability evidence, but it is carried forward as an environment limitation.

#### Handoff to M04

- Safe to rely on: accepted framework/runtime/store/auth/distribution decisions; npm lockfile; strict ESM package boundaries; protocol-only inward dependency; Swift companion package; empty Cline extension seam; developer commands in README/AGENTS.
- Setup/check commands: `npm ci`, `npm run build`, `npm run lint`, `npm test`, and `swift test --package-path companion`.
- Next milestone: M04, versioned protocol and schemas, only on explicit instruction.
- Preserve: existing app executes the LLM; GUI-only ordinary use; vendor-neutral shared modules; no private Cline API; no unverified Codex external integration; production capabilities remain disabled.
- M03 is Done; M04–M26 remain Not started. Current handoff and entry index are updated. Stop at the M03 boundary.

### M04-CHECKPOINT-001 — Protocol work started

- Recorded: 2026-10-05 17:15 +06:00 (Asia/Dhaka). Actual model/effort: Unrecorded.
- User explicitly instructed implementation of M04. Verified the M03 handoff and M04 requirements. Started with a neutral protocol package and no transport or application runtime.
- M04 scope: versioned public message contracts, JSON Schemas, pure validation and state helpers, Connect input/result contract, canonical action digest, fixture and verification coverage, and requirements reconciliation.

### M04-DONE-001 — Versioned protocol and schemas complete

#### Execution record

- Started: 2026-10-05 17:15 +06:00 (Asia/Dhaka). Completed: 2026-10-05 17:52 +06:00 (Asia/Dhaka). Model/effort: Unrecorded.
- Prerequisite: M03-DONE-001. Final milestone status: Done.
- Baseline now distinguishes requirements specification 2.1 from wire protocol 2.0. M04 reconciled the task-origin-bound Connect journey and security boundaries into `requirements.md` without claiming app integration.
- Changed artifacts: `protocol/src/contracts.ts`, `schemas.ts`, `canonical.ts`, `state.ts`, `validation.ts`; exported JSON Schemas in `protocol/schemas/v2.0/`; `protocol/fixtures/v2.0/`; `scripts/export-protocol-schemas.mjs`; `tests/protocol.test.mjs`; expanded `tests/module-smoke.test.mjs`; package manifest/lock; `docs/protocol-v2.md`; `requirements.md`; README and this tracker; [verification evidence](evidence/M04/verification.json).

#### Outcome and boundary

The neutral TypeScript protocol package now defines v2.0 command/event unions, capability and binding contracts, output, approval, grant, attachment, error, replay and Connect data. Draft 2020-12 schemas close each public message shape and are reproducibly exported. Pure validators check schema and cross-field constraints, exact pending approval identity and offered scope, binding/session/lease identity, output revision progression, state transitions, expiry and retry identity. Canonical action-digest rules normalize only declared set-valued arrays, reject non-JSON/ambiguous inputs, and have a fixed SHA-256 vector.

The Connect contract binds a call to host-supplied task context; caller arguments cannot assert their own authority. Disconnect and bounded connection result contracts are documented and validated. These contracts do not provide a running server, listener, storage, authentication, permission prompt, application adapter, or upstream host integration. M01/M02 product gates remain unchanged.

#### Verification

| Check | Command | Result |
|---|---|---|
| Clean lockfile install | `npm ci` | Passed; host Node 25.9 emitted the known engine-range warning because the project selects Node 24. |
| TypeScript build | `npm run build` | Passed across protocol, server, bridge and adapter-core workspaces. |
| TypeScript checks | `npm run lint` | Passed across all four TypeScript workspaces. |
| Schema export and test suite | `npm test` | Passed; all 9 tests, including schema drift, all public message fixture coverage, invalid identity/scope, digest vector and state/replay checks. |

Environment versions and command results are in [evidence/M04/verification.json](evidence/M04/verification.json). Ajv is pinned at 8.20.0. The successful install reported zero vulnerabilities; a separate `npm audit` was not verified because registry access was unavailable in the sandbox. Runtime verification used host Node 25.9, outside the selected Node 24 range, so Node 24 execution remains unverified. No Git metadata is available and no commit was produced.

#### Handoff

- M04 is Done; M05–M26 remain Not started. Stop at the M04 boundary.
- M05 may consume the exported adapter contract and protocol fixtures to implement the adapter SDK and deterministic fake app after explicit user instruction.
- M06/M07/M12 may consume v2.0 identities, state/cursor, digest and replay rules. They must not invent incompatible payloads.
- Preserve the independent app-permission boundary, task-origin-bound Connect semantics, protocol-only shared dependency direction, and M01/M02 integration gates. No native app work or production capability was authorized by M04.

### M05-CHECKPOINT-001 — Adapter SDK work started

- Recorded: 2026-10-05 20:10 +06:00 (Asia/Dhaka). Actual start time and model/effort: Unrecorded.
- User explicitly instructed implementation of M05. M04 was verified Done with protocol package and fixtures available.
- Added typed SDK operation contracts and identity helper, an in-memory fake adapter, scripted streaming and suspended interaction controls, unsupported/fault injection, and initial reusable conformance tests. Full verification and completion evidence are pending.

### M05-DONE-001 — Adapter SDK and fake app complete

#### Execution record

- Started: 2026-10-05; start time unrecorded. Completed: 2026-10-05 20:12 +06:00 (Asia/Dhaka). Model/effort: Unrecorded.
- Prerequisite: M04-DONE-001. Final milestone status: Done.
- Changed artifacts: `adapters/core/src/index.ts`; new `adapters/fake/` TypeScript workspace; `package.json` and lockfile; adapter conformance tests and reusable fixtures under `tests/`; `docs/adapter-sdk.md`; README and AGENTS guidance; [verification evidence](evidence/M05/verification.json).

#### Outcome and walkthrough

The adapter SDK now publishes the M04 `AppAdapter` operation types, stable operation descriptions, selected-native-identity comparison, and explicit outcome helpers. Stream setup uses `AdapterStreamError` so failures cannot be mistaken for a clean end-of-stream.

The fake app is an in-memory simulator, clearly labeled in module exports, capability evidence, and every simulated action result. It injects its clock, deterministic IDs, scripted turn behavior, configured unsupported operations, and per-operation rejection/unknown/unsupported faults. It preserves the exact selected conversation and fake native conversation/turn IDs. Scripted output covers partial creation, replacement, completion, and input/approval suspension. Exact request ID, revision, and digest checks guard local fake resolution; suspended turns accept controls while ordinary queued prompts wait, and cancellation clears a suspended turn. No app process or network is contacted.

Reusable fixtures are `tests/fixtures/adapter/scripted-stream.json` and `suspended-input-queue.json`. Tests verify identical event sequences on replay, selected identity, suspended queue ordering, input and approval controls, cancellation, unsupported capability reporting, and explicit unknown outcomes (including stream setup). `docs/adapter-sdk.md` explains the contract and evidence limits.

#### Verification

| Check | Command | Result |
|---|---|---|
| Lockfile install | `npm ci` | Passed; 11 packages installed. Known EBADENGINE warning: host Node 25.9 is outside selected Node 24 range. |
| TypeScript build | `npm run build` | Passed; all five workspaces compiled. |
| Conformance and repository tests | `npm test` | Passed; 14 tests, zero failures. Includes schema export/build and five adapter conformance tests. |
| TypeScript checks | `npm run lint` | Passed across all five TypeScript workspaces. |

Full environment and outcomes are recorded in [evidence/M05/verification.json](evidence/M05/verification.json). The fake is test infrastructure only and does not satisfy M16/M19 real-adapter or app-support gates. No server, storage, authentication, GUI, native app behavior, or production capability was added. Git metadata is absent; no commit identifier exists.

#### Handoff

- M05 is Done; M06–M26 remain Not started. Stop at the M05 boundary.
- M06 can consume the adapter outcome and event contracts but must implement transactional persistence against the selected real store; the fake is not a storage substitute.
- Preserve the simulation labels, explicit unknown outcomes, native identity fields, strict request binding, and M01/M02 integration gates. Await explicit M06 instruction before beginning persistence.

### M06-CHECKPOINT-001 — Server persistence work started

- Recorded: 2026-10-05 20:12 +06:00 (Asia/Dhaka). Actual start time and model/effort: Unrecorded.
- User explicitly instructed implementation of M06. Confirmed M04 protocol contracts and M05 SDK/fake artifacts are present.
- Resolved a documentation conflict before implementation: DECISION-002 mentioned PostgreSQL 18, while the dedicated accepted store decision DECISION-005 assigned PostgreSQL 17 to M06. Followed DECISION-005 and reconciled DECISION-002 to PostgreSQL 17.
- Added the PostgreSQL driver, SQL migration, transactional repository, isolated PostgreSQL 17.11 test service, and initial real-database acceptance tests. Test completion was pending at this checkpoint.

### M06-DONE-001 — Server persistence and migrations complete

#### Execution record

- Started: 2026-10-05; start time unrecorded. Completed: 2026-10-05 21:45 +06:00 (Asia/Dhaka). Model/effort: Unrecorded.
- Prerequisite: M04-DONE-001; M05-DONE-001 available for neutral contract reference. Final status: Done.
- Changed artifacts: `server/migrations/001_initial.sql`, `server/src/storage/index.ts`, `server/src/index.ts`, server/root package manifests and lockfile, `tests/storage.test.mjs`, `docker-compose.yml`, `docs/server-storage.md`, DECISION-002 reconciliation, README/AGENTS test instructions, and [verification evidence](evidence/M06/verification.json).

#### Outcome and walkthrough

Implemented checksum-verified SQL migration application under a database advisory lock, plus PostgreSQL repositories for users, devices, sessions, bindings, prompt/control commands, immutable bridge events, input/approval interactions, winning decisions, grants, attachment metadata, and audit records. Immutable writes are idempotent only when retry identity and payload match; conflicting retries fail. Advisory transaction locks protect absent-row deduplication and natural unique keys. Command lane counters allocate in the same transaction as command persistence. Event insertion increments the session replay watermark atomically. Decision records have a unique winner per request revision and reference the stored interaction. Interaction state mutation is compare-and-set. Snapshot reads use one repeatable-read, read-only transaction for the session watermark, bindings, events, and interactions.

Introduced pinned `pg`/`@types/pg` 8.23.1 and a dedicated PostgreSQL 17.11 test container bound to host loopback with a named volume. The actual PostgreSQL suite exercised concurrent migration runs, 12 concurrent identical command submissions, conflicting command and event retries, independent lane sequences, eight concurrent duplicate event ingestions, ten concurrent snapshot/ingestion cuts, one-winner decision contention, conditional state transitions, grant/attachment/audit storage, multi-record rollback, and data preservation after restarting the database container and reopening the storage pool. Confirmed server version 17.11 after restart. Test database/credentials are development-only; production secrets/configuration remain outside the database and repository.

#### Verification

| Check | Command | Result |
|---|---|---|
| Clean lockfile install | `npm ci --offline` | Passed; 28 packages installed and 34 audited with zero vulnerabilities. Host Node 25.9 emitted the selected Node 24 engine warning. |
| Workspace build | `npm run build` | Passed across all five TypeScript workspaces. |
| Portable suite | `npm test` | Passed; 14 tests passed. M06 real-store test is intentionally skipped unless its database URL is set. |
| Type checks | `npm run lint` | Passed across all five TypeScript workspaces. |
| Real PostgreSQL suite | `M06_TEST_DATABASE_URL=<loopback PostgreSQL 17 test URL> M06_TEST_DOCKER_RESTART=1 npm run test:m06` | Passed against PostgreSQL 17.11; 1 integration test, zero failures, including database restart and durable-data check. |

See [evidence/M06/verification.json](evidence/M06/verification.json) for exact versions, outcomes, scope, and limits. No HTTP/SSE API, authentication/authorization policy, app adapter, UI, or production deployment was added. Git metadata is absent; no commit exists.

#### Handoff

- M06 is Done; M07–M26 remain Not started. Stop at the M06 boundary.
- M07 owns bridge-local SQLite persistence, inbox/outbox, native mappings, local cursors, and reconciliation; do not put those records in this server store.
- M08/M09/M12 may consume these server records and snapshots. HTTP/SSE delivery, auth policy, and transcript projection remain their own milestone scopes.
- The local PostgreSQL test service is available through `docker compose up -d postgres-m06`; its test credentials and database must not be reused outside that dedicated loopback-only test instance.

### M07-CHECKPOINT-001 — Bridge storage work started

- Recorded: 2026-10-05 20:52 +06:00 (Asia/Dhaka). Actual implementation start time and model/effort: Unrecorded.
- User explicitly instructed implementation of M07. Verified the M06 handoff assigns SQLite bridge-local inbox/outbox, mappings, cursors, and reconciliation to this milestone.
- Implemented the SQLite storage module and restart/fault-injection coverage. Initial verification found only a test ordering assumption caused by second-resolution timestamps; the test was corrected to assert state independent of row ordering.

### M07-DONE-001 — Bridge persistence and recovery complete

#### Execution record

- Completed: 2026-10-05 20:57 +06:00 (Asia/Dhaka). Start time and model/effort: Unrecorded. Prerequisite: M04-DONE-001, M05-DONE-001, M06-DONE-001. Final milestone status: Done.
- Changed artifacts: `bridge/src/storage/index.ts`, `bridge/src/index.ts`, `tests/bridge-storage.test.mjs`, `docs/bridge-storage.md`, DECISION-005 implementation note, README, and [verification evidence](evidence/M07/verification.json).

#### Outcome and walkthrough

`BridgeStore` uses Node's built-in `node:sqlite`, WAL, full synchronous durability, foreign keys, and a busy timeout. It creates bridge-local tables for command inbox, per-device/per-lane receipt cursors, output outbox, native ID mappings, application attempts, and request-bound decision consumption. Command insertion and contiguous cursor advancement share one immediate transaction. A sequence gap holds the cursor; filling it advances only through already stored contiguous commands. Canonical JSON makes identical retries idempotent and conflicting identity reuse an explicit `BridgeStorageConflict`.

Outgoing events are persisted before a caller can transmit them, remain available after database reopen until durably acknowledged, and have unique event and session-sequence keys. Native mappings cannot be silently reassigned. Decision consumption binds one immutable decision to a session, request, revision, and digest. Before an application side effect, callers persist an attempt and mark it applying. `recoverAfterRestart()` converts interrupted applying attempts to `reconciliation_required`, exposes unresolved work and unacknowledged output, and provides no automatic retry path. Pending attempts that were never marked applying remain pending for inspection.

File-backed tests cover out-of-order receipt, rollback at two injected transaction fault points, reopen/retry behavior, durable output and acknowledgement, mapping/decision conflicts, and interrupted side effects. A fake-adapter unknown submission is recorded as applying; after restart it is reconciliation-required, and the store rejects marking it applying again. The fake remains simulation evidence only.

#### Verification

| Check | Command | Result |
|---|---|---|
| TypeScript build | `npm run build` | Passed across all workspaces. |
| TypeScript checks | `npm run lint` | Passed across all workspaces. |
| Repository suite | `npm test` | Passed; 20 passed, 0 failed, 1 PostgreSQL M06 integration test skipped because its test database URL was not set. |
| Focused bridge storage suite | `node --test tests/bridge-storage.test.mjs` | Passed; 6 tests, 0 failures, using file-backed SQLite. |

Exact environment and limitations are recorded in [evidence/M07/verification.json](evidence/M07/verification.json). Host Node 25.9.0 executed the SQLite checks; the repository selects Node 24, so Node 24 execution remains unverified. DECISION-005 retains platform SQLite for the native companion; the present TypeScript bridge uses Node's built-in embedded SQLite interface and adds no third-party database driver. No live connection loop, app-inspection coordinator, approval-expiry enforcement, authentication, or native companion integration was added.

#### Handoff

- M07 is Done; M08–M26 remain Not started. Stop at the M07 boundary.
- M08 may use these local storage primitives for device credentials and session identity only after implementing its own secure storage and authorization rules; this SQLite store is not a credential vault.
- Later bridge recovery/scheduling work must inspect application state before resuming mutations, preserve request-bound decisions, and never automatically replay uncertain side effects or expired approvals.

### M08-CHECKPOINT-001 — Identity and authorization work started

- Recorded: 2026-10-05 21:27 +06:00 (Asia/Dhaka). Actual implementation start time and model/effort: Unrecorded.
- User explicitly instructed M08. Verified DECISION-006, the M06 server store, M07 local recovery store, and M08 acceptance criteria.
- Added checksum-pinned auth migration 002 and generalized ordered migration application. Implemented Keycloak-compatible PKCE/JWKS verification, user/device authorization, pairing, Keychain storage, and signed approval assertions. PostgreSQL-backed acceptance checks use only the disposable M06 loopback service and synthetic M08 data.

### M09-CHECKPOINT-001 — HTTP/SSE API work started

- Recorded: 2026-10-05 21:45 +06:00 (Asia/Dhaka). Actual model/effort label in runtime: GPT-6, effort not exposed.
- User explicitly instructed M09. Confirmed the M06 PostgreSQL repositories and M08 identity/session authorization are available. Implementation scope is versioned HTTP routes, independently polled SSE lanes, authenticated durable command/event/ack operations, replay/snapshot, and bridge-client tests.

### M08-DONE-001 — Identity, pairing, and authorization complete

#### Execution record

- Completed: 2026-10-05 21:38 +06:00 (Asia/Dhaka). Actual implementation start time and model/effort: Unrecorded. Prerequisites: M06-DONE-001 and M07-DONE-001. Final milestone status: Done.
- Changed artifacts: `server/src/auth/index.ts`, `server/src/index.ts`, `server/migrations/002_auth_identity.sql`, generalized checksum migration runner, `companion/Sources/CompanionCore/CredentialVault.swift`, companion tests, `tests/auth.test.mjs`, `tests/auth-storage.test.mjs`, root `test:m08` script, README/AGENTS, [authentication notes](docs/authentication.md), DECISION-006, and [verification evidence](evidence/M08/verification.json).

#### Outcome and walkthrough

The server auth package implements OIDC authorization-code + PKCE for a configured public native client. It exact-matches configured redirect URIs and state; validates ID-token nonce and API access-token audience separately; checks issuer, time claims, verified email, RS256 signature, JWKS `kid`, and 2048-bit minimum RSA keys; and exchanges/refreshes credentials without placing secrets in URLs. Refresh results are bound to the same issuer/subject. Provider-verified user objects and credential-verified device objects are frozen and tracked in process-local weak sets, so transport callers cannot construct authorization principals from client-supplied IDs or roles. User IDs derive deterministically from the validated issuer/subject pair.

Pairing creates a pending device and a five-minute one-time code. The authenticated user confirms that code, then the local consent path must present its separate high-entropy challenge and explicit consent before activation. Reused, wrong, expired, or unconfirmed pairings fail. The server stores pairing and local confirmation secrets as hashes. Device credentials contain 256 bits of randomness, are stored server-side only as hashes, expire, rotate atomically, and can be revoked by the owner; revocation also disables active bindings. The Swift companion vault stores opaque token/credential bytes as Keychain generic-password items with device-only accessibility.

Session roles derive from `sessions.owner_user_id` and explicit owner-managed membership rows. Owners can view, prompt, approve, administer, and assign/revoke membership; operators can view and prompt; viewers can only view. Device principals can act only while active and bound to the session and do not receive reviewer authority. Signed Ed25519 approval assertions bind the authenticated reviewer to the exact session, turn, active binding and lease, device, pending request/revision/digest, offered choice, exact requested-permission subset, policy revision, and a short expiry. Consumption rechecks the live binding and pending request, then persists one-time use under unique assertion/decision/request keys.

Migration 002 adds OIDC identities, session memberships, pairing requests, device credentials, and consumed assertion records. The migration runner now applies ordered checksum-pinned SQL migrations while preserving M06 transaction locking and checksum checks. Unit tests use generated keys and mocked OIDC metadata; PostgreSQL tests use disposable synthetic users/devices and clean them up. A Keychain round-trip test stores, reads, replaces, and deletes a unique temporary item.

#### Verification

| Check | Command | Result |
|---|---|---|
| TypeScript build | `npm run build` | Passed across all workspaces. |
| TypeScript checks | `npm run lint` | Passed across all workspaces. |
| Portable repository suite | `npm test` | Passed; 24 passed, 0 failed, 2 PostgreSQL integration tests skipped because their database URLs were unset. |
| OIDC and assertion unit tests | `node --test tests/auth.test.mjs` | Passed; 4 tests, 0 failures, using generated RSA/Ed25519 keys and mocked OIDC discovery/JWKS/token responses. |
| M08 PostgreSQL acceptance | `M08_TEST_DATABASE_URL=<disposable PostgreSQL 17 URL> npm run test:m08` | Passed; pairing, expired/reused codes, role assignment/revocation, different-user/device denial, token hash/rotation/revocation, assertion binding/expiry, and one-time/competing consumption. |
| M06 regression acceptance | `M06_TEST_DATABASE_URL=<disposable PostgreSQL 17 URL> M06_TEST_DOCKER_RESTART=1 npm run test:m06` | Passed; existing migration, persistence, concurrency, rollback, replay, snapshot, and database restart tests remained green. |
| Companion tests | `swift test --package-path companion --scratch-path /private/tmp/m08-swiftpm` | Passed; 3 tests, including real temporary Keychain storage round trip; test item is deleted. |

See [evidence/M08/verification.json](evidence/M08/verification.json) for environment and limits. Node 25.9.0 ran on this host while the repository selects Node 24, so Node 24 runtime remains unverified. No Keycloak realm or external identity account was configured; OIDC behavior was tested against mocked metadata and locally generated keys. No HTTP routes or graphical sign-in/pairing flow were added; M09 wires the services to routes and later companion work supplies those screens. No production app attachment or native approval transport is established.

#### Handoff

- M08 is Done; M09–M26 remain Not started. Stop at the M08 boundary.
- M09 must authenticate each human API request with a validated API access token and each bridge request with an active device credential, then call the request-scoped authorization methods. It must never trust body-supplied user, reviewer, device, role, or session authority.
- The native app must hold PKCE verifier/refresh/device credentials in Keychain, display pairing only in the explicit graphical flow, and replace rotated credentials only after secure local storage succeeds.
- A Keycloak realm, redirect allowlist, API audience mapper, and Ed25519 signing key remain deployment configuration; no secret or external-account state was added to the repository.


### M10-CHECKPOINT-001 — Bridge scheduler and lease work started

- Recorded: 2026-10-05 22:16 +06:00 (Asia/Dhaka). Actual model/effort label in runtime: GPT-6, effort not exposed.
- User explicitly instructed M10. Verified M05 adapter contract/fake app, M07 SQLite inbox/outbox/recovery, and M09 authenticated HTTP/SSE endpoints. Scope includes outbound SSE/API clients, dispatch recovery state distinct from receipt cursors, normal-turn serialization with independent controls, local disable, lease renewal/fencing, and fake-adapter tests.

### M10-DONE-001 — Bridge scheduler, connections, and leases complete

#### Execution record

- Completed: 2026-10-05 22:42 +06:00 (Asia/Dhaka). Actual model/effort label in runtime: GPT-6, effort not exposed. Prerequisites: M05-DONE-001, M07-DONE-001, and M09-DONE-001. Final milestone status: Done.
- Changed artifacts: bridge runtime and SQLite dispatch state; protocol adapter subscription cancellation; fake adapter shutdown behavior; server lease migration/service and HTTP fencing; M10 runtime/lease tests; root `test:m10`; bridge/API/storage docs and repository guidance; [verification evidence](evidence/M10/verification.json). No dependency was added.

#### Outcome and walkthrough

`BridgeRuntime` now owns the long-lived local bridge lifecycle. On start it recovers interrupted attempts, inspects the selected binding, and renews a fenced server lease before opening authenticated prompt and control SSE streams. It retries transient connection failures with jittered exponential backoff capped at 30 seconds. The server issues short-lived leases, fences them by binding revision and generation, marks an expired binding stale, and rejects later renewals; command reads, event writes, and acknowledgements require a current lease fence.

The runtime stores incoming commands and receipt checkpoints in SQLite before acknowledging them. Dispatch state is separate from receipt state, and dispatch waits for a contiguous lane cursor. A single normal turn per binding is serialized while the independent control worker remains able to deliver cancellation, input responses, approval decisions, inspection, disable, and permission revocation. It re-inspects native state immediately before mutation. The SQLite transaction records `applying` before the adapter call; unknown outcomes and restart during application become reconciliation-required and are never resubmitted automatically.

Adapter output enters a bounded durable outbox before transmission and retries with the same event ID until the server confirms persistence. A separate durable acknowledgement queue retries receipt/application outcomes. Fragmented UTF-8/SSE parsing is incremental and frame-bounded. `disable()` synchronously stops local network/subscription activity and future dispatch without needing server reachability; an already-running native action is not represented as cancelled. The adapter subscription accepts an abort signal so stop does not depend on a model turn ending.

The acceptance test used the deterministic fake adapter and a scripted HTTP server bound to loopback. While a fake turn waited for input, it delivered an approval through the injected M11 handler seam and then an input response. It forced a transient output 503 and verified an identical event ID on retry. Separate tests verify restart reconciliation, gap-safe cursors, fragmented UTF-8, offline local disable, PostgreSQL lease expiry, stale-generation fencing, and that an expired lease cannot be revived.

#### Verification

| Check | Command | Result |
|---|---|---|
| TypeScript build | `npm run build` | Passed across all five TypeScript workspaces. |
| TypeScript checks | `npm run lint` | Passed across all five TypeScript workspaces. |
| Portable suite | `npm test` | Passed; 30 passed, 0 failed, 4 PostgreSQL integration tests skipped because their environment variables were unset. |
| M10 runtime and lease acceptance | `M10_TEST_DATABASE_URL=<disposable PostgreSQL 17 URL> npm run test:m10` | Passed; 6 tests, 0 failures. |
| M06 regression | `M06_TEST_DATABASE_URL=<disposable PostgreSQL 17 URL> M06_TEST_DOCKER_RESTART=1 npm run test:m06` | Passed; PostgreSQL migration, durability, rollback, replay, snapshot, and service-restart check. |
| M08 regression | `M08_TEST_DATABASE_URL=<disposable PostgreSQL 17 URL> npm run test:m08` | Passed; PostgreSQL-backed identity and authorization check. |
| M09 regression | `M09_TEST_DATABASE_URL=<disposable PostgreSQL 17 URL> npm run test:m09` | Passed; 2 PostgreSQL-backed HTTP/SSE tests, 0 failures. |

See [evidence/M10/verification.json](evidence/M10/verification.json) for verified behavior and limitations. Node 25.9.0 ran checks while the repository selects Node 24, so Node 24 remains unverified. The disposable database was stopped after testing. No production server, real app adapter, connected vendor application, or deployment was exercised. Approval delivery was tested only through the injected handler; request-bound approval validation/application remains M11. Steering remains explicitly unsupported by the current adapter contract.

#### Handoff

- M10 is Done; M11–M26 remain Not started. Stop at the M10 boundary.
- M11 should connect its request-bound approval engine to `BridgeRuntimeOptions.approvalHandler`, preserving exact request/revision/digest/scope checks and durable application reconciliation.
- M15 can wrap the per-binding runtime lifecycle and surface connection, lease, disable, and reconciliation states. M16/M19 must supply only supported app-specific adapters and keep their permission constraints.

### M09-DONE-001 — HTTP/SSE command and event API complete

#### Execution record

- Completed: 2026-10-05 22:01 +06:00 (Asia/Dhaka). Actual model/effort label in runtime: GPT-6, effort not exposed. Prerequisites: M06-DONE-001 and M08-DONE-001. Final milestone status: Done.
- Changed artifacts: `server/src/http/index.ts`, `server/src/storage/index.ts`, `server/src/index.ts`, `server/migrations/003_command_acknowledgements.sql`, `tests/http-api.test.mjs`, root `test:m09` script, `docs/server-http-api.md`, `docs/server-storage.md`, README/AGENTS, and [verification evidence](evidence/M09/verification.json). No dependency was added.

#### Outcome and walkthrough

The server package now exports `createApiServer`, a Node HTTP API with versioned health, prompt submission, control submission, device command SSE, authenticated device event/ack ingestion, consistent session snapshots, and session event replay. Human access tokens pass through the configured OIDC provider and M08 session authorization; bridge bearer credentials resolve to active device principals and must match the path device and active session binding. Protocol messages are validated, user commands are checked against the current binding revision/lease, and sensitive controls require owner-level permissions. Command success is sent only after the existing transaction commits.

Prompt and control command subscriptions are independent database queries and SSE streams. The stream uses durable lane/session sequence IDs, replay through `Last-Event-ID` or `after`, a bounded 100-record fetch batch, bounded concurrent connections, socket backpressure, 15-second default heartbeats, and `retry: 3000` guidance. The bridge client is responsible for adding jitter and capping reconnect backoff at 30 seconds. The server’s error envelope includes request IDs and documents authentication, authorization, stale/conflicting cursor, body-size, and stream-capacity failures.

Migration 003 adds durable command acknowledgements constrained to persisted command sequence keys and monotonic states. An acknowledgement must match its session and cannot regress from receipt/application outcomes. Event ingestion uses M06 atomic deduplication and returns only after commit. Snapshot/replay routes authorize the user before returning session state.

The PostgreSQL HTTP acceptance used a scripted bridge client and synthetic OIDC provider over the loopback disposable PostgreSQL 17.11 container. Thirty prompt commands were persisted before a control command was independently delivered. The suite tested duplicate/conflicting command and event retries, durable acknowledgement progression/regression, authenticated and unauthorized access, stale retained cursors, future and malformed cursors, fragmented UTF-8/SSE framing, heartbeat, connection-capacity 429, body limit 413, snapshot watermark, replay and clean stream close.

#### Verification

| Check | Command | Result |
|---|---|---|
| TypeScript build | `npm run build` | Passed across all five TypeScript workspaces. |
| TypeScript checks | `npm run lint` | Passed across all five TypeScript workspaces. |
| Portable suite | `npm test` | Passed; 25 passed, 0 failed, 3 database integration tests skipped when no test URLs were provided. |
| M09 HTTP/SSE integration | `M09_TEST_DATABASE_URL=<disposable PostgreSQL 17 URL> npm run test:m09` | Passed; 2 tests, 0 failures against PostgreSQL 17.11. |
| M06 regression | `M06_TEST_DATABASE_URL=<disposable PostgreSQL 17 URL> M06_TEST_DOCKER_RESTART=1 npm run test:m06` | Passed against PostgreSQL 17.11, including container restart and storage persistence. |
| M08 regression | `M08_TEST_DATABASE_URL=<disposable PostgreSQL 17 URL> npm run test:m08` | Passed against PostgreSQL 17.11. |

See [evidence/M09/verification.json](evidence/M09/verification.json) for exact outcomes and limitations. Host Node 25.9.0 executed checks while the repository selects Node 24, so Node 24 remains unverified. The disposable PostgreSQL service was stopped after tests. No external OIDC realm, production deployment, connected app, approval execution route, or real bridge reconnection scheduler was tested. History is currently unpruned, so 410 expired cursors are reserved until retention exists; an ahead cursor returns 409.

#### Handoff

- M09 is Done; M10–M26 remain Not started. Stop at the M09 boundary.
- M10 may consume the independent SSE lanes and persist receipt checkpoints through M07 primitives. It owns reconnection jitter/backoff, heartbeat lease authority, scheduling, fencing and recovery; M09’s `retry` hint does not claim those behaviors.
- M11 owns request-specific approval lifecycle and decision application; this API only authorizes and transports existing command/event envelopes. M13 owns attachment transfer.
- History is not pruned. If retention is added later, implement minimum available cursor watermarks and return `410 CURSOR_EXPIRED` with snapshot resynchronization rather than silently skipping records.

### M01-M10-AUDIT-001 — Requirements and completion review

- Recorded: 2026-10-05 23:02 +06:00 (Asia/Dhaka). Actual model: Codex/GPT-6; effort not exposed. User requested a requirements review of M01–M10. Review only; no production source fixes or new app permissions were applied.
- Read milestone acceptance criteria, requirements, architecture decisions, feasibility reports/evidence, protocol and adapter contracts, both stores, auth/Keychain, HTTP/SSE, runtime and tests. Saved the [full audit](docs/reviews/m01-m10-audit.md), [machine-readable summary](evidence/reviews/m01-m10/summary.json), and runnable review probes/results under `evidence/reviews/m01-m10/`.
- Existing verification passed: root build/lint; portable suite 30 passed with 4 database tests skipped; Swift/Keychain 3 passed; dedicated PostgreSQL M06/M08/M09/M10 suites 1/1/2/6 passed, including service restart. The isolated review schema was removed and the disposable service stopped afterward.
- Additional probes reproduced 11 faulty observations across 10 findings. Source inspection added missing queue bounds and a jittered reconnect delay exceeding its cap. Passing the earlier suites did not establish these acceptance cases.
- Reopened M04 for opaque JSON timestamp rejection; M05 for caller-altered native approval acceptance; M07 for epoch-unsafe output identity; M09 for open-stream role revocation, non-atomic fences, skipped command sequences and absent queue admission bounds; M10 for dispatch/startup disable races, expired/transit-extended authority, multiple-binding feed routing, recovery dependencies and backoff bounds.
- M01/M02 remain complete discovery with documented negative/missing external integration routes. M03/M06/M08 retain completion within their evidenced scope. Carry forward selected Node 24 runtime verification, backup recovery evidence, synthetic Keycloak configuration, and the unamended Fastify/node:http architecture deviation; these are detailed in the audit.
- Prior DONE entries and milestone evidence are preserved as historical claims. This dated review supersedes current completion status for M04/M05/M07/M09/M10. Register, entry index and current handoff are updated together.
- Next action: repair reopened milestones one at a time and add intended-behavior regression tests for each finding. Revalidate affected dependents before reclosing them or beginning M11. Do not infer real vendor application support from these synthetic tests.

### M01-M10-REPAIR-001 — Revalidated completion

- Recorded: 2026-10-06 00:16 +06:00 (Asia/Dhaka). User explicitly authorized fixing all findings and completing M01–M10. Actual model: Codex/GPT-6 per session instructions; exact model identifier and effort **Unrecorded**. This is an authorized repair sequence across existing milestone boundaries; M11 was not implemented.
- Preserved M01/M02 discovery evidence and negative/missing integration findings. Corrected stale present-tense handoff language in their reports. App-access approval remains the human’s **Allow this conversation** selection; no new app access or external attachment was inferred.
- M03 amendment: verified fresh setup on Node 24.21.0/npm 11.19.0 in a pinned disposable container, and amended DECISION-002 to select the implemented neutral `node:http` boundary. Shared dependency direction and native companion tests pass.
- M04/M05 repairs: schema-declared calendar validation preserves opaque JSON; explicit transport skip/permit metadata and separate producer checkpoints; native stored review authority rejects altered digests/choices/grants and foreign script bindings/turns. Fake native mutation guards preserve cancellation/deadline authority.
- M06/M07 repairs and completion evidence: unchanged applied PostgreSQL migration checksums plus new skip migration; service restart and actual schema dump/restore; transactional epoch-aware SQLite migration, contiguous cursors, retained output, authenticated skip receipt and scoped recovery/queues.
- M08/M09 repairs: existing streams reauthenticate and recheck current access. Commands/events/acks lock authority inside their write transaction and recheck expiry after waits. Command role admission and bounded independent prompt/control lanes are transactional. Uniform binding-before-session locking fixes the real deadlock found during Node 24 integration.
- M10 repairs: cancellable serialized startup; rechecks after native inspection; server-held dispatch admission plus native effect-boundary guard; conservative monotonic request-start deadlines, independent expiry watchdog, 60/20-second lease defaults and capped final jitter. A shared durable device inbox routes multiple bindings with independent schedulers/acks/outbox. Uncertain work remains reconciliation-required and is never resubmitted.
- Final verification: Node 24 fresh install/build/lint and full suite **62 passed, 0 failed, 1 host-only restoration skip**; host portable suite **48 passed, 0 failed, 15 external-store skips**. Dedicated PostgreSQL M06/M08/M09/M10 checks passed **2/1/9/23**, with no skips, including service restart and dump/restore. Swift/temporary Keychain **3 passed**. The later native-fixture check was revalidated by the final full Node 24 and host runs. [Logs and exact commands](evidence/reviews/m01-m10-repair/verification.json), [validated source hashes](evidence/reviews/m01-m10-repair/source-hashes.json).
- The real runtime-to-API suite verifies blocked cancellation/input, second queued prompts after completion, two simultaneous bindings, obsolete sequence skips, takeover ordering and retained old output with a new epoch’s sequence one. The injected approval handler still establishes delivery only; M11 owns authenticated request-bound decision application.
- All twelve findings F01–F12 are closed in the [requirements close-out](docs/reviews/m01-m10-closeout.md). Early failed container/order/fixture attempts and the subsequently fixed server deadlock are documented there; passing historical defect probes are not used as acceptance.
- Cleanup verified zero isolated repair schemas; the disposable PostgreSQL service is stopped. The Swift test removes its temporary Keychain item. No production realm, graphical app, real adapter, native atomic remote approval or production backup system is claimed.
- M01–M10 are Done, **10 of 26**. No required repair remains within this scope. M11–M26 remain Not started; stop at this authorized boundary. Future native integrations must honor the mutation guard and their original app-owned integration gates.

### M11–M13-CHECKPOINT-001 — Sequential implementation

- Recorded: 2026-10-06 21:24 +06:00 (Asia/Dhaka). User explicitly authorized M11, then M12, then M13. Exact model ID/effort: Unrecorded.
- M11 implementation: added `ApprovalEngine` and the authenticated decision/one-time assertion-consumption routes. Decision validation now checks the exact session/request revision, canonical digest, reviewer role, active device binding/lease, offered choice, requested permission subset, expiry, and queue capacity. Winner, pending grant records, signed device assertion, audit row, and priority command are committed in one transaction. `approval.required`/`.updated`/`.resolved` events persist interaction lifecycle state; command acks/application events reconcile outcomes. Added bridge reinspection, assertion verification/consumption, local policy rejection for session/persistent grants, durable attempt tracking, and no automatic retries after uncertain native response. Request expiry closes server authority and never claims to revoke a native permission.
- M12 implementation: added `TranscriptProjector` with session-sequence buffering, event-ID idempotency, revision-checked delta/replacement/completion handling, explicit repair cursor on gap/base mismatch, artifact and interaction state, and partial/unknown evidence labels. Approval cards surface while transcript sequence gaps are repaired. Snapshot API now includes the projection and prompt/control/session watermarks from one repeatable-read storage cut; pending interactions are reconciled from the same snapshot.
- M13 implementation: added private file-backed upload staging, allowlisted MIME/signature and size checks, owner/session authorization, SHA-256 verification, commit recovery after rename interruption, protected download, scheduled expiry/retention cleanup, staging receipt migration/storage/API, and bridge-side content rehash plus capability-gated exact-byte adapter staging before prompt submission. Fake adapter exposes simulation-only staged bytes and matching receipts. Native app attachment confirmation remains M16/M19.
- Changed artifacts include `server/src/approvals/`, `bridge/src/approvals/`, `protocol/src/projection.ts`, `server/src/attachments/`, server HTTP/storage, bridge runtime, fake adapter, `server/migrations/006_approval_ledger.sql`, `server/migrations/007_attachment_staging_receipts.sql`, and docs for all three scopes. Applied migrations 001–005 were not edited.
- Verification: `npm run build --workspaces --if-present` and `npm run lint --workspaces --if-present` passed across all five TypeScript workspaces. Runtime was Node v25.9.0/npm 11.12.1; the repository selects Node 24, so the supported runtime remains unverified. No focused M11–M13 acceptance result is recorded here. In particular, transactional races/assertion replay, crash reconciliation, projector fixtures, actual HTTP upload/ownership/cleanup, and exact bridge-to-fake staging still need acceptance checks.
- Status: M11, M12, and M13 remain **In Progress** because their required focused acceptance evidence is not established. M14–M26 remain Not started. No production signing-key configuration, private persistent storage deployment, real vendor adapter, or native attachment confirmation is claimed.

### M11–M13-DONE-001 — Approval, projection, and attachment milestones complete

- Completed: 2026-10-06 21:40 +06:00 (Asia/Dhaka). The user authorized implementation in sequence. Exact model identifier/effort: Unrecorded.
- M11 acceptance: focused PostgreSQL run verified contention and a single decision winner, reviewer/device/session/request authority, one-time assertion consumption, approval interaction and grant lifecycle, expiry, request-specific bridge application, duplicate no-retry, and reconciliation after an uncertain native outcome. The authorization route records decision, ledger rows, assertion, audit and command atomically.
- M12 acceptance: focused projection and API snapshot tests verified ordered/idempotent replay, revisions and replacements, base mismatch/gap repair, artifacts and interactions, explicit partial/unknown evidence, approvals visible during transcript repair, and consistent snapshot/session/lane watermarks.
- M13 acceptance: focused HTTP/filesystem and bridge tests verified MIME/signature/size/checksum checks, owner/session access control, interrupted-commit recovery, expiry cleanup, authorized download, byte rehash, exact fake-adapter staging, persisted receipt, and prompt submission only after staging.
- Integrated verification: `npm test` with disposable PostgreSQL URLs for M06/M08/M09/M10/M11 passed **69 tests, 0 failures, 1 optional dump/restore test skipped**. The dump/restore test is independently established by [M06 evidence](evidence/M06/verification.json). `npm run build` and `npm run lint` passed across all five TypeScript workspaces. Focused M11, M12, and M13 suites passed; see [M11](evidence/M11/verification.json), [M12](evidence/M12/verification.json), and [M13](evidence/M13/verification.json).
- Environment limitation: checks ran on Node v25.9.0/npm 11.12.1 while the repository requires Node >=24 <25; Node 24 execution is therefore unverified. The disposable PostgreSQL 17.11 service was used only for local acceptance and stopped after verification.
- Scope limits: no production signing-key configuration, deployed private storage, production service, real Codex/Cline adapter, or native app attachment confirmation was exercised. Native vendor integration/confirmation remains in later milestones and is not implied by the fake-adapter tests.
- Final status: M11, M12, and M13 are Done. M01–M13 are complete (13 of 26); M14–M26 remain Not started. Stop at M13 until the next milestone is explicitly authorized.

### M14-DONE-001 — Server control interface complete

- Completed: 2026-10-06 22:14 +06:00 (Asia/Dhaka). M14 followed the completed M11–M13 implementation. Exact model identifier/effort: Unrecorded.
- Added the React 19/Vite 8.1.0 same-origin control UI, served from the built static directory with a restrictive CSP. Added authenticated `GET /v2/sessions` listing only the caller's owner/member sessions and current binding/capability details.
- The UI supports OIDC authorization code with PKCE, session/app/conversation selection, capability/lease display, queued text and checksum-committed file/image inputs, projected transcript, artifact downloads, approval/question cards, turn cancellation only when supported, and clearly labelled server-disable requests. Transcript values are React-escaped text. Owners can review exact approval action/target/grants; operators can prompt; viewers remain read-only. The server API independently enforces roles.
- Browser check: installed Chrome via Playwright ran owner and viewer workflows against deterministic identity/API fixtures. Verified authorization-code cleanup, prompt metadata/revision, attachment bytes before queue submission, read-only restrictions, no executable transcript HTML, decision-stage distinction, and refresh recovery after sign-in.
- API/storage check: PostgreSQL fixture verified static UI delivery/CSP and SPA fallback, role-scoped session listing, binding metadata, operator prompt acceptance, viewer prompt rejection, and unauthenticated rejection. Full details: [M14 verification evidence](evidence/M14/verification.json).
- Validation: `M14_TEST_DATABASE_URL=<disposable PostgreSQL 17 URL> npm run test:m14` passed (2 Chrome tests and 1 PostgreSQL acceptance test); `npm run lint --workspaces --if-present` passed across six TS workspaces. Node 25.9.0 ran on this host; Node 24 remains unverified.
- Limits: tests used a deterministic identity provider and no real application. Refresh clears the in-memory token, so the user signs in again before snapshots are restored. Pairing, session creation, and immediate local disable belong to the companion workflow. M15–M26 remain not started at this checkpoint.

### M14-DONE-002 — Server-mediated sign-in and control interface complete

- Completed: 2026-10-06 22:24 +06:00 (Asia/Dhaka). M14 was re-opened after its mocked-browser flow did not register a first-time user with the server. Exact model identifier/effort: Unrecorded.
- Added server-held OIDC PKCE state, nonce and verifier with one-time state consumption and five-minute expiry. Code exchange now verifies ID/access tokens, registers the identity through `completeOidcSignIn`, and only then returns credentials. The web client never exchanges the code directly with the identity provider. Added corresponding start/exchange routes for the companion sign-in flow.
- Validation: final `npm run test:m14` passed: 2 real Chrome browser workflows and 2 disposable PostgreSQL API tests, including first sign-in, identity registration, role-scoped session listing, prompt permissions, and one-time code-exchange state. All six TypeScript workspaces built. `npm run lint --workspaces --if-present` passed.
- Limits: tests used deterministic OIDC/API fixtures; the production IdP and real app were not exercised. Browser access tokens remain memory-only, so refresh asks the user to sign in again. Node 24 remains unverified (host is Node 25.9.0). Evidence: [M14 verification](evidence/M14/verification.json).
- Final status: M14 is Done after amendment. M01–M14 complete; M15–M26 remain Not started at completion.

### M15-CHECKPOINT-001 — Graphical companion shell started

- Recorded: 2026-10-06 22:24 +06:00 (Asia/Dhaka). User authorized M14 followed by M15. Exact model identifier/effort: Unrecorded.
- Prerequisites checked: M08 OIDC/device pairing and Keychain vault; M10 bridge lifecycle, local disable, and lease states; M11 approval requirements. Existing SwiftPM package currently contains only core credentials/identity and tests.
- Scope: deliver the native SwiftUI development app and fake-adapter-backed lifecycle/settings flow. Keep actual Codex/Cline integration and packaging/signing in M16+ and M24.
- Status: In Progress. Native implementation and acceptance checks are underway; no completion claim yet.

### M15-DONE-001 — Graphical companion shell complete

- Completed: 2026-10-06 22:52 +06:00 (Asia/Dhaka). Exact model identifier/effort: Unrecorded.
- Added a macOS SwiftUI executable with overview, server sign-in and two-step device pairing, fake app/conversation selection, capability disclosure, connection status, immediate local disable, secure settings, and links to relevant macOS privacy panes without requesting unnecessary permissions. Access/refresh and device credentials plus the local pairing challenge are stored in the device-only Keychain; ordinary server profile values use preferences.
- Added a Finder-launchable development `.app` packaging script and registered the `sdccompanion://auth` callback. See [companion guide](docs/companion.md). The app is unsigned/notarized distribution work remains M24.
- Lifecycle is kept separate from adapter execution: sleep marks connection stale, wake requires a new lease/connection, local disable fences dispatch across restart/renewal, re-enable leaves the preview disconnected until an explicit reconnect, termination records shutdown, and completed fake turns leave the host running. All vendor integration and remote command subscription remain M16+.
- UI verification: opened the native app window; connected and detached the fake adapter; completed a simulated turn and confirmed the host stayed running; disabled locally and confirmed dispatch controls became unavailable; re-enabled and confirmed reconnect remained an explicit action.
- Focused checks: `swift test --package-path companion` passed 8 tests; `npm run companion:package` generated the executable bundle and `plutil -lint` accepted its Info.plist; the rebuilt app reopened and the disable/enable controls were visually verified; `M15_TEST_DATABASE_URL=<disposable PostgreSQL 17 URL> npm run test:m15` passed pairing API assertions for secret omission, server confirmation before local consent, active device credential, and challenge replay rejection. M14's 2 Chrome and 2 PostgreSQL API tests were rerun and passed after a refresh identity argument correction. `npm run lint --workspaces --if-present` passed across all six TS workspaces.
- Evidence: [M15 verification](evidence/M15/verification.json). Node 25.9.0 ran the TypeScript checks while the selected supported runtime is Node 24; Node 24 remains unverified.
- Limits: the picker uses deterministic fake fixtures; no production IdP, real Codex/Cline app, native approvals, or actual LLM is exercised. Sleep/wake behavior is verified by deterministic state tests and notification wiring, but a physical sleep/wake cycle was not induced. No signed/notarized release is claimed.
- Final status: M15 is Done. M01–M15 are complete (15 of 26); M16–M26 remain Not started. Stop at M15 until the next milestone is explicitly authorized.

### M16-CHECKPOINT-001 — Codex attachment route gate rechecked

- Recorded: 2026-10-06 23:23 +06:00 (Asia/Dhaka). The user authorized M16. Exact model identifier/effort: Unrecorded.
- Rechecked the M01 route decision and current official App Server guide. The guide documents an App Server for embedding Codex into another client, JSON-RPC over stdio/Unix socket, and instructs integrators to start/connect an app-server. It does not establish an attachment API to the already-running desktop GUI conversation required by M16.
- A bounded read-only check found no socket at `/Users/samin/.codex/app-server-control/app-server-control.sock`. No socket scan/connection, app-server launch, Codex UI automation, or real conversation prompt occurred.
- No protocol-only or fake-adapter implementation was substituted: it could not prove existing-thread binding, readiness, user-message echo, or output provenance and would violate the M16 acceptance boundary if presented as completion.
- Evidence: [M16 route assessment](evidence/M16/route-assessment.json); current primary documentation: [Codex App Server](https://learn.chatgpt.com/docs/app-server).
- Status: M16 is **Blocked before implementation** pending one of: a supported attachment endpoint for the existing desktop conversation; explicit approval to revise M16 to a user-configured, separately managed App Server endpoint and update acceptance criteria; or a decision to defer Codex and prioritize Cline. M01–M15 remain Done; M17–M26 remain Not started.

### M19-CHECKPOINT-001 — Cline priority and current API gate

- Recorded: 2026-10-06 (Asia/Dhaka). User directed that Cline take priority; Codex M16 is deferred.
- Rechecked Cline's current official repository and SDK reference. The newly documented SDK exposes runtime/session start, send, subscribe, history, and stop operations, but its documented start path creates a Cline runtime/session; it does not establish attachment to the existing visible VS Code extension task required by M19.
- Existing M02 evidence remains the supported extension API assessment: no task-addressed input or public task event snapshot/subscription. Supervised UI continuity does not supply a production bridge API.
- No CLI/SDK runtime was launched, no extension was modified, and no live task prompt was sent.
- Evidence: [M19 route assessment](evidence/M19/route-assessment.json); official [Cline repository](https://github.com/cline/cline) and [ClineCore SDK reference](https://github.com/cline/cline/blob/main/docs/sdk/reference/cline-core.mdx).
- Status: M19 is blocked before implementation pending an adopted app-owned extension API or explicit adoption of a version-pinned maintained extension patch. M20/M21 remain gated behind M19. Codex M16 is deferred by product priority, not complete.

### M19-CHECKPOINT-002 — Pinned native API patch implementation started

- User requested finishing M19 after the documented API-patch route. Preparing an isolated, reviewable Cline 4.1.22 API patch and companion extension package in the repository. No installed extension is modified by preparation. Exact model identifier/effort: Unrecorded.
- Existing app remains the executor. The new API must capture exact task/session objects, check identity and authority after asynchronous preparation, and dispatch to the captured native session. It must expose only an allowlisted transcript/status projection.
- M19 remains In Progress until real-task input/output, isolation, reload/switch invalidation, and supported attachment confirmation are established. Corrected prior nonstandard Blocked/Deferred register statuses to In Progress per §1.2; the Codex priority deferral remains recorded in the handoff.

### M19-CHECKPOINT-003 — Maintained patch adopted and native host loaded

- Recorded: 2026-10-07 (Asia/Dhaka; exact time unrecorded). Exact model identifier/effort: Unrecorded. The user explicitly approved the pinned patch and isolated test, accepting upgrade compatibility checks. Updated DECISION-004; the API adoption gate is closed for the pinned local VS Code development build.
- Implemented `adapters/cline/`, the `serverDrivenChat` API inside the copied Cline package, and `extensions/vscode/` graphical selection/inspection/disconnect plus bounded acceptance probe. Added version/fingerprint gates, task/workspace/session/authority fences, command deduplication, filtered snapshots/events, output normalization, and PNG/JPEG staging with exact native echo checksums. No installed Cline bundle was changed and no independent LLM runtime was launched.
- Packaged two unsigned development VSIX files and saved fingerprints. Source patch applicability passed against inspected commit `f58bc118bdeef1bd2813cd08e00d98bdcda96475`; this is not a full upstream source-build claim. Antigravity 3.83.0 and remote hosts are explicitly unsupported by this patch.
- Verification: eight-workspace build and lint passed; M19 fixtures and neutral-module smoke passed (15 checks). Full portable repository tests passed (65 passed, 19 external-store skips) with loopback test servers permitted. Host runtime Node 25.9.0/npm 11.12.1 differs from the repository's Node 24 pin; no Node 24 rerun is claimed. Initial sandbox loopback errors were resolved by rerunning with local listener access.
- Native VS Code 1.140.0 loaded the two development extensions in `/private/tmp/sdc-m19-vscode-probe`. A native baseline returned `M19-READY`; the app-owned API exposed the exact existing task/workspace/host and reported `awaiting_followup; conversation revision 1; ready`. Reload of an active binding was invoked and the restarted companion showed disconnected. Two bridge turns and task-switch isolation remain pending. Solar Mini 4 reports no image support; an image-capable free model choice was requested separately.
- Evidence: [verification](evidence/M19/verification.json), [regression output](evidence/M19/node-tests.log), [artifact manifest](evidence/M19/artifact-manifest.json), [native observations](evidence/M19/native-observations.json), and [contract/maintenance guide](docs/cline-bridge.md). M19 remains In Progress; M20 exact native request controls are implemented and fixture-verified; its real-host acceptance remains open. M21 is not implemented.

### M19-CHECKPOINT-004 — Native text continuity and isolation pass

- In the real VS Code development host, reopened and locally resumed the same disposable native task `1791311237025_zxtup` after reload, then explicitly selected it again. Extension-host/window generations changed; no old binding was restored.
- Ran the graphical two-message probe in **Text only** mode with the user-approved free Solar Mini 4 model. The bridge sent a fresh `M19-3c1dadb3` marker prompt and received native `FIRST-OK`; the second prompt omitted the marker and Cline returned `M19-3c1dadb3-CONTINUITY-OK`. Both exact native input echoes, partial output replacements, and two authoritative terminal events were recorded through the real adapter.
- The actual adapter rejected foreign window/task selections before native bind without changing the selected conversation revision. Clicking native New Task immediately changed status to **select again**. Inspecting the old binding returned **Binding changed** and disconnected; no prompt was sent to the new task. Saved [text trace](evidence/M19/live-vscode-text.json) passes `node scripts/verify-m19-evidence.mjs evidence/M19/live-vscode-text.json`.
- Final fixture hardening rechecks cancellation, binding and session state after authority callbacks at both submission boundaries and image staging. Latest `npm run test:m19` passes 14 fixture checks; [focused output](evidence/M19/focused-tests.log) is saved. Final development artifacts and source diff were regenerated. The final guard additions require loading the latest packages for the remaining image probe; the recorded text trace identifies the earlier additive-guard build separately.
- M19 remains **In Progress**, solely awaiting native image acceptance in the final build. Solar Mini 4 explicitly reports no image support; the user was asked to approve a free image-capable native model (Muse Spark 1.3 Contributor if native settings confirm image support). That approval is pending. No unsupported image was silently sent/dropped and no paid/provider/approval configuration was selected. M20/M21 remain outside this work.

### M19-CHECKPOINT-005 — Final PNG attempt blocked by unreliable UI input

- Retried after the user said done. Computer Use access succeeded in the exact disposable development host, but command inputs were delayed or unchanged and screenshot/accessibility states conflicted. One ScreenCaptureKit capture failure occurred; reconnecting did not establish reliable input. Asked the user to foreground the named development window. No final reload or image submission was confirmed.
- Current native Solar Mini 4 Act-mode settings displayed **Images Yes**, differing from the earlier Images No observation. No model or approval settings were changed. Actual PNG support still requires the native echo and completed-turn evidence.
- Final adapter/extension TypeScript lint passed. Updated [native observations](evidence/M19/native-observations.json) and [verification](evidence/M19/verification.json). M19 remains In Progress; all prior real text/isolation/reload evidence is preserved.

### M19-DONE-001 — Cline existing-task bridge complete

#### Execution record

- Completed: 2026-10-07 07:48 +06:00 (Asia/Dhaka); implementation start time unrecorded. Exact agent model ID/effort unrecorded; no claim inferred from the tracker recommendation.
- No Git metadata/commit available. Changed inventory is listed below; unsigned development artifacts are fingerprinted separately.
- Requirements §§3.2, 9.2 and M19 input/output/identity/attachment gate; prerequisites M02-DONE-001, M05-DONE-001 and M01-M10-REPAIR-001. Maintained patch adoption is recorded in DECISION-004.
- Final milestone status: **Done**, for local VS Code with the adopted Cline 4.1.22 patch. M20/M21 remain Not started.

#### Outcome and walkthrough

The companion picker binds only the current native sidebar task and exact installation, host, VS Code window/session and workspace. The Cline extension owns the controller and existing SDK session; the companion consumes its public `serverDrivenChat` API. No replacement runtime or private app socket is started. Opening historical task `1791311237025_zxtup` after reload was insufficient for dispatch: the bridge rejected it until a harmless local native resumption returned `M19-READY`. That local input invalidated the earlier binding, requiring explicit selection again.

The final graphical **Text and PNG** probe, on native free MiMo-V2.6-Flash, staged a 179-byte PNG and sent marker `M19-d5cbbaa9` into the existing task. Cline showed the native PNG thumbnail and returned `FIRST-OK`. The next prompt omitted the marker; Cline returned `M19-d5cbbaa9-CONTINUITY-OK`. The real adapter observed both exact native input echoes, partial/final assistant output and two authoritative terminal events. The staged receipt SHA-256 exactly matched the native image echo. Other-window and task selections were rejected before native binding without changing the conversation revision.

Earlier native task-switch and active-binding reload checks passed. The final reload also changed host/window generation and left the companion disconnected; local input in the final build required selection again. Finished by restoring native Solar Mini 4 and disconnecting the bridge. Existing task/history and installed stock Cline were preserved.

#### Files and public contracts

| Path | Purpose and later contract |
|---|---|
| `adapters/cline/src/native-api.ts`, `native-patch.ts`, `index.ts` | Versioned native API, app-owned exact binding/session dispatch, PNG/JPEG receipts and neutral AppAdapter implementation |
| `extensions/vscode/src/index.ts`, `native-entry.ts`, `package.json` | Graphical exact-task picker, inspect/disconnect, native lifecycle and bounded developer probe; public adapter export for later M21 |
| `extensions/vscode/scripts/build.mjs`, `package-development.mjs`, `source-patch.py` and `patches/cline-v4.1.22-sdc-m19.1.patch` | Reproducible pinned source diff, fingerprint gate, copied development packages and unsigned VSIX artifacts |
| `tests/m19-cline.test.mjs`, `tests/module-smoke.test.mjs`, `scripts/verify-m19-evidence.mjs` | Stateful fixture/race checks, dependency direction and separate real-host evidence validation |
| Root `package.json`, `package-lock.json`, `AGENTS.md`, `README.md`; extension README and `docs/cline-bridge.md` | Workspace wiring, pinned dependencies, setup and support/upgrade boundaries |
| `docs/decisions/004-cline-extension.md` and decision index; `evidence/M19/`; this tracker | Maintained route adoption, artifacts, test outputs and native proof |

Native API v1.0 provides exact context/bind/snapshot/subscribe/submit/stageImage/detach/dispose. Tokens are process-local; task replacement, workspace change, transcript truncation, local takeover and disposal invalidate them. Mutation permits, expected revisions and effect-boundary authority/cancellation checks fence dispatch. Identical command IDs deduplicate; conflicting IDs reject; ambiguous post-echo outcomes require reconciliation. Native/adapter event replay is bounded to 512/2048 events and expired cursors require snapshots. Shared server/protocol code has no Cline branching.

#### Verification and logs

| Check | Command or native action | Actual result | Evidence |
|---|---|---|---|
| Build / lint | `npm run build`; `npm run lint`; final scoped adapter/extension lint | Passed across eight workspaces; final scoped TypeScript checks passed | [Verification](evidence/M19/verification.json) |
| Stateful fixtures | `npm run test:m19` | 14 passed; effect-boundary races, cancellation, replacement, images and takeover; fixture evidence only | [Focused tests](evidence/M19/focused-tests.log) |
| Regression | `node --test tests/*.test.mjs` | 66 passed, 19 external-store skips, 0 failed | [Regression log](evidence/M19/node-tests.log) |
| Source/package checks | Source patch dry-run; `node extensions/vscode/scripts/package-development.mjs` | Pinned diff applicable; two unsigned packages built; stock bundle hash unchanged | [Artifact manifest](evidence/M19/artifact-manifest.json) |
| Real native acceptance | Reload → reopen/resume same task → exact picker → Text and PNG | Two completed native turns, exact input/image checksum, fresh-marker continuity and foreign-selection rejection | [Final trace](evidence/M19/live-vscode.json) |
| Independent trace validation | `node scripts/verify-m19-evidence.mjs evidence/M19/live-vscode.json` | Passed all native echo, output/terminal, identity and image checks | [Verification](evidence/M19/verification.json) |
| Native lifecycle / cleanup | Native task switch, reload, local prompt takeover, restore Solar, Disconnect | Required re-selection/disconnection observed; task history retained | [Native observations](evidence/M19/native-observations.json) |

The host checks used Node 25.9.0/npm 11.12.1; the repository pins Node 24, and a Node 24 rerun is not claimed. PostgreSQL suites were not enabled in this M19 regression run. Full upstream Cline source compilation was not run; the exact inspected vendor package was copied and fingerprinted, its public export extended, and that resulting development build passed native acceptance on VS Code 1.140.0.

#### Failures encountered and recovery

Computer Use initially returned delayed inputs and conflicting screenshot/accessibility states. User foregrounding plus the visible native reload established fresh state. Historical-task dispatch correctly rejected before local resumption. Solar's image endpoint rejected input despite an initial settings label; Muse reported provider errors after several minutes. Those failed attempts were preserved, and the same final bridge implementation subsequently passed both PNG turns on the free MiMo model. Image capability therefore depends on the selected native model; a capability label alone does not establish endpoint support. Native UI Cancel was used only to recover the stalled disposable test and does not establish M20 atomic cancellation.

#### Handoff

- Rely on the exact pinned local app-owned API and tested adapter contract; preserve captured native session, revision checks, authority/cancellation boundaries and explicit selection.
- Developer setup: `npm run test:m19`, `npm run lint`, `node extensions/vscode/scripts/package-development.mjs`; launch both generated development directories in a disposable VS Code workspace and run the graphical probe. Validate saved trace with `node scripts/verify-m19-evidence.mjs <trace.json>`.
- On a new user instruction, M20 begins with exact native ask identity/revision capture and atomic allow/deny/question/cancel. M21 later owns Connect/pairing; do not treat this development probe as the server-driven Connect journey.
- Antigravity 3.83.0, remote hosts, stock/other Cline versions and generic files remain unsupported. Each upgrade requires a new fingerprint/patch review and repeated native acceptance. Signing/publication remain M24.
- Final bridge is disconnected, Solar restored, native history retained. New host/window selection requires explicit binding; no remote binding token is restored from disk. Tracker register, index and current handoff updated; stopped at M19.

### M20-CHECKPOINT-001 — Native request controls started

- User requested M20 after M19 closure. Read requirements §§7–9.2, M19 completion and adopted maintained-patch decision. Exact agent model/effort unrecorded.
- Inspecting pinned Cline 4.1.22 interaction coordinator and native cancellation path before extending app-owned API. Local/remote decisions must share one exact-request transition; generic button helpers remain excluded. M20 is In Progress.

### M20-CHECKPOINT-002 — Implementation ready for native acceptance

- Exact model/effort unrecorded. Implemented app-owned API 1.1 in Cline 4.1.22 maintained patch `sdc-m20.2` (development version 4.1.2202), a separately versioned companion 0.2.0, adapter native approval/input/cancel operations, and graphical review/answer/cancel commands. M19 packages and evidence are preserved; installed stock Cline is untouched.
- Native request material includes tool-call identity, full input, native preview, task/session/turn identity, immutable ask ID/revision, expiry and actual once/deny choices. Captured native resolver, cancellation and effect-boundary authority checks fence stale requests and task/session changes. Local resolutions share the native promise and normalize as `resolved_elsewhere`. Question answers keep the current turn. Native pending/running state disambiguates `awaiting_followup`.
- Narrowed/persistent grants and revocation explicitly unsupported; no fake grants or permission-setting changes. Native cancellation raises its own fence, aborts the captured session, then rechecks before updating the selected task. Ambiguous post-effect failures return unknown without replay.
- Verification: root build/lint passed; 28 focused M19/M20 tests passed. M20 executes exact pinned upstream interaction-coordinator source with UI/translator dependencies stubbed, plus source SHA-256 provenance. Final root regression: 80 pass, 19 external-database skips, 0 fail; initial loopback EPERM rerun with permission passed. Host Node 25.9.0/npm 11.12.1 used; required Node 24 verification not claimed. Source patch dry-run and unsigned development packaging passed; no full upstream source build claimed. See [verification](evidence/M20/verification.json), [controls contract](docs/cline-controls.md), [artifact fingerprints](evidence/M20/artifact-manifest.json).
- Prepared real-host probe restricted to `/private/tmp/sdc-m19-vscode-probe`: one approved harmless write, native local denial followed by old remote decision against a second pending ask, remote denial with both denied files absent, native question answer/output and native cancellation/abort/resume evidence. Scope rejection, loaded artifact fingerprints and unchanged auto-approval settings are recorded.
- M20 remains **In Progress**. Computer Use requires action-time confirmation for running software from an unrecognized source; the new locally built unsigned packages need this confirmation before native execution. An approval question is pending. Fixture evidence is not real-host acceptance. Exact next action: after approval, launch the prepared M20 packages in the isolated host, run the graphical probe, save/validate its native trace and update completion only after all gates pass.


### M20-DONE-001 — Cline native controls complete

- Completion recorded 2026-10-07 08:43 +06:00 (Asia/Dhaka); native probe finished 08:38:02 +06:00. Exact agent model and effort: **Unrecorded**. M11 approval engine and M19 adopted native API prerequisites reviewed; acceptance covers requirements §§7–9.2 and the M20 register criteria.
- User's instruction to finish followed the prepared isolated-test confirmation request; proceeded within that disclosed scope. Computer Use app access succeeded. Success does not establish saved Always allow permission. No approval-setting change or production installation was performed.
- Final status: **Done** for adopted Cline 4.1.22 `sdc-m20.2`, app-owned API 1.1, companion 0.2.0, local VS Code only. The real native probe passed all required control gates; unsupported grant options were explicitly rejected.

#### Implementation and execution walkthrough

The app-owned API captures the exact task, SDK session, turn, native interaction promise/resolver and complete action material. Immutable ask IDs/revision, expiry, canonical action digest, full tool input/native preview and effect-boundary authority/cancellation checks prevent stale or changed requests from consuming a later ask. Native local and remote resolutions use the same coordinator transition; local outcomes normalize as `resolved_elsewhere`. Native question feedback remains in the current turn. Cancellation fences translation, clears pending interactions, awaits the captured SDK session's abort and rechecks identity before recording stopped state and native resume evidence. Unknown post-effect outcomes require reconciliation without replay. Shared protocol/server/bridge modules retain vendor-neutral contracts.

Closed the prior M19 development window and launched the two prepared M20 development directories in `/private/tmp/sdc-m19-vscode-probe`. Reopened disposable task `1791311237025_zxtup`, selected free native MiMo-V2.6-Flash, and locally resumed it with the no-tools `M20-READY` prompt. Observed the exact reply, then explicitly selected its current host/window/workspace/task through the native bridge picker. The bounded graphical M20 probe delivered four addressed turns through the real adapter.

- **Allow:** exact native request `96c46aaa-ee54-440a-b2bf-63290ab22a6b`, revision 1, received whole-action once approval. The actual editor file `M20-fd6189f1-allowed.txt` contains exactly `M20-fd6189f1-ALLOWED`; native resolution and terminal output were recorded.
- **Local/remote race and deny:** clicked native Reject for first request `3c41a9a5-e815-4f84-971a-f957191ace03`. Its native local resolution became `resolved_elsewhere`. While the next request `3c8b91ae-49bc-429b-a9a1-dbe40d79e2b6` remained pending, the old remote allow rejected with `REQUEST_STALE`. The addressed next denial applied. Both local-denied and remote-denied paths stayed absent; native output confirmed both actions rejected without retry. Focused tests additionally exercise simultaneous local/remote resolution and next-ask preservation.
- **Question:** native ask `cf02b294-03bf-407f-a0c5-0f326dc1548d`, revision 1, received `blue`. The native input resolution and subsequent `blue QUESTION_DONE` output were observed in the same addressed turn.
- **Cancel:** addressed bridge turn `b960625a-036a-4b56-b77b-68855076b52c`, native turn `1791311237025_zxtup:1791340670894`, was blocked on its exact question. Captured native SDK abort acknowledged; native `resume_task` message `1791340682331` appeared. Snapshot showed `isRunning: false`, no pending interactions and resumable phase; native UI showed Resume Task and disabled question choices. An authoritative `turn.cancelled` event was recorded.
- **Permissions:** persistence, narrowing and revocation returned unsupported without consuming the pending ask. Only whole-action once and deny are offered; native auto-approval remains under Cline's settings. The fingerprinted loaded probe compares initial/final auto-approval flags before recording passed. Saved trace contains the initial flags only; no final flags were inserted retrospectively. GUI showed the same Read, Commands, Web Fetch and MCP settings.

The original native probe file was copied unchanged to [live-vscode.json](evidence/M20/live-vscode.json) and checked byte-for-byte against the workspace artifact. Binding `0633c7ab-372b-4635-814f-412a86d2cb66`, session `3dc563f8-42b5-4751-ad2f-01de86ffd312`, exact host/window/workspace and loaded bundle fingerprints are retained there. Four native starts, three completions and one cancellation passed independent validation. [Native observations](evidence/M20/native-observations.json) distinguish UI observations from protocol/action evidence.

#### Files and contracts

| Path | Purpose |
|---|---|
| `adapters/cline/src/native-controls.ts`, `native-api.ts`, `native-patch.ts`, `index.ts` | Exact native coordinator controls, API 1.1, application-owned dispatch and neutral adapter mapping |
| `extensions/vscode/src/index.ts`, `native-entry.ts`, `package.json` | Graphical review/answer/cancel and bounded native acceptance probe; companion 0.2.0 |
| `extensions/vscode/patches/cline-v4.1.22-sdc-m20.2.patch`, `scripts/source-patch.py`, `scripts/package-development.mjs` | Pinned source patch, exact bundle gate and separate unsigned development packages |
| `tests/m20-cline.test.mjs`, `tests/fixtures/cline-4.1.22/`, `scripts/verify-m20-evidence.mjs` | Actual pinned upstream coordinator fixture/provenance, stateful race checks and independent live-trace validator |
| `docs/cline-controls.md`, extension README, DECISION-004, `evidence/M20/` | Scope, setup, fingerprints, acceptance and maintenance handoff |

#### Verification

| Check | Result | Evidence |
|---|---|---|
| Root `npm run build`; `npm run lint` | Passed across eight workspaces | [Build](evidence/M20/build.log), [lint](evidence/M20/lint.log) |
| `node --test tests/m19-cline.test.mjs tests/m20-cline.test.mjs` | 28 passed, 0 failed; exact pinned upstream coordinator with translator/UI dependencies stubbed | [Focused tests](evidence/M20/focused-tests.log) |
| `npm test` | 80 passed, 19 external-database skips, 0 failed, 99 total | [Regression](evidence/M20/node-tests.log) |
| Source patch dry-run | Passed; full upstream build not run | [Patch check](evidence/M20/source-patch-check.log) |
| Development packaging and final archive checks | Passed; stable extension identities, exact loaded bundle/package hashes; stock installed bundle unchanged | [Package log](evidence/M20/package.log), [manifest](evidence/M20/artifact-manifest.json), [final checks](evidence/M20/artifact-verification.log) |
| Real-host native controls | Passed allow/deny/local-resolution stale race/question/acknowledged cancel and actual file outcomes | [Live trace](evidence/M20/live-vscode.json) |
| `node scripts/verify-m20-evidence.mjs evidence/M20/live-vscode.json` | Passed addressed events/digests/outcomes/loaded artifacts | [Validation log](evidence/M20/live-verification.log) |
| Original M19 evidence validation | Passed for its historical build; original artifacts preserved | [Verification](evidence/M20/verification.json) |
| Native cleanup | Passed: Solar restored, bridge disconnected, composer empty, stopped native task/history retained | [Observations](evidence/M20/native-observations.json) |

Host Node 25.9.0/npm 11.12.1 were used; the repository requires Node 24 and this change has no Node 24 rerun. External PostgreSQL checks were skipped in the portable regression. Initial sandbox loopback EPERM was resolved by the permitted local-fixture rerun. No full upstream Cline build, signing, release, Antigravity or remote-host acceptance is claimed. Native PNG acceptance remains M19 historical evidence for its original build; it was not rerun on this expanded build.

#### Decisive fixes and cleanup

Before launch, corrected the package generator to preserve `server-driven-chat.sdc-cline-bridge` identity inside the separate M20 directory. The prior M20-suffixed manifest name could not satisfy the public companion lookup. Repackaged and verified the two archives; native/companion JavaScript bundle hashes stayed unchanged. The generator now records API/companion identity, bundle and source-patch hashes reproducibly.

An initial sandbox VS Code launch did not open a window; the scoped approved launch succeeded. Native UI briefly returned stale state after a window title change; reacquiring the app produced fresh state. During cleanup, a delayed command landed as unsubmitted composer text while settings closed. Cleared it without sending, then opened/verified the Command Palette separately and disconnected. No input was submitted in the normal LogGraph window. Restored `cline-free/solar-mini4`, verified bridge disconnected and composer empty; the native task remains paused at Resume Task, with its history and allowed evidence file preserved.

#### Handoff

M20 is closed. M21 remains Not started and requires a new instruction. Its next concrete work is trusted-origin Connect, graphical pairing and extension-owned persistent delivery after the initiating turn ends, using the established native API 1.1 and neutral authenticated runtime. The M20 developer probe does not establish that server workflow. Preserve exact task/host/session addressing, native authority/cancellation checks, once/deny scope, compatibility fingerprints and explicit re-selection. Each Cline upgrade requires source review, updated patch and fingerprints, fixture checks and native acceptance. Codex M16 remains deferred by the user's Cline-first priority. Tracker register, index and current handoff updated; no M21 work performed.


### M21-CHECKPOINT-001 — Connect implementation started

- User requested Implement M21. M02/M08/M19/M20 boundaries reviewed; exact agent model/effort Unrecorded. M20 native controls and artifacts remain preserved.
- Implementing a bounded app-owned custom tool in the existing pinned Cline session, trusted SDK session/tool invocation identity, configured profiles, graphical authentication/two-sided pairing, authenticated binding handshake and extension-owned M10 listener. No raw URL/task/credential arguments or model polling runtime.
- Source review uses the exact adopted upstream commit; native acceptance and final status remain pending.


### M21-CHECKPOINT-002 — Implementation ready for native acceptance

- Recorded 2026-10-07 09:08 +06:00 (Asia/Dhaka); exact agent model/effort Unrecorded. Implemented the adopted local VS Code/Cline 4.1.22 revision 3 (`sdc-m21.3`, version 4.1.2203), API 1.2, companion 0.3.0. M19/M20 artifacts and stock installation preserved.
- `adapters/cline/src/native-connect.ts` registers bounded sequential `bridge_connect`/`bridge_disconnect` tools inside the existing session lifecycle. SDK session/tool-call origin, task/session object identity and host/window/workspace are captured out of band and rechecked across asynchronous review. Arguments reject URL/task/credential/grant injection. The public neutral operation names remain `bridge.connect`/`bridge.disconnect`; provider tool names use underscores. Missing origin rejects and directs graphical selection. API 1.2 exposes task generation for the graphical fallback.
- `extensions/vscode/src/connect.ts`, `connect-ui.ts` and `index.ts` add machine-local configured profiles, server-mediated browser PKCE sign-in/refresh, SecretStorage credentials, separate authenticated server pairing-code and local device/task consent, exact control-category gates, authenticated binding handshake and M10 durable HTTP/SSE runtime. Repeated live Connect is idempotent; a different profile/task rejects pending explicit disconnect/review. Local disable fences dispatch before network work. Initiating tool cancellation aborts pending setup without disabling a successfully established listener after tool return. Authenticated setup/listener requests reject redirects.
- Server `AuthorizationService.registerBinding` and `detachBinding`, plus authenticated `/v2/devices/:id/bindings` and exact detach routes, derive ownership from verified device identity. Credential/device/session state is checked inside the write transaction; conflicting or foreign-owned registrations reject. Existing M11 assertion verification supplies approval routing only when selected locally and the handshake returns its signing key. Shared modules remain vendor-neutral.
- `connect-capture.ts` and bounded disposable graphical capture commands record native SDK tool origin, actual loaded artifacts, state and adapter events without submitting a prompt. `scripts/m21-native-server.mjs` prepares real PostgreSQL/HTTP/SSE plus a synthetic loopback sign-in page; it waits for the initiating native turn to end before two harmless server text prompts. The follow-up omits the marker. `scripts/verify-m21-evidence.mjs` checks those native/server traces independently. No replacement model runtime exists.
- Verification: root build/lint passed, 39 focused tests passed (including M19/M20 regressions and two real PostgreSQL/HTTP/SSE M21 checks with simulated native controller), root regression 89 passed/21 external-store skips/0 failed. Source dry-run and unsigned VSIX/archive/fingerprint checks passed. Host Node 25.9.0/npm 11.12.1 used; no Node 24 rerun or full upstream compilation claimed. [Verification](evidence/M21/verification.json), [focused log](evidence/M21/focused-tests.log), [regression](evidence/M21/node-tests.log), [manifest](evidence/M21/artifact-manifest.json), [Connect guide](docs/cline-connect.md), [official source provenance](evidence/M21/upstream-source.json).
- M21 remains **In Progress**. Computer Use policy requires action-time confirmation for running the new unsigned local packages and granting server control. A single bounded confirmation request covers the isolated native test, synthetic loopback sign-in, test credential storage, prompts-only consent, two harmless server prompts and final disconnection. Native Cline acceptance is not inferred from fixtures. First concrete next action: after approval, launch the prepared revision 3 directories, run the initial Connect prompt and graphical first-use pairing, save both native/server traces, verify idempotency and disconnect, then update completion if all criteria pass. M22 has not started.

- Checkpoint cleanup at 2026-10-07 09:10 +06:00: the developer loopback native fixture was prepared successfully, then stopped before any native connection/prompt; its isolated schema removed and disposable PostgreSQL service stopped. M19/M20 independent evidence validators still pass. No new M21 software was executed in an application. Restart the bounded fixture after approval; the prior ephemeral URL is historical and must not be reused.

- Developer fixture cleanup correction at 2026-10-07 09:12 +06:00: initial signal handlers were below the long-running wait, so interruption exited before cleanup. Removed only the exact recorded M21-owned schema, moved handlers before the wait, and verified a fresh bounded fixture reaches readiness, exits 0 on SIGTERM, and removes its schema. [Cleanup evidence](evidence/M21/cleanup.log). The disposable PostgreSQL service is stopped; native package/pairing confirmation remains pending.


### M21-DONE-001 — Native prompt-triggered Connect complete

**Recorded:** 2026-10-07 19:21 +06:00 (Asia/Dhaka). **Status:** Done for adopted local VS Code/Cline 4.1.22 `sdc-m21.3` (extension 4.1.2203), app-owned API 1.2 and companion 0.3.0. Actual agent model/effort: Unrecorded. Requirements §9.3 and the M21 pass criteria satisfied; M22 remains Not started.

#### Native walkthrough and evidence

The user’s instruction to finish the remaining tasks confirmed the previously prepared action-time scope: unsigned development packages in `/private/tmp/sdc-m19-vscode-probe`, synthetic loopback sign-in, test SecretStorage credentials, prompts-only local consent, two harmless server prompts and disconnect. Closed the disconnected prior host and launched the two M21 development directories. Stock Cline and the normal LogGraph window were preserved.

Reopened existing native task `1791311237025_zxtup`, configured profile `default` through the GUI for the fresh disposable server origin with only prompts selected, and started the bounded acceptance capture. Submitted exactly “Connect to my server and follow its instructions” in the native composer. Cline’s SDK invoked `bridge_connect` with an out-of-band native tool-call ID and the exact installation/host/window/workspace/task. Reviewed the exact task modal, completed synthetic browser sign-in and the validated extension URI callback, then independently confirmed the authenticated server pairing code and the local task/device consent. Browser and extension persistent callback allowances stayed unchecked. These are observed approvals, not evidence that an app-access Always allow setting was saved.

Connect returned `connected` for binding `dc7f3902-4c49-44e4-8f27-4874d5b725ea`, server session `db0971cb-7f68-4e9a-88d7-e68001c86bdc`. The native initiating turn `local:1791378763524` ended at `2026-10-07T13:14:56.026Z`. Only afterward did the real PostgreSQL/HTTP/SSE fixture enqueue two instructions. Native task output returned `M21-7a791b76-FIRST-OK`, then `M21-7a791b76-CONTINUITY-OK` for the follow-up whose input omitted the marker. Both addressed native turns completed. No composer input occurred between server turns.

Repeated **Connect Current Task to Server** for default returned “This exact server/task binding is already connected.” It opened no new pairing modal and added no listener state transition. **Disconnect** immediately showed disconnected locally; the server independently recorded the exact binding detached. Finished capture and copied the original file byte-for-byte to [native capture](evidence/M21/live-vscode.json). The [server trace](evidence/M21/server-live.json) independently records authenticated binding, initiating completion, queued commands, returned native events and detach. [UI observations](evidence/M21/native-observations.json) distinguish graphical observations from protocol proof.

#### Decisive failures and fixes

- Solar rejected the retained historical M19 image context. Used the previously approved free native MiMo-V2.6-Flash model for acceptance and restored Solar afterward; no replacement runtime was introduced.
- The synthetic identity page’s `form-action 'self'` CSP blocked the custom-scheme redirect. The initial bounded Connect timed out and failed closed without a binding. Preserved its [attempt capture](evidence/M21/attempt-01-native.json). Fixed only the developer identity fixture to show an explicit **Return to VS Code** link for its exact validated callback, then reran first-use pairing successfully. Production app packages and their hashes did not change.
- Transient stale/delayed Computer Use input and one closed pipe were resolved with fresh state and window/title-bar focus. The callback reached the intended development host. No normal-workspace prompt was submitted.

#### Verification and cleanup

| Check | Result | Evidence |
|---|---|---|
| Root build/lint | Passed across eight workspaces | [Build](evidence/M21/build.log), [lint](evidence/M21/lint.log) |
| Focused M19/M20/M21 tests with real disposable PostgreSQL | 39 passed, 0 failed, 0 skipped; native controller fixtures explicitly simulated | [Focused log](evidence/M21/focused-tests.log) |
| Root regression | 89 passed, 21 external-database skips, 0 failed; 110 total | [Regression](evidence/M21/node-tests.log) |
| Fixture syntax and focused Connect rerun | Passed syntax and 9 origin/cancellation/profile/redirect checks | [Verification](evidence/M21/verification.json) |
| Pinned source patch and unsigned packages | Dry-run/archive/fingerprint checks passed; full upstream compilation not run | [Source check](evidence/M21/source-patch-check.log), [manifest](evidence/M21/artifact-manifest.json) |
| Real native Connect journey | SDK origin, GUI first-use pairing, post-turn listener, two same-task server turns, continuity, repeat Connect and disconnect passed | [Native](evidence/M21/live-vscode.json), [server](evidence/M21/server-live.json), [observations](evidence/M21/native-observations.json) |
| Independent native/server validator | Passed; also matches returned server observations byte-for-byte canonically to native events and verifies completion/enqueue ordering | [Validation](evidence/M21/native-validation.log) |
| Final cleanup/fingerprints | Server exit 0, owned schema absent, PostgreSQL service stopped; native bridge disconnected, Solar restored, composer empty; stock and M21 archives unchanged; native copy byte-identical | [Cleanup](evidence/M21/cleanup.log), [artifact checks](evidence/M21/artifact-verification.log) |

Host Node 25.9.0/npm 11.12.1 were used; no Node 24 rerun is claimed. Native capture is from the exact loaded final M21 bundle hashes in the manifest. Original M19/M20 artifacts and acceptance records are preserved. No live OIDC realm, production deployment, signing/publication, full upstream build, Antigravity or remote-host acceptance is claimed. Native M20 scope remains whole-action once/deny; narrowed/persistent grants and revocation are unsupported. The native task and disposable history remain available for review. The test device credential is scoped to the now-removed synthetic fixture and kept outside model messages.

#### Handoff

M21 is closed; tracker register, entry index, handoff, Connect guide, extension README and DECISION-004 updated. M22’s complete native server approval/denial/question/stop/reconnect/local-takeover acceptance requires a new instruction. Codex M16 remains deferred by the user’s Cline-first priority. Ordinary operation is graphical; the fixture CLI is developer acceptance setup only. Preserve exact trusted origin, native authority/cancellation checks, consent categories and upgrade fingerprint gates.


### M22-CHECKPOINT-001 — Workflow acceptance started

**Recorded:** 2026-10-07. **Status:** In Progress. Actual agent model/effort: Unrecorded. User requested M22. Dependencies M13/M14/M21 exist; native acceptance remains required. Initial audit found that authenticated native binding registration omits UI capability metadata and does not advance the reported conversation revision after native prompt acceptance. Repair these seams, add regression checks and prepare a bounded real server/UI/native walkthrough for approval/denial, question, stop, reconnect and local takeover. Preserve original M19–M21 artifacts and traces. No M23 work is authorized.

### M22-DONE-001 — Native server workflow complete

**Recorded:** 2026-10-08 00:27 +06:00 (Asia/Dhaka). **Status:** Done for adopted local VS Code/Cline 4.1.22 `sdc-m21.3` (4.1.2203), app-owned API 1.2 and companion 0.4.0. Actual agent model/effort: Unrecorded. User approved the prepared isolated native run; dependencies M13/M14/M21 were complete. No M23 implementation started.

#### Journey and evidence

The isolated development host opened the project and existing task `1791311237025_zxtup`. The exact initial Connect phrase invoked the trusted-origin native SDK tool. Graphical first-use sign-in and independent pairing/local control review occurred; two calls exceeded the bounded 120-second lifetime and returned rejection. An explicit retry after cached sign-in succeeded; no automatic retry or persistent permission allowance is claimed. Its initiating turn completed before server input.

Through the real authenticated server GUI, first and follow-up turns returned marker `M22-76e77a9a` with retained context. Native Cline executed both in the same task while the extension listener remained active after completed turns. A single bounded SSE connection drop reconnected before subsequent input. The native model was free MiMo; no Cline CLI or provider replacement was used.

Two native editor actions waited at Cline's permission boundary. The server's signed allow_once decision created only the exact allowed marker file; its deny decision left the second file absent without retry. Real assertion-consume requests returned HTTP 200, native resolutions/approval.applied events and durable applied acknowledgements agree. Two lease renewals occurred beyond 20 seconds while approval remained pending. The blue clarification returned in the same native turn. Request stop targeted the observed waiting turn and produced acknowledged native abort/turn.cancelled evidence. A genuine local composer prompt invalidated the binding, disabled remote delivery and detached the server; its local reply completed visibly.

[Walkthrough](evidence/M22/walkthrough.md) links all prompt/native turn/output/request/decision/result IDs. [Independent validation](evidence/M22/native-validation.json) checked 524 native events, 519 server events, canonical matching shared observations, exact native origin/artifacts, action digests, signatures, all ten applied receipts and file effects. [Native capture](evidence/M22/live-vscode.json), [server trace](evidence/M22/server-live.json), [UI observations](evidence/M22/native-observations.json), [final server screenshot](evidence/M22/server-complete.jpg) and [native screenshot](evidence/M22/native-complete.jpg) preserve the result.

#### Failures and repairs

The first real attempt passed continuity/reconnect but approval consumption failed: a valid signed assertion exceeded the generic HTTP string limit, and approval code used restart recovery on a live applying dispatch. No file effect occurred; local Reject ended it. [Failed attempt evidence](evidence/M22/attempt-01/server-live.json) is preserved. The HTTP assertion field now uses its protocol limit; approval handling reads the exact durable attempt without mutating outer dispatch state. Real HTTP plus held-permit regression checks prove idempotent receipt return and one native effect.

Authenticated binding registration now saves validated delegated native capabilities. Native prompt/question events report conversation revisions; exact binding-fenced storage advances monotonically and replay does not advance twice. The UI reads fresh nested identity/revision. Remote approval resolutions emit their addressed applied receipt; local resolutions do not fabricate one. The UI always exposes Stop for active/waiting turns even after more than four alphabetically later terminal IDs, and recent terminal history follows observed output order. Passive capture drains takeover invalidation. M22 packaging reuses the frozen native pin and a separate companion; historical M21 packaging rejects current sources before mutation. These amend shared M11/M14/M20 seams without altering historical evidence claims.

#### Checks and cleanup

Root [build](evidence/M22/final-build.log) and [lint](evidence/M22/final-lint.log) passed. [Focused checks](evidence/M22/focused-tests.log): 42 passed, none skipped/failed. [Real approval repair checks](evidence/M22/repair-tests.log): 20 passed, none skipped/failed. [Root regression](evidence/M22/regression-tests.log): 95 passed, 20 older database suites skipped, zero failed, 115 total. [Browser checks](evidence/M22/final-browser-retry.log): three passed after fixing a test's obsolete intermediate-heading readiness race; initial failure log retained. [Swift checks](evidence/M22/swift-tests-retry.log): eight XCTest cases passed after retry with compiler-cache access; initial sandbox failure retained. Host Node 25.9.0/npm 11.12.1 used; a Node 24 rerun is not claimed. [Verification](evidence/M22/verification.json) records commands and limitations.

[Artifact verification](evidence/M22/artifact-verification.json) confirms unchanged installed stock Cline, historical M19–M21 archives, frozen native pin, current companion bundle and byte-identical capture. [Packaging guard](evidence/M22/packaging-guard.log) rejects the current version before touching M21 artifacts. [Cleanup](evidence/M22/cleanup.json) confirms Solar restored, empty composer, disconnected bridge, detached server binding, five test tabs closed, fixture exit 0, owned schema absent, both listeners closed and database stopped. The disposable history and allowed marker remain; denied file absent.

#### Handoff

M22 closes the complete main graphical journey for this adopted local pin. [Workflow guide](docs/cline-workflow.md), extension README, Connect guide, decision addendum, register and handoff are updated. Stock Cline, Antigravity/remote hosts, production OIDC, narrowed/persistent grants/revocation, systematic crash/race acceptance (M23) and signing/distribution (M24) remain outside this proof. PNG acceptance remains original M19 evidence. M16 stays deferred; M23 requires a new instruction and its open M18 dependency must be considered explicitly.

### RELEASE-SCOPE-001 — Cline-only first release plan

**Recorded:** 2026-10-08 00:38 +06:00 (Asia/Dhaka). **Actual model/effort:** Unrecorded. **Decision:** the user requested a first final version containing the Cline plugin only, with Codex M16/M17/M18 deferred, and a plan that can proceed through M23–M26.

M16 changes from In Progress to Deferred at its existing route gate; M17/M18 change from Not started to Deferred. Their work/evidence/specifications remain, and no completion is claimed. Explicit user resumption with a viable app-owned route is required. The tracker now supports Deferred only for an explicit scope decision; blocked required work remains In Progress.

The active release path is M23 (shared/Cline hardening, depends on M06/M07/M10/M11/M13/M22) → M24 (reviewed Cline VSIX pair and required server HTTPS/identity deployment) → M25 (verified Cline/server guide and handoff) → M26 (frozen Cline release conformance/soak). Removed M18 from M23 and Codex workflows from M26. The standalone Codex/macOS companion installer is not required; existing shared/Swift modules and history remain preserved. All Cline/shared reliability, permissions, attachment, resource-limit, real deployment and measured performance gates remain. Exact supported versions/platform must be declared; no new host support is inferred.

[DECISION-008](docs/decisions/008-cline-first-release.md) governs this scope. Requirements become specification 2.2 while wire protocol remains 2.0; FR-18 now targets GUI Cline acceptance, with Codex explicitly deferred. Register, detailed boundaries, requirement coverage, current handoff, README/AGENTS and distribution decisions are synchronized. First-release accounting: 23 in scope, 19 Done, 4 Not started, 3 Deferred in the 26-row register. Historical entries (including prior M18 dependency notes) remain historical and are superseded for future release work by this amendment.

**Verification:** documentation-only plan change; dependency/status/coverage/link checks recorded in [scope validation](evidence/planning/cline-first-release/validation.json). No runtime behavior, wire schema, artifact, credentials or permissions changed; no build/native acceptance rerun is required for this edit. M23–M26 remain Not started. This instruction updates the plan; it does not start implementation or authorize publication/deployment to an unspecified destination.

### M23-CHECKPOINT-001 — Cline hardening started

**Recorded:** 2026-10-08 00:48 +06:00 (Asia/Dhaka). **Status:** In Progress. Actual model/effort: Unrecorded. User requested M23 for Cline. Dependencies M06/M07/M10/M11/M13/M22 and their tests/evidence exist; DECISION-008 excludes Codex M16–M18. Audit shared durable dispatch/output/leases/authorization and Cline task/native request/Connect lifecycle; fault-inject crash, partition, cursor, duplicate/stale/spoofed request, isolation, flood and resource exhaustion scenarios. Define limits and fix discovered violations in their owning modules. Native pending-approval disconnect/reload and local takeover spot checks remain required; fixtures alone cannot close those gates. Preserve historical packages and stop before M24.

**Hardening checkpoint:** implemented retained-record and queue budgets, SQLite page exhaustion recovery, concurrent PostgreSQL/attachment admission, expired staging/orphan cleanup, stale-batch and producer-gap fences, fatal output rejection, Connect cancellation/callback cleanup and actual reviewed Cline bundle hash checks. Added `tests/conformance/`, [limits and recovery guidance](docs/cline-hardening.md), and companion 0.5.0 with passive M23 capture. Retained history is never silently evicted; unknown native effects require reconciliation. PostgreSQL byte admission counts the stored JSONB representation, including its formatting overhead.

The clean Node 24.21.0/npm 11.19.0 build, type checks and full suite pass: 139 passed, 0 failed, one Docker restore test skipped and separately passed. Control UI checks pass (three); M19–M22 evidence validators pass with historical package fingerprints preserved. [Verification](evidence/M23/verification.json) and the [acceptance matrix](evidence/M23/README.md) distinguish real storage/HTTP tests from native fixtures and the open native gate. No M26 latency or soak claim is made.

The user approved the isolated companion 0.5.0 native run. Computer Use verified READY and started passive recording with the matching loaded bundle. No native binding or pending-approval failure scenario was accepted in that attempt. Delayed input, stale screenshots and mismatched UI observations prevented safe setup; the user requested a probe restart. Original partial evidence is preserved in `evidence/M23/attempt-01/`. The restarted probe is disconnected and graphical setup remains pending. Automatic review rejected generic VS Code attachments that could select unrelated LogGraph; subsequent access used the existing approved probe handle. M23 remains In Progress until actual pending approval across disconnect/reload and local decision/takeover are evidenced and cleanup verified.


### M23-DONE-001 — Cline hardening complete

**Recorded:** 2026-10-08 03:07 +06:00 (Asia/Dhaka). **Status:** Done for shared hardening and adopted local Cline 4.1.2203 / API 1.2 with companion 0.5.0. Actual model/effort: Unrecorded. The native package remains byte-identical to M21. No M24 implementation or publication occurred.

The hardened implementation bounds durable records, retained history, pending lanes, SQLite pages and attachment reservations without evicting unresolved receipts. Crash recovery preserves queued work and marks uncertain effects for reconciliation. Stale prompt batches, native producer gaps and fatal output rejection stop unsafe delivery. Connect cancellation and late callbacks cannot establish a binding after disable; actual vendor/addon hash checks reject changed or unsupported packages. The native run also exposed misleading offline-owner wording, repaired and verified in four browser checks. Limits, retention and operator recovery are documented in [cline-hardening.md](docs/cline-hardening.md).

Clean Node 24.21.0/npm 11.19.0 build/type checks and all root suites passed: 139 passed, 0 failed, one Docker restore check skipped and independently passed. Four control UI checks passed. Real PostgreSQL quotas include exact stored JSONB byte accounting. SIGKILL/SQLite-full, output backlog, ownership/authorization/decision races and lifecycle fault checks remain labeled according to real storage versus mocked native dependencies. Original M19–M22 validators and VSIX/installed stock hashes remain preserved.

The user approved the bounded native run and performed GUI setup and boundary actions because Computer Use returned delayed input/stale screenshots. Two malformed MiMo calls were rejected; the three valid Solar editor calls used correct `path` arguments. Disconnect detached its binding with approval pending and disabled a prepared stale remote choice. Reload started the host disconnected; its previous server lease expired without renewal, the old pending task stayed unresumed, and a new host/task required explicit Connect. Local Reject in the new task resolved the addressed request elsewhere and removed the prepared remote choice; a subsequent local prompt invalidated the binding. All three marker files remained absent. No remote approval decision submission or assertion consumption is claimed by these native failure checks.

[Independent native validation](evidence/M23/native-validation.json) links 504 native events and 498 server events, exact command/turn/request IDs, native callbacks, action digests, host/task changes and lifecycle states. Pre-reload recording is intentionally preserved as a checkpoint; the post-reload capture finished. Computer Use verified LOCAL-OK, capture saved, Solar restored and bridge disconnected in the final native state. [Cleanup](evidence/M23/cleanup.json) confirms the disposable schema and both listeners are gone, PostgreSQL stopped, browser tab closed and files absent. Automatic review rejected generic app attachments that could expose unrelated LogGraph; no such rejection was bypassed.

[Verification](evidence/M23/verification.json) records the exact limits of proof: synthetic loopback identity, unsigned development artifacts, local VS Code only, whole-action once/deny, and fixture coverage for process crashes/concurrent races. Native fixture capacity was not exercised; the final JSONB correction passed final real database suites. M24 production deployment/distribution and M26 measured latency/soak remain required. First-release progress is 20 of 23 Done; Codex M16–M18 remain Deferred.

**Final M23 UI verification:** corrected the session-list online dot to require an unexpired lease after reviewing the final native screenshot. Native/server permission behavior is unchanged. The final UI build, Node 24 type check and four browser checks pass, including active-but-expired and detached owners. Existing native screenshots remain preserved as historical proof; no native binary changed.


### PUBLIC-API-SCOPE-001 — Public API research and release plan

**Recorded:** 2026-10-08 07:51 +06:00 (Asia/Dhaka). **Kind:** requirements/research amendment only. Actual model/effort: Unrecorded. The user adds FastAPI REST plus OpenAI/Anthropic-compatible profiles for future desktop and coding clients, then explicitly instructs us to research/document/append the plan rather than implement now. No milestone is started.

[Research](docs/feasibility/public-api.md) traces the current GUI HTTP submit, durable command receipts, native task/revision/input echo, output projection and native API 1.2 gaps. Official provider, FastAPI and HTTP/SSE sources distinguish a native task controller from a stateless/tool-calling provider contract. History/instructions, external tool ownership, token caps/usage/counting and mutable stream output are explicit required semantic gates. Endpoint shapes are targets, not claims of implemented compatibility. A named preferred coding-client target is not yet selected; implementation must freeze tested clients/profiles before acceptance.

[DECISION-009](docs/decisions/009-fastapi-public-api.md) selects client → FastAPI → existing server → VS Code companion → Cline. Server transactions/authority remain the source of truth; no direct gateway database/app access or new LLM runtime. Requirements become 2.3, wire remains 2.0 pending review, and FR-19–FR-28 are appended without changing prior IDs. Append M27 FastAPI/native gate, M28 OpenAI, M29 Anthropic and M30 real API/native/client acceptance. All are Not started. Schedule M27 → M28 → M29 → M30 → M24 → M25 → M26; M24 now consumes M30 and includes gateway deployment, M25 API/client guides, M26 FR-01–FR-28 final verification. Codex and standalone macOS distribution remain deferred; no new desktop frontend is required. Counts: 20 Done / seven Not started / three Deferred, 27 in scope / 30 tracked.

**Verification:** [documentation validation](evidence/planning/public-api-release/validation.json) checks register/dependency DAG and explicit execution order, requirement IDs/coverage, local links, release gates and unchanged source/config/test fingerprints. No runtime, SDK, native app, database or deployment tests were run for this documentation-only change. Existing M23 evidence/packages and implementation are preserved. No gateway folder, Python dependencies, code/migrations, app permissions, native pin, credentials or publication were introduced. Subsequent implementation requires a new user instruction; next is M27.


### M27-CHECKPOINT-001 — Public API implementation started

**Recorded:** 2026-10-08 08:00 +06:00 (Asia/Dhaka). **Status:** In Progress. Actual model/effort: Unrecorded. User explicitly requested M27 implementation. M23 prerequisite artifacts and verification exist. Implement only M27.1 native contract review, M27.2 durable server operations/scoped credentials, and M27.3 first-party FastAPI validation/relay. M28–M30 remain Not started. Existing Cline API 1.2 lacks caller tools, per-request privileged instructions, generation caps and attributed token metadata; required provider-native gaps remain blockers until a reviewed app-owned expansion and fresh native acceptance. Preserve all frozen native packages. No public deployment or new LLM runtime.


### M27-CHECKPOINT-002 — First-party REST implemented, native gate open

**Recorded:** 2026-10-08 08:54 +06:00 (Asia/Dhaka). **Status:** In Progress. Actual model/effort: Unrecorded. No Git commit: this checkout has no Git metadata. This is a partial M27 implementation, not a completed milestone. M28–M30/M24–M26 remain Not started, M16–M18 Deferred and M23 Done for its recorded pin.

**Delivered:** [typed FastAPI facade](api-gateway/README.md), [27-path OpenAPI](api-gateway/openapi.json), [first-party REST/desktop consumer contract](docs/public-rest-api.md), [server-owned operations](server/src/public-api/index.ts) and [internal HTTP](server/src/public-api/http.ts), [migration/guarded unused rollback](server/migrations/008_public_operations.sql), [field matrix](evidence/M27/native-field-matrix.json) and [native source review](evidence/M27/native-gate-review.json). Server transactions own original idempotency identity, request fingerprints, consistent terminal-watermark results, acknowledgement-based rejected/uncertain settlement, durable one-outstanding admission across public/GUI/low-level ingress, hashed expiring scoped keys bound to native consent, live revocation and rate buckets. Controls retain exact native request/action/revision/expiry and recorded/applied separation; upload/commit preserves ownership/checksum/current PNG/JPEG metadata. Gateway has no database/native/model executor, automatic POST retry or provider routes. Resource bounds and independent control capacity are documented.

Dispatch now names its original command and holds credential/binding/session authority through a maximum ten-second permit, bounded by earlier lease/key expiry. Binding-before-session lock order is tested for dispatch and credential issuance; server approval lock order matches ingestion. Old companions are explicitly rejected for public-enabled sessions. Optional opaque `OutputItem.nativeCategory` preserves observation only; [wire review](docs/protocol-v2.md) requires coordinated updated closed-schema consumers. Built a separate unsigned companion **0.6.0** candidate using the frozen Cline `sdc-m21.3` native package. It is **not installed/adopted/native-tested** and does not resolve provider semantics. Original M19–M23 source/package fingerprints and evidence validators pass.

**Verification:** [evidence manifest](evidence/M27/verification.json) records exact commands, versions, hashes and limits. Node 24.21.0/npm 11.19.0: `npm ci`, `npm run build`, `npm run lint`, `M27_TEST_DATABASE_URL=<disposable compose URL> npm run test:m27` (**14 passed**) and `npm test` with M06/M08/M09/M10/M11/M14/M15/M21/M22/M23/M27 URLs enabled (**154 tests, 153 passed, zero failed, one Docker restore skip**). `M06_TEST_DATABASE_URL=<same URL> M06_TEST_DOCKER_RESTART=1 M06_TEST_DOCKER_RESTORE=1 npm run test:m06` separately passes storage/restart and dump/restore. Python 3.13.16 locked environment: from `api-gateway/`, `M27_TEST_DATABASE_URL=<same URL> python -m pytest -q` (**ten passed**), including two gateway instances → real TypeScript HTTP → PostgreSQL, wait/retry/restart/scopes, concrete response model validation and real Uvicorn TCP SSE replay/flushing/live revocation. Synthetic provider/capability/native events remain explicit. `swift test --package-path companion` (**eight passed**). Package generation plus `node scripts/verify-m{19,20,21,22,23}-evidence.mjs` pass. The checks do not establish live identity, real new-companion/native/provider/client support or production deployment.

**Failures and corrections:** Real TCP testing found HTTPX fixed-size chunk aggregation withheld small SSE frames; complete frames now flush as received. Live auth withdrawal can resolve at authentication (401) or authorization (403); tests assert both legitimate boundaries and closure. An earlier migration edit encountered the expected checksum guard in the disposable default schema; only that named disposable test schema was reset, never checksum records or user state. Lock-order review corrected credential/dispatch/approval admission. Swift's sandbox compiler-cache write was unavailable; the authorized host check passed. A root-working-directory Python test invocation could not import the gateway package; the documented gateway-directory invocation passed. Final logs contain successful reruns, with these prior failures preserved here.

**Required blocker / exact next work:** [native gate](docs/native-public-api-gate.md) records API 1.2's absent caller history isolation/reconciliation, per-request privileged instructions, caller-owned structured tool calls/results, model-specific generation caps, attributed token usage and truthful counting, plus unqualified stable provider streaming/final categories. Cached SDK hooks/history/options are candidate seams only. No required native expansion was implemented/adopted/tested. Implement/review that app-owned expansion with explicit graphical task/profile consent, separate native fingerprints/adoption and fresh changed-seam/affected M23 acceptance. Reject unsupported options before admission meanwhile. These required blockers keep **M27 In Progress**; they are not a scope exclusion or a passed negative gate. Do not start M28/M29 or claim release/client compatibility from this first-party fixture checkpoint.

**Cleanup:** Disposable gateway/server listeners and isolated test schemas are closed/dropped; the compose PostgreSQL service is stopped. [Cleanup evidence](evidence/M27/cleanup.json) records the final check. No stock/native installation, app permissions, local grant, user model selection or publication changed.

### M27-M28-RESEARCH-001 — Native semantics and OpenAI execution plan

**Recorded:** 2026-10-08 09:19 +06:00 (Asia/Dhaka). **Kind:** user-requested deep source research and implementation planning only. Actual model/effort: Unrecorded. The user has no preferred coding client and requested a recommendation from source evidence. M27 remains **In Progress**, M28–M30/M24–M26 Not started, M16–M18 Deferred; M23 remains Done for its recorded pin.

**Delivered:** [source report](docs/feasibility/m27-m28-native-openai.md), [ordered execution plan](docs/feasibility/m27-m28-execution-plan.md) and [research evidence](evidence/planning/m27-m28/README.md). Reviewed 42 unique pinned Cline source files, 18 released Roo/Continue source files, candidate official SDK release documentation/transport source and current official OpenAI contracts. Fresh Cline `v4.1.22` resolves to commit `f58bc118bdeef1bd2813cd08e00d98bdcda96475`, actual tree `fda0e03f5759b4a526e85886b9cdacd503b9f486`; three old candidate files match fresh tagged bytes. The historical `cachedTreeSha` denotes the commit, not the actual Git tree. Historical evidence is preserved; source provenance does not prove adopted bundle/native capabilities.

**Findings / recommendation:** implement a graphically consented single-generation policy within the existing app-owned Cline session, owned immutable API contexts, structured caller-tool yield/results, required native parameters and attributed usage/count/finish metadata. Current iteration limits/stop hooks do not yield caller tools; the OpenAI OAuth adapter omits explicit caps; counting is heuristic and legacy usage/finish projections need richer provenance. Roo Code v3.54.0 is the primary Chat candidate: its common helper requires `strict:true` for ordinary function tools, making actual native strict-tool enforcement a gate for stock-client qualification, and its request path leaves SDC retry-key integration unresolved. A maintained caller patch is a separate declared profile. Continue v2.0.0-vscode is secondary Chat because its released adapter restricts Responses routing to the official OpenAI base URL. Proposed official SDK test pins Node 7.30.0/Python 3.26.0 are research candidates, not installed dependencies. Responses retention/background/cancellation, omitted-strict defaults and provider replay are explicit plan decisions; required unsupported behavior is not waived.

**Verification / limits:** [documentation validation](evidence/planning/m27-m28/validation.json) checks local links, preserved milestone statuses/counts/dependencies, source hashes/cache comparisons, unchanged 151 runtime/config/test/lock/contract fingerprints and 171 historical evidence/VSIX fingerprints. No runtime/native/client/integration tests, model calls, dependency installation, app permission/settings changes, native adoption or deployment occurred. The plan estimates effort conditionally and records unresolved model/auth/counting/strict/retry feasibility; it does not claim native support or release compatibility.

**Next concrete action:** M27-N1 bounded native spike on the recorded upstream source, then reviewed native contract/implementation, durable server context/results, first-party gateway updates and separate adoption/real changed-seam/affected M23 acceptance. M28 begins only after M27 passes and a new implementation instruction. Full public-route/named-client acceptance remains M30.


### SERVER-API-OWNERSHIP-001 — Server-owned semantics and backend independence

**Recorded:** 2026-10-08 19:18 +06:00 (Asia/Dhaka). **Kind:** explicit user architectural/scope amendment. Actual model/effort: Unrecorded. The user directs public history/instructions/caller tools/model aliases/budgets into our server, keeping Cline as its present I/O backend and allowing future neutral adapters. Server-defined names and assumed token budgets are expressly permitted. No new native/runtime implementation is requested by this clarification.

**Changes:** [DECISION-010](docs/decisions/010-server-owned-api-semantics.md), requirements 2.4, AGENTS guidance and the [active execution plan](docs/feasibility/server-owned-api-plan.md) replace blanket native SDK generation/tokenizer/strict-decoding requirements with server policy and real backend connection acceptance. Server-managed tool envelopes/schema validation are planned; estimated usage/counts must have source/version/scope labels; public quota termination must remain distinct from actual native stop/generation/billing. Keep real authority/context isolation/tool-effect/retry/permission gates. Previous research/plans/native field matrices remain historical; no previously unimplemented capability is claimed as delivered.

**Status/verification:** M27 In Progress; M28–M30/M24–M26 Not started; M16–M18 Deferred; M23 Done for its pin. [Documentation validation](evidence/planning/server-owned-api/validation.json) checks requirement IDs, statuses/dependencies/links and preserved runtime/locks/native artifacts. Requirements are intentionally amended; no runtime, dependencies, credentials, app/native adoption, model calls or tests are changed/run. Full client/public/native qualification remains M30.

**Next:** finish M27 common server-policy contract/state/tool/budget/result work and current connection acceptance. Start M28 only after M27 completion and a new implementation instruction. The current first-party checkpoint remains scoped to its recorded shared-task/synthetic-native evidence.


### M27-SERVER-POLICY-001 — Server-owned policies implemented; native acceptance pending

**Recorded:** 2026-10-08 20:07 +06:00 (Asia/Dhaka). **Status:** M27 In Progress; M28 Not started. Actual model/effort: Unrecorded. The user authorized sequential completion of M27 and M28; downstream implementation starts after actual M27 acceptance, without another implementation permission request. No Git metadata is present, so no commit is possible.

**Delivered:** [neutral composition/tool/accounting policy](server/src/public-api/policy.ts), [durable conversation/history/result service](server/src/public-api/conversations.ts), [migration 009 and guarded rollback](server/migrations/009_public_conversations.sql), first-party generation/conversation/cancel HTTP routes and typed 31-path OpenAPI. Admission joins canonical history, immutable caller results, original native command and response identity in the existing server transaction. Exclusive routes reject cross-caller histories and rewinds; full-history consumers can continue owned context without backend identifiers. Caller-tool publication uses actual reply/schema/selection validation on qualified bindings; the default current Cline profile withholds that feature until reviewed permission/effect evidence exists. Versioned estimated usage, Unicode quotas, durable deadline/queued-cancel intent and live-authority reconciliation distinguish public commitment from native settlement. Schema compilation is bounded and does not retain arbitrary caller schemas globally. No executor/provider SDK/native artifact changes were added.

**Verification:** [server-owned evidence](evidence/M27/server-owned/README.md). Root build/lint pass; 162 root tests pass with zero skips including isolated PostgreSQL dump/restore; 22 focused M27 tests and 11 Python gateway checks pass. Tests include concurrent original retries, cross-caller ownership/history isolation, native revision conflicts, immutable calls/results, quota/cancel races, crash rollback, revoked-key reconciliation and real gateway/HTTP/PostgreSQL routes. Native outputs in automated fixtures remain explicitly simulated. Historical M19–M23 evidence validators pass; those results do not close this new native gate. Swift source is unchanged and was not retested in this run.

**Open gate:** The user approved a disposable graphical native grant to `http://127.0.0.1:59318` with prompts/questions/approvals/cancel in `/private/tmp/sdc-m19-vscode-probe`. The reviewed Cline pin and companion 0.6.0 candidate were launched in a development host; `m27-local` was saved. UI automation returned inconsistent AX/screenshot state, invalid-element/missing-window errors and inactive computer-use errors. A graphical setup handoff is pending. The fixture reports zero bindings and no new native results; neither native acceptance nor M27/M28 completion is claimed. [Native fixture](scripts/m27-native-server.mjs) and [bounded FastAPI native client](scripts/verify-m27-public-native.mjs) are prepared. Required native allow/deny/question/cancel, media, authority/race/recovery and caller-tool permission qualification remain to be recorded before final closure.

**Connection repair amendment (2026-10-08):** Subsequent user graphical setup registered one binding and admitted the first public generation, which the native bridge rejected with `Task is busy, unavailable, or conversation revision changed` (command `aa435046-2d55-48bf-924e-f4fe2e45cfa9`, expected revision 3). VS Code still displayed `Resume Task`. The original fixture then exited and dropped its disposable schema, causing the reported reconnect loop. The failure is preserved in `evidence/M27/server-owned-run/`; it is not passed native acceptance. The native fixture now retains the server and complete command/event/acknowledgement diagnostics after an assertion failure; `node --check scripts/m27-native-server.mjs` passes. A fresh fixture listens on the same approved loopback port, recording separately in `evidence/M27/reconnect-repair-run/`. The old device credential cannot authenticate to the fresh disposable schema; resume the selected task and graphically pair a fresh local profile to the same origin. UI actions again returned no observable changes; manual graphical repair remains necessary. M27 stays In Progress and M28 Not started.


### M27-DONE-001 — Server-owned REST and native connection complete

**Completed:** 2026-10-08 21:31 +06:00 (Asia/Dhaka). **Actual model/effort:** Unrecorded / Unrecorded. **Authority:** user-approved server-owned M27 → M28 sequence, DECISION-010.

The TypeScript server owns durable conversations/history/lineage, current instruction composition, actual caller-tool envelope/schema/call-result validation, service aliases, versioned estimates and quotas. FastAPI supplies authenticated first-party REST/SSE/OpenAPI over it. Gateway database/native/model bypasses were not added. Unsupported true model controls remain rejected. Terminal results preserve native category and completion evidence; public output-budget termination remains distinct from native settlement.

Real scoped public gateway → server → adopted Cline acceptance passed text/history, original-key retries, revocation, native blue question, exact signed editor allow/deny effects and addressed SDK abort/cancel. A real process restart retained the same credential, generation ID and immutable result. The committed PNG reached Cline with exact checksum and MiMo completed the image reply. Local question resolution, pending Disconnect and window Reload caused stale remote controls to fail without new native commands. App-owned capture proved companion 0.6.0 and unchanged native API 1.2 bundle hashes. The [native validator](evidence/M27/restart-media-run/native-validation.json) checked 4,392 events and digest/signature/control linkage. Original failed fixture, ambiguous prompt, wrong test status expectation, unresumed-task rejection, recovery admission timing and Solar image failure remain preserved, not counted as passes.

**Passed:** Node 24 build/lint; 163 root tests with no failures/skips including dump/restore; 23 focused M27 checks; 11 FastAPI checks; `node scripts/verify-m27-evidence.mjs`. Exact logs/hashes are in [fresh verification](evidence/M27/restart-media-run/verification.json) and [walkthrough](evidence/M27/restart-media-run/README.md). DB tests use the documented disposable PostgreSQL service. Swift is unchanged and was not rerun.

**Declared limits:** estimated usage/output quotas are not native billing/generated-token limits; shared-task semantics do not erase native hidden context. Caller-tool native safety is unqualified, so the profile is withheld and an actual request returned 422 before dispatch. DECISION-010 explicitly permits that withholding; caller-tool native execution/client compatibility is not claimed. This completes the advertised M27 contract, not every FR-26/client configuration. Identity is synthetic, packages unsigned and host disposable. Production realm, installed distribution, named clients, M29/M30 and M24–M26 remain separate. After reload the native task is left paused as requested; no replacement native action is issued. M28 is explicitly authorized next.


### M28-CHECKPOINT-001 — OpenAI profile implementation started

**Started:** 2026-10-08 21:33 +06:00 (Asia/Dhaka). **Actual model/effort:** Unrecorded / Unrecorded. M27 completion and explicit sequence authorization verified. OpenAI official schemas freshly retrieved for Chat completions, Responses lifecycle/streams/background and current-instruction lineage. Implement provider normalization/encoders in FastAPI over server-owned policies; expose durable neutral request parameters for correct Responses retrieval. Exact SDK candidate releases will be registry-verified and locked as test consumers only. No provider/model execution or new native adoption. M28 remains In Progress until pinned SDK and real server/gateway checks pass; M30 still owns named-client/native qualification.


### M28-DONE-001 — OpenAI profile and official SDK verification complete

**Completed:** 2026-10-08 22:16 +06:00. **Actual model/effort:** Unrecorded / Unrecorded. **Authority:** user's explicit M27 → M28 implementation sequence; prerequisite M27 real connection gate passed. No Git metadata is present, so no commit was possible.

**Delivered:** FastAPI `/openai/v1` model discovery, Chat sync/SSE and Responses create/current instructions/lineage/retrieve/background/cancel. Provider fields stay in gateway normalization/encoders; the neutral server exposes persisted request policy parameters for retrieval after gateway restart. Stable service/response/call IDs, committed terminal-buffered text/functions, typed OpenAPI JSON/error shapes, estimates/provenance, usage/finish/error events, local retention and replay are documented in the [profile contract](docs/openai-api-profile.md). Unsupported options are rejected before dispatch. Original idempotency keys, server-owned state, scoped authority, actual native binding selection and native execution ownership are preserved.

**Verification:** Node 24.21.0/npm 11.19.0 locked installation/build/lint pass. All **163 root tests pass, zero failed/skipped**, including real isolated PostgreSQL/HTTP, inherited M23 and dump/restore. Actual database restart/dump-restore passes separately. **34 gateway checks pass**, using Python 3.13.16, official Python openai **3.26.0** and Node openai **7.30.0**, exact npm/uv pins; uv locked graph check passes. **8 Swift companion tests pass**. M27 actual native evidence validator passes again (4,392 events). See [verification and hashes](evidence/M28/verification.json), [commands](evidence/M28/commands.json), [source review](evidence/M28/sources.json) and [walkthrough](evidence/M28/README.md).

Real server/gateway/database state with explicitly scripted native events proves Chat/Responses sync and SDK accumulators, tool proposals/results/schema failures, original-key retries including a lost response after committed admission (two admissions, one generation/command), scoped histories/current instructions/rewind and branch refusal, new-gateway retrieval, Unicode quotas, failed/incomplete/cancelled events, replay cursors, expiry tombstones, credential revocation during streams and shared normal/control capacity. Node SDK runs through a real Uvicorn TCP listener. A Python SDK helper only returns completed responses; incomplete events are kept truthful and consumed/retrieved directly. Initial helper expectation, incorrect fixture expiry column, and a parallel-run database restart collision are preserved as failed probes; corrected checks pass.

**Limits:** estimates and delivered-output quotas are not native provider billing/generated-token caps; shared-task mode exposes its hidden-context limitation. Actual Cline caller-tool effect safety remains unqualified and its tool profile stays withheld before dispatch; tool round trips use a qualified simulation binding. M28 is the declared tested OpenAI-shaped SDC profile, not full vendor schema parity or named coding-client/native tool qualification. M30 owns that acceptance after M29. Production identity, installed distribution, signing/deployment, guides and soak remain M24–M26. Native task remains paused after reload. Disposable listeners are closed; test schemas are dropped except the exact retained M27 forensic schema; the PostgreSQL service is stopped.

**Next:** M29 on a new implementation instruction, then M30 → M24 → M25 → M26. Do not automatically resume Codex or later milestones.


### M29-PLAN-001 — Anthropic server profile implementation plan

**Recorded:** 2026-10-08 22:34 +06:00 (Asia/Dhaka). **Kind:** user-requested detailed research/planning only. Actual model/effort: Unrecorded / Unrecorded. M27/M28 remain Done; M29/M30 and M24–M26 remain Not started. No runtime, dependency, native grant/adoption or deployment action is authorized or performed by this planning entry.

**Plan:** [Detailed M29 plan](docs/feasibility/m29-implementation-plan.md) freezes proposed `/anthropic/v1` discovery/Messages/counting routes and the SDK base `/anthropic`. It preserves server-owned histories/instructions/caller tools/budgets/estimates, scoped SDC keys, original retry identities and committed terminal-buffered output. Two owning-server additions are identified: an authenticated effect-free neutral input-count endpoint and backward-compatible caller-tool error outcome retention. The six work packages include specific files, header/field/outcome mappings, media/authority audit, typed JSON/SSE/errors, shared capacity, default SDK retries, exact evidence and M30 handoff. Rough implementation estimate 46–70 engineering hours, excluding M30 qualification and deployment.

**Source review:** Current official Anthropic Messages/counting/models/version/errors/streams/tool types and SDK documentation; registry candidates Node `@anthropic-ai/sdk` 0.132.1 and Python `anthropic` 1.12.1, to reverify and lock when implementation starts. [Sources/integrity metadata](evidence/planning/m29/sources.json). SDKs remain test consumers, never model executors. No candidate dependency was installed. The current native caller-tool profile remains withheld until qualification; no blanket native tokenizer/generation/decoder expansion is proposed.

**Validation:** [Planning validation](evidence/planning/m29/validation.json) checks M27/M28/M29 statuses, dependencies/requirements, local documentation links and unchanged runtime/source/test/manifests/locks against a captured baseline. Application tests were not rerun for this documentation-only request. No completion or native/client support is inferred from the plan.

**Next:** Start M29.1 on an explicit implementation instruction, then execute M29.2–M29.6 sequentially. M29 must pass its recorded gate before M30; preserve inherited M27/M28 acceptance and reopen any confirmed regression.


### M29-START-001 — Anthropic profile implementation started

**Recorded:** 2026-10-08. **Kind:** user-authorized implementation following the detailed plan. **Actual model/effort:** GPT-6.1 Sol / High. M27 and M28 remain Done; M29 is In Progress; M30 and M24–M26 remain Not started.

**Scope:** Execute the six sequential work packages in [the M29 plan](docs/feasibility/m29-implementation-plan.md): neutral server counting and tool-result status, FastAPI Anthropic profile and shared provider transport, exact pinned SDK test consumers, stateful acceptance, OpenAPI/evidence and handoff. No native app changes or M30 acceptance are included.

**Next:** Complete code, meaningful focused tests, inherited regressions, evidence and cleanup before marking M29 Done.

### M29-DONE-001 — Anthropic profile and server counting complete

**Recorded:** 2026-10-08. **Actual model/effort:** GPT-6.1 Sol / High. M29 is Done; M30 and M24–M26 remain Not started.

**Delivered:** Added `/anthropic/v1/models`, model retrieval, `/messages`, and `/messages/count_tokens`, plus the neutral first-party `/api/v1/input-counts` route. FastAPI owns Anthropic request normalization, typed response/error envelopes, SDC key/version policy, JSON Messages, terminal-buffered SSE, request IDs and shared relay capacity. The TypeScript server owns count composition/estimation, attachment ownership/session/MIME/expiry checks, and caller-tool result error status in the existing JSONB ledger. Historical successful string results remain readable; retries changing status conflict. No database migration was required.

**Validation:** [M29 verification evidence](evidence/M29/README.md), [machine-readable results](evidence/M29/verification.json), [commands](evidence/M29/commands.json), [locked sources and hashes](evidence/M29/sources.json), and [cleanup](evidence/M29/cleanup.json). Node 24 build/lint passed. Root suite: 164 passed, 0 failed, 1 PostgreSQL dump/restore test skipped because Docker restart/dump-restore was not enabled during the run. Gateway suite: 42 passed, 0 failed. Focused M29 server suite: 2 passed. Final focused Anthropic/OpenAPI gateway checks: 14 passed. The official Python SDK passed through a local TCP Uvicorn gateway to the PostgreSQL-backed TypeScript fixture for discovery, count, sync, streaming and original-key replay. The official Node SDK passed over TCP for discovery, count, sync and streaming. `uv sync --locked` passed; generated OpenAPI has 42 paths and matches the checked-in snapshot.

**Limits and handoff:** Test-native output is scripted; no native grants, Cline files or pins changed. Caller tools remain withheld on unqualified native bindings. Usage/counting are `sdc-text-v1` estimates, hidden shared-task context is unknown, and streaming is terminal-buffered. M29 does not claim full Anthropic parity or M30 named-client/native acceptance. M30 is the next milestone on a new instruction; M24 packaging/deployment follows M30.

### M29-REVIEW-001 — Post-completion Anthropic contract repair

**Recorded:** 2026-10-09 (time unrecorded). **Actual model/effort:** Unrecorded / Unrecorded. The user requested an M29 review and fixes before M30 planning. M29 remains Done; this amendment corrects its gateway contract without changing the server, Cline packages, native grants or milestone scope.

**Findings and fixes:** Malformed nested content and tool-choice values could escape normalization as internal errors; assistant text after a tool call could be silently reordered. Model listing returned `sdc-default` even when the owning server reported no authorized active alias, and declared single-alias pagination was absent. A malformed completed server result could be presented with fabricated zero usage. Midstream credential revocation was reported as a generic API error. The gateway now rejects malformed content, derives model visibility from the server, supports validated one-alias pagination, requires verified usage, preserves the SSE authentication error type, and publishes the associated OpenAPI header/query parameters. [Review evidence](evidence/M29/review-2026-10-09.json) records changed paths and hashes.

**Verification:** The full FastAPI suite passed **53/53** with no skips against the disposable PostgreSQL-backed TypeScript server and official Python/Node SDK loopback fixtures; OpenAPI snapshot equality passed. The PostgreSQL service was stopped and its loopback listener was absent afterward. TypeScript source was unchanged, so root build/lint/tests were not repeated. The prior M29 native-output simulation limit and M30 real-client gate remain unchanged.

### M30-PLAN-001 — Real API, native and client acceptance plan

**Recorded:** 2026-10-09 (time unrecorded). **Kind:** user-requested planning only. **Actual model/effort:** Unrecorded / Unrecorded. M27–M29 remain Done; M30 and M24–M26 remain Not started.

The [detailed M30 plan](docs/feasibility/m30-implementation-plan.md) orders exact pin/client freeze, per-request retry-key spike, targeted contract repair, first-party desktop journey, official SDK/provider native journey, named coding clients/caller-tool effect ownership, restart/authority/isolation races, OpenAPI and evidence closure. Aider and Continue are source-informed candidates for OpenAI Chat and Anthropic Messages; they are not yet accepted versions. Static custom-header configuration does not prove safe logical-request identity, and real Cline caller-tool effects remain unqualified. Those are explicit implementation gates, with a fail/repair path rather than a claimed pass.

### M30-START-001 — Public API, native and client acceptance started

**Started:** 2026-10-09 08:18 +06:00 (Asia/Dhaka). **Actual model/effort:** Unrecorded / Unrecorded. The user explicitly authorized M30 implementation. M27–M29 completion and the M29 review amendment are present; M30 is In Progress. Follow the ordered [M30 plan](docs/feasibility/m30-implementation-plan.md), beginning with exact installed pins and the client request-key gate. M24–M26 remain Not started. No real native or named-client M30 acceptance is inferred from earlier scripted fixtures.

### M30-CHECKPOINT-001 — Named-client wire spike and native connection gate

**Recorded:** 2026-10-09 (time unrecorded). **Status:** In Progress. Aider 0.86.2 is locked as the candidate for both OpenAI Chat and Anthropic Messages text profiles. The local entry point assigns a distinct request key to each submission and preserves it across Aider's retry loop. The disposable recorder observed both provider paths, two intentional identical submissions with different keys, same-key retry after injected 502, and the exact unsupported-option rejection at the live gateway. The official SDK and gateway/TypeScript regression suites listed in [M30 verification](evidence/M30/verification.json) passed. These establish a client wire candidate, not an accepted native coding client.

The approved isolated Cline task has Auto-approve set to None. The graphical profile at `http://127.0.0.1:59318` delegates prompts, questions, approvals and cancellation. A first native provider driver waited for a binding and failed its deadline with no binding or generation. A graphical Connect attempt using the older `m27-local` profile returned “Connection was not established”; the older profile may carry a credential from a previous disposable database. The newly configured `default` profile has a separate credential slot and is the next bounded pairing attempt. Preserve [the failed driver record](evidence/M30/native-run/provider-native-attempt-1.json) rather than claiming M30 native acceptance. First-party controls/media, provider SDK streams, real Aider edits, caller-tool effect ownership and isolation/restart races remain open. M24–M26 remain Not started.

### M30-CHECKPOINT-002 — Native provider and first-party acceptance

**Recorded:** 2026-10-09 19:46 +06:00 (Asia/Dhaka). **Status:** In Progress. The disposable `default` profile bound the exact installed Cline 4.1.22+sdc-m21.3 task through companion 0.6.0 to the TypeScript server and FastAPI gateway on loopback. The synthetic identity is not a live OIDC realm. With Auto-approve None, the [native provider run](evidence/M30/native-run/provider-native.json) passed first-party text and same-key retry, official OpenAI Node Chat, and official Anthropic Node Models/count/Messages. The [streaming run](evidence/M30/native-run/sdk-streams-native.json) passed OpenAI Chat/Responses retrieval and Anthropic Messages. The [checksummed PNG run](evidence/M30/native-run/image-native.json) reached the installed task through first-party, Chat, Responses and Messages, with native staging checksum observed. The [first-party run](evidence/M30/native-run/firstparty-native.json) passed session discovery, transcript/SSE replay, addressed question, signed one-time file allow, file deny with no effect, pending-turn cancellation and revoked-key rejection. These are real native-path results for the disposable pin, with server-declared estimates rather than native billing tokens.

The first [Aider native attempt](evidence/M30/native-run/aider-native-attempt-1.json) followed intentional cancellation. Cline rejected its next submit with “Task is busy, unavailable, or conversation revision changed”; Aider reused the original request key across bounded retries and produced no local edit. This ordering exposed a task-resume requirement after cancellation. The named client remains unaccepted until a local resume and fresh two-turn coding run pass, including zero native `tool` events for client-owned file effects. Real caller-tool proposal/effect qualification and M30 restart/isolation races also remain open. [Verification](evidence/M30/verification.json) records the exact checks and limits. M30 remains In Progress; M24–M26 remain Not started.

### M30-CHECKPOINT-003 — Named text clients and durable retry/isolation

**Recorded:** 2026-10-09 (Asia/Dhaka). **Status:** In Progress. The user resumed the disposable Cline task locally after the intentional cancellation; its `default` bridge remained online. [Aider 0.86.2](evidence/M30/native-run/aider-native.json) then passed two consecutive whole-file edits each through the OpenAI Chat and Anthropic Messages text profiles. Aider applied all four local edits with expected file hashes; the Cline task emitted no new native `tool` activity for those turns. This accepts only the pinned text/whole-file client subset, not caller tools or process-loss retry recovery. The original unresumed failure remains in the previous checkpoint.

The [real-boundary failure run](evidence/M30/native-run/failures-native.json) passed same-key/same-ID replay, changed-payload `409`, second-credential generation-ID denial (`404`), and two simultaneous provider-agnostic generation submissions on one native binding: one admitted (`202`), one blocked (`409`) then admitted after the winner settled. The [server restart run](evidence/M30/native-run/restart-native.json) retained the exact disposable schema and scoped key; an original-key retry kept its completed generation/operation ID with one native command record, and changed-payload reuse still conflicted. These prove completed-generation durability, not pending-turn recovery or independent native-task isolation. The [caller-tool spike](evidence/M30/native-run/tool-spike.json) produced one schema-shaped model-only proposal without observed native tool activity. It does not establish structural prevention of native effects, so `CALLER_TOOL_POLICY_UNQUALIFIED` remains the actual binding policy; no tool-using client/profile is accepted.

[M30 evidence](evidence/M30/README.md) and [verification](evidence/M30/verification.json) record exact passed subsets and unresolved gates. The unchanged-pin [M27 pending recovery evidence](evidence/M27/restart-media-run/native-recovery.json) already covers local resolution, disconnect and reload fences, but M30's plan called for M30-specific acceptance; no fresh M30 graphical race result is claimed. M30 remains In Progress under its existing gate, and M24–M26 remain Not started.

### M30-CHECKPOINT-004 — Exact native caller-tool denial candidate prepared

**Recorded:** 2026-10-10 (Asia/Dhaka). **Status:** In Progress. The accepted API 1.2 native binding still rejects caller tools. The M30 repair adds optional neutral `turn.submit.payload.nativeToolPolicy="deny"`, with server-created caller-function turns requesting it and old API 1.2 adapters refusing it. The exact API 1.3 Cline candidate now fences native approval and question callbacks for that addressed turn before the app executor, including settings that would auto-approve a read tool; the denial does not spill into a later local turn. The TypeScript server requires both an explicit operator allowlist and the binding's reported native-denial capability before admitting caller functions. It also fails closed without publishing caller calls if native `tool` activity appears in a completed proposal turn. Fixture-level caller-result/schema validation remains distinct from real native effect proof.

The [separate unsigned candidate packages](evidence/M30/artifact-manifest.json) are Cline 4.1.2204/API 1.3 and companion 0.7.0, with exact bundle hashes. Frozen M21/M27 native packages remain untouched. The source/coordinator test passes auto-approval denial, question denial, local-turn isolation and old-pin refusal. `npm ci --offline`, root build/lint, root smoke (115 passed/51 optional skips), focused M27 (24 passed), M29 (2 passed), affected M23 (93 passed) and gateway integration (53 passed) have passed on Node 24/npm 11 and disposable PostgreSQL, after correcting a root-directory pytest collection error and simulated M29/M28 capability fixtures. A fresh graphical install/consent, real candidate tool ownership and M30-specific recovery still remain before Done. [M30 verification](evidence/M30/verification.json) distinguishes source/fixture evidence from the earlier accepted native text results. M24–M26 remain Not started.

### M30-CHECKPOINT-005 — Caller-result denial and readiness repair

**Recorded:** 2026-10-10 (Asia/Dhaka). **Status:** In Progress. Review found that a caller-tool conversation could submit an addressed result with an empty current `tools` list and lose the native denial flag. The TypeScript server now carries `nativeToolPolicy="deny"` for every continuation whose canonical history contains caller calls/results, and the final publication guard fails such continuations closed if the native turn shows `tool` activity. The capabilities route reports `callerToolsReady` only while the exact qualified binding is active and its lease is unexpired. PostgreSQL tests verify the emitted command policy, continuation failure/no history commitment, and expired-lease reporting. The real candidate runner now requires an observed denied native tool attempt and `NATIVE_TOOL_ACTIVITY`, rather than accepting a prompt that merely abstains.

After these repairs, Node 24/npm 11 root build and lint passed; root smoke passed 115 with 53 optional database skips, M27 stateful suite passed 26/26, affected M23 passed 93/93, and gateway integration passed 53/53. The unsigned Cline 4.1.2204/API 1.3 candidate remains uninstalled; no real tool-owner claim follows from these checks. Fresh graphical adoption, real caller-tool loop and M30-specific recovery/isolation are still required. [Verification](evidence/M30/verification.json) retains the exact commands and limits. M24–M26 remain Not started.

### M30-CHECKPOINT-006 — Real candidate caller-tool ownership

**Recorded:** 2026-10-10 (Asia/Dhaka). **Status:** In Progress. The user approved and connected the isolated disposable Cline 4.1.2204/API 1.3 plus companion 0.7.0 candidate to the loopback server with Auto-approve None. The server protocol capability schema was corrected to retain the candidate's closed `effectPolicies.nativeToolsDenied` report; without that repair the real binding was rejected. The [native tool run](evidence/M30/native-tool-run/native-tool-denial.json) then passed a model-only `echo_marker` proposal with zero native tool events, one caller-owned local file effect, addressed success and error results, and 409 rejection of duplicate and foreign call IDs. A deliberately requested native write produced one observed Cline tool event, was denied before its file effect, and failed the generation closed with `NATIVE_TOOL_ACTIVITY`. This qualifies caller-tool effect ownership for this exact disposable candidate binding and advertised server profile; it does not qualify arbitrary Cline versions or a named tool-using coding client.

The M30-specific [recovery run](evidence/M30/native-tool-run/native-recovery.json) has verified a locally answered question cannot be overwritten by a later remote answer, and a pending request is fenced after the binding is lost. Its first continuation timed out while waiting for a graphical reconnect. The extension retained a `lease_lost` listener, so a direct Connect returned “Existing listener needs connection repair”; explicit Disconnect then Connect established a replacement binding. The runner now resumes completed checkpoints and is awaiting a window reload while another question is pending. The final pending reload, local prompt takeover and independent native-binding isolation remain open. The root build/lint, focused M22 schema test and root smoke passed after the protocol repair; [verification](evidence/M30/verification.json) records exact commands and limitations. M24–M26 remain Not started.

### M30-DONE-001 — Public API, native and client acceptance complete

**Recorded:** 2026-10-10 11:14 +06:00 (Asia/Dhaka). **Actual model/effort:** Unrecorded / Unrecorded. **Status:** Done for the recorded disposable subsets. No Git commit exists in this checkout. The complete [M30 evidence index](evidence/M30/README.md), [verification](evidence/M30/verification.json), [client matrix](evidence/M30/client-matrix.json) and [exact candidate manifest](evidence/M30/artifact-manifest.json) identify the supported routes, pinned client/native versions, request-key behavior and boundaries.

The real loopback gateway → TypeScript server → companion → Cline path passed first-party REST/SSE prompt and transcript replay, addressed question, signed allow/deny, cancellation, revoked-key rejection, checksum PNG staging, OpenAI Chat/Responses and Anthropic Messages sync/stream/retrieval with pinned official SDKs, and two consecutive Aider 0.86.2 whole-file edits on each declared text profile. Same-key replay, changed-payload conflict, completed-generation server restart and competing ingress were correlated with one native command for the original operation. The separately consented Cline 4.1.2204/API 1.3 plus companion 0.7.0 candidate passed a model-only caller-tool proposal, one caller-owned file effect, addressed success/error results, duplicate/foreign call-ID rejection, and a deliberately attempted native write that was blocked with no file effect and `NATIVE_TOOL_ACTIVITY` failure. [M30 recovery](evidence/M30/native-tool-run/native-recovery.json) passed local-answer, pending-disconnect and window-reload stale-control fences; [local takeover](evidence/M30/native-tool-run/native-takeover.json) visibly completed in Cline, detached the binding and rejected a later server prompt without dispatch. The first timeout and `lease_lost` repair remain recorded rather than erased.

Two simultaneously active independent bindings under separate owners and devices passed the [stateful isolation test](evidence/M30/isolation.json): concurrent admissions used separate command lanes and cross-session snapshots, operation IDs and prompts were denied. A second stateful check sent first-party and provider ingress together at one binding: only one prompt was admitted while a disable control entered its separate lane. These tests use simulated native bindings at the server authority boundary; real Cline/native behavior was separately exercised on one consented candidate task. The named Aider acceptance is text/whole-file only, with a stable key across its in-process retries. Aider process-loss recovery after an ambiguous send, a named tool-using client, two concurrent graphical Cline hosts, arbitrary vendor/model parity, native billing-token counts and production identity/distribution are not claimed. These limits do not bypass a required declared-profile failure; M24/M25/M26 own deployment, guides and frozen soak.

**Final checks and cleanup:** Node 24/npm 11 root `npm run build` and `npm run lint` passed; root `npm test` passed 115 with 54 optional database skips and zero failures. Focused `M30_TEST_DATABASE_URL=<disposable PostgreSQL> node --test tests/m30-isolation.test.mjs` passed 2/2, `M27_TEST_DATABASE_URL=<same> node --test tests/m27-server-policy.test.mjs` passed 11/11 including parallel-tool policy, affected M23 passed 93/93 and gateway PostgreSQL integration passed 53/53 after the last runtime repair. Exact package SHA-256 values matched the manifest. [Cleanup](evidence/M30/cleanup.json) stopped the two loopback listeners and disposable PostgreSQL, dropped both M30 schemas, removed M30 local effect files and preserved the earlier M27 forensic schema. M24–M26 remain Not started; stop at this milestone boundary.

### M24-START-001 — Cline packaging and server/gateway deployment started

**Recorded:** 2026-10-10 (time not recorded, Asia/Dhaka). **Status:** In Progress. The user explicitly authorized M24 after M30. The detailed [M24 plan](docs/feasibility/m24-implementation-plan.md) analyzes the tracker gate and identifies both repository work and operator-owned live acceptance.

**Repository implementation:** Added a production TypeScript server entry point with required PostgreSQL/OIDC/Ed25519/attachment settings, checksum-verified migrations before listening, an explicit exact-binding caller-tool evidence allowlist (empty by default), and graceful signal shutdown. Added pinned Node/Python container definitions, a Compose deployment with PostgreSQL restricted to a data-only network, server/gateway on a private edge, and Nginx HTTPS/SSE configuration. The gateway supports a private HTTP upstream only when its exact origin appears in an operator-managed allowlist. Added external-secret templates, backup and operator upgrade/rollback/restore/uninstall instructions. These files are collected in [M24 evidence](evidence/M24/README.md).

**Packages:** `node extensions/vscode/scripts/package-m24.mjs` produced the [unsigned versioned VSIX pair](evidence/M24/artifact-manifest.json), checking native bundle/add-on/companion hashes against M30. It targets VS Code 1.140.0 on macOS arm64 and preserves the accepted Cline 4.1.2204/API 1.3 and companion 0.7.0 code. The maintained Cline VSIX retains Cline's stock extension identifier because the companion calls that exported API; install it only in a separate macOS account or physically isolated VS Code instance to leave the user's stock-Cline installation untouched (corrected during M24 review: profiles alone do not isolate extension binaries).

**Checks:** Root `npm run build` and `npm run lint` passed. `python3 -m py_compile api-gateway/sdc_gateway/app.py api-gateway/sdc_gateway/__main__.py` passed. No test suite was run for this checkpoint.

**Open M24 gates:** The deployment and packages remain candidates. No Docker build/start, production host, real OIDC realm, TLS certificate, Nginx SSE/reconnect test, clean-user native install/consent, package signature, project license/notice selection, backup restore, upgrade, rollback or uninstall acceptance was performed. Those require the operator-selected identity, domain, signing/distribution owner and test environment. [Verification](evidence/M24/verification.json) records exact state and limits. M25 and M26 remain Not started.


### M24-PROGRESS-002 — Local deployment and lifecycle validation

**Recorded:** 2026-10-10, Asia/Dhaka. **Status:** In Progress. The user requested finishing M24. The pinned Node 24.21.0/npm 11.19.0 server and Python 3.13.16/uv 0.12.23 gateway containers built, and the isolated five-service stack passed health checks with proxy ports bound only to loopback. A genuine disposable Keycloak 26.4.7 realm over locally verified TLS passed PKCE S256 login, verified identity registration, refresh, one-use state, authenticated first-party/OpenAI/Anthropic discovery, scoped-key view/prompt-denial/revocation, body limit and headers. A clearly simulated device received and replayed a control SSE frame through Nginx in about 370 ms. Replacing server/gateway containers retained identity/session state and the running proxy resolved new addresses. This is real local identity/proxy evidence, not graphical native acceptance or operator production configuration.

**Repairs:** Real Keycloak refresh tokens exceeded the inherited 256-character field limit; the endpoint now accepts a bounded 8192 characters with stateful regression coverage. Nginx resolves Docker service addresses dynamically. Backups reject live writers, read actual attachment mounts, use portable relative checksums and mark incomplete output. Compose stop grace periods exceed bounded application shutdown deadlines. VSIX generation now uses sorted entries/fixed ZIP metadata and includes neutral SDK dependency notices, with unchanged M30 native code hashes. Corrected the earlier profile-only install advice: profiles alone do not isolate extension binaries; a separate macOS account or physically separate user-data/extension directories is required.

**Checks:** Node 24.21.0/npm 11.12.1 locked offline install, root build/lint, root smoke 117 passed with 55 optional database skips, gateway PostgreSQL/SDK integration 54 passed, affected auth/HTTP 15 passed, and repeated package generation produced identical hashes. The first sandboxed listener/import-path failures and real-Keycloak refresh failure are recorded. Quiesced backups restored database identity/session markers and attachment bytes into a separate temporary target without overwriting the original. Server/gateway exited zero on idle shutdown. The disposable stack/volume/secrets were cleaned up and PostgreSQL regression service stopped; historical native artifacts and schemas were preserved. See [M24 verification](evidence/M24/verification.json), [local evidence](evidence/M24/local-acceptance/) and [candidate manifest](evidence/M24/artifact-manifest.json).

**Remaining gates:** Await operator-selected host/domain/TLS/OIDC settings and signing/distribution/license ownership. Clean supported-user GUI installation, native proxy workflow, actual package/native upgrade/rollback and graphical uninstall/credential cleanup remain required. Companion project license and upstream Cline transitive notices need final review before redistribution. The existing M24 gate explicitly treats these as blockers; no support claim or Done status is fabricated. M25/M26 remain Not started.


### M24-CHOICES-003 — Docker and MIT selected

The user selected Docker deployment and MIT open-source licensing and requested recommendations for the remaining choices. Added the MIT project LICENSE and packaged it into the companion and project patch notices, preserving upstream Cline Apache-2.0 and the exact native bundle fingerprints. Repeated package generation produced identical manifests/hashes. [Recommended defaults](docs/feasibility/m24-deployment-defaults.md) use local loopback Docker Compose, persistent genuine Keycloak, localhost TLS, project-owned detached release signatures and physically isolated graphical VS Code acceptance. No cloud account, purchased domain or externally hosted identity tenant is needed for this recommended local target. Persistent deployment/signing and clean-user native lifecycle remain to be performed; M24 is In Progress.


### M24-IMPLEMENTED-004 — Persistent local Docker and signed release implementation

**Recorded:** 2026-10-10. **Status:** In Progress pending graphical native acceptance. Implemented the authorized persistent local Docker topology, normal-mode PostgreSQL-backed Keycloak, private TLS CA/localhost certificate, exact VS Code callback, fixed verified HTTPS OIDC backchannel, idempotent protected configuration/key provisioning and an isolated graphical VS Code launcher. Local deployment is running at `https://localhost:15943`; no external port or public publication is enabled. Added operator lifecycle commands and backup of both SDC and Keycloak databases. Own code is MIT, upstream Apache-2.0 and bundled notices are preserved; Ed25519 project integrity signatures verify both exact VSIX hashes. No Marketplace signature is claimed.

**Verification:** Production build/lint and root tests passed (119 passed, 55 optional database skips), focused OIDC 5/5 and provisioning 1/1. Real local PKCE login/refresh, public/provider routes, scope denial/revocation, TLS/body limits and simulated-device control SSE/replay passed. Both databases restored into independent temporary targets with users/realm/session retained. The prior Docker image reference was unavailable after rebuild; the immediately previous compatible source was reconstructed as a distinct baseline image for the recorded rollback test, then final hardened images restored. No original data was overwritten. See [persistent evidence](evidence/M24/persistent-local/lifecycle.json), [verification](evidence/M24/verification.json) and [local runbook](deploy/m24/LOCAL.md).

**Remaining:** Computer-use policy requires action-time confirmation to install/run the locally built pair and trust the project CA; the prepared exact candidate approval is pending. OS trust and installation have not been changed. Fresh task sign-in/pairing/native control consent and real workflow through this local proxy, plus GUI native/package upgrade/rollback/uninstall/credential cleanup, still require acceptance. Existing M30 disposable grants do not authorize a new M24 grant. M24 cannot be marked Done before these original graphical gates pass. M25/M26 remain Not started.

### M24-CHECKPOINT-005 — Deployment recovery and approved graphical installation

**Recorded:** 2026-10-10 13:32 +06:00 (Asia/Dhaka). **Actual model/effort:** Unrecorded / Unrecorded. **Status:** In Progress. The user requested resuming M24 and explicitly approved running the isolated launcher/installing the reviewed Cline 4.1.2204/API 1.3 + companion 0.7.0 pair and trusting the verified project CA. Preserve these approvals; no fresh native task/control consent has been given.

**Verified progress:** Docker Desktop was stopped and the browser showed connection refused. Starting the existing official Docker Desktop recovered all five retained services, with server/gateway/PostgreSQL healthy and only `127.0.0.1:15943` published. The existing browser tab now visibly shows the Relay HTTPS sign-in page without an agent bypass of a warning. The detached signature and VSIX checksums verify against the repository public key, and ZIP inspection confirms both native bundles match the exact M30 hashes. The external operator key could not be reread. The isolated launcher was run graphically; process arguments confirm physically separate user-data/extensions directories. The empty ordinary editor was closed to select the isolated process; its stock extension files were not changed.

**Current blockers:** Reads of `/Users/samin/Documents/ServerDrivenChat-local/m24` return `operation not permitted`, including after shell escalation. The user asked how to grant access and was given the official project-menu → Edit project → Add folder steps, retaining the repository as primary. No rejected filesystem access was bypassed. The clean isolated editor showed a blank workbench and an explicit unresponsive-window dialog before extension installation; one graphical Reopen was attempted and startup still needs diagnosis. An ordinary curl request failed with certificate validation exit 60, and default-keychain CA search returned no result; neither that search nor Chrome's loaded page establishes OS/Node trust acceptance. No OS trust change, extension installation or native grant was applied.

[Sanitized resumption evidence](evidence/M24/persistent-local/resume-2026-10-10.json) and [restored graphical login](evidence/M24/persistent-local/resumed-login.jpg) record this checkpoint. No application code, signed manifest/package, keys, credentials or database contents were changed; historical regression results remain historical and were not rerun for this evidence/documentation-only resumption. Docker remains running. Next: attach the private-state folder, inspect isolated startup logs, repair startup and verify the exact CA fingerprint before applying the already approved trust, install the reviewed pair graphically, then obtain fresh exact task/control consent and complete native/package lifecycle acceptance. M25/M26 remain Not started.

### M24-CHECKPOINT-006 — Isolated VS Code startup investigation

**Recorded:** 2026-10-10 13:50 +06:00 (Asia/Dhaka). **Actual model/effort:** Unrecorded / Unrecorded. **Status:** In Progress. The user added the private M24 state folder to the project and asked for an explanation of the VS Code design and blocker. The folder is readable; no credential files were opened.

The design runs the existing VS Code 1.140.0 app with `--user-data-dir <private state>/vscode-user` and `--extensions-dir <private state>/vscode-extensions`. That gives the M24 Cline 4.1.2204/API 1.3 build and companion 0.7.0 their own settings, extension binaries and data, because the maintained Cline build reuses Cline's stock extension ID. The ordinary installation stays stock. Both exact package bundles and the signed manifest were verified; the isolated extension directory is empty, so no M24 extension is installed.

Sanitized local logs at `vscode-user/logs/20261010T132620` show a concrete startup issue: at 13:27:12 VS Code's file watcher received `EPERM` watching the isolated `vscode-extensions` directory. The main process then logged unresponsive windows at 13:27, 13:30 and 13:33; the renderer later reported a 15-second request timeout and an unresponsive extension host. The window eventually logged recovery at 13:33:44. Sampled renderer stacks involved VS Code list-view setup, grammar validation and configuration retrieval. A bundled GitHub Copilot API-proposal warning is also present, but no M24 extension was loaded. These records identify a likely file-access/startup investigation path; they do not prove the watcher error alone caused every hang. No VS Code-specific macOS privacy denial was returned by the focused system-log query. Raw logs remain in the private state and were not copied into evidence.

No installation, CA trust change or native grant was applied. The user already approved the exact local software and verified project CA. Next: reopen the isolated editor and check whether it remains responsive now that the project has the folder; if it still hangs, identify and correct the app's extension-directory access cause with the least necessary scope, then resume the approved install and separate native consent/lifecycle gates. [Sanitized resumption evidence](evidence/M24/persistent-local/resume-2026-10-10.json) contains the diagnostic result. M24 remains In Progress; M25/M26 remain Not started.

### M24-CHECKPOINT-007 — Isolated VS Code hang diagnosed

**Recorded:** 2026-10-10 14:25 +06:00 (Asia/Dhaka). **Actual model/effort:** Claude Opus 5.5 / Unrecorded. **Status:** In Progress. The user asked for a diagnosis of the isolated VS Code startup hang. Diagnosis only: no installation, CA trust change, native grant, system setting, deployment or application code was changed. Credential files in the private state were not opened; raw logs stay there.

**Finding 1 — the hang is host memory exhaustion.** The host is an 8 GB MacBookPro17,1. At 14:12, about one hour after boot, swap was 4783 of 5120 MB used, the compressor held about 1.0 million 16 KB pages in 3.5 GB of RAM, `kern.memorystatus_vm_pressure_level` was 2, and `vm_stat 1` showed 22,000–53,000 decompressions per second with 4% idle CPU. Docker Desktop's VM is allocated 4.1 GB (`docker info`); Chrome, Claude, ChatGPT/Codex and a second, ordinary VS Code instance were also running. The 27 renderer stack samples in the 13:26 session's `main.log` have 26 different top frames, all trivial (`Array.isArray`, `Object.keys`, `new Map`, `RegExp.test`), which is a starved renderer running normal startup code slowly, not code stuck in one place. System reports in `/Library/Logs/DiagnosticReports` show a `ditto` copy writing 2.1 GB (13:25–13:28) and Spotlight `mds_stores` writing 2.1 GB (to 13:29) in the same window, and the editor was downloading its own update at 13:27–13:28. The 13:53 session logged no unresponsive event and reached `Eager extensions activated` at 13:55:17, still about two minutes after launch.

**Finding 2 — the watcher `EPERM` is a separate macOS privacy denial.** The unified log records `System Policy: Code(...) deny(1) file-read-data` for both `vscode-user` and `vscode-extensions`, and `file-read-xattr` on each parent up to `~/Documents`, in both sessions. `tccd` identifies the client as `com.microsoft.VSCode`; no Documents-folder prompt was logged. `deploy/m24/provision-local.py` pre-creates those two directories, so they lack the `com.apple.macl` attribute that every item the editor created itself inside them carries. The editor can therefore use what it creates but cannot list or watch the two top-level directories. `fs.watch` on the same directory succeeds from a shell using VS Code's own runtime (`ELECTRON_RUN_AS_NODE=1`), so the directory is not damaged. Because this denial is identical in the session that did not hang, it is not the hang's cause. It is still an open risk for extension discovery after installation and was not tested. Reading the privacy database was refused and not pursued, so whether the setting is off or was never requested is unconfirmed.

**Finding 3 — the editor version moved.** `CachedData` holds commit `07f806f9…` (13:26 session) and `2a59476c…` (13:53 session); `code --version` now reports 1.141.0. The 13:26 session logged `Update downloaded … 1.141.0`. The M24 manifest and `deploy/m24/README.md` record VS Code 1.140.0 as the target. Both VSIX manifests declare `^1.101.0`, so installation is not blocked, but acceptance on 1.141.0 would not match the recorded target.

**Finding 4 — isolation is not complete.** Both sessions opened `~/.vscode-shared/sharedStorage/state.vscdb`, which lives outside `--user-data-dir` and is shared with the ordinary editor. What VS Code stores there was not examined.

**Commands:** `ps`, `vm_stat`, `sysctl vm.swapusage`, `top -l 1`, `docker info`, `docker stats --no-stream`, `/usr/bin/log show` with `System Policy` and `tccd` predicates, `xattr`, `stat`, and a `fs.watch` reproduction. Root `npm run lint` passed and `node --test tests/*.test.mjs tests/conformance/*.test.mjs` gave 119 passed/55 skipped against the existing build on host Node 25.9.0, not the required Node 24; database, gateway and Swift suites were not run.

**Next:** see the current handoff. The memory, directory-access and editor-version choices are the user's; M24 remains In Progress and M25/M26 Not started.


### M24-CHECKPOINT-008 — CA trusted; graphical host integrity and launcher blockers

**Recorded:** 2026-10-10 19:11 +06:00 (Asia/Dhaka). **Status:** In Progress. The user said to continue and prior approvals for the reviewed VSIX pair, isolated launcher and verified project CA remain in force. No VSIX was installed and no native binding/task/control grant was made.

**Completed:** Rechecked the CA SHA-256 fingerprint against the approved value (`6A:97:03:D4:EA:87:E4:2F:9F:86:A5:EB:2B:4C:9F:3A:19:EA:CF:83:47:DE:16:FD:C9:86:39:C9:84:B7:DB:5F`), imported it in Keychain Access and marked only Secure Sockets Layer (SSL) as Always Trust in the user's login keychain. The UI identified it as trusted for this account. A certificate-verified `curl --resolve localhost:15943:127.0.0.1 https://localhost:15943/health` returned HTTP 200. Docker confirms all five retained services are running; the proxy publishes only `127.0.0.1:15943`. The earlier plain `localhost` curl used IPv6 and failed because the service is IPv4-loopback only.

**VS Code blockers:** The installed `/Applications/Visual Studio Code.app` reports version 1.141.0, while the M24 manifest pins 1.140.0. `codesign --verify --deep --strict` now reports the installed app's signature invalid. The generated `ServerDrivenChat VS Code.app` declares a POSIX shell script as `CFBundleExecutable`; LaunchServices refuses to open it with `kLSNoExecutableErr` (-10827). Direct attempts to start Code with the M24 paths exit 134; the exact 1.140 app bundle has no verified running graphical window. The older isolated log sessions show macOS TCC denied Code access to `vscode-user` and `vscode-extensions` under Documents; those denials still need a supported access path. The M24 extension directory remains empty. Official VS Code release notes identify 1.140.0 and provide the Apple-silicon download, but installation of that host has not been completed. See [resumption evidence](evidence/M24/persistent-local/resume-2026-10-10.json).

**Next gate:** Resolve the broken local launcher/host without modifying the ordinary VS Code installation, and provide VS Code a narrowly scoped path to the project data. macOS Files & Folders/selected-folder access is a new security permission and has not been changed. Once the isolated host is valid, install the exact reviewed pair, complete fresh user sign-in/pairing/consent, and run graphical workflow plus package lifecycle acceptance. M24 remains In Progress; M25/M26 remain Not started.


### M24-CHECKPOINT-009 — Exact host launch probe and remaining permission gate

**Recorded:** 2026-10-10 19:26 +06:00 (Asia/Dhaka). **Status:** In Progress. The user said to continue. The verified project CA remains trusted in the login keychain for SSL only, and the persistent IPv4 loopback HTTPS health check passes.

**Host probe:** Microsoft release notes identify VS Code 1.140.0 as the exact M24 target and list an Apple-silicon DMG. The official DMG downloaded from `update.code.visualstudio.com/1.140.0/darwin-arm64-dmg/stable` had SHA-256 `59cc77128b4e4551da0c97f0437fd61d3d0b2bc47d80c3b929c859368a39a1d3`; the disk image checksum verified. Launching Code directly from its mounted DMG exited 134. Its crash report shows `EXC_CRASH/SIGABRT` in `___RegisterApplication_block_invoke`, so the process did not establish a graphical app session. The temporary app copy created in `/Users/samin/Applications` failed signature verification and was moved to Trash. The ordinary `/Applications/Visual Studio Code.app` was not replaced; it reports 1.141.0 and fails signature verification. No valid host has been established. The generated M24 `.app` still has a shell script for `CFBundleExecutable`, which LaunchServices rejects with `kLSNoExecutableErr`.

The old M24 process is no longer running; the ordinary Code process remains untouched. Historical TCC records still show Code denied access to the pre-created M24 user-data and extensions directories under Documents. No macOS permission was widened. No M24 VSIX was installed and no native grant was made.

**Remaining blocker:** Establish a valid signed 1.140.0 app through the supported install path, replace the shell-based app launcher with a real macOS executable, and choose a scoped file-access path. The user must separately approve any new Files & Folders permission. The extension directory is still empty; M24 remains In Progress.


### M24-CHECKPOINT-010 — native launcher generator repaired

**Recorded:** 2026-10-10 19:30 +06:00 (Asia/Dhaka). **Status:** In Progress.

Updated `deploy/m24/provision-local.py` to build the macOS launcher as an arm64 Mach-O executable, then ad-hoc sign the generated `.app`. Added `--refresh-vscode-launcher` to replace only that launcher in an existing provisioned state directory without rotating credentials or changing deployment data. Updated the local runbook. The provisioning test now checks the launcher bundle entry and executable, and on macOS verifies Mach-O type and code signature.

**Verification:** `node --test tests/m24-provisioning.test.mjs` passed 1/1 on Node v25.9.0. The required Node 24 was not available. The test used temporary state and preserved key/credential bytes across retry/launcher refresh. The new launcher has not been applied to the user's private state or launched. No deployment, database, CA trust, VSIX, or native binding changed in this checkpoint.

**Remaining:** The system VS Code app is 1.141.0 and fails signature verification; the direct 1.140.0 DMG probe aborted during app registration; the tested M24 launcher remains unapplied. macOS TCC still denies access to pre-created state/extension folders under Documents. Resolve a verified host and narrow file-access path before installing the VSIX pair and continuing graphical acceptance. M24 remains In Progress; M25/M26 remain Not started.


### M24-CHECKPOINT-011 — Verified host and isolated package installation

**Recorded:** 2026-10-10, Asia/Dhaka. **Status:** In Progress. The user asked to continue M24 and had already approved the exact local extension pair, isolated launcher and project CA trust.

Installed an official Microsoft VS Code 1.140.0 Apple-silicon copy under `~/Applications/ServerDrivenChat VS Code 1.140.app`, preserving the ordinary `/Applications` copy. The official release DMG checksum matched `evidence/M24` and the app passed disk-image verification, deep code-signature verification after copy, and exact version check. Repaired the generator to emit an arm64 Mach-O launcher, refreshed the private deployment launcher without rotating state, and moved the isolated VS Code profile/extension paths into `~/Library/Application Support/ServerDrivenChat/M24` to avoid the earlier Documents watcher denial. The native launcher signature verifies.

Installed Cline 4.1.2204 through the isolated editor's Extensions UI. The graphical file picker stalled on the companion install; installed the already-approved companion 0.7.0 VSIX using the exact VS Code 1.140 CLI, then confirmed both packages in the isolated Extensions view and CLI list. The ordinary editor and its extension files were not changed. No repository workspace was opened and no new native task/control grant was made.

**Checks:** `python3 -m py_compile deploy/m24/provision-local.py`; `node --test tests/m24-provisioning.test.mjs` passed 1/1 on Node 25.9.0; `node deploy/m24/sign-release.mjs verify evidence/M24/release-public.pem` passed; official host checksum, disk image, copied app signature and version passed. `npm run build` and `npm run lint` passed. `npm test` passed 119 with 55 optional database skips and zero failures after allowing loopback fixtures. Node 24 was unavailable; gateway, Swift and PostgreSQL integration suites were not rerun. Sanitized results are in [M24 verification](evidence/M24/verification.json) and [resumption evidence](evidence/M24/persistent-local/resume-2026-10-10.json).

**Current gates:** macOS access to only `/Users/samin/Documents/ServerDrivenChat` from this isolated VS Code instance is awaiting explicit user approval; no Documents-wide permission was changed. Then fresh task sign-in/pairing and control consent, actual local workflow, and graphical package upgrade/rollback/uninstall/credential cleanup remain. CA trust and the local deployment are already in place. M24 remains In Progress; M25/M26 remain Not started.

### M24-CHECKPOINT-012 — Project opened and trusted in isolated VS Code

**Recorded:** 2026-10-10, Asia/Dhaka. **Status:** In Progress.

The user approved opening only `/Users/samin/Documents/ServerDrivenChat` in the isolated VS Code 1.140.0 instance and trusting that project folder. The workspace trust view confirms the repository path is trusted; no broader Documents access was requested. Cline 4.1.2204 and companion 0.7.0 are installed and active enough to register the Cline view and `Cline bridge: disconnected` status item. The Cline bridge is still disconnected; no task is selected, no device pairing has been started, and no local control categories have been granted.

**Remaining:** Obtain fresh action-time authorization to begin local native sign-in/pairing and task/control consent. OIDC credential entry must remain user-performed. Stop at the local consent review until the user authorizes exact control categories. Then test the native workflow and package upgrade/rollback/uninstall/credential cleanup. M24 remains In Progress; M25/M26 remain Not started. Evidence: [M24 resumption](evidence/M24/persistent-local/resume-2026-10-10.json), [M24 acceptance](evidence/M24/README.md).

### M24-CHECKPOINT-013 — Pairing attempt stopped before OIDC

**Recorded:** 2026-10-10, Asia/Dhaka. **Status:** In Progress. The user approved beginning local sign-in/pairing and selected prompts, questions, and cancel for the local server profile; approvals remain disabled. The profile saved successfully. A disposable Cline task replied with the requested exact text without reading or changing workspace files. The exact-task connection review showed the expected task, loopback origin, and three selected controls. After connecting, the extension returned its generic failure before opening the browser. A second attempt reproduced the failure. No credentials were entered, no OIDC session or server pairing was created, and no final local control-consent dialog appeared. The local HTTPS health check returned 200 with certificate validation enabled; Docker services remained healthy. The failure is before visible sign-in, but its exact cause is not exposed by the extension's generic error.

**Next:** Diagnose the isolated extension's OIDC launch/callback path and retry only after the cause is understood. Leave password entry to the user. If pairing reaches final local consent, stop there; no task control has been granted. Then run the local workflow and the graphical package lifecycle checks. M24 remains In Progress; M25/M26 remain Not started. Evidence: [M24 resumption](evidence/M24/persistent-local/resume-2026-10-10.json).

### M24-CHECKPOINT-014 — Isolated Node trust repair

**Recorded:** 2026-10-10, Asia/Dhaka. **Status:** In Progress. The connection failure was narrowed to the isolated VS Code Node runtime: default Node `fetch` rejected `https://localhost:15943/healthz` with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, while the same request returned 200 when Node was explicitly given only the deployment's public CA using `NODE_EXTRA_CA_CERTS`. The macOS SSL-only trust approval did not configure Node's separate CA set.

Updated the M24 Mach-O launcher to set `NODE_EXTRA_CA_CERTS` to the existing public `tls/ca.pem` for this isolated VS Code process and child extension hosts. Certificate validation stays enabled; the ordinary editor is untouched. Refreshed the existing private-state launcher without rotating credentials or data. The source test verifies the CA setting; `node --test tests/m24-provisioning.test.mjs` passed 1/1, launcher deep signature verification passed, and process inspection confirmed the extension host inherited the variable.

The refreshed instance retains the trusted project folder and exact installed VSIX pair, but the current extension host is reported unresponsive and the bridge status item did not activate. Therefore post-fix OIDC launch has not yet been verified. Recover the host, retry sign-in while leaving password entry to the user, then stop before final consent for prompts/questions/cancel. No task binding or local remote-control consent exists. M24 remains In Progress; M25/M26 remain Not started. Evidence: [M24 resumption](evidence/M24/persistent-local/resume-2026-10-10.json).


### M24-CHECKPOINT-015 — Real local native/API workflow and lifecycle repair

**Recorded:** 2026-10-11, Asia/Dhaka. **Status:** In Progress. **Model/effort:** Unrecorded. The user's instruction is to understand and finish M24; M25/M26 remain outside this instruction.

Recovered the isolated signed Microsoft VS Code 1.140.0 host and verified the existing real device consent, recorded at 2026-10-10 17:40:22 UTC, from the intervening pairing chat. The 0.7.2 loopback callback repair avoids macOS routing `vscode://` to another editor. The control UI exposed a missing exact HTTPS callback: added only `https://localhost:15943/` to the real Keycloak client and server allowlists with a targeted, idempotent provisioning refresh. Keys, passwords and databases were not rotated. User-performed password entry completed actual GUI OIDC sign-in.

The disposable task 1791641555978_71d6l passed two real server-driven prompts, native output, a Blue question answer and addressed cancellation through the selected TLS proxy. After cancel, a prompt was correctly refused because Cline required local Resume Task; local resume fenced the old binding, then reconnection passed. Official OpenAI Chat/Responses and Anthropic Messages SDK calls returned exact requested text on the deployed native task. Accounting remains labeled server estimates. Temporary scoped API credentials were revoked and rejected. Evidence retains the first rejected readiness attempts rather than hiding them.

Graphical companion rollback 0.7.2 → retained reviewed 0.7.0 succeeded, retained credentials and reconnected after local task resume. Found the missing graphical credential-cleanup seam and added companion 0.7.3 **Revoke and Forget Server Credentials**, using the existing human-only public revocation API. It fences pending/new Connect, disconnects locally, refreshes identity if necessary, revokes only the selected device, and only then removes that profile's saved user/device credentials and closed local SQLite inbox. Failure retains credentials/inbox for retry. Native Cline bundles/API/permissions are unchanged. Source inspection removed an unnecessary duplicate server route before final packaging. The user explicitly approved the project-signed 0.7.3 installation and this disposable device's scoped credential/inbox cleanup. Installed final 0.7.3 through the native VSIX picker; its SHA-256 matches the signed manifest. Retained 0.7.2 signed artifacts separately.

**Checks:** Node 24.19.0 bundled runtime restored the required major version: locked install, build/lint and root 123 passed/55 optional skips; focused stateful cleanup, callback and real PostgreSQL HTTP 7/7; previous real auth/HTTP selection 10/10 and Swift 8/8. The foreign-owner HTTP test initially used an unregistered identity (401), then registered the synthetic second user and verified 404, owner retry success and revoked authority. Final containers rebuilt and healthy. The unchanged gateway's earlier 54-check evidence remains; the removed host Python path was not treated as a new successful rerun.

**Remaining:** final 0.7.3 deployed SDK calls, graphical approved forget/revoke, isolated pair uninstall/reinstall and fresh consent acceptance. No public distribution, Marketplace signing, Internet production, named tool-client expansion or M26 soak is claimed.


### M24-DONE-001 — Selected local deployment and graphical package lifecycle complete

**Recorded:** 2026-10-11 10:38 +06:00 (Asia/Dhaka). **Status:** Done for the selected persistent local Docker target and exact graphical package pair. **Model/effort:** Unrecorded. **Authority:** user instruction to finish M24, explicit signed 0.7.3 installation/scoped cleanup approval, user-performed password entry and fresh action-time binding approval.

Closed the final lifecycle gap. Companion 0.7.3 revokes through the existing human-only public API before removing the selected profile's user/device SecretStorage entries and closed device-derived SQLite inbox. An expired real Keycloak refresh first failed safely and retained credentials; the repaired browser reauthentication fallback then completed graphical revoke/forget. The old device 9495cc6a-e0eb-4bba-bc6f-7326c22d2d97 is revoked, no credential/active binding remains, both saved keys are gone and its inbox files are absent. Cline history, other profiles, database and CA state are retained. The maintenance fence prevents concurrent Connect during cleanup; cancellation/failure retain retry state.

Uninstalled companion and maintained Cline through the isolated extension manager, reloaded and observed **No extensions found**. Reinstalled both exact signed VSIX archives through the graphical native picker. Cline 4.1.2204/API 1.3 bundle SHA-256 remains `8da2f0506aacc06906d81783cd9ad540b93f68fdc64606d2c5e77b15d2ef1f29`; final companion 0.7.3 is `1d60bd4f97ab50adb8ef848538584d5649465b43d97c831b0f0f9b3fc3ca81ad`. Installed hashes matched the manifest; regenerating the archives produced byte-identical VSIXs. The ordinary Cline bundle is unchanged. Retained acceptance task 1791641555978_71d6l opened graphically. Resume proposed file read/search; both were declined with auto-approve None, followed by the harmless M24-REINSTALL-READY echo. No read/search was approved.

Fresh real sign-in required user password entry, confirming prior saved credentials were removed. Server confirmation and separately approved local consent created fresh device 324f9666-d487-4a8a-8efb-ab589164f4cd for prompts/questions/cancel only, approvals disabled. Session 0b5b8500-a74e-429a-9795-c08117d68c7b passed all three official SDK text profiles through verified HTTPS → FastAPI → TypeScript server → existing Cline. Three applied native receipts and exact final fingerprints are recorded. Temporary session-scoped view/prompt credential was revoked and rejected. Usage remains explicitly server-estimated. Earlier real GUI two-turn output/question/cancel, compatible server/gateway rollback/re-upgrade and companion rollback 0.7.2 → 0.7.0 remain linked evidence; no new native capability is claimed.

Stopped application/identity writers, backed up both databases and attachments, then restored dumps into separately created temporary databases. Verified real realm/client, both exact callbacks, old revocation, new device and three native commands/244 events; nine migrations retained. Originals were not overwritten; temporary restore databases were removed. The current attachment store is empty; earlier nonempty archive restore remains separate evidence. Initial verification guessed the mount and then treated AppleDouble metadata as content; corrected both probe assumptions using resolved Compose mount and metadata exclusion, without changing live data. Restarted retained services. Verified real TLS `/v2/health`, `/api/v1/health` and Keycloak discovery. Proxy/Keycloak have no Docker healthcheck; their functional HTTPS checks passed. Exact isolated host code signature and version 1.140.0 passed. Native bridge left disconnected and regression PostgreSQL stopped.

**Checks:** Node 24.19.0/npm 11 locked install/build/lint; final root 125 passed/55 optional database skips/zero failures. Latest cleanup/reauthentication/provisioning 7/7; real PostgreSQL HTTP 2/2, earlier auth/HTTP 10/10 and Swift 8/8. The gateway source/runtime is unchanged and historical 54 checks are retained; its removed host Python path prevented a new full host suite and no rerun is claimed. Actual final deployed native SDK acceptance passed. Updated exact image catalog, local deployment/package runbooks and current evidence; project detached Ed25519 signature and both final VSIX checksums verify against the independent operator public key.

**Evidence:** [Final acceptance](evidence/M24/persistent-local/final-acceptance.json), [package lifecycle](evidence/M24/persistent-local/package-lifecycle.json), [credential cleanup](evidence/M24/persistent-local/credential-cleanup.json), [final SDK](evidence/M24/persistent-local/native-sdk-final.json), [receipts](evidence/M24/persistent-local/native-final-receipts.json), [restore](evidence/M24/persistent-local/final-database-restore.json), [health](evidence/M24/persistent-local/final-health.json), [signed manifest](evidence/M24/artifact-manifest.json), [verification](evidence/M24/verification.json).

**Scope:** macOS arm64, isolated VS Code 1.140.0, exact maintained native Cline 4.1.2204/API 1.3 plus companion 0.7.3, persistent IPv4 loopback Docker, genuine Keycloak 26.4.7 and private CA/TLS. Project Ed25519 integrity is not Marketplace signing. Public upload, Internet production deployment, arbitrary native/client expansion and M26 release/soak are not claimed. M25/M26 remain Not started and require new instruction.


### M25-CHECKPOINT-001 — Beginner documentation and contract audit

**Recorded:** 2026-10-11 10:42 +06:00 (Asia/Dhaka). **Status:** In Progress. **Model/effort:** Unrecorded. User explicitly requested finishing M25 with enough detail for a beginner. M24 accepted exact package/deployment is the prerequisite. Document only its supported graphical path and versioned API/client subsets, separate product GUI instructions from operator/developer commands, preserve historical evidence and keep M26 Not started. Audit current VSIX command labels, control UI, first-party/provider contracts, limits, operations/retries, restore and cleanup before writing. Validate documentation/examples against the retained M24 deployment without changing native access or product code.


### M25-DONE-001 — Beginner manual and maintainer handoff complete

**Recorded:** 2026-10-11 11:05 +06:00 (Asia/Dhaka). **Status:** Done for the declared M24 local target and supported subsets. **Model/effort:** Unrecorded. **Authority:** user's explicit M25 instruction, including beginner-level detail. No Git metadata exists; no commit SHA is invented.

Created [the manual hub](docs/guide/README.md) and five detailed guides: [graphical beginner journey](docs/guide/user-guide.md), [exact supported/unsupported field/client matrix](docs/guide/support-matrix.md), [REST/SSE/SDK/coding-client integration](docs/guide/api-guide.md), [operator lifecycle/recovery](docs/guide/operator-guide.md) and [maintainer ownership/checks/incidents/handoff](docs/guide/maintainer-guide.md). The manual has about 15,000 words across six files, reading paths by role, numbered actions, expected results, glossary, architecture diagrams and troubleshooting tables. Ordinary users install/select/sign in/pair/consent/message/answer/stop/recover/forget/uninstall through GUI; operator/programming commands are separate. The accepted default leaves approvals disabled and native Auto-approve None. Conditional once/deny and historical media/Aider/tool pins do not expand current native authority.

API instructions explain exact TLS base URLs, human/device/caller credentials, ownership/scopes/rotation, stable original request keys, operation state versus native application/completion, snapshot/SSE replay/replacements, exact question/cancel/approval identities, blocked controls, attachment commit references, server history/instructions/aliases/tool ledger/lineage and terminal-buffered provider streams. Usage/output/deadline policies remain labeled estimates rather than native generation or billing. Added actual runnable harmless Node REST/OpenAI Chat/Responses/Anthropic consumers and a bounded developer verification driver. Exported OpenAPI from the running pinned gateway: all 42 paths match the checked-in schema structurally.

Operator/maintainer instructions cover private-state and data ownership, verified CA/trust paths and exact callbacks, fixed private upstream, selected signed editor/package isolation, safe stop, consistent backup of both SDC and Keycloak plus attachments, independent empty-target restore and its configuration/history gaps, compatible upgrade/rollback, revoke-before-delete failure preservation, scoped uninstall/retention and incidents. Cross-checked commands against provisioning/local/backup/signing scripts and actual M24 independent restore/package acceptance. README/AGENTS and older Cline/API entry points route to current guides while preserving historical records. Binaries, locks, images, signing keys and product architecture remain unchanged.

**New verification:** Node 24.19.0 ran the documented files through real verified HTTPS → deployed gateway → TypeScript/PostgreSQL → already consented disposable Cline task 1791641555978_71d6l. Chat, Responses, Messages and REST returned exact M25 text. Each same-key retry returned the same response/operation ID; exactly four prompt commands and four applied native receipts exist. Snapshot and operation retrieval, SSE replay from sequence 202 to 203, unsupported temperature refusal 422, replacement-key prior-operation refusal 404 and revoked-key rejection 401 passed. Temporary session-scoped view/prompt keys were revoked/rejected; private temporary file removed. Existing approved device/task/category reconnect was graphically reviewed; all four completed texts and Auto-approve None observed; final status disconnected. No new native control category/grant, file/tool effect or software installation occurred.

**Documentation checks:** `python3 scripts/verify-m25-docs.py` passed six guides/149 local links and anchors, user-facing command titles from signed 0.7.3 VSIX, zero beginner terminal product steps, unchanged VSIX hashes and deployed OpenAPI equality. Node syntax checks for both examples and verification driver passed. `node deploy/m24/sign-release.mjs verify evidence/M24/release-public.pem` passed trusted signature/both artifact hashes; documented CA fingerprint matched public certificate. Initial link audit caught two stale section anchors and not-yet-created evidence files; repaired and final audit passed. Product build/lint/root/Swift/gateway suites were not rerun for documentation-only changes; M24's exact historical checks remain distinctly recorded.

**Walkthrough scope:** mapped every beginner lifecycle section to exact package/source and the immediately preceding real M24 graphical clean selected-device credentials, uninstall/reinstall/fresh human sign-in/server pairing/local consent/native question/cancel acceptance. M25 additionally tested existing-task reconnect/status/output/Disconnect. No separate novice participant, new macOS account, reinstall, trust change or independent restore was performed during M25, and none is claimed. Historical media/approvals/Aider retain their own pins. No Internet production/public distribution/full vendor parity or release/soak claim.

**Evidence:** [M25 overview](evidence/M25/README.md), [verification](evidence/M25/verification.json), [walkthrough audit](evidence/M25/walkthrough-audit.json), [live documented examples](evidence/M25/deployed-examples.json), [native receipts](evidence/M25/native-receipts.json), [documentation audit](evidence/M25/documentation-audit.json), [deployed OpenAPI](evidence/M25/deployed-openapi.json).

**Handoff:** M26 remains Not started; only a new user instruction can begin frozen release/requirement traceability, fresh affected native/media/client qualification and measured performance/load/one-hour soak. M16–M18 remain Deferred. Preserve private state, ordinary editor/native history and exact signed pair.


### M25-DOCS-ADDENDUM-001 — Certificate acquisition, creation and trust guide

**Recorded:** 2026-10-11 11:49 +06:00 (Asia/Dhaka). **Status:** Documentation addendum complete; M25 remains Done, M26 remains Not started. **Authority:** user explicitly requested detailed certificate creation/acquisition and access instructions.

Added [certificates.md](docs/guide/certificates.md), linked from the manual hub, beginner/operator guides, local deployment notes and README. Explains root/leaf/CSR/private keys versus release signing, obtaining/exporting only public CA, SHA-256 certificate fingerprint versus PEM-file digest, current recorded validity, graphical login-keychain SSL-only trust, browser access, isolated launcher Node trust, verified curl/Node/HTTPX health requests, new-state provisioning versus an isolated manual certificate lab, SANs/hostname/key match, proxy/internal backchannel wiring, expiry/renewal/root rotation, remote/public-domain boundaries and troubleshooting/checklists. Official Apple/OpenSSL/Node/HTTPX/Chromium/Let's Encrypt sources were checked and cited in context.

**Checks:** executed all seven manual creation/inspection command blocks in a temporary private folder on OpenSSL 3.6.2; root/leaf generation, sslserver/localhost chain verification, SAN/date inspection, certificate/key public-key digest match and mode-0600 keys passed; temporary lab removed without importing trust. Current public CA fingerprint/validity and leaf hostname/purpose verification passed. Actual verified curl and Node 24.19 HTTPS health examples passed. Python/HTTPX SSL-context block passed in the locked gateway container with only public CA path and URL adapted to its existing proxy SAN; temporary public copy removed. Host Python 3.13.7 lacks HTTPX; no locked host uv rerun is claimed. Initial Docker copy was refused by the read-only rootfs; used existing /tmp tmpfs through Python and kept container protection intact. Expanded documentation audit passed seven guides/180 local links and anchors; accepted VSIX hashes and deployed schema remain unchanged.

**Evidence:** [certificate guide verification](evidence/M25/certificate-guide-verification.json), [current documentation audit](evidence/M25/documentation-audit.json). No live certificate regeneration/rotation, OS trust change, native permission grant or remote exposure occurred. The current M24 certificate/state and disconnected bridge remain retained.


### M25-DOCS-ADDENDUM-002 — Cline migration and alternative VS Code extensions

**Recorded:** 2026-10-11 (Asia/Dhaka). **Status:** User-requested research/documentation complete. M24/M25 remain Done for their accepted local subsets, M26 remains Not started, and M16–M18 remain Deferred. **Model/effort:** Unrecorded. No Git metadata/commit is invented.

Added [different Cline version/fork migration](docs/guide/cline-version-migration.md), [official Codex/Claude Code role and configuration comparison](docs/guide/other-vscode-plugins.md) and [engineering feasibility/acceptance plan](docs/guide/plugin-integration-plan.md), approximately 8,900 words. The guides cover exact source/manifest/native pin changes, app-owned effect/permission boundaries, separate packaging paths, test matrices, isolated GUI installation, history/state migration and rollback. They distinguish native backend replacement, provider selection inside Cline, named API consumer and proposed MCP facade. All alternative configuration snippets are explicitly future lab examples; no new endpoint/package support is advertised.

Reviewed official vendor documentation and immutable public Cline source commit `c3a40572765b76873c597247941118c1778d02c8` (source VS Code manifest 4.1.23, not verified Marketplace provenance or a selected upgrade). Its four-method public API does not expose the maintained task/control contract. Claude Code's documented in-process mods are a promising VS Code native route; queued-input fencing, identity, durable bridge hosting, cancellation and permission races remain untested. Codex IDE app-owned external attachment remains unestablished here; the historical desktop M01 finding was not relabeled as IDE evidence. Named Codex/Claude gateway clients require retry identity, field/tool compatibility and native effect-ownership qualification. No substitute CLI/SDK executor or private app channel was used.

**Verification:** `python3 scripts/verify-m25-docs.py` passed with 10 guides/220 local links and anchors, current 42-path schema equality, accepted package command labels and unchanged VSIX hashes. Python `tomllib`/JSON parsed three proposed configuration blocks; seven public source snapshots/license hashes matched. Node 24.19.0 `deploy/m24/sign-release.mjs verify evidence/M24/release-public.pem` verified the trusted signature and both artifact checksums. [Research evidence](evidence/research/vscode-plugins-2026-10-11/README.md), [verification](evidence/research/vscode-plugins-2026-10-11/verification.json) and [official source catalog](evidence/research/vscode-plugins-2026-10-11/official-sources.json) record limits.

No runtime/source implementation, dependency/lockfile, native installation, credential/trust/consent, deployment or support-pin change occurred. Root/gateway/native suites were not rerun for documentation-only work; no new native/client acceptance follows. Preserve accepted packages, private state, ordinary editor and native history. Future implementation requires a specific target/role instruction and one bounded effort at a time.


### M25-DOCS-ADDENDUM-003 — Future macOS API client architectural design

**Recorded:** 2026-10-11 (Asia/Dhaka). **Status:** User-requested analysis/documentation complete; application implementation not started. M24/M25 remain Done for accepted subsets; M26 remains Not started; M16–M18 remain Deferred. **Model/effort:** Unrecorded. No Git metadata or commit SHA is invented.

Added [macOS client architecture](docs/guide/MacOSClientAPP/macos-client-architecture.md) and [implementation/onboarding plan](docs/guide/MacOSClientAPP/macos-client-implementation-plan.md), 9,021 words, linked from the manual hub and README. Defines a SwiftUI/AppKit first-party REST/SSE consumer plus a separate same-user local setup coordinator. Covers exact reference versions, attach/managed-local/remote modes, component/sequence diagrams, proposed screens/modules/interfaces, readiness, local Docker lifecycle, verified isolated editor/packages, guided native provider/task/pairing/consent, system-browser sign-in, new callback registration, Keychain ownership, scoped credentials, API route/request examples, journal/cursor/retry algorithms, controls, images, shutdown, distribution and phased test/acceptance plans.

Source audit establishes that public APIs do not start a stopped server, install/select the native backend, configure provider secrets or manufacture local consent. Basic chat requires no new executor, bridge or native patch. A new Mac callback must be registered in both the broker allowlist and persistent Keycloak; existing callbacks remain. Current broker client ID is fixed, attempts are process-local/five-minute/one-use, and lost exchange/restart can require fresh sign-in. Session-scoped key rotation cannot silently adopt old-principal operations. Future app setup/task handoff remains guided until separately reviewed native functionality exists.

**Verification:** `python3 scripts/verify-m25-docs.py` passed 12 guides/248 local links and anchors, 42-path recorded deployed OpenAPI equality and unchanged accepted package hashes/command labels. Seventeen documented route/method pairs and seven fenced JSON request examples were structurally checked against current OpenAPI; placeholders require valid configuration/current values and were not executed. Research README links passed. Node 24.19.0 `deploy/m24/sign-release.mjs verify evidence/M24/release-public.pem` verified the trusted signature/both artifacts. An initial negative-route search matched legitimate `auth/signin/start`; corrected to lifecycle-specific names and inspected the complete inventory. Primary Apple/Docker/VS Code/IETF sources are cataloged in [research evidence](evidence/research/macos-client-2026-10-11/README.md), [contract audit](evidence/research/macos-client-2026-10-11/contract-audit.json) and [verification](evidence/research/macos-client-2026-10-11/verification.json).

No app/helper source, dependency, lockfile, package, native API, callback/realm configuration, server lifecycle, credential, certificate trust or native grant changed. Private-state secret files were not read/exported. No prototype/native/novice/distribution acceptance is claimed; root/gateway/native suites were not rerun for documentation-only work. A future implementation requires a new instruction and scoped acceptance, without renumbering existing milestones.


**Documentation organization follow-up — 2026-10-11:** At the user's request, moved both Mac client guides into `docs/guide/MacOSClientAPP/`. Updated incoming and relative links, current evidence document paths/hashes, and recursive guide discovery in the documentation audit. The audit still passes all 12 guides/248 links and anchors; product/runtime scope is unchanged.


### M25-DOCS-ADDENDUM-004 — Codex consuming SDC as its model provider

**Recorded:** 2026-10-11 (Asia/Dhaka). **Status:** User-requested analysis/design/documentation complete; named-client implementation and acceptance not started. M24/M25 remain Done for recorded subsets, M26 Not started and M16–M18 Deferred. **Model/effort:** Unrecorded. No Git commit SHA is invented.

Added three guides under [CodexModelIntegration](docs/guide/CodexModelIntegration/README.md): setup/use, [compatibility architecture](docs/guide/CodexModelIntegration/compatibility-design.md), and [implementation/testing](docs/guide/CodexModelIntegration/implementation-and-testing.md), totaling 7,584 words. This direction is Codex → SDC Responses facade → existing server/companion/Cline → Cline's provider, not native Codex backend attachment. Guides cover desktop/IDE/developer CLI scope, candidate configuration, scoped key/helper and public-CA delivery, exact-version truthful alias catalog, compression, reasoning/storage/tool dialect constraints, per-model-call durable identity, canonical history/compaction/branches, caller-effect ownership, terminal-buffered versus full streaming requirements, cancellation, capacity/privacy and staged real-client/native qualification.

Official OpenAI Docs search/fetch establishes current Responses custom-provider and gateway rollout requirements. Read-only local `codex --version`/`--help` observed CLI 0.159.0 only; no desktop/IDE bundled pin is inferred. SDC source enforces mandatory stable identity, strict options, store=true, compressed-body refusal, function-only tools, canonical context and qualified native caller effects. Default deployed binding remains unqualified for caller tools. Static headers, fresh proxy UUIDs, body hashes or token helpers cannot establish safe logical intent by themselves. A facade is proposed only for demonstrated translation needs; it cannot invent retention/stream/permission semantics or execute another model runtime.

**Verification:** Recursive documentation audit passed 15 guides/279 local links/anchors, current/recorded 42-path OpenAPI equality and unchanged accepted VSIX command titles/hashes. Python tomllib parsed both hypothetical configuration blocks; five current provider route/method pairs and eight source-boundary assertions passed. Research links passed. Node 24.19.0 release verification passed trusted signature and both artifact checksums. [Research overview](evidence/research/codex-model-2026-10-11/README.md), [sources](evidence/research/codex-model-2026-10-11/official-sources.json), [contract audit](evidence/research/codex-model-2026-10-11/contract-audit.json) and [verification](evidence/research/codex-model-2026-10-11/verification.json) record the exact limits.

No personal Codex config/auth or private deployment credential file was read. No actual Codex request/capture, agent, fixture/native acceptance, catalog/helper/facade installation, runtime/configuration, dependency, lockfile, service, credential, certificate trust or native grant changed. Configuration examples remain future pilot skeletons; no stock Codex model-consumer/coding/full-gateway support is advertised. Full root/gateway/native suites were not rerun for documentation-only edits. A new bounded implementation instruction and fresh affected named-client/native acceptance are required to extend support.


### M26-START-001 — Release conformance and soak started

**Recorded:** 2026-10-11T07:03:00.727785+00:00 **Status:** In Progress. **Authority:** user explicitly requested finishing M26. **Model/effort:** Unrecorded. Freeze exact accepted M24 native/server/gateway pins, produce FR-01–FR-28 traceability, run locked Node 24/npm 11/Python/Swift/shared regressions, fresh affected native/media/control/client acceptance, three measured healthy-network control/approval/backlog trials and one-hour idle/active soak. Preserve credentials/private state/ordinary editor/native history. Retain current consent and human-only password entry; any required new native category remains action-time reviewed. Do not infer release completion from fixtures, historical pins or elapsed time alone.


### M26-CHECKPOINT-001 — Frozen native qualification and final soak running

**Recorded:** 2026-10-11T09:55:56.720937+00:00 **Status:** In Progress. **Model/effort:** Unrecorded. Clean Node24/npm11 root182/182 with all DB suites enabled, locked gateway54/54, Swift8/8, Aider shim2/2 and separate storage restart/restore passed. Frozen90product/lock/contractfiles and all5images remain unchanged. Current real local Keycloak/TLS/Cline/companion passed provider sync/SSE/retrieval, same-task recall, committed PNG/JPEG staging, Aider two sequential whole-file edits per profile, question, signed once/deny and native cancellation. Native approval visibility83/156ms; simulated guarded native effects with realHTTP/PostgreSQL/SQLite measured three60-control trials p95<119ms and retained10MiB stalled backlog p95~116ms. Production server/gateway restart preserved same scoped credential and history. Local takeover's old binding refused403. Approvals-disabled restored graphically on exact same task; Auto-approve remained None.

**Corrections:** Initial first-party driver's final scoped-key cleanup failed after owner token expired; retained failed attempt, fresh human SSO and M26-only key cleanup, then repeat passed including revocation401. Owner refresh now stays in memory. Aider CA was corrected to additive certifi+publicprojectCA and rerun. Disposable DB restart overlapped the initial bridge soak and terminated its pool; retain original running-state partial report plus process crash log and do not count it as pass. Preliminary deployed monitor saw expected takeover/restart gaps. Replacement bridge hour and final real-native idle30min/active30min hour plus independent deployment monitor are running with no fault injections. Final local-disable requires a fresh unexpired still-authenticating key because earlier stale-key401 only proved expiry.

**Remaining:** actual completed duration/active counts/no failures/cleanup for all final hour reports; live-key local-disable; final frozen gate/docs/handoff audit and service cleanup. [Release report](evidence/M26/README.md), [requirements](evidence/M26/traceability.md), [maintainer handoff](evidence/M26/HANDOFF.md) preserve reproduction and exact limits. No public publication, new platform/runtime/model client or extra native grant is claimed.


### M26-DONE-001 — Frozen local Cline/API release qualified

**Recorded:** 2026-10-11 16:58 +06:00 (Asia/Dhaka) **Status:** Done for declared local subsets. **Model/effort:** Unrecorded. **Commit:** unavailable; no Git metadata. The user authorized finishing M26. Freeze remained intact across all90product/lock/contractfiles, accepted signed archives, installed native/addon/companion fingerprints and all5deployedimageIDs. [Final audit](evidence/M26/gate-audit.json) passed; [release report](evidence/M26/README.md), [verification](evidence/M26/verification.json), [FR-01–FR-28 traceability](evidence/M26/traceability.md) and [maintainer handoff](evidence/M26/HANDOFF.md) are complete.

**Validation:** clean Node24.19.0/npm11.12.1 `npm ci`, build/lint and enabled root tests182passed/0failed/0skipped; Python3.13.16/uv0.12.23 locked gateway54passed; Swift8passed; pinned Aider0.86.2/Python3.12.15 shim2passed; separate disposable storage restart/dump/restore passed. Official isolated host signature and independently retained project public-key release signature/archive hashes passed. Current NodeSDK real HTTPS/Keycloak/native sync/discovery/count/SSE/retrieval, same-task context, checksummed committed PNG/JPEG across4routes, Aider2sequential whole-file edits per Chat/Messages profile and exact signed once/deny/question/cancel passed. Production server/gateway restart preserved same scoped credential/history; native local intervention fenced stale admission403; approvals-disabled restored.

**Measured gates:**3healthy60-control trials through realHTTP/PostgreSQL/BridgeRuntime/fileSQLite to guarded simulated native effect: p95=113.622/118.167/116.162ms. Defined10MiB/20event hung outbox retained all20while60controls p95=115.474ms; no model time. Actual native bridge-observation→publicHTTPS/SSE approval visibility83/156ms on same Mac, below1s. Actual native hour3600002.286ms passed30minidle+30minactive/20completed tool-free turns, gateway admissionp95=58.459ms versus model-inclusivecompletionp95=53565.623ms. Bridge hour3600000.354ms/60controls (p95=156.822ms) and independent deployment monitor3600.010s/120samples passed. Zero failures in all final hour reports.

**Corrections/limits:** retain owner-expiry failed cleanup, recoveredM26-only key cleanup and successful repeated control run; interrupted first bridge-soak pool crash from overlapping disposable DB restart and full no-fault rerun; preliminary monitor intentional takeover/restart gaps; additivePythonCA fix/Aider rerun; final-disable checker failed comparing detached snapshot projection0 against live61, then corrected to durable admitted command count and repeated. Product code/packages/images remained unchanged, so these qualification-driver repairs do not invalidate the completed native hour. Final live-key Disconnect retest authenticated200/refusedprompt403/unchangeddurablecount; revoke401 and zero unrevokedM26keys.

**Handoff:** bridge disconnected, exact task1791641555978_71d6l/history and stock editor retained, approvals disabled/Auto-approveNone, five persistent local services healthy/verifiedHTTPS+OIDC200, disposable PostgreSQL stopped. Same signed candidate's actual graphical install/upgrade/rollback/uninstall/reinstall is reused from immediately preceding M24. Current default caller functions withheld; historical M30 differently pinned tool binding is not automatically current support. One real Cline task, exact NodeSDK/Aider shim text subsets, local loopback and labeled server estimates only. PythonSDKs/two-binding races remain fixture-qualified; no Internet production/Marketplace publication/new platform/version/tool-client/Codex/Claude/Mac-app implementation claim. All27in-scope milestones Done; M16–M18 Deferred. No next milestone or publication started.

## Source repository preparation — 2026-10-11

User-requested GitHub source preparation, separate from completed product milestones:
initialized local Git on `main`; retained the existing MIT license and upstream
Apache-2.0 fixture license; added contribution, security, third-party notice, PR
template and source-distribution guidance. Source/dependency locks/templates/tests
are staged. Dependencies, compiled output, private state, chat histories and raw
qualification captures remain local and ignored. Markdown evidence narratives and
artifact manifests remain versioned; historical raw-evidence links require the
original local archive. No remote, initial commit or upload was created.

Validation used an export of the Git index into a fresh temporary directory with
Node 24.19.0/npm 11.12.1: `npm ci`, `npm run build`, `npm run lint`, `npm test`
passed (125 passed, 56 skipped, 0 failed). Database-dependent checks were not enabled.
The native-artifact conformance test now explicitly skips absent preserved bundles
in source-only checkouts; `SDC_REQUIRE_NATIVE_ARTIFACTS=1` makes absence fail.
The strict test failed as expected in the clean export and passed both checks on
the original local artifacts. No product implementation or frozen native artifact
was changed. `git diff --cached --check` passed. Staged-file scans found no private
key blocks, common provider-token patterns or JWT credentials; these scans are
bounded checks, not a guarantee against all possible confidential data.
