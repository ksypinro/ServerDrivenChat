# Maintainer handoff

This guide explains who owns each behavior, how to check a change, and how to investigate a failure. Start with the [support matrix](support-matrix.md): the exact accepted packages and limited client subsets define the current support claim. Read [IMPLEMENTATION_TRACKER.md](../../IMPLEMENTATION_TRACKER.md) before working; implement one milestone at a time.

## Contents

1. [Architecture and ownership](#1-architecture-and-ownership)
2. [Security and durability invariants](#2-security-and-durability-invariants)
3. [Reproduce the checks](#3-reproduce-the-checks)
4. [Maintain schemas and guides](#4-maintain-schemas-and-guides)
5. [Diagnose an operation](#5-diagnose-an-operation)
6. [Handle incidents](#6-handle-incidents)
7. [Handoff to the next milestone](#7-handoff-to-the-next-milestone)

## 1. Architecture and ownership

```mermaid
flowchart LR
    Browser[Browser control UI] --> Server[TypeScript server]
    Client[REST or SDK client] --> Gateway[FastAPI facade]
    Gateway --> Server
    Server --> DB[(PostgreSQL)]
    Server <-->|authenticated commands / events| Bridge[VS Code companion / bridge]
    Bridge --> Inbox[(Local SQLite inbox)]
    Bridge <-->|adopted native API| Cline[Existing Cline task]
    Cline --> Model[Configured model provider]
```

An API format is a facade over this path. The gateway does not execute a model. Native activity is observable, but it is not automatically a caller-owned function call. The server owns the public conversation/history/tool ledger under [DECISION-010](../decisions/010-server-owned-api-semantics.md).

| Owner | Source and responsibilities |
|---|---|
| Neutral contracts | `protocol/`: versioned wire schemas, canonical digests, IDs and spelling from `requirements.md` |
| Server persistence | `server/src/storage/`, `server/migrations/`: command/event history, transactions, receipt continuity, schema evolution |
| Identity/transport | `server/src/auth/`, `server/src/http/`: OIDC, human/device authority, pairing, HTTP/SSE, signed decisions |
| Public semantics | `server/src/public-api/`: credentials, operations/idempotency, admission/rates, aliases, conversation composition, caller tools, estimates/budgets |
| Local recovery | `bridge/`: file-backed SQLite inbox/outbox, checkpoints, reconnect, lease/scheduler and effect recovery |
| Neutral adapter SDK | `adapters/core/`: mutation context, capabilities and lifecycle boundary |
| Simulation | `adapters/fake/`: test-only scripted native effects; never evidence of real host support |
| Cline adoption | `adapters/cline/`, `extensions/vscode/`: reviewed maintained native patch, exact task selection/controls, graphical Connect and selected-profile forget |
| Provider formatting | `api-gateway/sdc_gateway/`: strict first-party/OpenAI/Anthropic schemas, HTTP/SSE relay and normalization; no database/native access |
| Browser | `control-ui/`: human sign-in, sessions/transcript, prompts/questions/decisions/stop |
| Swift companion core | `companion/`: Swift modules/Keychain and historical native shell; not a new installer requirement |
| Distribution | `deploy/m24/`, extension packaging scripts: local container/proxy/configuration, signing, isolation and backup tooling |
| Evidence | `evidence/M*/`: exact pins, commands, observed effects, failures, limits and historical checkpoints |

Shared server/bridge/core code depends inward on protocol, never on a provider SDK, Cline UI or FastAPI. Keep TypeScript strict ESM/NodeNext, four-space indentation and named exports. Document a boundary reason before using `any`. Keep Swift four-space formatting/public API comments. Pin direct dependencies and update lockfiles together with manifests.

## 2. Security and durability invariants

Preserve these when repairing behavior:

1. **Existing native execution.** No replacement runtime, headless executor, private native socket or provider SDK model server.
2. **Graphical consent.** Exact native task/control approval remains local. Device/API credentials do not grant arbitrary native permissions. The current local profile has prompts/questions/cancel, approvals disabled.
3. **Authority at the effect boundary.** Native mutations call `AdapterMutationContext.assertAuthority()` at the actual effect, honor cancellation, and use the command fence. Recheck user/device/session/binding authority inside write transactions.
4. **Conservative leases.** Default lease 60 seconds, renewal 20 seconds; use conservative monotonic deadlines. An expired connection cannot keep remote authority by retaining a UI flag.
5. **Receipt continuity.** Retain authenticated `command.skipped` tombstones; output checkpoints are per session/epoch. Scope schedulers to bindings sharing the durable device inbox.
6. **No blind native retry.** “Durably queued,” “native applied” and “native completed” are separate observations. Unknown effect after a crash requires reconciliation, not an automatic second dispatch.
7. **Exact approvals/questions/cancel.** Preserve addressed request/turn IDs, revisions, action digests and stale/local-resolution fences. Only once/deny is qualified for the native approval route; no persistent grant expansion.
8. **Public ownership.** Stable original request key, immutable principal/binding scope, server canonical history and caller-issued tool-result ownership. A replacement key does not inherit prior operation IDs.
9. **Stateful native isolation.** Exclusive mode requires a qualified task boundary. Shared-task mode explicitly exposes existing native context; no hidden-context isolation claim.
10. **Honest usage and streams.** Estimates are labeled server estimates. Terminal-buffered public SSE is not native live token streaming or provider billing. Output/deadline settlement does not prove native work stopped.
11. **TLS/origin restrictions.** Loopback or fixed operator-managed private origins; certificate validation on; exact callback/issuer/audience. No wildcard callbacks, caller-supplied upstream or ambient proxy redirects.
12. **Safe cleanup.** Revoke selected device before deleting its saved credentials/closed inbox. Failure retains retry state and fences Connect. Preserve other profiles/history/CA state.

M23 hardening is accepted only for its recorded pin. A later native change needs affected hardening and real host acceptance. Do not infer M26 release/soak from earlier bounded reconnect tests.

## 3. Reproduce the checks

### Locked workspace and Swift

From the repository root, with Node **24 LTS** and npm **11** selected:

```sh
node --version
npm --version
npm ci
npm run build
npm run lint
npm test
swift test --package-path companion
```

The final M24 workspace run used Node **24.19.0**. The package engine requires `>=24 <25`; Node 25 is not the specified check runtime. `npm test` regenerates protocol schemas before running tests. Review intentional schema changes. A passing portable test run may skip optional database suites; record pass/skip counts rather than claiming storage/auth/integration from empty wiring checks. Swift checks need the supported macOS SDK/toolchain; see the root README.

For a changed package, run its focused checks first. For a cross-package change, complete root build/lint/smoke too. Stateful milestone behavior needs meaningful tests, including file-backed SQLite and injected failures for recovery. Do not add tests that merely repeat a reversible prose change.

### Disposable PostgreSQL integration

The repository regression database is separate from the retained `sdc-local` deployment:

```sh
docker compose up -d postgres-m06
export M06_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@127.0.0.1:55432/sdc_m06_test
export M08_TEST_DATABASE_URL="$M06_TEST_DATABASE_URL"
export M09_TEST_DATABASE_URL="$M06_TEST_DATABASE_URL"
export M10_TEST_DATABASE_URL="$M06_TEST_DATABASE_URL"
M06_TEST_DOCKER_RESTART=1 M06_TEST_DOCKER_RESTORE=1 npm run test:m06
npm run test:m08
npm run test:m09
npm run test:m10
docker compose stop postgres-m06
```

These are intentionally public disposable test credentials, not the private M24 login. Run restart/restore checks separately from concurrent database suites because restarting the shared test container interrupts other fixtures. M10 also runs a loopback HTTP fixture. M08/M09/M10 use a synthetic identity provider; they do not prove real Keycloak configuration.

For later focused suites, set the corresponding variable to this **disposable** URL: `M11_TEST_DATABASE_URL`, `M21_TEST_DATABASE_URL`, `M22_TEST_DATABASE_URL`, `M27_TEST_DATABASE_URL` and `M30_TEST_DATABASE_URL`, as required by the selected test file. For example:

```sh
M27_TEST_DATABASE_URL="$M06_TEST_DATABASE_URL" npm run test:m27
M27_TEST_DATABASE_URL="$M06_TEST_DATABASE_URL" npm run test:m29
M30_TEST_DATABASE_URL="$M06_TEST_DATABASE_URL" node --test tests/m30-isolation.test.mjs
```

Start the test service before those commands and stop it afterwards. Never use the retained local deployment database for a schema-creating/dropping regression fixture. M29 uses the M27 database variable; the script name does not imply a separate M29 variable.

### Gateway

Build TypeScript first. From `api-gateway/`, use Python **3.13.16**, uv **0.12.23** and the existing `uv.lock`:

```sh
uv sync --locked
uv run --locked python -m pytest -q
M27_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@127.0.0.1:55432/sdc_m06_test SDC_TEST_NODE=/absolute/path/to/node24 uv run --locked python -m pytest -q
```

The second pytest command enables real HTTP/PostgreSQL fixtures and official SDK consumers; native events remain scripted in those fixtures. That is different from the deployed M24 real Cline acceptance. Do not silently substitute another Python version if the locked interpreter is unavailable. Recreate a broken `.venv` using the exact lock/interpreter, preserving the lockfile; report a missing runtime as a limitation.

### Native and packaging checks

Historical M21 packaging freezes its own artifacts and refuses newer companions. M22 uses `extensions/vscode/scripts/package-m22.mjs`. Current M24 uses `extensions/vscode/scripts/package-m24.mjs`; follow [deployment notes](../../deploy/m24/README.md), verify the resulting manifest and explicitly sign reviewed changes. Regeneration/signing is release work, not required for editing guides.

Do not automatically install a generated candidate in the ordinary host. A native/package change requires reviewed adoption, signed isolated installation, human credential entry and exact action-time task/control consent. Preserve host/pair/API fingerprints, actual dispatch receipts, native effect/output and limits. The current [M24 acceptance](../../evidence/M24/persistent-local/final-acceptance.json) is the reference, not an instruction to replay all GUI lifecycle actions on every documentation change.

## 4. Maintain schemas and guides

The beginner entry point is [docs/guide/README.md](README.md). Historical milestone guides remain useful records, with current-guide banners so beginners do not accidentally install old pins.

When changing an API field or supported option:

1. Update the authoritative gateway model and neutral server mapping together, without leaking provider spelling into shared contracts.
2. Add appropriate stateful/validation tests; fail unsupported options before native admission.
3. Regenerate OpenAPI from `create_app().openapi()` using the locked environment.
4. Review the schema diff, exact support matrix and API examples.
5. Test the affected supported profile and document fixture/native/client scope separately.

For the deployed container, this read-only export is useful:

```sh
docker exec sdc-local-gateway-1 python -c 'import json; from sdc_gateway.app import create_app; print(json.dumps(create_app().openapi(), sort_keys=True, indent=2))' > /tmp/sdc-deployed-openapi.json
```

Compare parsed JSON to `api-gateway/openapi.json`; formatting alone is not a contract difference. The M25 [deployed snapshot](../../evidence/M25/deployed-openapi.json) has 42 paths and matches the checked-in schema. The local proxy does not expose FastAPI Swagger/OpenAPI routes as a public documentation site; use the checked-in file.

Check guide links, anchors, current VSIX command titles and sample syntax with:

```sh
python3 scripts/verify-m25-docs.py
node --check docs/guide/examples/sdk-text.mjs
node --check docs/guide/examples/rest-text.mjs
```

Run the documented SDK/REST samples against an **already consented disposable native task**, using a short-lived session-scoped key in a private file and the public CA. Revoke it afterwards. Read-only checks do not broaden native support. The [M25 evidence](../../evidence/M25/README.md) records the actual outcome, including current-versus-historical walkthrough coverage.

## 5. Diagnose an operation

Start with a timestamp, session ID, original idempotency key and operation/command/turn/request IDs. These are correlation identifiers; an API token is a secret. Do not request a password or raw authorization header from a user.

1. **Admission:** Did the request fail validation/auth/rate/readiness before admission? A rejected request has no implied native effect. Keep the reported error/status.
2. **Durable state:** Does the original operation exist under its original credential? After a lost response, retrieve/retry the same normalized request with the same key. Do not change the body or key merely to force success.
3. **Command state:** Was the command queued, dispatched, acknowledged applied/rejected/skipped, or left uncertain? A POST 202 is durable acceptance, not effect proof.
4. **Native state:** Is the exact task active, waiting for a native approval/question, locally resumed/taken over, disconnected or terminal? Use the native UI and exact receipt/turn checkpoint.
5. **Authority:** Did device/key expiry, revocation, binding replacement, stale epoch or lease expiry fence dispatch? A cached connected label is not sufficient.
6. **Terminal evidence:** Is there actual native completion/abort evidence or only public quota/deadline settlement? Do not release a still-uncertain native lane through a guessed final result.
7. **Projection:** Compare snapshot watermark and event sequence. Resume/rebuild from authoritative snapshot if replay is outside retention; do not invent missing transcript events.

SSE disconnect is a transport event, not proof that an instruction stopped. Shared native work can require local attention. The [API guide](api-guide.md) defines pending/terminal states and retry/control contracts.

## 6. Handle incidents

| Incident | First action | Recovery and evidence |
|---|---|---|
| Wrong task or unintended native tool proposal | Disconnect remote delivery; decline native proposal or use local stop | Inspect exact binding/scope; preserve addressed receipts; reconnect only after the intended owner confirms the task |
| Request response lost | Preserve original key/body/credential | Retrieve/retry same operation; distinguish already applied from still pending; no blind duplicate |
| Repeated 409 / stale question | Read current snapshot/native interaction | Use current IDs/revision; a new key does not repair a stale control target |
| Public result timed out but native still running | Check actual native turn; request addressed cancel if authorized | Wait for terminal/reconciliation evidence; public deadline is not a kill guarantee |
| Credential leak | Authorized owner revokes affected device/key; disconnect locally if reachable | Rotate scoped API key; new key cannot retrieve old principal's operation IDs; preserve audit without secret contents |
| Cleanup identity refresh expired | Leave delivery disconnected and credentials/inbox retained | Human browser reauthentication, then selected-profile retry; no manual delete before server revocation |
| TLS/issuer/callback mismatch | Stop connection attempts to the unexpected origin | Verify trusted CA/host/exact callbacks; never turn TLS verification off |
| Native crash / unresolved applied receipt | Stop duplicate dispatch and preserve inbox/checkpoints | Reconcile through supported native recovery; escalate unresolved effect rather than asserting exactly-once completion |
| Disk/capacity pressure | Inspect bounded storage and service health | Preserve retained history; explicit backup/retention decision, no blanket database/inbox purge |
| Restore requested | Quiesce writers and retain originals | Independent restore of both databases, attachments and matching protected configuration before any switch |

Record the affected exact pins, timestamps, sanitized identifiers, expected versus observed behavior, authority state and checks performed. Do not copy raw secret stores, provider keys, login files, cookies, full callback URLs or unreviewed transcript bodies. Full native prompt logging is not a default diagnostic requirement.

Security authority failures remain inside their owning transaction/effect boundary. A UI workaround that suppresses the error does not repair authority. Add a regression at the actual failing seam and rerun the focused affected suite before broader checks.

## 7. Handoff to the next milestone

M25 finishes documentation, contract/example checks and the maintainer handoff for the declared M24 target. It does not change binaries or start the next milestone.

**M26 is Done for the exact selected local target.** [M26 report](../../evidence/M26/README.md), [requirement traceability](../../evidence/M26/traceability.md) and [release handoff](../../evidence/M26/HANDOFF.md) record fresh qualification and complete actual-hour results. Changed pins or additional support require new affected acceptance. Its [tracker specification](../../IMPLEMENTATION_TRACKER.md#m26--clineapi-release-conformance-and-soak-gate) owns frozen release fingerprints, requirement traceability, fresh native/client/media acceptance and measured performance/load/soak. Read the tracker for the exact gates, including the one-hour soak and latency/attachment requirements; do not mark them complete from M24 lifecycle or M25 examples.

Retain the exact signed pair/images, current support matrix, private-state backup and all recorded failures/limits. A newly adopted native pin, expanded caller-tool qualification, new client or Internet deployment requires affected acceptance before changing support claims. M16–M18 remain Deferred. No standalone SwiftUI installer or new desktop frontend is required.
