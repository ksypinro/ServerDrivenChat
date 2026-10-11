# Implement and qualify SDC as a Codex model provider

**Proposed engineering plan — 11 October 2026.** Read the [setup guide](README.md) and [compatibility design](compatibility-design.md) first. This is a design, not an instruction to run a new native acceptance or modify current services without a new implementation scope.

## 1. Deliverables and ordered gates

Build one bounded consumer integration. Preserve the current accepted Cline API, neutral server policies and native permissions. Start with these deliverables:

1. Exact client/surface inventory and sanitized request/event contract.
2. A durable per-model-call identity mechanism, including crash/transport recovery.
3. A supported request/dialect profile with explicit retention/context policy.
4. Exact-version truthful model catalog, configuration and credential delivery.
5. First a narrow text pilot, then independent tool/native-effect qualification.
6. Installation, update, rollback, cleanup and operational instructions only after acceptance.

These are proposed work stages, not milestone renumbering or resumption of native Codex M16–M18. M26 remains a separate release/soak effort. No new runtime or model executor is authorized by this documentation.

## 2. Stage A: pin the client and inspect its real contract

### Inventory

Record surface (macOS desktop, VS Code extension or developer CLI), platform/architecture, installed version, bundled runtime, signature/provenance, configuration scope and enabled feature set. The documentation review observed CLI **0.159.0** only. A desktop or extension using another runtime is a separate target.

Record backend versions, server/gateway image/dependency hashes, model alias, binding identity, native grant categories and caller-tool qualification. Use the current [support matrix](../support-matrix.md), [artifact manifest](../../../evidence/M24/artifact-manifest.json) and [OpenAI profile](../../openai-api-profile.md) as the baseline.

### Nonexecuting client-contract fixture

Before sending actual model work, design a loopback fixture that captures only a disposable user's approved requests and returns scripted Responses events. It must not execute models/tools or reach the native backend. Fixture success proves client wire behavior, not SDC/native compatibility.

Capture/inspect:

| Contract area | Questions to resolve |
|---|---|
| URL/transport | Actual endpoint, WebSocket attempt, query parameters, content encoding |
| Identity | Per-call identifier, lifecycle across HTTP/SSE retry, restart and intentional identical call |
| Authentication | Header transport, environment/helper inheritance, expiry and refresh behavior |
| Request | Store setting, reasoning/text options, output limit, tool count/type/schema, image form |
| Follow-up | Full replay or parent ID, role/content/item IDs, custom/reasoning items |
| Stream | Needed event types/fields, progress heartbeat handling, terminal/error semantics |
| Tools | Call IDs, custom/function grammar, result shape, denial/failure/parallel loop |
| User actions | Stop, retry, edit, fork, compaction, new chat and model switch behavior |

Do not record Authorization/cookies, private credential files or arbitrary repository content. Keep sensitive full bodies only in an explicitly scoped protected test capture, if needed; publish redacted field inventories/digests. Use dummy credentials for the fixture. Never intercept the ordinary user's active model traffic silently.

**Exit gate:** the exact client contract is known. If no durable logical model-call identity exists, select a reviewed client mechanism before adding a real backend.

## 3. Stage B: resolve identity and dialect

### Choose direct integration or a facade

Use direct routing when the selected client can emit all required semantics. If translation is necessary, design a narrowly scoped authenticated facade as in the [architecture](compatibility-design.md#2-direct-provider-versus-compatibility-facade).

Proposed integration paths such as `integrations/codex-consumer/` or a new explicit gateway profile are suggestions, not existing packages. A generic facade should depend on neutral public contract data; any Codex-specific provider syntax belongs at the edge. Do not add Codex packages/imports to shared protocol/storage/bridge core.

### Per-call identity implementation

Implement a durable client-owned intent before dispatch. One model round gets one key; tool continuation gets another; HTTP/SSE retries preserve the original. Correlate original client identity/body digest/principal/context to SDC operation/response IDs. Unknown outcomes remain unresolved, even after restart or credential rotation.

If identity comes from a client's observed header, test all lifecycle cases before accepting it. If a client patch is required, pin/review/distribute it explicitly and document stock-client support as absent. A helper that only emits a bearer token cannot supply this mechanism.

### Provider profile rules

- Accept only the captured supported request shapes. Preserve required instruction, tool and storage semantics.
- Disable unsupported features through documented client controls where possible; verify on the wire.
- Do not rewrite `store: false`, strict/structured behavior, built-in search or custom tool requirements silently.
- Keep the selected service alias and server-origin allowlist exact.
- If translating tools, validate grammar/schema/arguments and preserve issued IDs/results bidirectionally.
- Respect canonical history and effect-denial policy. Do not deduplicate by text alone.
- Preserve distinct auth, routing, validation, rate, context and backend errors.
- Define cancellation/outcome recovery separately from stream disconnect.

For full live streaming, propose safe immutable increments or a separately qualified stable-output path. The current terminal-buffered profile should remain accurately labeled; do not regress its output/authority correctness to improve appearance.

## 4. Stage C: package catalog, config and credential delivery

### Build a truthful catalog

1. Select the catalog from the exact official client version/source commit or desktop bundled runtime.
2. Add the SDC alias using that version's actual schema.
3. Review capabilities against SDC's qualified profile, not a familiar GPT model's advertised window/tool features.
4. Disable unsupported migrations; retain all other models intentionally needed in that isolated configuration.
5. Install to a resolved absolute path and set top-level `model_catalog_json` before TOML tables.
6. Validate parsing and effective model behavior on the exact surface.

Do not create a JSON catalog from guessed required fields. Pin/hash the distributed catalog and include it in integration evidence. [OpenAI's version-matched catalog guidance](https://learn.chatgpt.com/docs/enterprise/roll-out-a-gateway#supply-metadata-for-a-custom-alias).

### Finalize configuration

Use the [candidate provider configuration](README.md#5-candidate-configuration-useful-but-not-a-working-release-recipe) only as a starting point. Fill the installed catalog path, selected verified endpoint and actual identity mechanism. Keep sensitive provider routing in a supported user/admin configuration layer; project-local configuration is not an appropriate provider/auth override channel. [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

For a supported named profile in the selected client version, use its documented profile file/selection mechanism. Avoid copying older examples with a different profile format. Review managed requirements and effective precedence; never edit the ordinary shared configuration as part of a hidden test.

### Optional credential helper

If GUI process environment delivery is unsuitable, a future helper can load **this consumer's** scoped SDC key from its own Keychain namespace. It must:

- Resolve only approved user/profile/server identity.
- Output only the bearer token through the documented helper contract.
- Keep diagnostic stderr token-free and never expose tokens in command arguments.
- Fail when expired/revoked instead of silently switching session/binding/principal.
- Coordinate planned key renewal with unresolved operations.
- Avoid device secrets, private CA keys and administrator credentials.

This helper is not currently shipped. A future configuration would replace `env_key`, `experimental_bearer_token` and `requires_openai_auth` fields with an auth block. The example path below is a **placeholder**, not an installed executable:

```toml
[model_providers.sdc-qualification.auth]
command = "/absolute/installed/path/sdc-codex-token"
args = ["print-token", "--profile", "selected-lab-profile"]
timeout_ms = 5000
refresh_interval_ms = 300000
```

Installing a helper or enabling it requires its own reviewed product scope. Token refresh is distinct from generation key assignment. [Official helper behavior](https://learn.chatgpt.com/docs/config-file/config-advanced#custom-model-providers).

## 5. Stage D: qualify a limited text pilot

Use one dedicated disposable already-consented backend task, with a real provider upstream and current native categories. Keep the ordinary editor/history intact. Do not point backend Cline back at SDC.

Prepare valid HTTPS, client-specific public-CA delivery and a view/prompt key owned by the active session. Confirm the exact effective provider/catalog/alias before the first real prompt. Baseline tests include:

| Test | Required observation |
|---|---|
| Plain answer | One original generation, one native prompt/receipt, intended alias/binding and verified terminal result |
| Intentional identical next prompt | Different per-call key and exactly one new generation |
| Admission reply loss | Same original key/result and no duplicate native command |
| SSE interruption | Original response recovered without new intention |
| App/client restart | Durable original intent recovered or explicit uncertainty, never silent rerun |
| Follow-up | Accepted canonical replay/parent identity and correct prior context |
| Key expiry/revocation | Reads/streams refused appropriately; retained work not silently repeated |
| Wrong alias/options | Useful refusal before native dispatch |
| Timing | Actual completion/heartbeat/client timeout behavior, labeled terminal-buffered if applicable |

If the actual client cannot avoid unsupported tool declarations/fields in a “plain” request, this stage is blocked until the profile handles them. Do not remove tools behind the client's back just to get a text success screenshot.

A successful text pilot is deliberately narrow. Do not label it full Codex coding support or unbuffered gateway parity. Read-only sandboxing describes effect permissions, not the shape of requests.

## 6. Stage E: qualify caller tools and coding

Add tools only after separately qualifying the exact backend binding for caller-effect ownership. Retain native `assertAuthority()` effect-boundary/cancellation checks; backend auto-approve settings alone are insufficient.

### Begin with a harmless read-only loop

In a disposable folder, ask Codex to list a small fixed set of files and summarize them. Observe:

1. The client tool definition reaches the accepted profile with preserved meaning.
2. The server publishes a validated issued call ID in the correct client dialect.
3. Cline performs **no** caller effect.
4. Codex's permissions permit exactly the intended frontend read.
5. Codex returns a matching result using a new model-call intention.
6. The server verifies ownership/canonical continuation and returns a final answer.

Then test a single explicitly scoped disposable edit, denial, tool failure, stale/duplicate result, nonobject/freeform arguments, malformed JSON/grammar, local takeover, revoke/lease races and cancellation. Tools must not execute twice when a request or stream is retried.

A server observing native tool activity must fail the caller result rather than laundering it into a successful client tool call. A client permission denial must be represented truthfully, not retried automatically as success elsewhere.

Qualify actual built-in/custom tools, plugin/MCP definitions and parallel tool behavior only when included in the declared target. Model-provider configuration does not authorize connected services or bypass client permissions.

## 7. Stage F: context and operational acceptance

Test actual new chat, fork, rewind/edit, compaction and Stop actions. A stateful Cline binding does not become stateless because Codex can create many UI threads.

| Scenario | Required policy/evidence |
|---|---|
| Two frontend histories on one binding | Explicit rejection or reviewed isolation; no hidden-context leakage |
| Compaction alters prior history | Defined refusal or separately implemented safe context transition |
| Foreign response/key | Retrieval refused; no principal/key rotation bypass |
| Native local activity/task switch | Context/authority conflict surfaced; no automatic dispatch to another task |
| Stop/disconnect | Separate stream stop, generation settlement and actual native cancellation evidence |
| Prompt lane occupied by another ingress | Admission/backpressure visible; no hidden timed resubmission |
| Long native question/approval wait | Expose backend wait/timeout; preserve original intent and current disabled approval profile |
| Capacity/oversized results | Bounded refusal/truncation/error consistent with declared semantics |
| Upgrade/rollback | Compatible context/journal/catalog behavior and preserved unrelated state |

If multi-chat support needs a pool, design explicit mappings to **already consented distinct native bindings**. Do not add undocumented native task creation, reuse uncertain busy tasks or automatically reset history to bypass isolation.

## 8. Concrete code areas to change after a new instruction

| Area | Potential work | Preserve |
|---|---|---|
| Client integration package/patch | Durable per-call identity, selected payload controls, own recovery | Existing Codex permissions and explicit modified-client support label |
| New edge provider/facade | Exact captured request/tool/event translation | Gateway public API boundary, credential ownership and useful errors |
| `api-gateway/sdc_gateway/openai_profile.py` | Only reviewed new provider semantics if needed | Strict unsupported-field refusal; existing accepted profile |
| `api-gateway/sdc_gateway/openai_http.py` | Explicit versioned dialect/stream behavior if needed | Mandatory stable identity and truthful retention/outcome |
| `server/src/public-api/conversations.ts` | Only necessary neutral context/caller contracts | Canonical history, transaction authority and call ledger |
| Native binding/adapter | Qualification or narrowly reviewed stable-output/effect boundary work | Cline app executes model; no new native permissions by default |
| Config/catalog/helper distribution | Exact pins, installation, Keychain/CA delivery | No secret literals, ordinary profiles/history intact |
| Evidence/support docs | Exact named-client matrix and limitations | Historical M24/M30 evidence not relabeled |

Direct dependencies must be pinned and lockfiles updated if implementation introduces them. Run affected checks and root build/lint/smoke for cross-package changes; gateway checks use its locked runtime. Native/source changes require fresh affected acceptance before repackaging. This documentation task changed none of those code areas.

## 9. Evidence record and rollout gate

Create a named-client record with exact surface/version/runtime, config/catalog/helper hashes, endpoint/profile, backend/native hashes, grants, credential ownership, request/event inventory, per-call identity trace, response/generation/operation/receipt correlations and tested limitations. Redact secrets/content appropriately.

Do not distribute general-use instructions until these distinctions are clear:

- **Configuration parses:** syntax/effective settings only.
- **Fixture works:** client dialect only.
- **SDK works:** accepted SDK consumer only.
- **Text pilot works:** exact client/text/context/retry subset only.
- **Coding profile works:** actual tool loop, ownership, denial and recovery evidenced.
- **Full gateway qualification:** streaming/continuation/tools/metadata/security behavior meets the selected documented requirements.

OpenAI provides a rollout procedure with real client streaming, local tool-loop, follow-up and attribution checks. Adapt it to SDC's native/task/stateful boundaries rather than claiming a health/model-list response qualifies the integration. [Official rollout tests](https://learn.chatgpt.com/docs/enterprise/roll-out-a-gateway#test-the-client-and-gateway).

For now, the result is a concrete design and gated implementation plan. [Research evidence](../../../evidence/research/codex-model-2026-10-11/README.md) records read-only inspection, official sources, configuration syntax and unchanged release artifacts. No new Codex consumer acceptance is claimed.
