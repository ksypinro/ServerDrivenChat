# Codex consuming the SDC model API — research, 11 October 2026

User requested detailed analysis/design documentation about integrating the existing SDC server as Codex's model provider.

Deliverables:

- [Setup and use guide](../../../docs/guide/CodexModelIntegration/README.md).
- [Compatibility and architecture](../../../docs/guide/CodexModelIntegration/compatibility-design.md).
- [Implementation and testing plan](../../../docs/guide/CodexModelIntegration/implementation-and-testing.md).
- [Official sources](official-sources.json), [contract/configuration audit](contract-audit.json), [documentation audit](documentation-audit.json) and [verification](verification.json).

Codex's official documentation establishes Responses custom providers, environment/command-backed auth, a local model catalog for custom aliases, public-CA settings and gateway qualification requirements. Read-only local checks observed `codex-cli 0.159.0` and help flags; no inference/agent/client request was run and no app/IDE bundled version was established.

Current SDC source requires a stable per-generation `Idempotency-Key`, strict bounded accepted fields, local `store: true`, append-only context and qualified caller-tool ownership. It rejects compressed request bodies, nonfunction tool dialect and unsupported provider features. Its provider text stream is terminal-buffered. The default deployed native binding is not caller-tool qualified. These prevent claiming that a base-URL/configuration change alone provides full Codex support.

The proposal distinguishes a limited text pilot from an independently qualified coding profile. It evaluates direct routing/client identity work versus a narrow authenticated compatibility facade. Such a facade cannot derive reliable logical intent from body hashes or invent unbuffered native output, retention semantics, native consent or caller-effect ownership. It must use the public server APIs and never execute models/tools or access databases directly.

Primary OpenAI documentation was searched/fetched with OpenAI Docs. Current repository contract/source, exact accepted release evidence and nonsecret installed CLI version/help were inspected. Personal `config.toml`, `auth.json` and private deployment credential files were not read. No source/runtime/lockfile, configuration/catalog/helper, installation, OIDC/trust, credential/native grant or service changed. No request capture, fixture, real client/native acceptance or rollout is claimed.

M24/M25 remain Done for their recorded subsets; M26 remains Not started; M16–M18 remain Deferred. Future named-client implementation needs a new bounded instruction and affected acceptance. Previous alternative-extension research remains distinct and historical.
