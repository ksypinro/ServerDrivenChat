# DECISION-002 — Server and graphical control interface

**Status:** Accepted for planned implementation. **Scope:** M03/M06/M09/M14.

Use Node.js 24 and its built-in `node:http` server for the HTTP/SSE boundary, PostgreSQL 17 for transactional server state, and a same-origin React 19 + Vite 8 web control interface served through the application deployment. PostgreSQL 17 follows the more specific accepted transactional-store decision DECISION-005, which owns the M06 server schema. Exact dependency versions must be pinned in the lockfile when each owning milestone introduces the dependency. At the M03 foundation checkpoint the server package was an empty TypeScript boundary. M09/M10 now implement and validate HTTP/SSE and lease admission without adding an app executor.

The built-in HTTP boundary is confined to `server/src/http/`; business rules and protocol remain framework-independent. The browser UI calls authenticated same-origin services. SSE carries server events and HTTPS POST carries client commands/events, as required by the baseline. Bind development services to loopback; production TLS/auth/deployment are M24 work. No app-specific executor is hosted in the server.

The GUI is the ordinary product operation. CLI commands are reserved for developer setup/build/test. No headless LLM/provider runtime is introduced.

Version references at decision time: [Fastify 5 current docs](https://fastify.dev/docs/latest/), [React 19.3](https://react.dev/blog/2026/09/09/react-19-3), [Vite 8.1](https://vite.dev/blog/announcing-vite8-1), and the [PostgreSQL supported release lines](https://www.postgresql.org/support/versioning/). PostgreSQL 18 was the initial target; M06 reconciled the server store to PostgreSQL 17 per DECISION-005. These are major/minor references, not dependency pins; each owning milestone pins exact packages/images.

## Accepted amendment — 2026-10-06

The M01–M10 repair request authorizes reconciling M09's implemented transport with the foundation. The server boundary uses Node's built-in HTTP implementation rather than the originally proposed Fastify 5. This choice keeps the existing versioned routes, streaming backpressure, cancellation, and transactional services together without adding a framework dependency or changing adapter ownership. PostgreSQL, the planned React/Vite interface, and TLS deployment requirements retain their existing decisions. The HTTP/API and integration acceptance suites validate the selected boundary; a framework does not supply its authorization, queue admission, or lease semantics.

This amendment supersedes the original Fastify selection for M09 and later server work. It does not establish graphical screens or a production deployment. Those remain their owning milestones.

## Public API amendment — 2026-10-08

[DECISION-009](009-fastapi-public-api.md) adds a user-selected FastAPI public REST/provider gateway in front of this existing TypeScript server. It preserves `node:http`, server-owned authority/transactions and native app execution. Authenticated programmatic operation is added alongside graphical setup/consent. M27–M30 are Not started; exact Python/runtime/dependencies and schemas are future implementation work. This is not a return to Fastify or a server rewrite.
