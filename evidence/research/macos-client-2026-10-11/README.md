# macOS client architecture research — 11 October 2026

User-requested documentation for a future native Mac app, covering selected local server startup, isolated VS Code/Cline setup, sign-in and public API chat.

Deliverables:

- [Architectural design](../../../docs/guide/MacOSClientAPP/macos-client-architecture.md): component and sequence diagrams, local/remote modes, guided user journey, identity/authority boundaries, persistence, failures and distribution.
- [Implementation plan](../../../docs/guide/MacOSClientAPP/macos-client-implementation-plan.md): proposed modules, callback registration, exact request examples, API map, recovery algorithms, staged development and test matrix.
- [Official source catalog](official-sources.json): primary Apple, Docker, VS Code and IETF documentation consulted.
- [Contract audit](contract-audit.json): documented route/method and JSON-schema checks, callback/broker and credential findings from current source.
- [Documentation audit](documentation-audit.json) and [verification](verification.json): link/schema/artifact checks and precise verification limits.

The proposal separates new same-user local orchestration from existing public HTTPS APIs. A stopped server cannot expose its own startup endpoint. Task/provider configuration and consent remain native GUI actions. The new Mac app would have its own callback and human/scoped credentials; it must not reuse native device secrets or become another model runtime/bridge.

Current reference is the accepted local M24 deployment: macOS arm64, isolated VS Code 1.140.0, maintained Cline 4.1.2204/API 1.3 and companion 0.7.3. Existing fixture/browser/SDK support is not acceptance of a new Swift client. Current local profile leaves approvals disabled.

This research changed documentation only. No app source, helper, public endpoint, dependency, lockfile, package, callback registration, OIDC realm, service lifecycle, certificate trust, credential or native grant changed. No private state credentials were read or exported. M24/M25 remain Done for recorded subsets; M26 remains Not started and M16–M18 Deferred.

Apple pages were read through their official Markdown representations when their web pages required JavaScript. External pages are mutable, so recheck them against the selected SDK/build before implementation. This evidence records a design review, not a working prototype, novice study, runtime/native acceptance or distribution qualification.
