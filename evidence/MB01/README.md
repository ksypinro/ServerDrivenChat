# MB-01 native route discovery

**Date:** 2026-10-11  
**Scope:** route feasibility for the installed isolated VS Code lab; no sign-in,
native task selection, prompt execution, or consent grant was performed.  
**Result:** discovery complete; none of the three routes passes the MB-01 native
acceptance gate for the proposed generic host.

## What was examined

- Installed lab inventory and entry-file fingerprints recorded in
  [`task.md`](../../task.md). Those values identify the installed extensions and
  do not prove complete archive provenance or runtime behavior.
- Existing Cline integration in `extensions/vscode/` and the accepted local
  lifecycle evidence under `evidence/M24/`.
- The official Codex IDE and app-server documentation, and the official Claude
  Code VS Code and Mods documentation. Links are listed below.

## Route matrix

| Backend | Selection and identity | Input/output route | Effect-boundary and recovery | MB-01 result |
|---|---|---|---|---|
| Cline 4.1.2204 / native API 1.3 | Existing SDC adapter identifies a task through the adopted native API. The accepted M24 evidence applies to that exact package pair and its existing companion. | Existing patched native API and bridge; accepted only for the documented Cline workflow. | Existing implementation has native-specific permission and authority handling. This does not establish that the same guarantees survive extraction into a new generic host. | Known-good reference route for the pinned pair; generic-host route remains untested. |
| Claude Code 2.1.296 | The VS Code extension and Mods UI establish an in-editor surface. This discovery did not find a documented bridge from SDC to an exact selected conversation with stable binding identity. | Mods may interact with the Claude Code panel. The documented prompt submission operation can queue until Claude becomes idle and then begin, so a one-time consent check before enqueue is insufficient. | No supported mechanism was established here to cancel/fence queued work at the instant of native effect, host the current durable SQLite/SSE bridge, or recover uncertain effects. | Blocked pending a supported host-owned integration and effect-time fencing route. No driver implemented. |
| Codex 26.1007.21434 | The extension is installed and its declared VS Code engine range admits the lab host. No documented supported API was established for selecting an existing Codex IDE conversation from another extension. | Official documentation describes direct use of the IDE extension. Codex app-server is a JSON-RPC interface used to power rich clients; using it would create/use that app-server route and does not prove attachment to the already-selected IDE task. | Existing-thread identity, wrong-thread refusal, pre-effect authority checks, native approval handling, and recovery were not demonstrated through a supported extension API. | Blocked pending an official existing-IDE attachment route or explicit product-scope change. No driver implemented. |

No harmless two-prompt same-conversation test, wrong-conversation refusal, or
authority-loss-before-effect test was run for Claude or Codex. No simulated result
is presented as native proof. The exact Cline M24 evidence is not transferable to a
different host/companion composition.

## Decision and unblock conditions

Keep the neutral `AppAdapter` contract as the candidate shared semantic boundary,
but do not build a generic host that implies these integrations exist. Do not add a
Codex CLI, Codex app-server process, Claude CLI, model executor, private socket, or
UI automation as a substitute for selected-IDE attachment.

- **Cline:** provision the reviewed pair into the isolated combined lab, then obtain
  fresh graphical consent and repeat affected binding, recovery, and lifecycle tests
  against the generic host before claiming parity.
- **Claude:** obtain a supported API/host mechanism that identifies the exact task,
  delivers input and observes output, and performs authorization/cancellation at
  effect time while retaining durable bridge recovery. Otherwise the Claude driver
  remains blocked.
- **Codex:** obtain a documented supported extension interface that addresses the
  exact existing IDE conversation and permits input/output observation plus
  effect-time fencing. Otherwise the Codex driver remains blocked.

## Official documentation consulted

- [Codex IDE extension](https://developers.openai.com/codex/ide)
- [Codex app-server](https://developers.openai.com/codex/app-server/)
- [Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)
- [Claude Code Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)
- [Claude Code Mods API](https://code.claude.com/docs/en/plugins/mods/api)

Documentation establishes documented surfaces and interface purpose; it does not
prove that an undocumented attachment route is impossible. Therefore the Codex and
Claude findings are “not established/blocked,” not claims of permanent impossibility.
