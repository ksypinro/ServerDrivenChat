import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema, ErrorObject } from "ajv";
import type { CapabilitiesDocument, ActionDigestInput, ApprovalDecisionProposal, ApprovalRequest, CommandSkip, DispatchPermit, ConnectToolResult, JsonValue, ProtocolMessage, TrustedConnectContext } from "./contracts.js";
import { canonicalJson, computeActionDigest } from "./canonical.js";
import { isValidRfc3339Timestamp } from "./state.js";
import { commandSkipSchema, dispatchPermitSchema, connectResultSchema, connectToolSchema, protocolSchema, trustedConnectContextSchema } from "./schemas.js";

export interface ValidationIssue { path: string; keyword: string; message: string }
export type ValidationResult<T> = { valid: true; value: T } | { valid: false; issues: ValidationIssue[] };
export interface ExpectedBinding { sessionId: string; bindingRevision: number; leaseGeneration: number }

function compile(schema: unknown) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addFormat("date-time", { type: "string", validate: isValidRfc3339Timestamp });
  return ajv.compile(schema as AnySchema);
}
const capabilitiesValidator = compile({ ...protocolSchema, $ref: "#/$defs/Capabilities", oneOf: undefined });
const skipValidator = compile(commandSkipSchema);
const permitValidator = compile(dispatchPermitSchema);
const messageValidator = compile(protocolSchema);
const connectValidator = compile(connectToolSchema);
const contextValidator = compile(trustedConnectContextSchema);
const resultValidator = compile(connectResultSchema);

function issues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) => ({ path: error.instancePath, keyword: error.keyword, message: error.message ?? "invalid value" }));
}

export function validateProtocolMessage(value: unknown, expected?: ExpectedBinding): ValidationResult<ProtocolMessage> {
  if (!messageValidator(value)) return { valid: false, issues: issues(messageValidator.errors) };
  const message = value as ProtocolMessage;
  const semanticIssues: ValidationIssue[] = [];
  if (expected) {
    if (message.sessionId !== expected.sessionId) semanticIssues.push({ path: "/sessionId", keyword: "binding", message: "message session does not match the selected binding" });
    if (message.bindingRevision !== expected.bindingRevision) semanticIssues.push({ path: "/bindingRevision", keyword: "binding", message: "message binding revision is stale or mismatched" });
    if (message.leaseGeneration !== expected.leaseGeneration) semanticIssues.push({ path: "/leaseGeneration", keyword: "lease", message: "message lease generation is stale or mismatched" });
  }
  if (message.type === "output.item.delta" && message.payload.revision !== message.payload.baseRevision + 1) {
    semanticIssues.push({ path: "/payload/revision", keyword: "revision", message: "a delta must advance exactly one item revision" });
  }
  if (message.type === "replay.gap" && message.payload.earliestAvailableSeq <= message.payload.expectedSeq) {
    semanticIssues.push({ path: "/payload/earliestAvailableSeq", keyword: "cursor", message: "earliest available sequence must be after the missing sequence" });
  }
  if ((message.type === "approval.required" || message.type === "approval.updated") &&
      (message.sessionId !== message.payload.sessionId || message.bindingRevision !== message.payload.bindingRevision || message.leaseGeneration !== message.payload.leaseGeneration)) {
    semanticIssues.push({ path: "/payload", keyword: "binding", message: "approval identity must match its event envelope" });
  }
  if (message.type === "session.snapshot" &&
      (message.sessionId !== message.payload.sessionId || message.bindingRevision !== message.payload.bindingRevision || message.leaseGeneration !== message.payload.leaseGeneration)) {
    semanticIssues.push({ path: "/payload", keyword: "binding", message: "snapshot identity must match its event envelope" });
  }
  return semanticIssues.length ? { valid: false, issues: semanticIssues } : { valid: true, value: message };
}

export function validateConnectToolInput(value: unknown): ValidationResult<Record<string, JsonValue>> {
  if (!connectValidator(value)) return { valid: false, issues: issues(connectValidator.errors) };
  const semanticIssues: ValidationIssue[] = [];
  if (semanticIssues.length) return { valid: false, issues: semanticIssues };
  return { valid: true, value: value as Record<string, JsonValue> };
}
export function validateTrustedConnectContext(value: unknown): ValidationResult<TrustedConnectContext> {
  if (!contextValidator(value)) return { valid: false, issues: issues(contextValidator.errors) };
  return { valid: true, value: value as TrustedConnectContext };
}
export function validateConnectToolResult(value: unknown): ValidationResult<ConnectToolResult> {
  if (!resultValidator(value)) return { valid: false, issues: issues(resultValidator.errors) };
  return { valid: true, value: value as ConnectToolResult };
}

function digestInput(request: ApprovalRequest): ActionDigestInput {
  return {
    appId: request.appId,
    appInstanceId: request.appInstanceId,
    bindingId: request.bindingId,
    sessionId: request.sessionId,
    nativeConversationId: request.nativeConversationId,
    bindingRevision: request.bindingRevision,
    leaseGeneration: request.leaseGeneration,
    turnId: request.turnId,
    ...(request.nativeTurnId ? { nativeTurnId: request.nativeTurnId } : {}),
    requestId: request.requestId,
    ...(request.nativeRequestId ? { nativeRequestId: request.nativeRequestId } : {}),
    requestRevision: request.requestRevision,
    action: request.action,
    requestedPermissions: request.requestedPermissions,
    availableDecisions: request.availableDecisions
  };
}

/** Cross-object decision validation; callers still authenticate reviewer/assertion separately. */
export async function validateDecisionAgainstRequest(
  request: ApprovalRequest,
  decision: ApprovalDecisionProposal & { expiresAt?: string },
  now?: string
): Promise<ValidationResult<ApprovalDecisionProposal>> {
  let expectedDigest: string;
  try {
    expectedDigest = await computeActionDigest(digestInput(request));
  } catch {
    return { valid: false, issues: [{ path: "/request", keyword: "canonicalization", message: "request contains content that cannot be represented as canonical JSON" }] };
  }
  const problems: ValidationIssue[] = [];
  if (!isValidRfc3339Timestamp(request.expiresAt)) problems.push({ path: "/request/expiresAt", keyword: "date-time", message: "request expiry must be a valid RFC 3339 timestamp" });
  if (!request.evidence.complete) problems.push({ path: "/request/evidence/complete", keyword: "evidence", message: "incomplete native evidence cannot authorize a structured remote decision" });
  if (request.actionDigest !== expectedDigest) problems.push({ path: "/request/actionDigest", keyword: "digest", message: "request digest does not match its canonical review content" });
  if (decision.requestId !== request.requestId) problems.push({ path: "/decision/requestId", keyword: "identity", message: "decision targets a different request" });
  if (decision.requestRevision !== request.requestRevision) problems.push({ path: "/decision/requestRevision", keyword: "revision", message: "decision targets a stale request revision" });
  if (decision.actionDigest !== request.actionDigest) problems.push({ path: "/decision/actionDigest", keyword: "digest", message: "decision digest differs from the reviewed action" });
  const matchingChoices = Array.isArray(request.availableDecisions) ? request.availableDecisions.filter((candidate) => candidate.id === decision.choiceId) : [];
  const choice = matchingChoices[0];
  if (matchingChoices.length > 1) problems.push({ path: "/request/availableDecisions", keyword: "choice", message: "native choice IDs must be unique" });
  if (!choice) problems.push({ path: "/decision/choiceId", keyword: "choice", message: "decision choice was not offered by the native request" });
  if (choice && choice.effect !== "allow" && decision.grantedPermissions.length > 0) {
    problems.push({ path: "/decision/grantedPermissions", keyword: "grant", message: "deny and cancel decisions cannot carry grants" });
  }
  let requested: Set<string>;
  let granted: string[];
  try {
    requested = new Set(request.requestedPermissions.map(canonicalJson));
    granted = decision.grantedPermissions.map(canonicalJson);
  } catch {
    return { valid: false, issues: [...problems, { path: "/decision/grantedPermissions", keyword: "canonicalization", message: "permission scopes must be JSON values" }] };
  }
  if (new Set(granted).size !== decision.grantedPermissions.length) {
    problems.push({ path: "/decision/grantedPermissions", keyword: "unique", message: "duplicate grants are not allowed" });
  }
  if (granted.some((grant) => !requested.has(grant))) {
    problems.push({ path: "/decision/grantedPermissions", keyword: "scope", message: "decision grants a permission absent from the request" });
  }
  if (now && !isValidRfc3339Timestamp(now)) problems.push({ path: "/now", keyword: "date-time", message: "comparison time must be a valid RFC 3339 timestamp" });
  if (now && isValidRfc3339Timestamp(now) && Date.parse(now) >= Date.parse(request.expiresAt)) {
    problems.push({ path: "/request/expiresAt", keyword: "expiry", message: "request has expired" });
  }
  if (decision.expiresAt && !isValidRfc3339Timestamp(decision.expiresAt)) {
    problems.push({ path: "/decision/expiresAt", keyword: "date-time", message: "decision expiry must be a valid RFC 3339 timestamp" });
  } else if (decision.expiresAt && (Date.parse(decision.expiresAt) > Date.parse(request.expiresAt) || (now && isValidRfc3339Timestamp(now) && Date.parse(now) >= Date.parse(decision.expiresAt)))) {
    problems.push({ path: "/decision/expiresAt", keyword: "expiry", message: "decision expiry must be current and cannot outlive its request" });
  }
  if (problems.length) return { valid: false, issues: problems };
  return { valid: true, value: decision };
}

export function validateCommandSkip(value: unknown): ValidationResult<CommandSkip> {
  return skipValidator(value) ? {valid: true,value: value as CommandSkip} : {valid: false,issues: issues(skipValidator.errors)};
}
export function validateDispatchPermit(value: unknown): ValidationResult<DispatchPermit> {
  return permitValidator(value) ? {valid: true,value: value as DispatchPermit} : {valid: false,issues: issues(permitValidator.errors)};
}

/** Validate device-reported capability metadata; this is descriptive, never an authority grant. */
export function validateCapabilities(value: unknown): ValidationResult<CapabilitiesDocument> {
  return capabilitiesValidator(value) ? { valid: true, value: value as CapabilitiesDocument } : { valid: false, issues: issues(capabilitiesValidator.errors) };
}
