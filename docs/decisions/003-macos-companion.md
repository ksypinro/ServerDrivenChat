# DECISION-003 — macOS companion

**Status:** Accepted for planned implementation. **Scope:** M03/M07/M15/M16/M17.

Build the native graphical companion in Swift 6.2+ using SwiftUI and Swift Package Manager. The package declares macOS 15 as the minimum platform and uses Swift tools version 6.2; the observed host compiler is Swift 6.4 in Xcode 27. SwiftPM is used for reproducible module/test boundaries. The M03 deliverable is only a Foundation-level companion-core library; M15 adds the app entry point and graphical pairing/lifecycle.

The companion is the local bridge owner, not a replacement LLM executor and not a separately launched app-server. Use macOS Keychain for credentials and SQLite for local durable bridge records when those contracts are implemented. Do not add local networking or app-control behavior in M03.

## First-release scope amendment — 2026-10-08

The user’s [Cline-only first-release decision](008-cline-first-release.md) defers Codex M16–M18 and a standalone macOS companion distribution. This document and existing Swift modules remain preserved for that future path. For the Cline first release, the VS Code companion extension host owns the local bridge; it does not require the SwiftUI app/DMG to install or operate. Shared protocol, lease, persistence, consent and app-only execution constraints remain.
