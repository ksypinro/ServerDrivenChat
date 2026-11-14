# MB-05 Step 02: recover single-view ownership

**Step:** 02 — Recover single-view ownership of the existing conversation  
**Implementation status:** Read-only ownership recheck complete; ready for review  
**Step result:** PASS (post-release recheck)  
**Luna review:** ACCEPT for the post-release recheck. The initial BLOCKED finding
and its Luna ACCEPT remain preserved in the original attempt history.

## Objective and evidence

Step 01 is accepted PASS. This step establishes one authoritative native view for
the already selected `Project analysis` conversation before any prompt or probe
interaction, while preserving that existing conversation and its history.

The initial read-only inspection of isolated VS Code 1.140.0 showed:

- Window: `Project analysis — ServerDrivenChat`.
- Workspace: `~/Documents/ServerDrivenChat`.
- SDC status item: `SDC backends: disconnected`.
- Claude displayed an ownership warning and offered “Open here anyway”; it was
  left untouched.
- The other view was not identified. The original BLOCKED finding and Luna review
  remain preserved in the original attempt record and supplemental inventory.

The user then reported: “I released it in the other view.” A new read-only check
of the same isolated host showed the existing `Project analysis` conversation,
the expected project workspace, no ownership warning, and SDC still disconnected.
A fresh identity digest matched the previously selected session digest
(`763571110b7e7f52…`); the raw native session identifier was neither emitted nor
stored. Details and timing precision are recorded in
[`recheck-2026-10-15.md`](recheck-2026-10-15.md).

## Work performed and limits

Only read-only app/window and in-memory digest inspection was performed. No
prompt, Mod action, session resume, ownership override, lock-file operation,
process termination, or conversation creation occurred. No source, settings,
credential, package, permission, or server state changed. There are no tests for
this read-only step.

**Current result: PASS / Luna ACCEPT.** The same selected session appears
in the correct isolated host and workspace, without the ownership warning, and
its identity digest matches the baseline selection. This passes Step 02's
read-only ownership conditions. Step 03 is already PASS/ACCEPT. Do not start Step
04 or interact with the native conversation beyond its specifically approved
bounded diagnostic; the Step 04 unit itself sends no native prompt.

## Resumption and acceptance

The user released the conversation in the other view through normal UI. No
additional user action is currently needed for Step 02. Recheck the ownership
warning before any later native prompt; if it returns, stop and resolve ownership
normally. Step 02 passes only for the observed host/workspace and matching
session identity; title alone is not identity.
