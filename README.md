# Server-Driven Chat

**Control an existing Cline conversation from a web interface or an authenticated API.**

Server-Driven Chat (SDC) connects a server to a Cline task running in VS Code.
You can send prompts, stream responses, answer questions, and request cancellation
without moving the conversation out of Cline. A persistent bridge delivers commands
and returns events, while the server manages identity, permissions, conversation
records, and recovery.

Cline remains the application that runs the model and performs native actions.
SDC adds a control layer with explicit local consent; it does not run a separate
headless coding agent.

[Getting started](#getting-started) · [Architecture](#architecture) ·
[API](#api) · [Developer setup](#developer-setup) ·
[Documentation](#documentation) · [Contributing](#contributing)

## Features

- **Web control interface:** send prompts, view conversation output, answer native
  questions, and request cancellation for a connected task.
- **Public APIs:** first-party REST/SSE plus defined OpenAI Chat Completions,
  OpenAI Responses, and Anthropic Messages compatibility profiles.
- **Persistent delivery:** PostgreSQL server records, a local SQLite bridge
  inbox/outbox, command acknowledgements, event replay, and reconnect handling.
- **Scoped access:** OIDC sign-in, device pairing, session-scoped API credentials,
  and explicit local selection of permitted controls.
- **Native approval handling:** decisions address a specific native request and
  revision. Approval controls require a separately consented binding.
- **Attachments:** committed PNG/JPEG inputs on the qualified native/API paths.
- **Deployment tooling:** Docker services, an HTTPS proxy, database migrations,
  backup/restore procedures, and package integrity verification.

## Project status and supported environment

The current release has completed local qualification, including native workflows,
package lifecycle checks, recovery tests, and one-hour soak runs. Support is limited
to the recorded environment below; it is not a general compatibility claim.

| Component | Qualified target |
|---|---|
| Native host | macOS on Apple silicon (`arm64`) |
| Editor | Isolated VS Code **1.140.0** |
| Cline | Maintained **4.1.2204** build, native API **1.3**; based on upstream 4.1.22 |
| SDC companion extension | **0.7.3** |
| Server deployment | Local Docker, PostgreSQL **17.11**, Keycloak **26.4.7**, private CA/TLS |
| Selected local controls | Prompts, questions, and cancel; approvals disabled by default |
| API clients | Declared SDK subsets and Aider **0.86.2** with the supplied shim and text/whole-file settings |

Stock Cline and arbitrary newer versions are not interchangeable with the maintained
build. Other native hosts, Codex/Claude backends, a standalone Mac client, and
Internet production deployment are not currently qualified. Codex-as-a-model-consumer
integration is a design proposal, not a supported client.

See the [support matrix](docs/guide/support-matrix.md) for exact SDK versions,
capabilities, unsupported fields, and client restrictions. The
[release qualification summary](evidence/M26/README.md) describes the recorded runs.

## Architecture

### Runtime components

![Runtime architecture: HTTPS edge, server services, and the consented Cline desktop bridge](docs/assets/runtime-architecture.svg)

The **server** is authoritative for credentials, authorization, durable operations,
idempotency, scheduling, and API conversation policy. The **gateway** translates
public request/response formats and relays streams; it has no direct database or
native application access. The **desktop bridge** checks its current authority
before applying an action through the reviewed Cline API.

The browser control UI and the public API reach the same server through different
routes. A successful HTTP submission means the server accepted work; completion is
reported through operation records and events after the native application responds.

### Prompt and response flow

This sequence assumes graphical sign-in, pairing, task selection, and local consent
have already completed.

![Prompt and response sequence from API admission through Cline execution and recorded output](docs/assets/prompt-response-flow.svg)

Questions and approval decisions refer to exact pending requests. Chat text does
not grant permission. Disconnect, local takeover, expired authority, and changed
bindings fence further remote actions. Recovery uses retained receipts and replay;
it does not silently restore a revoked native grant.

### Code boundaries

`protocol/` defines vendor-neutral contracts. Shared server, bridge, and adapter
interfaces depend inward on those contracts. Cline-specific integration stays in
`adapters/cline/` and `extensions/vscode/`; provider wire formats stay in
`api-gateway/`. The fake adapter is used for simulation and tests.

## Getting started

### Use a prepared installation

1. Have an operator prepare the local services, trusted TLS configuration, and
   exact maintained Cline/companion packages using the
   [operator guide](docs/guide/operator-guide.md).
2. Open the isolated VS Code installation with both extensions. Isolation requires
   separate user-data **and** extension directories, or a separate macOS account;
   a VS Code profile alone does not isolate extension binaries.
3. Open the intended Cline task and follow the graphical Connect workflow. Sign in,
   select the task, and consent to the required control categories.
4. Open the control page at your configured server origin. The documented local
   deployment uses `https://localhost:15943`.
5. Send a prompt, observe its output, and use only the controls enabled for that binding.

The [beginner user guide](docs/guide/user-guide.md) walks through these steps.
For API access after pairing, follow the [API guide](docs/guide/api-guide.md).

### Build from source

Start with [developer setup](#developer-setup) below. Building the workspace creates
server, UI, and bridge outputs; it does **not** provision identity, establish native
consent, or install the accepted Cline package pair.

Generated VSIX packages and preserved historical native bundles are excluded from
Git. Current packaging scripts require exact reviewed release inputs, so a source
clone alone cannot reproduce the previously accepted native release archive.
See [source distribution notes](docs/source-distribution.md) before attempting
native packaging and [local deployment setup](deploy/m24/LOCAL.md) before provisioning
services. Keep deployment credentials and signing keys outside the checkout.

## API

All three API profiles use the same server-owned operations and consented native
binding. Clients must follow SDC's authentication, request-identity, and capability
requirements; changing an SDK's base URL alone is not sufficient for every client.
Provider generation requests require a stable `Idempotency-Key` so retries retain
the identity of the original operation.

| Interface | Base path | Contract |
|---|---|---|
| First-party REST/SSE | `/api/v1` | [Sessions, generations, controls, credentials and events](docs/public-rest-api.md) |
| OpenAI-compatible profile | `/openai/v1` | [Chat Completions and Responses](docs/openai-api-profile.md) |
| Anthropic-compatible profile | `/anthropic/v1` | [Messages, discovery and input estimates](docs/anthropic-api-profile.md) |

Read the [API guide](docs/guide/api-guide.md) for executable examples and the
[OpenAPI specification](api-gateway/openapi.json) for route schemas.

These are defined compatibility subsets. Unsupported options are rejected before
native dispatch. Provider streams use the documented event framing and buffering
semantics; they do not promise token-by-token native output. Model identifiers are server-defined aliases for eligible bindings;
they do not switch Cline's configured model arbitrarily. Reported token estimates
and budgets describe server accounting, not measured native generation or provider
billing. Caller tools are withheld on bindings without the required qualification.

## Developer setup

### Prerequisites

| Tool | Needed for |
|---|---|
| Node.js **24 LTS** and npm **11** | TypeScript workspaces, UI, bridge and Node tests |
| Python **3.13.16** and uv **0.12.23** | Locked gateway environment |
| Docker with Compose | Disposable database tests and local service deployment |
| Swift **6.2+**, macOS **15 SDK+** | Optional Swift companion-core development on macOS |

From the repository root:

```sh
npm ci
npm run build
npm run lint
npm test
```

`npm test` regenerates protocol schemas and runs the repository/conformance suites.
Database checks skip unless their test environment variables are supplied. The
native-bundle check skips when preserved native artifacts are absent; release
qualification uses `SDC_REQUIRE_NATIVE_ARTIFACTS=1` to make missing artifacts fail.
Passing portable tests does not establish native compatibility.

For gateway checks, build the TypeScript workspaces first, then:

```sh
cd api-gateway
uv sync --locked
uv run --locked python -m pytest -q
```

See the [gateway README](api-gateway/README.md) for integration-test configuration.
To test the optional Swift core:

```sh
swift test --package-path companion
```

The Swift package contains companion foundations and a GUI shell; it is not the
standalone Mac client proposed in the design documents.

### Database integration tests

Use the disposable test service, never a deployment database:

```sh
docker compose up -d postgres-m06
M08_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@127.0.0.1:55432/sdc_m06_test npm run test:m08
docker compose stop postgres-m06
```

The credentials above belong only to the disposable loopback fixture. Additional
storage, transport, lease, and recovery checks are documented in
[AGENTS.md](AGENTS.md) and the [maintainer guide](docs/guide/maintainer-guide.md).
Run Docker restart/restore checks separately from concurrent database suites.

## Repository layout

| Path | Responsibility |
|---|---|
| `protocol/` | Wire contracts, validation, schemas and fixtures |
| `server/` | HTTP services, authentication, policy, scheduling and PostgreSQL migrations |
| `api-gateway/` | FastAPI facade and provider compatibility profiles |
| `bridge/` | Command delivery, local SQLite persistence and recovery |
| `adapters/core/` | Neutral native-adapter interface |
| `adapters/cline/` | Maintained Cline integration |
| `adapters/fake/` | Simulated adapter for testing |
| `extensions/vscode/` | Companion extension, native patches and packaging scripts |
| `control-ui/` | React browser control interface |
| `companion/` | Swift companion core and GUI shell |
| `deploy/` | Container, TLS, identity and lifecycle tooling |
| `tests/` | Contract, integration, recovery and conformance tests |
| `docs/` | User guides, API contracts, architecture decisions and future designs |
| `evidence/` | Versioned qualification narratives and package manifests |

Raw local qualification captures, private configuration, dependencies, and generated
packages are intentionally excluded. Historical evidence links may require the
original local archive; see the [source inclusion policy](docs/source-distribution.md).

## Documentation

| Goal | Read |
|---|---|
| Use the installed system | [Beginner guide](docs/guide/user-guide.md) |
| Find all manuals | [Documentation hub](docs/guide/README.md) |
| Check supported versions and API fields | [Support matrix](docs/guide/support-matrix.md) |
| Deploy, back up or restore services | [Operator guide](docs/guide/operator-guide.md) |
| Create and trust certificates | [Certificate guide](docs/guide/certificates.md) |
| Develop and verify changes | [Maintainer guide](docs/guide/maintainer-guide.md) |
| Understand design decisions | [Architecture decisions](docs/decisions/README.md) |
| Review requirements and implementation history | [Requirements](requirements.md) and [tracker](IMPLEMENTATION_TRACKER.md) |
| Change the maintained Cline version | [Migration guide](docs/guide/cline-version-migration.md) |

Future integration designs are documented separately: a
[native macOS client](docs/guide/MacOSClientAPP/macos-client-architecture.md),
[other VS Code plugins](docs/guide/other-vscode-plugins.md), and
[Codex as an API consumer](docs/guide/CodexModelIntegration/README.md).
These documents do not add those integrations to the current supported release.

## Contributing

Bug reports, documentation improvements, tests, and focused code changes are welcome.
Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions, validation, and the
pull request process. Discuss substantial architecture or native-version changes
before implementing them.

Report vulnerabilities through the process in [SECURITY.md](SECURITY.md). Do not
include credentials, private keys, or user conversation data in public reports.

## License

ServerDrivenChat-owned code is licensed under the [MIT License](LICENSE).
Cline-derived material and dependencies retain their own licenses, including
Apache-2.0 for the retained Cline fixture. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
for attribution and distribution details.
