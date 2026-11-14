# MI-04 — same workspace and session continuity

**Done, 2026-11-14, for the recorded S6/S7/N1 subset.** Two Git worktrees and a supported duplicate-workspace window passed real Cline acceptance. N2 park/resume is excluded. MI-06 was not started. The M24/M26 release records keep their own frozen pins.

## Accepted implementation and runtime

Explicit local Connect negotiates `binding.continuity` for a scoped native task. The server preserves the owner's latest session for that native conversation key, advances the binding revision under authority locks, and requires local consent to displace a live holder. Existing API keys and binding aliases stay frozen to the old binding. Historical sessions are not merged. Disabled/closed sessions are refused; clients without continuity retain their existing behavior.

The maintained native add-on exposes `nativeScopeId`; its upstream extension bundle is unchanged. The companion adopts only server session/revision before delivery, preserves ordered output identity through native ID reindexing and reopened assistant categories, and records changed request metadata as replacements only within an anchored status-only gap. Changed or ambiguous material prefixes remain refused. The UI groups by device/workspace/window, hides offline sessions and warns about authorized live workspace overlap.

Exact accepted candidate: signed official VS Code **1.140.0 arm64**, Cline **4.1.2206/API 1.3**, companion **0.9.0-mi04.10**, and server image `sha256:8d54282b63035ba283c2e371e82f5d4ad144a4e870f8edf5b170ec13eea4cf1c`. Packages remain unsigned isolated candidates; nothing was published. Migration 010 remains the latest schema. [Artifact hashes](artifact-manifest.json), [final native record](native-final10.json), [verification](verification.json).

## Verified results

- Build/lint passed. Final focused MI-04 checks: **13 passed**, no skips. Full root suite: **289 passed**, zero failed, **one optional dump/restore skip**, using concurrency 4. [Focused log](focused-status-repair10.log), [root log](root-tests-status-repair10-bounded.log). Earlier unchanged gateway/UI checks remain 54 and 5 respectively at their recorded scope.
- Final A reload preserved its server session, advanced revision **2→3**, kept exactly one initial prompt and prior answers, rejected old-key reads/prompts with **403**, and accepted new-key native work. B completed a real API turn while A reloaded. Earlier disconnect/reconnect/reload cases remain recorded separately.
- Three real windows on final companion .10 completed concurrent API turns with isolated histories, markers, aliases and per-session keys. B/C shared the same workspace but had distinct native tasks/hosts; only B/C reported overlap. All reused one paired device.
- Native **Move Cancel** preserved original B's binding and revision 13. Switching away from C's prior task fenced its key. A remained usable.
- After fresh user approval, the agent clicked native **Move connection here** for the existing B-REINDEX task. Its original server session advanced **13→14** in C, retained one initial prompt and earlier answers, rejected old-holder reads/prompts with **403**, and completed a new-key API turn. A completed a concurrent turn without changing its binding.
- Actual native B/C checkpoint refs remained task-scoped and retained the developer-created untracked fixture in their third parent. [Fresh checkpoint evidence](checkpoint-refs-final10.json). Earlier pre-restart refs are historical observations; the restart lost those temporary Git objects.
- All held test keys were publicly revoked and rejected with **401**. All three native windows were disconnected. Final audit found **zero live MI-04 bindings, zero unrevoked MI-04 keys and zero open inbox handles**, including unlinked files, across 19 isolated app processes. The disposable test PostgreSQL was stopped/removed. [Cleanup](cleanup-final10.json). Pairing, native/server history, rollback artifacts and retained local services are preserved.

The append-only [public API report](api-native-2026-11-12.json) spans November 12–14; filenames do not replace individual timestamps. Its final passing labels are `candidate10-reload-confirmed`, `candidate10-three-active`, `candidate10-after-cancel`, `candidate10-move` and `candidate10-after-move`. The developer consumer uses verified HTTPS against existing native Cline tasks; it does not execute a model.

## Retained failures and limits

Real testing found an activation whitelist omission, duplicate history import, native message-ID/category changes, repeated-content anchors and changed reopened request-status metadata. Failed attempts and their histories were preserved, with regressions before repairs. [Final status repair](status-repair10.json), [reindex repair](reindex-repair.json), [category repair](category-repair.json), [anchor repair](anchor-repair9.json). The first final root run hit the previously observed SSE cleanup429 timing failure; standalone HTTP and the full bounded-concurrency rerun passed.

The system restart removed the disposable Git lab and in-memory consumer tokens. The lab was recreated at the approved paths, interrupted-run keys were revoked through public APIs, and the exact official editor was restored after its automatic update to 1.146. Results on that updated editor were excluded. Existing macOS CA trust was used without bypassing certificate validation. [Host recovery](host-auto-update.json).

Old A-FINAL failed native generation after restoration; its cause is unconfirmed and its history is retained. A healthy A-RECOVERY peer was used while the original B-REINDEX remained the continuity target. Nemotron promotion requests later failed despite the FREE picker label; the user approved **Solar Mini 4** for the remaining native tests. Native tasks must be active/resumed: an online bridge alone does not prove readiness. One premature A check and C's inactive-task rejection are retained in the API report; the confirmed reruns passed. Earlier human-assisted A setup included two read-only shell commands; final API turns were text-only and asserted no native tool activity.

This establishes the declared worktree/duplicate-window and continuity subset. It does not extend MI-03's broader performance/backlog, five-to-ten-window load, upgrade skew, server-only revocation, enabled-approval routing, other host/platform/native-version or vendor-client claims. N2 automatic park/resume and MI-06 retention remain separate. No replacement runtime, raw native conversation-file access or credential entry by the agent was used.
