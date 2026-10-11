# DECISION-008 — Cline-only first release

**Status:** Accepted by explicit user instruction on 2026-10-08. **Scope:** first release; M16–M18 and M23–M26. **Specification:** requirements 2.2; wire protocol remains 2.0.

## Decision

The first final version delivers the Cline plugin in local VS Code and its required shared server/control interface. Codex integration, native controls and pilot acceptance (M16, M17, M18) are Deferred and are not dependencies or release acceptance criteria for this version. They are unfinished future work, not completed or deleted. Their research, prototype code, checkpoints and shared architecture remain preserved.

The supported route is the explicitly adopted maintained Cline build plus its companion VS Code extension. The starting validated baseline is Cline 4.1.22 `sdc-m21.3` (4.1.2203), app-owned API 1.2 and companion 0.4.0 on local macOS VS Code. M24/M26 must declare and verify the exact release versions, host and platform. This decision does not add stock Cline, Antigravity, remote extension hosts, Windows/Linux or other apps to the support matrix. Additional hosts/platforms need their own acceptance before being advertised.

The Cline extension host owns the local bridge. A separate Codex/macOS SwiftUI companion installer or DMG is not a first-release deliverable. Existing Swift companion modules and their historical evidence remain; shared regressions still run when relevant. The required authenticated server, database, control UI, HTTPS and real identity deployment remain release work. A plugin-only scope does not remove its server dependencies.

## Active sequence

| Milestone | Required inputs | First-release deliverable and gate |
|---|---|---|
| M23 | M06, M07, M10, M11, M13, M22 | Shared/Cline recovery, isolation, race and resource-limit hardening, with real native spot checks and explicit unresolved blockers |
| M24 | M23 | Reviewed Cline native/companion VSIX pair, graphical clean installation/pairing, server HTTPS/OIDC deployment, compatibility checks, upgrade/migration/rollback and uninstall evidence |
| M25 | M24 | Verified Cline user guide and maintainer/server runbooks; clear deferred/unsupported matrix |
| M26 | M23, M24, M25 | Frozen Cline release candidate, fresh-install/native journey, FR-01–FR-18 traceability, measured three-trial latency/backlog checks and one-hour soak |

There are 23 in-scope milestones in the register, 19 complete and four remaining (M23–M26); three Codex milestones are deferred. M01 remains completed feasibility history and does not require a Codex implementation for release. Numerical IDs and original completion records are retained. This plan update does not start M23 or authorize publication/deployment to an unspecified destination.

## Acceptance retained

All app-neutral requirements still apply to Cline: exact identity and consent, same-task context, durable authenticated delivery, deduplication, request-bound allow/deny, supported question/cancel outcomes, native permission enforcement, verified attachments, correct output/state, bounded queues, takeover/disable and honest unsupported capabilities. FR-18 now requires the graphical Cline journey; Codex pilot acceptance is deferred.

M23 must test crashes/uncertain effects without blind replay, partitions/cursor repair, split ownership/stale bindings, duplicate/changed/forged decisions, concurrent local/remote resolution, cross-user/device/file isolation, floods/storage exhaustion, task/window/host changes, reload and version mismatches. Fixtures prove shared seams; real native tests prove effects mocks cannot establish. M22's bounded SSE reconnect is not a substitute.

M24 must verify the real intended TLS proxy (including SSE flushing and control delivery) and identity configuration. Synthetic identity and unsigned development artifacts do not close production release gates. Required signing/distribution credentials, server infrastructure and publication ownership must be recorded and unresolved prerequisites remain blockers. Upgrades must preserve valid state or require explicit re-pairing; rollback and credential/data cleanup must be demonstrated. Do not overwrite the installed stock Cline or historical artifacts silently.

M26 keeps p95 server-to-bridge control latency below 500 ms, approval visibility within one second of bridge observation, no starvation under the defined 10 MiB backlog, three trials and a one-hour idle/active soak. Model runtime is excluded from transport latency. Report topology, queue limits, platform, failures and distributions. Freeze exact artifact fingerprints; changed code/packages require affected tests and native revalidation. Node 24/npm 11 clean-install checks remain required; M22's Node 25 host checks do not replace that release verification.

Whole-action once/deny is the currently accepted Cline permission scope. Unsupported narrowing, persistent grants and native revocation must remain rejected and accurately reported; deferring Codex does not permit weaker Cline approval semantics. Release blockers remain failures, never scope exclusions disguised as passes.

## Future Codex work

M16 was In Progress at its attachment-route gate; M17/M18 were Not started. All three are now Deferred by user decision. Resume only on an explicit instruction, restore their prior work states, establish an approved app-owned route, and run their own native acceptance. A Cline release must not claim Codex conformance. Shared protocol/adapter boundaries remain vendor-neutral to permit later integration.

## Sources of truth

[Requirements](../../requirements.md), [milestone register and handoff](../../IMPLEMENTATION_TRACKER.md), [M22 acceptance](../../evidence/M22/verification.json), and [Cline adoption decision](004-cline-extension.md). Historical log entries describe their original scope; this dated amendment governs future first-release work.

## Subsequent public API amendment — 2026-10-08

[DECISION-009](009-fastapi-public-api.md) extends this first release with FastAPI REST, OpenAI/Anthropic-compatible profiles and future-desktop contracts. Its current order is M27 → M28 → M29 → M30 → M24 → M25 → M26. New IDs are appended without renumbering history; M24 now depends on M30 too. Requirements are 2.3, wire remains 2.0, and FR-19–FR-28 join release acceptance. Current accounting is 20 Done/seven Not started/three Deferred across 30 tracked milestones (27 in scope). The baseline/counts above remain the original scope decision's historical snapshot. Codex deferral, app-only execution, local consent and standalone-app exclusion remain. This amendment authorizes research/planning only.
