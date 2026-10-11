import type { CommandType, EventType } from "./contracts.js";

type Schema = Record<string, unknown>;
const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` });
const str = (maxLength = 512): Schema => ({ type: "string", minLength: 1, maxLength });
const id = (): Schema => ({ type: "string", minLength: 1, maxLength: 200, pattern: "^[^\\u0000-\\u001f]+$" });
const integer = (minimum = 0): Schema => ({ type: "integer", minimum, maximum: Number.MAX_SAFE_INTEGER });
const dateTime = (): Schema => ({ type: "string", format: "date-time", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$" });
const hash = (): Schema => ({ type: "string", pattern: "^sha256:[a-f0-9]{64}$" });
const array = (items: Schema, maxItems = 256): Schema => ({ type: "array", items, maxItems });
const object = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
  type: "object", properties, required, additionalProperties: false
});
const jsonObject = (): Schema => ref("JsonObject");

const defs: Record<string, Schema> = {
  JsonValue: {
    anyOf: [
      { type: "null" }, { type: "boolean" }, { type: "number" }, { type: "string" },
      { type: "array", items: ref("JsonValue"), maxItems: 10000 },
      { type: "object", additionalProperties: ref("JsonValue"), maxProperties: 10000 }
    ]
  },
  JsonObject: { type: "object", additionalProperties: ref("JsonValue"), maxProperties: 10000 },
  ContentBlock: {
    oneOf: [
      object({ type: { const: "text" }, text: { type: "string", maxLength: 2_000_000 } }, ["type", "text"]),
      object({ type: { const: "image" }, attachmentId: id(), mimeType: str(255) }, ["type", "attachmentId", "mimeType"]),
      object({ type: { const: "file" }, attachmentId: id(), mimeType: str(255), filename: str(1024) }, ["type", "attachmentId", "mimeType", "filename"]),
      object({ type: { const: "artifact" }, artifactId: id(), mimeType: str(255), label: str(1024) }, ["type", "artifactId", "mimeType"])
    ]
  },
  PermissionGrant: object({ resource: str(256), operation: str(128), scope: jsonObject() }, ["resource", "operation", "scope"]),
  ApprovalChoice: object({ id: id(), effect: { enum: ["allow", "deny", "cancel"] }, scope: { enum: ["action", "turn", "session", "persistent"] } }, ["id", "effect", "scope"]),
  AttachmentReference: object({ attachmentId: id(), mimeType: str(255), sizeBytes: integer(), sha256: hash(), filename: str(1024) }, ["attachmentId", "mimeType", "sizeBytes", "sha256"]),
  Action: object({
    tool: str(256), arguments: ref("JsonValue"), artifactId: id(), workingDirectory: str(4096), command: array({ type: "string", maxLength: 32768 }, 4096),
    environmentChanges: { type: "object", additionalProperties: { anyOf: [{ type: "string", maxLength: 32768 }, { type: "null" }] }, maxProperties: 4096 },
    recipient: str(4096), body: { type: "string", maxLength: 2_000_000 },
    attachmentChecksums: array(object({ attachmentId: id(), sha256: hash() }, ["attachmentId", "sha256"])),
    artifactChecksums: array(object({ artifactId: id(), sha256: hash() }, ["artifactId", "sha256"]))
  }, ["tool", "arguments"]),
  ApprovalRequest: object({
    requestId: id(), requestRevision: integer(1), nativeRequestId: id(), kind: { enum: ["action_approval", "permission_grant"] },
    appId: id(), appInstanceId: id(), bindingId: id(), sessionId: id(), nativeConversationId: id(), bindingRevision: integer(1), leaseGeneration: integer(1), turnId: id(), nativeTurnId: id(),
    action: ref("Action"), requestedPermissions: array(ref("PermissionGrant")), availableDecisions: array(ref("ApprovalChoice"), 32),
    actionDigest: hash(),
    evidence: object({ source: { enum: ["native_event", "accessibility", "dom", "screen_observation"] }, snapshotId: id(), complete: { type: "boolean" } }, ["source", "complete"]),
    expiresAt: dateTime()
  }, ["requestId", "requestRevision", "kind", "appId", "appInstanceId", "bindingId", "sessionId", "nativeConversationId", "bindingRevision", "leaseGeneration", "turnId", "action", "requestedPermissions", "availableDecisions", "actionDigest", "evidence", "expiresAt"]),
  ProtocolError: object({
    code: { enum: ["CAPABILITY_UNSUPPORTED", "BINDING_CHANGED", "REQUEST_STALE", "PERMISSION_SCOPE_UNSUPPORTED", "APP_UNAVAILABLE", "EXECUTION_UNKNOWN", "CURSOR_EXPIRED", "INVALID_MESSAGE", "UNAUTHORIZED", "CONFLICT", "RATE_LIMITED", "PAYLOAD_TOO_LARGE"] },
    message: str(4096), retryable: { type: "boolean" }, details: jsonObject()
  }, ["code", "message", "retryable"]),
  OutputItem: object({
    itemId: id(), turnId: id(), kind: { enum: ["assistant_message", "user_message", "tool_activity", "status", "other"] },
    revision: integer(1), source: { enum: ["native_event", "accessibility", "dom", "screen_observation"] }, partial: { type: "boolean" },
    content: array(ref("ContentBlock"), 4096), observedAt: dateTime(), nativeCategory: str(256)
  }, ["itemId", "turnId", "kind", "revision", "source", "partial", "content", "observedAt"]),
  TurnState: { enum: ["queued", "dispatching", "running", "waiting_for_input", "waiting_for_approval", "completed", "failed", "cancelled", "completion_unverified", "reconciliation_required"] },
  ApprovalState: { enum: ["pending", "decision_recorded", "applying", "applied", "denied", "expired", "superseded", "resolved_elsewhere", "apply_failed", "reconciliation_required"] },
  Capabilities: object({
    protocolVersion: { const: "2.0" }, adapterId: id(), adapterVersion: str(128), appId: id(), appVersion: str(128), platform: str(128),
    operations: { type: "object", propertyNames: { enum: ["probe", "attach", "inspect", "submit", "subscribe", "respondInput", "resolveApproval", "cancel", "revoke", "stageAttachment", "detach"] },
      additionalProperties: object({ status: { enum: ["supported", "unsupported", "unverified"] }, reason: str(4096), evidenceRef: str(1024), limits: jsonObject() }, ["status", "reason"]) },
    effectPolicies: object({ nativeToolsDenied: object({ status: { enum: ["supported", "unsupported", "unverified"] }, reason: str(4096), evidenceRef: str(1024), limits: jsonObject() }, ["status", "reason"]) }),
    observedAt: dateTime()
  }, ["protocolVersion", "adapterId", "adapterVersion", "appId", "appVersion", "platform", "operations", "observedAt"]),
  Binding: object({
    bindingId: id(), sessionId: id(), appId: id(), appInstanceId: id(), accountId: id(), workspaceId: id(), conversationId: id(), nativeConversationId: id(),
    bindingRevision: integer(1), leaseGeneration: integer(1), capabilitiesRevision: id()
  }, ["bindingId", "sessionId", "appId", "appInstanceId", "conversationId", "nativeConversationId", "bindingRevision", "leaseGeneration", "capabilitiesRevision"]),
  SessionSnapshot: object({
    sessionId: id(), bindingRevision: integer(1), leaseGeneration: integer(1), turnState: ref("TurnState"),
    cursors: object({ prompt: integer(), control: integer(), sessionSeq: integer() }, ["prompt", "control", "sessionSeq"]),
    pendingApprovals: array(ref("ApprovalRequest")), pendingInputs: array(object({ requestId: id(), requestRevision: integer(1), question: str(16384), expiresAt: dateTime() }, ["requestId", "requestRevision", "question"]))
  }, ["sessionId", "bindingRevision", "leaseGeneration", "turnState", "cursors", "pendingApprovals", "pendingInputs"])
};
defs.ActionDigestInput = object({
  appId: id(), appInstanceId: id(), bindingId: id(), sessionId: id(), nativeConversationId: id(), bindingRevision: integer(1), leaseGeneration: integer(1),
  turnId: id(), nativeTurnId: id(), requestId: id(), nativeRequestId: id(), requestRevision: integer(1),
  action: ref("Action"), requestedPermissions: array(ref("PermissionGrant")), availableDecisions: array(ref("ApprovalChoice"), 32)
}, ["appId", "appInstanceId", "bindingId", "sessionId", "nativeConversationId", "bindingRevision", "leaseGeneration", "turnId", "requestId", "requestRevision", "action", "requestedPermissions", "availableDecisions"]);
defs.ProducerCursor = object({bridgeEpoch: id(),producerSeq: integer()}, ["bridgeEpoch","producerSeq"]);
defs.LaneCursor = object({ lane: { enum: ["prompt", "control"] }, seq: integer() }, ["lane", "seq"]);

const contentArray = array(ref("ContentBlock"), 4096);
const permissionArray = array(ref("PermissionGrant"));
const commandPayloads: Record<CommandType, Schema> = {
  "turn.submit": object({ content: contentArray, delivery: { enum: ["queue", "immediate"] }, expectedConversationRevision: integer(), nativeToolPolicy: { enum: ["deny"] } }, ["content", "delivery", "expectedConversationRevision"]),
  "turn.steer": object({ content: contentArray }, ["content"]),
  "turn.cancel": object({ reason: str(4096) }),
  "input.respond": object({ requestId: id(), requestRevision: integer(1), answer: ref("JsonValue") }, ["requestId", "requestRevision", "answer"]),
  "approval.decide": object({
    decisionId: id(), requestId: id(), requestRevision: integer(1), actionDigest: hash(), choiceId: id(), grantedPermissions: permissionArray,
    expiresAt: dateTime(), assertion: { type: "string", minLength: 16, maxLength: 8192 }
  }, ["decisionId", "requestId", "requestRevision", "actionDigest", "choiceId", "grantedPermissions", "expiresAt", "assertion"]),
  "session.inspect": object({ includeTranscript: { type: "boolean" }, includePendingInteractions: { type: "boolean" }}),
  "session.disable": object({ reason: str(4096) }, ["reason"]),
  "permission.revoke": object({ grantId: id() }, ["grantId"])
};
const eventPayloads: Record<EventType, Schema> = {
  "command.received": object({ commandId: id(), receivedAt: dateTime() }, ["commandId", "receivedAt"]),
  "command.rejected": object({ commandId: id(), error: ref("ProtocolError") }, ["commandId", "error"]),
  "turn.started": object({ turnId: id(), nativeTurnId: id(), conversationRevision: integer(), state: { const: "running" } }, ["turnId", "state"]),
  "turn.state": object({ turnId: id(), state: ref("TurnState"), reason: str(4096), conversationRevision: integer() }, ["turnId", "state"]),
  "turn.completed": object({ turnId: id(), terminalEvidence: str(4096) }, ["turnId", "terminalEvidence"]),
  "turn.failed": object({ turnId: id(), error: ref("ProtocolError") }, ["turnId", "error"]),
  "turn.cancelled": object({ turnId: id(), evidence: str(4096) }, ["turnId", "evidence"]),
  "output.item.created": ref("OutputItem"), "output.item.replaced": ref("OutputItem"),
  "output.item.delta": object({ itemId: id(), turnId: id(), baseRevision: integer(1), revision: integer(2), source: { enum: ["native_event", "accessibility", "dom", "screen_observation"] }, textDelta: { type: "string", maxLength: 2_000_000 }, observedAt: dateTime() }, ["itemId", "turnId", "baseRevision", "revision", "source", "textDelta", "observedAt"]),
  "output.item.completed": object({ itemId: id(), revision: integer(1), turnId: id() }, ["itemId", "revision", "turnId"]),
  "artifact.available": object({ attachmentId: id(), artifactId: id(), mimeType: str(255), sizeBytes: integer(), sha256: hash(), filename: str(1024) }, ["attachmentId", "artifactId", "mimeType", "sizeBytes", "sha256"]),
  "input.required": object({ turnId: id(), nativeTurnId: id(), requestId: id(), requestRevision: integer(1), question: str(16384), schema: jsonObject(), allowedChoices: array(str(512), 128), expiresAt: dateTime() }, ["requestId", "requestRevision", "question", "schema"]),
  "input.resolved": object({ requestId: id(), requestRevision: integer(1), outcome: { enum: ["answered", "dismissed", "expired", "resolved_elsewhere"] } }, ["requestId", "requestRevision", "outcome"]),
  "approval.required": ref("ApprovalRequest"), "approval.updated": ref("ApprovalRequest"),
  "approval.resolved": object({ requestId: id(), requestRevision: integer(1), decisionId: id(), state: ref("ApprovalState") }, ["requestId", "requestRevision", "state"]),
  "approval.applied": object({ requestId: id(), requestRevision: integer(1), decisionId: id(), evidence: str(4096) }, ["requestId", "requestRevision", "decisionId", "evidence"]),
  "approval.apply_failed": object({ requestId: id(), requestRevision: integer(1), decisionId: id(), error: ref("ProtocolError"), state: { enum: ["apply_failed", "reconciliation_required"] } }, ["requestId", "requestRevision", "decisionId", "error", "state"]),
  "permission.grant.recorded": object({ grantId: id(), requestId: id(), decisionId: id(), grant: ref("PermissionGrant"), expiresAt: dateTime() }, ["grantId", "requestId", "decisionId", "grant"]),
  "permission.grant.revoked": object({ grantId: id(), outcome: { enum: ["revoked", "unsupported", "unknown"] }, evidence: str(4096) }, ["grantId", "outcome"]),
  "session.snapshot": ref("SessionSnapshot"),
  "session.reconciliation_required": object({ reason: str(4096), affectedIds: array(id()) }, ["reason", "affectedIds"]),
  "local_action.required": object({ actionId: id(), kind: { enum: ["sign_in", "os_permission", "unlock", "confirm_binding", "other"] }, description: str(4096) }, ["actionId", "kind", "description"]),
  "protocol.error": ref("ProtocolError"),
  "replay.gap": object({ lane: { enum: ["prompt", "control"] }, expectedSeq: integer(1), earliestAvailableSeq: integer(1) }, ["lane", "expectedSeq", "earliestAvailableSeq"])
};

function messageSchema(kind: string, payload: Schema, envelope: Record<string, Schema>, required: string[]): Schema {
  return object({ ...envelope, type: { const: kind }, payload }, [...required, "type", "payload"]);
}
const commandEnvelope = {
  protocolVersion: { const: "2.0" }, commandId: id(), lane: { enum: ["prompt", "control"] }, seq: integer(1), sessionId: id(),
  bindingRevision: integer(1), leaseGeneration: integer(1), createdAt: dateTime(), expiresAt: dateTime()
};
const eventEnvelope = {
  protocolVersion: { const: "2.0" }, eventId: id(), sessionId: id(), bindingRevision: integer(1), leaseGeneration: integer(1),
  bridgeEpoch: id(), producerSeq: integer(1), createdAt: dateTime()
};
const commandSchemas = Object.entries(commandPayloads).map(([type, payload]) => {
  const targetsTurn = ["turn.submit", "turn.steer", "turn.cancel"].includes(type);
  const isSubmit = type === "turn.submit";
  return messageSchema(type, payload, {
    ...commandEnvelope, lane: { const: isSubmit ? "prompt" : "control" },
    ...(targetsTurn ? { turnId: id() } : {}), ...(isSubmit ? { promptId: id() } : {})
  }, ["protocolVersion", "commandId", "lane", "seq", "sessionId", "bindingRevision", "leaseGeneration", "createdAt", ...(targetsTurn ? ["turnId"] : []), ...(isSubmit ? ["promptId"] : [])]);
});
const eventSchemas = Object.entries(eventPayloads).map(([type, payload]) => messageSchema(type, payload, eventEnvelope,
  ["protocolVersion", "eventId", "sessionId", "bindingRevision", "leaseGeneration", "bridgeEpoch", "producerSeq", "createdAt"]));

export const protocolSchema: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://server-driven-chat.invalid/schemas/protocol-v2.schema.json",
  title: "Server-Driven Chat protocol version 2.0",
  oneOf: [...commandSchemas, ...eventSchemas],
  $defs: defs
};

const profileInput = object({ operation: { const: "bridge.connect" }, serverProfileId: id(), displayLabel: str(160) }, ["operation", "serverProfileId"]);
const disconnectInput = object({ operation: { const: "bridge.disconnect" }, scope: { const: "current-binding" }, reason: str(512) }, ["operation", "scope"]);
const trustedOrigin = object({ installationId: id(), hostId: id(), windowId: id(), workspaceId: id(), taskId: id(), toolInvocationId: id() },
  ["installationId", "hostId", "windowId", "workspaceId", "taskId", "toolInvocationId"]);
export const trustedConnectContextSchema: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://server-driven-chat.invalid/schemas/connect-context-v1.schema.json",
  ...trustedOrigin
};
export const connectResultSchema: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://server-driven-chat.invalid/schemas/connect-result-v1.schema.json",
  ...object({
  status: { enum: ["connected", "already_connected", "pending_local_confirmation", "disconnected", "no_connection", "rejected"] },
  displayMessage: str(1024), connectionId: id()
  }, ["status", "displayMessage"])
};
export const connectToolSchema: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://server-driven-chat.invalid/schemas/connect-tools-v1.schema.json",
  title: "Bounded local bridge Connect and disconnect tool contract",
  $defs: { ConnectInput: profileInput, DisconnectInput: disconnectInput, TrustedConnectContext: trustedOrigin, ConnectToolResult: connectResultSchema },
  oneOf: [ref("ConnectInput"), ref("DisconnectInput")]
};

export const publicCommandTypes = Object.keys(commandPayloads) as CommandType[];
export const publicEventTypes = Object.keys(eventPayloads) as EventType[];
export const publicMessageTypes = [...publicCommandTypes, ...publicEventTypes];
export const validConnectExample = { operation: "bridge.connect", serverProfileId: "team-staging", displayLabel: "Team staging" };
export const validDisconnectExample = { operation: "bridge.disconnect", scope: "current-binding", reason: "User requested disconnect" };

export const commandSkipSchema: Schema = object({deviceId: id(), lane: {enum: ["prompt", "control"]}, laneSeq: integer(1), commandId: id(), reason: {const: "obsolete_binding"}}, ["deviceId", "lane", "laneSeq", "commandId", "reason"]);
export const dispatchPermitSchema: Schema = object({sessionId: id(),bindingRevision: integer(1),leaseGeneration: integer(1),leaseExpiresAt: dateTime(),serverTime: dateTime()}, ["sessionId","bindingRevision","leaseGeneration","leaseExpiresAt","serverTime"]);
