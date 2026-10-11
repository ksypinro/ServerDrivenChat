# Architecture decision index

These choices establish M03's repository foundation. Future milestones consume them; they do not reopen framework selection without new evidence or a requirements change.

| Record | Decision |
|---|---|
| [001 — Language and runtime](001-language-and-runtime.md) | Node 24, TypeScript 5.9.3, ESM, npm workspaces |
| [002 — Server and UI](002-server-and-ui.md) | `node:http`, React, Vite, PostgreSQL; same-origin GUI |
| [003 — macOS companion](003-macos-companion.md) | Swift 6.2+, SwiftPM, SwiftUI |
| [004 — Cline extension](004-cline-extension.md) | VS Code VSIX; explicitly adopted Cline 4.1.22 maintained M19 API patch |
| [005 — Transactional stores](005-transactional-stores.md) | PostgreSQL server, SQLite local bridge |
| [006 — Authentication](006-authentication.md) | OIDC authorization-code + PKCE, Keycloak provider |
| [007 — Testing and distribution](007-testing-and-distribution.md) | Node test runner, XCTest, Cline VSIX/server first release; standalone macOS distribution deferred |
| [008 — Cline-only first release](008-cline-first-release.md) | Codex M16–M18 deferred; active M23–M26 Cline/shared release gates |
| [009 — FastAPI public API release amendment](009-fastapi-public-api.md) | Required first-party REST, OpenAI/Anthropic profiles and desktop contracts; append M27–M30 before packaging; planning only |

Framework versions used in future packages must be pinned exactly by their owning milestone against a fresh security/support check. M03 pins and locks only dependencies it actually installs. A version choice is not evidence that a feature or application integration exists.
