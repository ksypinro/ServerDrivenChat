# Anthropic-compatible SDC profile

> **Current integration guide:** [API/client walkthrough](guide/api-guide.md), [exact field/client matrix](guide/support-matrix.md) and [M24 final deployment](../evidence/M24/persistent-local/final-acceptance.json). The current base is `https://localhost:15943`; historical loopback examples and milestone pins below retain their original context.

The gateway exposes a restricted Anthropic Messages profile backed by the existing server and consented application. Configure official clients with base URL `http://127.0.0.1:8000/anthropic`, the SDC scoped key, and Anthropic wire version `2023-06-01`. The only model identifier is the service alias `sdc-default`; it does not select an Anthropic model.

Supported routes are `GET /v1/models`, `GET /v1/models/{model}`, `POST /v1/messages`, and `POST /v1/messages/count_tokens`. Messages require an original caller `Idempotency-Key`, accept `x-api-key` or `Authorization: Bearer` (exactly one), and support `X-SDC-Context-Mode: exclusive|shared-task`. A nonempty `anthropic-beta` is rejected. Responses are terminal-buffered and advertise `X-SDC-Usage-Source: estimated`.

Model listing reflects the alias currently authorized by the server. It accepts `limit=1..1000` and one of `after_id=sdc-default` or `before_id=sdc-default`; either cursor returns an empty page for this single-alias profile. Unknown, duplicate, or combined cursors fail. Other query parameters fail before dispatch.

The gateway maps text, ordinary system text, custom function schemas, tool selection, server-issued tool calls, addressed textual tool results including `is_error`, and committed `sdc-attachment://...` PNG/JPEG references. The server owns history, current instruction composition, call identity/result ledger, usage estimates, budgets, authorization, and durable operation state. Tool execution remains caller-owned. The current Cline tool profile is withheld unless the server has reviewed qualification evidence for the exact binding.

`messages.count_tokens` is a read-only estimate using the same server composition policy as generation. It returns an Anthropic-shaped `input_tokens` plus SDC provenance; `sdc-text-v1` estimates four Unicode scalar values per unit and assigns 1,024 units per committed image. It is neither provider tokenization nor billing, and hidden shared-task context remains unknown. Counting does not admit work or create conversation state.

Sampling controls, nonempty stop sequences, beta features, non-text/tool-result media, arbitrary external image URLs/base64, reasoning/signature/cache/structured-output controls, and built-in/server tools are rejected. Streaming emits final committed content as Anthropic message/block events; an error event closes without `message_stop`. [M30 acceptance](../evidence/M30/README.md) verifies the declared subset through disposable real Cline and pinned official SDKs, plus Aider 0.86.2 two-turn text/whole-file Messages edits. Full Anthropic parity and generic tool-using clients remain outside the accepted profile.

Malformed content blocks and histories return client errors; the gateway does not reorder tool calls or invent missing usage counters from an incomplete server response.
