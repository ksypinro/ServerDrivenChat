# M29 verification and handoff

M29 adds the restricted Anthropic Messages profile over the existing SDC server. The four gateway routes are model list/retrieve, Messages, and `messages/count_tokens`; the neutral first-party count route is `/api/v1/input-counts` (`/v2/public/input-counts` internally). The generated OpenAPI document contains 42 paths and is checked against `create_app().openapi()` in the gateway tests.

The TypeScript server now performs effect-free input counting through the same composition/estimate policy used for generation. Image ownership, MIME, session, committed state, and retention are checked against PostgreSQL in a repeatable read-only count transaction and in the generation admission transaction. Caller tool error outcomes are stored as a tagged value in the existing JSONB ledger; successful legacy string entries remain readable and a retry changing the result outcome conflicts.

FastAPI implements SDC key authentication with Anthropic version checks, strict option/content rejection, service-alias discovery, JSON Messages, terminal-buffered SSE, errors, request IDs, and shared capacity. Exact test-consumer pins are Node `@anthropic-ai/sdk` 0.132.1 and Python `anthropic` 1.12.1. The official Python SDK passed against the real TCP Uvicorn gateway and PostgreSQL-backed TypeScript fixture; the official Node SDK passed against a real local TCP Uvicorn gateway with the server transport stubbed. The gateway regression suite additionally exercises the M28 official SDK and server fixture.

Automated native output is scripted and labeled. No Cline/native files, pins, permissions, or bindings changed. The Cline caller-tool path remains withheld absent reviewed qualification evidence; tool normalization and error-result persistence use a qualified server simulation fixture. Usage is `sdc-text-v1` estimate, image allowance is 1,024 units, shared-task hidden context is unknown, and output is terminal-buffered. This is not full Anthropic parity, provider billing/tokenization, M30 named-client/native acceptance, or a production deployment.

See [verification.json](verification.json), [commands.json](commands.json), [sources.json](sources.json), and [cleanup.json](cleanup.json) for test results, exact pins, hashes, commands, and disposable service cleanup.

The [2026-10-09 review amendment](review-2026-10-09.json) records gateway validation, model discovery/pagination, usage and OpenAPI repairs. Its full gateway suite passed 53 checks over disposable PostgreSQL and SDK TCP fixtures; the original completion results above remain historical.
