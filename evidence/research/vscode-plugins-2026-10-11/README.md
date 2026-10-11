# VS Code extension migration research — 11 October 2026

User-requested analysis and documentation only. No installation, native execution, credential access/change, OS trust change, new pairing/grant, server deployment or release adoption was performed.

Documents:

- [Different Cline version/fork](../../../docs/guide/cline-version-migration.md): baseline, exact change map, source port/build, qualification, lifecycle and rollback.
- [Codex/Claude Code comparison and setup](../../../docs/guide/other-vscode-plugins.md): independent use, native backend, gateway consumer and MCP distinctions; future-only configuration examples.
- [Engineering plan](../../../docs/guide/plugin-integration-plan.md): supported-interface discovery, Claude mods candidate, Codex attachment gate, durable hosting, request identity and native/client acceptance.

[Source snapshot](source-snapshot.json) records immutable public Cline commit, source hashes and source manifest version. This is not verified Marketplace provenance or a selected replacement. The GitHub latest-release endpoint returned a desktop release; it was not mislabeled as a VS Code extension.

[Verification](verification.json) records local documentation/configuration/source integrity checks and unchanged accepted package hashes. It does not establish native support. [Official source catalog](official-sources.json) records the documentation used. Public source files retain their upstream ownership/license; private state is absent.

Current accepted artifacts remain M24 Cline 4.1.2204/API 1.3 and companion 0.7.3. M24/M25 remain Done for their stated scope; M26 remains Not started and M16–M18 Deferred.
