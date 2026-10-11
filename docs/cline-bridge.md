# Cline existing-task bridge

> **Current user instructions:** Start with the [M24/M25 beginner manual](guide/README.md). This document preserves its historical milestone/pin and implementation details; its old package names are not the current installation target.

M19 evidence below describes its original API 1.0 build. The expanded API 1.1 controls and acceptance gate are documented in [Cline native controls (M20)](cline-controls.md).

## Maintained application boundary

The user adopted the Cline 4.1.22 `sdc-m19.1` maintained patch and companion extension for isolated acceptance on 2026-10-07. [DECISION-004](decisions/004-cline-extension.md) records the maintenance decision. Stock Cline exports lack this contract. The [source patch](../extensions/vscode/patches/cline-v4.1.22-sdc-m19.1.patch) targets commit `f58bc118bdeef1bd2813cd08e00d98bdcda96475`; the development packaging script also verifies the exact installed vendor bundle SHA-256 before copying and patching its public export. [Artifact metadata](../evidence/M19/artifact-manifest.json) identifies the resulting packages.

`adapters/cline` consumes only the app-owned `serverDrivenChat` namespace. The native implementation is bundled inside the maintained Cline extension, where it captures the existing native controller task and SDK session. Submission uses that session's existing context preparation, user-message coordinator, and send method. It starts no replacement model runtime and changes no provider or permission settings. Shared protocol, bridge, and server code have no Cline branches.

## Binding and dispatch

API v1.0 exposes native context, current task, exact binding, filtered snapshot, bounded event replay, text/image submission, PNG/JPEG staging, detach, and disposal. Context includes installation, extension-host, VS Code session/window, workspace, task, and generation. The companion offers the exact current task in a graphical picker; no arbitrary task search or fallback to another task is permitted.

The native token is opaque and process-local. Every assignment of the controller task invalidates it immediately, including replacement by a proxy with the same task ID and A→B→A switching. Workspace changes, transcript truncation, and controller disposal invalidate it too. Reload creates a new extension-host identity and a disconnected companion. Tokens are never restored from disk.

A mutation requires a matching binding, live native session, supported native idle phase, expected conversation revision, uncancelled permit, and `assertAuthority()` at the effect boundary. These are checked again after asynchronous context preparation and after native echo callbacks, before dispatching through the captured session. Local input invalidates the remote binding. A command ID deduplicates identical submission content; conflicting reuse is rejected. An ambiguous post-echo failure returns unknown and requires reconciliation rather than replay.

Snapshots allowlist native messages and lifecycle state, excluding provider credentials/configuration. Adapter output has stable item IDs, increasing replacement revisions, local-history provenance, and native phase evidence for terminal events. Native return values alone are insufficient. Native event history is capped at 512 and adapter history at 2048; an expired cursor requires snapshot/reconciliation. This process-local history complements the durable bridge outbox rather than replacing it.

## Attachments and unsupported operations

PNG/JPEG images must match size, MIME signature, and SHA-256. Staging is bounded to 10 MiB per binding and produces an app-owned receipt. Submission verifies the exact native user-message echo and ordered image checksums. Generic files/artifacts fail explicitly. No unsupported block is silently dropped.

Only local VS Code with the exact patched base/API is supported. A historical task without a live session needs local native resumption before remote submission. Antigravity 3.83.0, remote extension hosts, other Cline versions, native approval/input enumeration and decisions, stop/cancel, and grant revocation are unsupported in M19. Waiting approval/input snapshots return unknown rather than pretending there are no pending requests. Request-bound controls belong to M20; server pairing and prompt-triggered Connect belong to M21.

## Verification and upgrade procedure

Run `npm run test:m19`, `npm run lint`, and the repository regression suite. Fixtures cover effect-boundary races, session replacement, task/workspace/disposal invalidation, ID conflicts, authority expiry, cancellation, image receipts, partial output, and local takeover. These tests do not prove live application acceptance.

Use the two development packages in a trusted disposable local workspace. Create a native idle task through Cline, explicitly select it, and run the bounded graphical probe. Save its two input echoes, image receipt/checksums, second-turn continuity output, and native terminal events. Switch tasks while bound and verify selection is required again; reload and verify disconnected state. Record other-window/host rejection separately. M19 is Done for this adopted local VS Code build. [Final native acceptance](../evidence/M19/live-vscode.json) records two completed bridge turns in existing task `1791311237025_zxtup`, fresh-marker continuity, a 179-byte PNG with exact native echo/checksum, and foreign-selection rejection. [Native observations](../evidence/M19/native-observations.json) record task switching, local input invalidation and reload disconnection. The PNG run used the native free MiMo-V2.6-Flash model; Solar rejected image input and Muse encountered provider errors. Original Solar settings were restored after acceptance. Image support depends on the selected native model; a settings capability label alone is insufficient.

An upgrade requires reviewed upstream source, a new explicit base fingerprint and patch revision, regenerated packages, and repeated real-host acceptance. Unsigned development artifacts are not a distribution release; M24 owns signing and publication.
