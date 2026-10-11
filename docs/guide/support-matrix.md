# Exact support and field matrix

Read this together with the [user guide](user-guide.md) and [API guide](api-guide.md). A protocol feature, a simulated fixture pass and an observed native effect are different evidence. Version ranges in an extension manifest describe install eligibility, not tested compatibility.

## 1. Host, packages and deployment

| Target | Status and evidence |
|---|---|
| macOS arm64; official signature-verified VS Code 1.140.0; maintained Cline 4.1.2204/API 1.3; companion 0.7.3 | Current selected target. [M24 acceptance](../../evidence/M24/persistent-local/final-acceptance.json), [installed hashes/lifecycle](../../evidence/M24/persistent-local/package-lifecycle.json) |
| Persistent local Docker at `https://localhost:15943`; real Keycloak 26.4.7; private CA/TLS; PostgreSQL 17.11 | Current selected target. [Verified health](../../evidence/M24/persistent-local/final-health.json), [identity/restore](../../evidence/M24/persistent-local/final-database-restore.json) |
| Prompts/questions/cancel, approvals disabled | Exact selected M24 local consent. [Fresh pairing/receipts](../../evidence/M24/persistent-local/native-final-receipts.json) |
| Signed release integrity | Project Ed25519 manifest, trusted verification key, MIT project/Apache-2.0 upstream and retained bundled notices. [Manifest](../../evidence/M24/artifact-manifest.json), [notice review](../../evidence/M24/upstream-notice-review.json). Not Marketplace signing |
| Stock Cline in ordinary VS Code | Preserved, not this integration target. [Unchanged stock bundle](../../evidence/M24/persistent-local/ordinary-cline-preserved.json) |
| A VS Code profile sharing ordinary extension binaries | Not an isolation boundary. Use separate user-data **and** extension directories, or a separate macOS user |
| Other VS Code/Cline versions, Intel macOS, Windows/Linux native hosts, remote extension hosts and Antigravity | No current acceptance; do not infer support from installation alone |
| Internet production/domain, public Marketplace distribution | Not performed/accepted by the selected local deployment |
| Codex integration M16–M18 / standalone SwiftUI installer | Deferred/outside first-release scope; preserved research is not support |
| Frozen release, latency/load and one-hour soak | [M26 qualification](../../evidence/M26/README.md) Done for the exact local target: real native hour, bridge hour, three latency/backlog trials and final cleanup passed |

## 2. Client and provider profiles

| Consumer | Exact tested version/subset | Evidence and limits |
|---|---|---|
| First-party REST/SSE | `/api/v1` over the existing TypeScript server | [M26 real controls/context/revocation](../../evidence/M26/firstparty-native.json), [current REST retry](../../evidence/M26/provider-native.json), [media](../../evidence/M26/image-native.json). Replay/race stress uses real HTTP/PostgreSQL and simulated native devices; see [traceability](../../evidence/M26/traceability.md) |
| OpenAI Node SDK | `openai 7.30.0`, Chat + Responses text on current final pair | [M26 current sync](../../evidence/M26/provider-native.json), [SSE/retrieval](../../evidence/M26/sdk-streams-native.json), [PNG](../../evidence/M26/image-native.json), [JPEG](../../evidence/M26/jpeg-native.json) |
| OpenAI Python SDK | `openai 3.26.0`, locked test consumer | [M28 SDK contract fixtures](../../evidence/M28/verification.json); not a claim of a separate current Python/native acceptance run |
| Anthropic Node SDK | `@anthropic-ai/sdk 0.132.1`, Messages text on current final pair | [M26 current discovery/count/sync](../../evidence/M26/provider-native.json), [SSE](../../evidence/M26/sdk-streams-native.json) and committed PNG/JPEG |
| Anthropic Python SDK | `anthropic 1.12.1`, locked test consumer | [M29 verification](../../evidence/M29/verification.json); fixtures alone do not prove a new native client |
| Aider | `0.86.2`, Python 3.12.15; exact local shim/model settings; two text/whole-file edits each on Chat and Messages | [M26 current real HTTPS/native edit results](../../evidence/M26/aider-native.json), [shim retry identity checks](../../evidence/M26/aider-shim-test.log). Exact shim/text/whole-file settings only; native API1.3/companion0.7.3 |
| Unmodified Aider, stock Aider tool mode, arbitrary coding/desktop clients | Not qualified | Unmodified requests omit the mandatory key and include unsupported sampling; named tool-using client acceptance is absent |
| Caller functions on default M24 binding | Withheld unless independently qualified for the exact binding | [Native gate](../native-public-api-gate.md). M30 API 1.3/companion 0.7.0 disposable caller-effect ownership passed, but that exact qualification does not automatically enable the default deployed binding |

These SDKs are API consumers. None replaces Cline's model executor. `sdc-default` names an authorized service binding; it is not an OpenAI/Anthropic model, and changing it is not a model-switch mechanism.

## 3. Media and control boundaries

| Feature | Current boundary |
|---|---|
| Text prompt + subsequent same-task prompt/output | Fresh [M26 same-task recall/output](../../evidence/M26/firstparty-native.json) passed |
| Text question answer and observed-turn cancel | Fresh [M26 native question/cancel receipts](../../evidence/M26/firstparty-native.json) passed; addressed IDs/revisions are required |
| Once/deny native approval | Fresh [M26 bounded once/deny](../../evidence/M26/firstparty-native.json) passed under temporary explicit consent. [Approvals-disabled restored](../../evidence/M26/native-fences.json) afterward; Auto-approve stayed None |
| Narrowed, turn/session/persistent native grants; native grant revocation | Unsupported. A device/API credential revocation is not a native permission-grant revocation |
| PNG/JPEG public image blocks | Fresh [M26 PNG](../../evidence/M26/image-native.json) and [JPEG](../../evidence/M26/jpeg-native.json) committed checksum staging and native completion through REST/Chat/Responses/Messages passed. Marker turns prove delivery, not image recognition accuracy |
| Browser picker offers PDF/JSON/text/Markdown/WebP | UI picker availability is not native support. Check the exact binding/capability; provider image profiles do not accept these formats |
| External image URL, data/base64 URL, provider file ID, audio/video | Rejected by the restricted public/provider profiles |
| Local Disconnect | Immediately stops new local remote dispatch; does not stop native work already running |
| Server/API disable/revoke/cancel request | Durable request/authority change, not automatic proof of native abort or undo |
| Tool activity in native transcript | Observed Cline activity, not a caller-owned function call |

## 4. Request field matrix

The [generated OpenAPI](../../api-gateway/openapi.json) is the exact structural reference. These summaries describe meaning and intentional restrictions. Unknown fields and unsupported values fail before admission. A supported schema field still needs live capability/authority and, for caller functions, exact safety qualification.

| Request | Supported fields/subset | Rejected or conditional |
|---|---|---|
| First-party prompt | `model`, `content`, `delivery: "queue"`; content is 1–32 text/image blocks | Unknown fields, alternate delivery, non-PNG/JPEG public image blocks |
| First-party generation | Server-owned history, instructions, `conversationId`/`parentId`, `contextMode`, tools/choice/parallel policy, budgets, background | Editing/branching canonical lineage, foreign tool IDs, unsafe/unqualified caller tools, unsupported settings |
| OpenAI Chat | `model`, `messages` user/assistant/tool/system/developer, text + committed image references, `n: 1`, `stream`, `stream_options.include_usage`, one of `max_tokens` or `max_completion_tokens`, ordinary text response format | Sampling, seed, stop, logprobs, reasoning, built-in tools, multiple choices, alternate models, nondefault image detail, native strict decoding |
| OpenAI Responses | `model`, text/messages/function input, `instructions`, `previous_response_id`, `max_output_tokens`, `stream`, `background`, `store: true`, `truncation: "disabled"`, ordinary text format | `store: false`, built-in tools, arbitrary cloud features, lineage rewinds/branches, unsupported nested fields |
| Anthropic Messages | Wire version `2023-06-01`; `model`, messages/system text, `max_tokens`, stream, custom caller functions/results on qualified bindings | Nonempty beta features, sampling, nonempty stop sequences, reasoning/signatures/cache controls, built-in/server tools, unsupported media |
| Anthropic model list | `limit` 1–1000 and at most one known `after_id` or `before_id` cursor | Unknown/duplicate/combined cursors and extra queries |
| Anthropic count | Supported input composition with labeled estimated `input_tokens`; no work/history admission | Treating it as actual provider tokenization/billing |
| Question answer | `type: input.respond`, stable `commandId`, `turnId`, `requestId`, positive `requestRevision`, nonempty `answer` | Generic answer targeting “the current question” or stale IDs |
| Native turn cancel | `type: turn.cancel`, stable `commandId`, exact observed `turnId`, optional bounded reason | Assuming HTTP success means native termination |
| Session disable | `type: session.disable`, stable `commandId`, nonempty reason; administer authority | Using it as an immediate offline local kill switch |
| Approval decision | Exact request route, decision ID, request revision, action digest, offered choice, empty grants for this native route, policy revision, bounded expiry | Narrowed/persistent grants or reusing a prior action's digest/decision |

`providerReady: false` in the native profile reports limitations of raw native exports. It is not a verdict that the separately declared gateway text profile failed. Inspect `serverPolicy`, operation readiness and the exact accepted profile/evidence together.

## 5. Limits and accounting

| Limit | Value/meaning | Source |
|---|---|---|
| Profile name | 1–64 letters/digits/`_`/`-` | Companion configuration validation |
| Graphical Connect | 120 seconds; explicit retry after expiry | `extensions/vscode/src/connect-ui.ts` |
| Cleanup browser reauthentication | 300 seconds | Same owner |
| Lease / renewal | Default 60 seconds / 20 seconds; conservative local deadline | [Bridge runtime](../bridge-runtime.md) |
| Request JSON | 1 MiB before decode; compressed bodies rejected | Gateway `BodyLimit` |
| Prompt blocks / individual text | 1–32 blocks / at most 262,144 characters at gateway schema | `api-gateway/sdc_gateway/models.py` |
| Public PNG/JPEG | 10 MiB upload and aggregate prompt image bytes; native staging also checked | `PUBLIC_LIMITS` and native adapter |
| Result / SSE frame | 36 MiB result/relay; 1 MiB frame plus 4,096-byte gateway envelope allowance | Gateway/server bounds |
| Body receipt / upstream connect, pool, write, read | 15 seconds / 5, 5, 10, 35 seconds | Gateway transport |
| Bounded wait | At most 30 seconds | Public server limits |
| Rate | 120 requests/minute per principal, normal and control buckets independent | Public server rate state |
| Gateway concurrency | 64 ordinary + 32 reserved control relays; 128 HTTP connection pool, per process | Gateway; more workers multiply local limits |
| Public waits / event streams | 64 waiters / 64 public streams per server process | Public limits; shared native dispatch has its own capacity |
| Credential retention cap / expiry | 100 records per owner / issue within 30 days; no implicit delegation | Public credential authority |
| Operations | 10,000 retained records per session; seven-day retrieval retention with expired retry tombstones | Public admission/storage |
| Shared durable storage defaults | 10,000 events and 32 MiB event payload per session; 50,000 lane commands and 32 MiB lane payload; 1 MiB record | [Storage owner](../../server/src/storage/index.ts). Caps refuse; no automatic archival policy |
| Input / output / deadline policy | Default 32,768 / 8,192 estimated units / 600 seconds; supported output range 1–8,192 | Server composition/provider profiles |
| Estimate | `sdc-text-v1`: ceiling of Unicode code points / 4; 1,024 input allowance per committed image | Server policy, explicitly estimated |

Output/deadline quotas settle public results; they do not measure or cap actual native generated tokens, hidden context, reasoning, provider costs or billing. The server requests addressed cancellation when it can, but the lane remains reserved until native terminal/reconciliation evidence. Never report estimated counters as real vendor usage.

## 6. Where to verify a claim

Current package fingerprints: [signed M24 manifest](../../evidence/M24/artifact-manifest.json). Current real identity/native/lifecycle: [M24 acceptance](../../evidence/M24/persistent-local/final-acceptance.json). Current frozen qualification: [M26](../../evidence/M26/README.md) and [FR traceability](../../evidence/M26/traceability.md). Historical separately qualified caller-tool cases: [M30 overview](../../evidence/M30/README.md) and its exact [client matrix](../../evidence/M30/client-matrix.json). Request schemas: [OpenAPI](../../api-gateway/openapi.json), [first-party contract](../public-rest-api.md), [OpenAI](../openai-api-profile.md) and [Anthropic](../anthropic-api-profile.md). M25 guide verification is recorded in [M25 evidence](../../evidence/M25/README.md).
