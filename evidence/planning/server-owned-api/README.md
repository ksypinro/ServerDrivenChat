# Server-owned API architecture amendment

Recorded 2026-10-08 (Asia/Dhaka) after the user clarified that this project's server owns public API histories/instructions/tools/aliases/budgets and permitted server-defined model names and estimated token budgets. Initially Cline supplies the I/O connection; future backends use neutral adapters. This does not resume Codex implementation.

- [DECISION-010](../../../docs/decisions/010-server-owned-api-semantics.md): accepted user clarification, approximation semantics and replaced native prerequisites.
- [Active execution plan](../../../docs/feasibility/server-owned-api-plan.md): common server contract/state/tool/budget work, gateway encoders and actual connection/client acceptance.
- [Requirements 2.4](../../../requirements.md) and [tracker](../../../IMPLEMENTATION_TRACKER.md): IDs/dependencies/statuses preserved; scope amended explicitly.
- [Runtime baseline](runtime-baseline.json): pre-amendment source/config/test/lock/requirements fingerprints. Only requirements.md is intentionally changed; runtime/locks remain unchanged.
- [Archive manifest](archive-manifest.json): prior native plan/gate preserved with relative links rebased, semantic content unchanged. Existing M19–M23/M27 evidence is untouched.
- [Validation](validation.json): documentation/IDs/dependency/link/fingerprint checks, not implementation or native/client acceptance.

Reproduce with `python3 evidence/planning/server-owned-api/validate-planning.py` from the repository root. It writes only this planning validation record. The earlier research validation remains a historical check of requirements 2.3; requirements 2.4 is an intentional amendment, not an unexplained runtime fingerprint change.

The accepted scope allows deterministic versioned estimates with visible source/scope metadata. It does not allow estimates to masquerade as measured native/billed tokens or a server output quota to claim a guaranteed native generation stop. Server history does not erase hidden native context, and server tool proposals cannot be fabricated from native activity.

M27 remains In Progress; M28–M30/M24–M26 Not started; M16–M18 Deferred. No runtime code/tests/dependencies, model calls, app settings/credentials, native adoption/install or deployment changed. The next implementation work is M27.1/S1 server policy/neutral adapter contract; this amendment itself implements no new API capability.
