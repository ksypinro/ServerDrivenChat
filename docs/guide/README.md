# ServerDrivenChat: start here

This manual is for the **M24 local release accepted on 11 October 2026**. It explains the current product, rather than the older development packages described elsewhere in the repository. You can use the graphical product without a terminal. Programming examples and server administration have their own guides.

ServerDrivenChat lets you send instructions to an **existing Cline conversation in VS Code** from a browser or an authorized API client. Cline still runs the model and enforces its native permissions. Keep VS Code running while you use it.

## Choose your guide

| Your goal | Read this |
|---|---|
| Install the reviewed packages, connect a task and use the browser | [Beginner user guide](user-guide.md) |
| Get/create certificates and add trust for browser, VS Code or API access | [Certificate guide](certificates.md) |
| Understand exactly which versions, files, controls and clients were tested | [Support and field matrix](support-matrix.md) |
| Write a REST/SSE client or use an OpenAI/Anthropic SDK | [API and client guide](api-guide.md) |
| Provision, start, back up, restore or upgrade the local server | [Operator runbook](operator-guide.md) |
| Maintain the code, run checks or handle a failure | [Maintainer handoff](maintainer-guide.md) |
| Use another Cline version or a Cline-derived fork | [Cline migration analysis and steps](cline-version-migration.md) |
| Compare/configure official Codex or Claude Code VS Code extensions | [Alternative extension guide](other-vscode-plugins.md) |
| Use SDC as Codex's model provider | [Detailed Codex provider analysis, setup and engineering plan](CodexModelIntegration/README.md) |
| Plan a new native adapter, named API client or MCP facade | [Plugin integration engineering plan](plugin-integration-plan.md) |
| Design a Mac app for server/backend setup, sign-in and chat | [macOS client architecture](MacOSClientAPP/macos-client-architecture.md) and [implementation plan](MacOSClientAPP/macos-client-implementation-plan.md) |

If you are new, read the user guide first. You do not need to understand Docker, OAuth or API keys to follow its everyday workflow. An operator prepares the local installation first.

The three extension-expansion documents are research and proposed procedures reviewed on 11 October 2026. They do not add an accepted Cline version, Codex/Claude backend, named API client or MCP endpoint to the release.

The two macOS-client documents are a user-requested future application design, also reviewed on 11 October 2026. They explain the local setup layer and public API layer separately, with guided native consent. No new Mac app or callback configuration has been implemented.

`CodexModelIntegration/` contains a separate detailed design for Codex calling SDC as its Responses model service. It is a proposed named-client integration, with request-identity, catalog, payload/tool, context, retention and streaming gates. Codex is not yet an accepted SDC model consumer.

## The accepted installation

| Component | Exact accepted target |
|---|---|
| Computer | macOS on Apple silicon (`arm64`) |
| Editor | Official, signature-verified VS Code **1.140.0**, in a separate installation |
| Maintained Cline | **4.1.2204**, native API **1.3** |
| Companion extension | **0.7.3**, “Server-Driven Chat — Cline bridge” |
| Browser/server address | **`https://localhost:15943`** |
| Deployment | Persistent local Docker; PostgreSQL **17.11**, Keycloak **26.4.7**, private CA TLS |
| Local control selection tested on this deployment | **prompts, questions, cancel**; approvals disabled |

“Accepted” means the stated scenario passed with recorded evidence. It does not mean every version, client or option will work. The [support matrix](support-matrix.md) separates the current deployment from historical acceptance and unsupported features.

## The three things you will open

1. **Docker Desktop** keeps the local server services running.
2. **ServerDrivenChat VS Code.app** opens the isolated editor. Cline and the bridge run there.
3. **Your browser** opens `https://localhost:15943` to send messages and answer questions.

For this already provisioned machine, the launcher is at `/Users/samin/Documents/ServerDrivenChat-local/m24/ServerDrivenChat VS Code.app`. Its editor is `/Users/samin/Applications/ServerDrivenChat VS Code 1.140.app`. The launcher chooses the isolated data and extension directories automatically. Opening the ordinary editor from the Dock does not establish this isolation.

## Evidence and release status

[M24 final acceptance](../../evidence/M24/persistent-local/final-acceptance.json), [package lifecycle](../../evidence/M24/persistent-local/package-lifecycle.json), [native SDK checks](../../evidence/M24/persistent-local/native-sdk-final.json), [credential cleanup](../../evidence/M24/persistent-local/credential-cleanup.json) and [signed manifest](../../evidence/M24/artifact-manifest.json) are the current release reference. The manifest has the precise archive and installed bundle fingerprints.

The project signature proves release integrity against the trusted project public key. These packages are not Microsoft Marketplace-signed. This local deployment is not an Internet production service. M25 supplies this manual; M26's frozen release and soak tests remain a separate milestone.
