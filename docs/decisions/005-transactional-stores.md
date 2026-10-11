# DECISION-005 — Transactional stores

**Status:** Accepted for planned implementation. **Scope:** M03/M06/M07.

Use PostgreSQL 17 for server-side users/devices, sessions/bindings, commands/events, interactions/decisions, attachment metadata, and audit records. Use SQLite 3 through the platform library on macOS for the bridge inbox/outbox, native mappings, cursors, and reconciliation state. Server migrations are owned by M06; local schema and recovery semantics are owned by M07.

M07's current TypeScript bridge implementation accesses embedded SQLite through Node's built-in `node:sqlite` module, with WAL and full synchronous durability enabled; it does not add a separately administered database service or npm SQLite driver. When a future native companion owns this store directly, it must use the platform SQLite library and preserve the schema's transactional and recovery behavior. This implementation detail does not move server-owned records into the local database.

The split follows the trust and lifecycle boundaries: PostgreSQL supplies shared multi-user transactions and server durability; SQLite gives the companion an embedded durable store that works offline without a separately administered local server. M03 installs neither database and defines no schema. Redis, filesystem JSON, and in-memory maps are not sources of truth for transactional records. Secrets are kept in Keychain or server secret configuration, never in either application database.
