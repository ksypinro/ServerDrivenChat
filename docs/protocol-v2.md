# Protocol v2.0 contract

This is the protocol contract introduced in M04. It describes data and pure validation only. It opens no sockets, writes no storage, and does not assert support from Codex, Cline, or another host. Machine-readable schemas are exported to [`protocol/schemas/v2.0/`](../protocol/schemas/v2.0/); TypeScript public types and validators are exported by `@server-driven-chat/protocol`.

## Compatibility and identity

Every wire message carries `protocolVersion: "2.0"`. A receiver accepts only an explicitly supported version and rejects an unknown major, message `type`, enum value, or undeclared property. Adding a field or message requires a schema/package update and compatibility review; optional extension data must not change authorization semantics. Native app, conversation, turn, request, and item identifiers remain opaque strings; they are never inferred from titles.

Commands have stable `commandId`, `sessionId`, `bindingRevision`, `leaseGeneration`, `lane`, lane-local `seq`, and creation time. `turn.submit` uses the `prompt` lane; all controls use the independent `control` lane. Bridge events have stable `eventId`, `bridgeEpoch`, and contiguous `producerSeq` per session/epoch. The server's later UI `sessionSeq` is assigned only after durable ingestion. Identical retries retain the same ID and canonical content; the same ID with changed content is a conflict. Gaps require replay or explicit resynchronization.

`validateProtocolMessage(value, expectedBinding)` checks schema and supported cross-field invariants. Callers pass the active session, binding revision, and lease generation; mismatch fails closed. The adapter interface returns promptly with `accepted`, `applied`, `rejected`, `unsupported`, or `unknown` evidence. Execution progress is reported through events; acceptance is not completion.

## Commands and output

The wire union distinguishes turn submission/steering/cancel, clarification response, request-bound approval decision, inspection, local/server disable, and supported grant revocation. Prompt and control lanes have independent sequence cursors. `turn.submit` requires a content-block array, explicit queue/immediate intent, and an expected conversation revision. An uncertain external submission is never automatically replayed by this contract.

Events model command receipt/rejection, turn states, stable output items and revisions, artifacts, input, approval lifecycle, grants, snapshots, local actions, protocol errors, and replay gaps. Output deltas carry both `baseRevision` and the next revision; a base mismatch requests reconciliation. Terminal output evidence is separate from assistant text. Snapshot watermarks include both command lanes and the server event stream.

## Approvals and canonical digests

An `approval.required` request preserves native request identity, app/session/binding/turn identity, request revision, exact reviewable action, requested permissions, exact native choices/scopes, observation evidence, expiry, and `actionDigest`. `evidence.complete: false` cannot authorize a structured remote decision. The digest is `sha256:` plus lowercase SHA-256 hex of UTF-8 RFC 8785 JSON Canonicalization Scheme bytes.

The digest input is `ActionDigestInput` from the package and includes app, app-instance, binding, session and native conversation IDs; binding revision and lease generation; server/native turn and request IDs where available; request revision; full action arguments; working directory/command/environment/recipient/body when exposed; requested permission scopes; available decision effects/scopes; and immutable attachment/artifact checksums. JSON object-key order is immaterial; command/content arrays preserve order. Permission, choice, and checksum arrays are sets and are deduplicated then sorted by their canonical JSON representation. Strings are not Unicode-normalized. Non-JSON values, cycles, sparse arrays, undefined, and non-finite numbers are rejected.

`validateDecisionAgainstRequest` recomputes the request digest, checks request identity/revision and exact offered choice, rejects incomplete evidence and expiry, and restricts grants to exact requested permission objects. Deny/cancel choices must have an empty grant list. This validates data only; reviewer authentication, server assertion verification, transactional winner selection, native request revalidation, and native application belong to M08/M11 and app milestones.

Approval states are `pending → decision_recorded → applying → applied`, with explicit denied/expired/superseded/resolved-elsewhere/apply-failed/reconciliation outcomes. No state named applied follows from a server record or UI click alone. `canTransitionApproval` and `canTransitionTurn` enforce the declared transitions; leaving reconciliation requires fresh evidence. `sequenceAdvance` distinguishes next, duplicate, stale, and gap. `isExpiredAt` takes an injected current timestamp and never reads the system clock.

## `bridge.connect` and `bridge.disconnect`

The two Connect tool inputs are a separate local contract rather than transport commands. `bridge.connect` accepts only a configured `serverProfileId` and optional display label. `bridge.disconnect` accepts only `scope: "current-binding"` and an optional reason. The closed schemas reject model-supplied task/session IDs, callback URLs, credentials, permission grants, reviewer identities, or arbitrary endpoint URLs.

The Cline extension supplies a separate trusted out-of-band context with installation, host, window, workspace, native task, and invocation identities. The handler must fail if that context is missing or ambiguous; it must never trust model arguments for these values. Local confirmation, authentication, and pairing remain graphical and distinct. Connect does not install an extension, sign in, or broaden app permissions. The bounded result reports status and a display message only; it contains no credentials. Disconnect targets the current trusted binding and does not imply cancellation of a running turn.

M02 established that stock Cline APIs do not yet supply the trusted origin or atomic task/request-bound actions. These contracts are proposals for an upstream app-owned API addition, not claims about a callable stock API. M21 cannot pass until that API is adopted and validated in each supported host.

## State and expiry rules

Turn states: `queued`, `dispatching`, `running`, `waiting_for_input`, `waiting_for_approval`, `completed`, `failed`, `cancelled`, `completion_unverified`, and `reconciliation_required`. Dispatch uncertainty remains distinct from app acceptance. Terminal states do not transition. A transition out of reconciliation requires a fresh inspected outcome.

Approval decisions require an expiry timestamp. Expiry means no new authority and never silently grants; server expiry does not revoke an already applied native grant. Lane cursors advance only across contiguous sequence numbers. A cursor at the current sequence is a duplicate candidate; equality of ID and canonical payload must be checked by the owner before acknowledging it as identical. A larger jump is a gap; a lower sequence is stale.

## Files and commands

- `protocol/src/contracts.ts` — TypeScript unions, identifiers, payloads, adapter seam, and local Connect types.
- `protocol/src/schemas.ts` — canonical schema source; `protocol/schemas/v2.0/*.schema.json` is generated from it.
- `protocol/src/canonical.ts` — canonical JSON, normalized approval digest input, SHA-256.
- `protocol/src/validation.ts` — JSON Schema and cross-object approval/binding validation.
- `protocol/src/state.ts` — pure state, expiry, and sequence helpers.
- `protocol/fixtures/v2.0/` — valid/invalid message fixtures and fixed digest vectors.

From the repository root, run `npm run build`, `npm run schemas:export`, `npm run lint`, and `npm test`. Schema export is deterministic; tests fail if checked-in JSON schemas drift from the TypeScript schema source.

## Transport metadata and SDK recovery amendment (2026-10-06)

Timestamp calendar validation applies only to schema-declared `date-time` fields. Opaque JSON answers, action arguments, scopes and schemas may contain arbitrary keys/text such as `{createdAt:"yesterday"}` without acquiring protocol semantics.

`command-skip.schema.json` defines authenticated obsolete-work tombstones for device-lane continuity; `dispatch-permit.schema.json` defines locked server admission metadata. These are route metadata under `/v2`, not additional native event types or model-authored authority. SDK output checkpoints carry an epoch and a contiguous producer sequence. Native mutations carry a cancellation/authority context; the adapter must check it at the effect boundary. These additions preserve the existing 2.0 command/event envelopes and make recovery/admission explicit.


## M27 compatibility review — 2026-10-08

`OutputItem.nativeCategory` is an optional opaque string (1–256 characters) preserving the native message category on item creation/replacement. It conveys observation, never authorization, caller-tool ownership or a guaranteed provider final answer. Existing producers that omit it remain valid. Because v2 schemas reject undeclared fields, **older closed-schema consumers will reject new category-bearing events**: update server, bridge/adapter and consumers together using the generated schemas. Wire remains 2.0 after this bounded optional-field review; this is not universal old-reader compatibility. Old archived/native packages are preserved. Companion 0.6.0 is an uninstalled candidate and fresh native acceptance remains outstanding.

The public operation/key/dispatch contracts live in server HTTP/storage and do not introduce provider-specific fields into the shared protocol. Public-enabled dispatch requires command-specific authority and rejects older companions explicitly. [M27 verification](../evidence/M27/verification.json) and [native gate](native-public-api-gate.md) separate current automated checks from required native qualification.
