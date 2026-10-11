import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  PROTOCOL_VERSION,
  canTransitionApproval,
  canTransitionTurn,
  canonicalJson,
  computeActionDigest,
  connectResultSchema,
  connectToolSchema,
  isExpiredAt,
  isValidRfc3339Timestamp,
  normalizeActionDigestInput,
  protocolSchema,
  publicMessageTypes,
  retryDisposition,
  sequenceAdvance,
  supportsProtocolVersion,
  trustedConnectContextSchema,
  validateConnectToolInput,
  validateConnectToolResult,
  validateDecisionAgainstRequest,
  validateProtocolMessage,
  validateCommandSkip,
  validateDispatchPermit,
  validateTrustedConnectContext
} from "../protocol/dist/index.js";
import { approvalRequest, validBinding, validCapabilities, validConnectContext, validConnectResult, validMessages } from "../protocol/fixtures/v2.0/valid-messages.mjs";
import digestVectors from "../protocol/fixtures/v2.0/action-digest-vectors.json" with { type: "json" };

const root = new URL("../", import.meta.url);

test("checked-in JSON Schemas exactly match the schema source", async () => {
  const [messages, tools, context, result] = await Promise.all([
    readFile(new URL("protocol/schemas/v2.0/messages.schema.json", root), "utf8"),
    readFile(new URL("protocol/schemas/v2.0/connect-tools.schema.json", root), "utf8"),
    readFile(new URL("protocol/schemas/v2.0/connect-context.schema.json", root), "utf8"),
    readFile(new URL("protocol/schemas/v2.0/connect-result.schema.json", root), "utf8")
  ]);
  const module = await import("../protocol/dist/schemas.js");
  assert.deepEqual(JSON.parse(messages), module.protocolSchema);
  assert.deepEqual(JSON.parse(tools), module.connectToolSchema);
  assert.deepEqual(JSON.parse(context), module.trustedConnectContextSchema);
  assert.deepEqual(JSON.parse(result), module.connectResultSchema);
});

test("JSON Schema fixtures cover every public message and reject unknown controls", () => {
  const types = new Set(validMessages.map((message) => message.type));
  assert.deepEqual([...types].sort(), [...publicMessageTypes].sort());
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const valid = ajv.compile(protocolSchema);
  for (const fixture of validMessages) {
    assert.equal(valid(fixture), true, `${fixture.type}: ${JSON.stringify(valid.errors)}`);
    assert.equal(validateProtocolMessage(fixture).valid, true, fixture.type);
    assert.equal(valid({ ...fixture, type: "unknown.control" }), false, `${fixture.type} must not admit unknown controls`);
    assert.equal(valid({ ...fixture, protocolVersion: "3.0" }), false, `${fixture.type} must reject unknown major versions`);
  }
});

test("capability, binding, and Connect contracts validate without model supplied authority", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  ajv.addSchema(protocolSchema);
  const capabilities = ajv.compile({ $ref: `${protocolSchema.$id}#/$defs/Capabilities` });
  const binding = ajv.compile({ $ref: `${protocolSchema.$id}#/$defs/Binding` });
  const connect = ajv.compile(connectToolSchema);
  const context = ajv.compile(trustedConnectContextSchema);
  const result = new Ajv2020({ allErrors: true, strict: true, validateFormats: false }).compile(connectResultSchema);
  assert.equal(capabilities(validCapabilities), true);
  assert.equal(binding(validBinding), true);
  assert.equal(connect({ operation: "bridge.connect", serverProfileId: "team-staging" }), true);
  assert.equal(connect({ operation: "bridge.disconnect", scope: "current-binding" }), true);
  assert.equal(connect({ operation: "bridge.connect", serverProfileId: "team-staging", taskId: "model-invented" }), false);
  assert.equal(context(validConnectContext), true);
  assert.equal(result(validConnectResult), true);
  assert.equal(validateConnectToolInput({ operation: "bridge.connect", serverProfileId: "team-staging", callbackUrl: "https://attacker.invalid" }).valid, false);
  assert.equal(validateTrustedConnectContext(validConnectContext).valid, true);
  assert.equal(validateConnectToolResult(validConnectResult).valid, true);
  assert.equal(validateConnectToolInput({ operation: "bridge.disconnect", scope: "all-sessions" }).valid, false);
});

test("message validation rejects wrong session, stale binding, and malformed semantic revisions", () => {
  const message = validMessages.find((entry) => entry.type === "turn.submit");
  assert.equal(validateProtocolMessage(message, { sessionId: "other-session", bindingRevision: 2, leaseGeneration: 3 }).valid, false);
  assert.equal(validateProtocolMessage(message, { sessionId: "session-1", bindingRevision: 1, leaseGeneration: 3 }).valid, false);
  assert.equal(validateProtocolMessage(message, { sessionId: "session-1", bindingRevision: 2, leaseGeneration: 4 }).valid, false);
  const delta = validMessages.find((entry) => entry.type === "output.item.delta");
  assert.equal(validateProtocolMessage({ ...delta, payload: { ...delta.payload, revision: 4 } }).valid, false);
  const snapshot = validMessages.find((entry) => entry.type === "session.snapshot");
  assert.equal(validateProtocolMessage({ ...snapshot, payload: { ...snapshot.payload, sessionId: "other-session" } }).valid, false);
  assert.equal(validateProtocolMessage({ ...message, createdAt: "2026-02-31T10:00:00Z" }).valid, false);
});

test("canonical action digest matches the fixed vector and normalizes only declared sets", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  ajv.addSchema(protocolSchema);
  const validateInput = ajv.compile({ $ref: `${protocolSchema.$id}#/$defs/ActionDigestInput` });
  for (const vector of digestVectors) {
    assert.equal(validateInput(vector.input), true, `${vector.name}: ${JSON.stringify(validateInput.errors)}`);
    assert.equal(await computeActionDigest(vector.input), vector.actionDigest, vector.name);
  }
  const vector = digestVectors[0].input;
  const reordered = {
    ...vector,
    action: {
      ...vector.action,
      arguments: { content: "ok", path: "/workspace/a.txt" },
      attachmentChecksums: [...vector.action.attachmentChecksums].reverse(),
      artifactChecksums: [...vector.action.artifactChecksums].reverse(),
      environmentChanges: { A: "1", B: "2" }
    },
    requestedPermissions: [...vector.requestedPermissions].reverse(),
    availableDecisions: [...vector.availableDecisions].reverse()
  };
  assert.equal(await computeActionDigest(reordered), digestVectors[0].actionDigest);
  assert.notEqual(await computeActionDigest({ ...reordered, action: { ...reordered.action, command: ["a.txt", "write"] } }), digestVectors[0].actionDigest);
  assert.throws(() => canonicalJson({ value: undefined }));
  assert.throws(() => canonicalJson({ value: Number.NaN }));
  assert.throws(() => canonicalJson({ value: "\ud800" }));
  assert.throws(() => canonicalJson([, "sparse"]));
  assert.throws(() => canonicalJson({ [Symbol("hidden")]: 1 }));
  let getterCalled = false;
  const accessor = Object.defineProperty({}, "value", { enumerable: true, get() { getterCalled = true; return 1; } });
  assert.throws(() => canonicalJson(accessor));
  assert.equal(getterCalled, false);
  assert.deepEqual(normalizeActionDigestInput(vector).requestedPermissions.map((permission) => permission.scope.path), ["/workspace/a", "/workspace/b"]);
});

test("decisions are bound to the canonical pending request and exact offered scope", async () => {
  const request = structuredClone(approvalRequest);
  const input = {
    appId: request.appId, appInstanceId: request.appInstanceId, bindingId: request.bindingId, sessionId: request.sessionId,
    nativeConversationId: request.nativeConversationId, bindingRevision: request.bindingRevision, leaseGeneration: request.leaseGeneration, turnId: request.turnId,
    nativeTurnId: request.nativeTurnId, requestId: request.requestId, nativeRequestId: request.nativeRequestId,
    requestRevision: request.requestRevision, action: request.action,
    requestedPermissions: request.requestedPermissions, availableDecisions: request.availableDecisions
  };
  request.actionDigest = await computeActionDigest(input);
  const deny = { decisionId: "decision-1", requestId: request.requestId, requestRevision: 1, actionDigest: request.actionDigest, choiceId: "deny_once", grantedPermissions: [], expiresAt: "2026-10-05T11:05:00Z" };
  assert.equal((await validateDecisionAgainstRequest(request, deny, "2026-10-05T11:00:00Z")).valid, true);
  assert.equal((await validateDecisionAgainstRequest(request, { ...deny, actionDigest: `sha256:${"b".repeat(64)}` }, "2026-10-05T11:00:00Z")).valid, false);
  assert.equal((await validateDecisionAgainstRequest(request, { ...deny, requestRevision: 2 }, "2026-10-05T11:00:00Z")).valid, false);
  assert.equal((await validateDecisionAgainstRequest(request, { ...deny, grantedPermissions: request.requestedPermissions }, "2026-10-05T11:00:00Z")).valid, false);
  const allow = { ...deny, choiceId: "allow_once", grantedPermissions: [request.requestedPermissions[0]] };
  assert.equal((await validateDecisionAgainstRequest(request, allow, "2026-10-05T11:00:00Z")).valid, true);
  assert.equal((await validateDecisionAgainstRequest(request, { ...allow, grantedPermissions: [{ resource: "filesystem", operation: "write", scope: { path: "/" } }] }, "2026-10-05T11:00:00Z")).valid, false);
  assert.equal((await validateDecisionAgainstRequest(request, allow, "2026-10-05T11:11:00Z")).valid, false);
  assert.equal((await validateDecisionAgainstRequest({ ...request, evidence: { ...request.evidence, complete: false } }, deny)).valid, false);
});

test("state, replay, expiry, and duplicate rules are pure and explicit", () => {
  assert.equal(canTransitionTurn("queued", "dispatching"), true);
  assert.equal(canTransitionTurn("completed", "running"), false);
  assert.equal(canTransitionTurn("reconciliation_required", "running"), false);
  assert.equal(canTransitionTurn("reconciliation_required", "running", true), true);
  assert.equal(canTransitionApproval("pending", "decision_recorded"), true);
  assert.equal(canTransitionApproval("applied", "pending"), false);
  assert.equal(canTransitionApproval("reconciliation_required", "applied"), false);
  assert.equal(canTransitionApproval("reconciliation_required", "applied", true), true);
  assert.equal(sequenceAdvance(4, 5), "next");
  assert.equal(sequenceAdvance(4, 4), "duplicate");
  assert.equal(sequenceAdvance(4, 3), "stale");
  assert.equal(sequenceAdvance(4, 7), "gap");
  assert.throws(() => sequenceAdvance(0, 0));
  assert.equal(retryDisposition({ b: 2, a: 1 }, { a: 1, b: 2 }), "identical");
  assert.equal(retryDisposition({ id: "same", payload: 1 }, { id: "same", payload: 2 }), "conflict");
  assert.equal(isExpiredAt("2026-10-05T11:00:00Z", "2026-10-05T11:00:00Z"), true);
  assert.equal(isExpiredAt("2026-10-05T11:01:00Z", "2026-10-05T11:00:00Z"), false);
  assert.equal(isValidRfc3339Timestamp("2026-02-31T10:00:00Z"), false);
  assert.equal(supportsProtocolVersion(PROTOCOL_VERSION), true);
  assert.equal(supportsProtocolVersion("3.0"), false);
});


test("timestamps follow declared schema fields and preserve opaque JSON", () => {
  const input = structuredClone(validMessages.find(m => m.type === "input.respond"));
  input.payload.answer = {createdAt: "yesterday", expiresAt: "never", nested: [{observedAt: "free text"}]};
  assert.equal(validateProtocolMessage(input).valid, true);
  input.createdAt = "2026-02-31T00:00:00Z";
  assert.equal(validateProtocolMessage(input).valid, false);
  const approval = structuredClone(validMessages.find(m => m.type === "approval.required"));
  approval.payload.action.arguments = {createdAt: "yesterday", expiresAt: "never"};
  approval.payload.requestedPermissions[0].scope.expiresAt = "user text";
  assert.equal(validateProtocolMessage(approval).valid, true);
});


test("transport authority metadata has closed schemas and calendar validation", async () => {
  const module = await import("../protocol/dist/schemas.js");
  for (const [file,key] of [["command-skip", "commandSkipSchema"],["dispatch-permit", "dispatchPermitSchema"]]) assert.deepEqual(JSON.parse(await readFile(new URL(`protocol/schemas/v2.0/${file}.schema.json`,root),"utf8")),module[key]);
  const skip={deviceId:"d",lane:"prompt",laneSeq:1,commandId:"c",reason:"obsolete_binding"};
  assert.equal(validateCommandSkip(skip).valid,true);assert.equal(validateCommandSkip({...skip,sessionId:"private"}).valid,false);
  const permit={sessionId:"s",bindingRevision:1,leaseGeneration:1,serverTime:"2026-01-01T00:00:00Z",leaseExpiresAt:"2026-01-01T00:01:00Z"};
  assert.equal(validateDispatchPermit(permit).valid,true);assert.equal(validateDispatchPermit({...permit,leaseExpiresAt:"2026-02-31T00:00:00Z"}).valid,false);
});
