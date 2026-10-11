# SDC OpenAI API profile

> **Current integration guide:** [API/client walkthrough](guide/api-guide.md), [exact field/client matrix](guide/support-matrix.md) and [M24 final deployment](../evidence/M24/persistent-local/final-acceptance.json). The current base is `https://localhost:15943`; historical loopback examples and milestone pins below retain their original context.

M28 implements `sdc-openai-v1` at `/openai/v1`. The gateway translates requests into the existing server's durable generations and conversations. The server selects an already consented native binding; `sdc-default` is a service alias, not an upstream model name. M28 tests use real server/HTTP/PostgreSQL and pinned official SDK consumers with scripted native events. [M30 acceptance](../evidence/M30/README.md) adds disposable real-Cline Chat/Responses SDK checks and Aider 0.86.2 two-turn text/whole-file Chat acceptance for the documented subset.

## Routes and supported fields

| Route | Behavior |
| --- | --- |
| `GET /models`, `GET /models/sdc-default` | Authenticated discovery within the caller's scoped binding |
| `POST /chat/completions` | Synchronous completion or SSE chunks, one choice |
| `POST /responses` | Synchronous, background or streamed response |
| `GET /responses/{id}` | Durable scoped retrieval; optional stable event replay |
| `POST /responses/{id}/cancel` | Idempotent cancellation of a background response; empty body or `{}` |

| Request | Supported profile |
| --- | --- |
| Both | `model: sdc-default`; text; committed PNG/JPEG references; current instructions; caller function definitions/choice/results on qualified bindings; `parallel_tool_calls`; `stream` |
| Chat | `messages` with user/assistant/tool/system/developer roles; `n: 1`; one of `max_tokens` or `max_completion_tokens`; `stream_options.include_usage`; ordinary `response_format: {type: text}` |
| Responses | `input` text/messages/function calls/results; `instructions`; `previous_response_id`; `max_output_tokens`; `background`; `store: true`; `truncation: disabled`; ordinary `text.format: {type: text}` |

Unknown fields and incompatible nested fields fail before dispatch. Sampling, seed, stop, logprobs, reasoning controls, built-in tools, audio/video, alternate model names, multiple choices, strict native structured decoding, nondefault image detail and `store: false` are unsupported. Schema validation of caller function proposals is server-owned; it does not guarantee a native strict decoder. Native tools never become caller function calls. The default deployed Cline binding has no caller-tool qualification, so caller tools are rejected before native dispatch. The original M28 round trip used an explicitly qualified simulation. M30 separately accepted API 1.3/companion 0.7.0 disposable native caller-effect ownership; it does not automatically qualify every later binding or named tool-using client.

## Authority, state and retries

Every request needs `Authorization: Bearer <SDC scoped credential>`. Mint the credential through the existing graphical/server authorization flow for one active native session. It is not an OpenAI key. Every generation POST requires a stable `Idempotency-Key` (1–128 letters/digits or `._:-`). Retrying the same normalized request with the same key returns the original generation; changing its content conflicts. The official SDKs' automatic retry uses the caller's header. A tested lost admission response produced two HTTP admissions and exactly one durable generation/native command. After stream interruption, retry the original Chat request/key or retrieve the same Responses ID; never invent a replacement key.

Default `X-SDC-Context-Mode: exclusive` reserves the stateful binding for one server conversation. Continue Chat with the exact canonical previous messages and tool results; continue Responses with the current head's `previous_response_id` and new input. Rewinds, edits, independent histories and branches conflict. A foreign caller cannot retrieve another caller's response. A fresh gateway reconstructs response lineage and options from server state.

For the existing graphical task, explicitly choose `X-SDC-Context-Mode: shared-task`. This profile shares the native task's hidden context; it does not promise independent model contexts. Server histories remain scoped. Current system/developer messages and Responses instructions are composed for the current turn; previous Responses instructions are not silently reapplied. Shared task native-local activity may change revisions or detach authority; reconnect through the normal graphical consent flow.

`resp_<generation UUID>` is the locally retained Responses ID. Results and lineage last seven days; original retry identities remain tombstones after expiry. Retrieval after expiry returns 410. `store: true` refers to local server retention only. Gateway restart does not change IDs or results. Cancellation and public output/deadline settlement do not prove the native app stopped generating; inspect `sdc.backend_status` and the existing operation/native receipts.

## Accounting and output

Headers `X-SDC-Profile`, `X-SDC-Usage-Source: estimated` and `X-SDC-Stream-Delivery: terminal-buffered` advertise the profile. Each response includes `sdc` provenance and the usage object contains the complete server estimate, including source/scope/estimator. Standard token counters carry **estimated units**, using `sdc-text-v1`, not provider billing or a native tokenizer. Cached/reasoning details and an unknown completion timestamp are null, never invented zero counts. Model creation time uses an explicit zero sentinel with `sdc.created_unknown: true`.

Input admission defaults to 32,768 estimated units; output defaults to 8,192 and accepts 1–8,192; deadline is 600 seconds. Output quotas trim committed text at Unicode character boundaries and may produce Chat `length` or Responses `incomplete` with reason `max_output_tokens`. They do not cap native generated tokens or costs. Input includes the composed server prompt under the documented estimator; native hidden context is excluded. Input estimates include a fixed 1,024-unit allowance per image, labeled in provenance; it is not a provider image-token count. `sdc.outcome` distinguishes quota/deadline/backend errors from observed native completion.

## Streaming and errors

Native partial/replaced outputs stay internal until the server commits its immutable result. SSE delivers deterministic chunks of that result, so no speculative text can later need retraction. Responses emits created/progress, output item/content/text or function argument events, and the committed completed/incomplete/failed event. Chat emits role/content or function deltas, finish reason, an optional final usage chunk with empty choices, then `[DONE]`. Long waits send heartbeat comments. Authentication is rechecked during waits and before each frame. HTTP/SSE disconnect releases gateway capacity; the server generation remains durable.

Responses retrieval supports `?stream=true&starting_after=<sequence>` or `Last-Event-ID: <response ID>:<sequence>`. Event IDs and sequence numbers are deterministic across retrieval/gateway restart. Foreign, malformed or ahead cursors are rejected. Pending responses expose only the created/progress prefix. Replay is local and scoped, not OpenAI cloud event storage.

Errors before streaming use an OpenAI-shaped `error` envelope and an appropriate HTTP status. Chat failure/cancellation/deadline during streaming emits an error and closes without a success finish or `[DONE]`. Responses cancellation emits an `error` event with `sdc_cancelled`; no invented completion event is emitted. A revoked credential cannot retrieve output or continue a stream. Gateway normal/control capacity is shared with first-party REST (64 normal, 32 reserved control slots), including the lifetime of streams.

## Images and SDK setup

Upload and commit media through the authenticated first-party attachment API. Use `sdc-attachment://<attachment UUID>?mime=image/png` (or `image/jpeg`) in Chat `image_url.url` or Responses `input_image.image_url`. The server validates attachment ownership, committed bytes and MIME. Arbitrary URLs, data URLs and provider `file_id` references are rejected; the gateway does not download media.

The tested exact consumers are Node **openai 7.30.0** and Python **openai 3.26.0**, pinned in the respective npm/uv locks. For example, with an existing shared graphical task:

```python
from openai import OpenAI
client = OpenAI(
    api_key=sdc_credential,
    base_url="http://127.0.0.1:8000/openai/v1",
    default_headers={"X-SDC-Context-Mode": "shared-task"},
)
response = client.responses.create(
    model="sdc-default", input="Reply briefly",
    extra_headers={"Idempotency-Key": "my-original-request-1"},
)
print(response.output_text)
```

SDK parsing and high-level stream accumulators are verified. Python SDK 3.26.0 `get_final_response()` requires a `response.completed` event; for incomplete/failed/cancelled streams inspect the typed terminal event or retrieve the same response instead. This profile does not promise every OpenAI feature, strict vendor schema parity, an unmodified coding client's required options, production identity or deployment. See [M28 evidence](../evidence/M28/README.md), [generated OpenAPI](../api-gateway/openapi.json), [first-party contract](public-rest-api.md), and [DECISION-010](decisions/010-server-owned-api-semantics.md).

Official source review: [Chat create](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Responses create](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create), [streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events), [background/cancel](https://developers.openai.com/api/docs/guides/background), [conversation state](https://developers.openai.com/api/docs/guides/conversation-state). These sources define wire shapes; the SDC restrictions above are intentional and explicit.
