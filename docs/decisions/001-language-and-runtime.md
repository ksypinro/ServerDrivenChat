# DECISION-001 — Language, runtime, and repository workspaces

**Status:** Accepted for the foundation (2026-10-05). **Scope:** M03. Revisit only for a requirement or material toolchain change.

## Decision

Use TypeScript 5.9.3, ESM, and Node.js 24 LTS for portable protocol, server, bridge, and adapter-core modules. Use npm 11 workspaces, with exact TypeScript pin in the root manifest, `.nvmrc` major pin `24`, and `engines` requiring Node 24 and npm 11. Compile as strict NodeNext modules targeting ES2023. The companion remains Swift; it is not a Node application.

## Rationale and limits

Node 24 is the current LTS line and has support into 2028; Node 25 is an odd-numbered, non-LTS line and is already end-of-life in the current release schedule. This host has Node 25.9.0/npm 11.12.1, but no Corepack or TypeScript. npm workspaces let contributors use the available npm 11 without adding a separate package-manager bootstrap. The `.nvmrc` intentionally selects the maintained major and lets a version manager resolve a current patch; exact patch lock-down belongs in the CI image/container decision at M24.

TypeScript makes shared contracts consumable by both the Node service and VS Code extension host. TypeScript 5.9.3 was selected as the tested, exact M03 compiler pin; TypeScript 6.0 exists, but introduces deprecations ahead of the announced native compiler transition, so adopting it is deferred until its compatibility changes are separately reviewed. ESM is the single module format. Shared packages may use neutral technical libraries (M04 pins Ajv for JSON Schema validation) and first-party neutral packages. They must not import Codex, Cline, VS Code, Antigravity, UI framework, provider SDK, or desktop implementation modules. This permits generic schema/tooling dependencies while preserving application-vendor independence.

Official lifecycle references: [Node.js release schedule](https://nodejs.org/en/about/previous-releases), [Node 24 LTS support through April 2028](https://nodejs.org/en/blog/migrations/v22-to-v24), [TypeScript 6.0 transition notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html).

## Repository commands

From the repository root: `npm ci`, `npm run build`, `npm run lint`, `npm test`; Swift companion check: `swift test --package-path companion`. `npm run build` compiles workspaces in declared dependency order. `npm test` runs the cross-module smoke after build. M03 has no formatter requirement; lint is strict TypeScript type-checking. CI installation must use a supported Node 24 + npm 11 pair and `npm ci` against the committed lockfile.

## Verification amendment — 2026-10-06

A disposable Linux ARM64 container using Node 24.21.0/npm 11.19.0 now validates a fresh `npm ci`, workspace build, lint, and the full suite with real PostgreSQL enabled. The exact image digest and output are recorded in [repair evidence](../../evidence/reviews/m01-m10-repair/node24.log). The host still uses Node 25.9.0; the container check establishes the selected Node 24 runtime separately. Build must precede lint after a fresh checkout because workspace exports resolve generated declarations under `dist/`.
