/** Versioned, app-independent wire contracts. Native IDs remain opaque. */
export const PROTOCOL_VERSION = "2.0" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const ADAPTER_OPERATIONS = ["probe", "attach", "inspect", "submit", "subscribe", "respondInput", "resolveApproval", "cancel", "revoke", "stageAttachment", "detach"] as const;
export type AdapterOperation = typeof ADAPTER_OPERATIONS[number];
export type CapabilityStatus = "supported" | "unsupported" | "unverified";
export interface CapabilityEvidence { status: CapabilityStatus; reason: string; evidenceRef?: string; limits?: JsonObject }
export interface CapabilitiesDocument {
  protocolVersion: typeof PROTOCOL_VERSION; adapterId: string; adapterVersion: string; appId: string; appVersion: string; platform: string;
  operations: Partial<Record<AdapterOperation, CapabilityEvidence>>; observedAt: string;
  /** Optional app-owned safety policy; absent means a caller-tool proposal binding is unqualified. */
  effectPolicies?: { nativeToolsDenied?: CapabilityEvidence };
}

export interface BindingSelection { appId: string; appInstanceId: string; accountId?: string; workspaceId?: string; conversationId: string }
export interface Binding extends BindingSelection {
  bindingId: string; sessionId: string; nativeConversationId: string; bindingRevision: number; leaseGeneration: number; capabilitiesRevision: string;
}

export interface TextContent { type: "text"; text: string }
export interface ImageContent { type: "image"; attachmentId: string; mimeType: string }
export interface FileContent { type: "file"; attachmentId: string; mimeType: string; filename: string }
export interface ArtifactContent { type: "artifact"; artifactId: string; mimeType: string; label?: string }
export type ContentBlock = TextContent | ImageContent | FileContent | ArtifactContent;
export interface AttachmentReference { attachmentId: string; mimeType: string; sizeBytes: number; sha256: string; filename?: string }
export interface AdapterAttachmentReceipt { receiptId: string; attachmentId: string; mimeType: string; sizeBytes: number; sha256: string }

export interface PermissionGrant { resource: string; operation: string; scope: JsonObject }
export interface ApprovalChoice { id: string; effect: "allow" | "deny" | "cancel"; scope: "action" | "turn" | "session" | "persistent" }
export interface ActionDescription {
  tool: string; arguments: JsonValue; artifactId?: string; workingDirectory?: string; command?: string[]; environmentChanges?: Record<string, string | null>;
  recipient?: string; body?: string; attachmentChecksums?: Array<{ attachmentId: string; sha256: string }>;
  artifactChecksums?: Array<{ artifactId: string; sha256: string }>;
}
export interface ApprovalRequest {
  requestId: string; requestRevision: number; nativeRequestId?: string; kind: "action_approval" | "permission_grant";
  appId: string; appInstanceId: string; bindingId: string; sessionId: string; nativeConversationId: string; bindingRevision: number; leaseGeneration: number;
  turnId: string; nativeTurnId?: string; action: ActionDescription; requestedPermissions: PermissionGrant[];
  availableDecisions: ApprovalChoice[]; actionDigest: string;
  evidence: { source: "native_event" | "accessibility" | "dom" | "screen_observation"; snapshotId?: string; complete: boolean };
  expiresAt: string;
}
export interface ApprovalDecisionProposal {
  decisionId: string; requestId: string; requestRevision: number; actionDigest: string; choiceId: string; grantedPermissions: PermissionGrant[];
}
export type ApprovalState = "pending" | "decision_recorded" | "applying" | "applied" | "denied" | "expired" | "superseded" | "resolved_elsewhere" | "apply_failed" | "reconciliation_required";
export type TurnState = "queued" | "dispatching" | "running" | "waiting_for_input" | "waiting_for_approval" | "completed" | "failed" | "cancelled" | "completion_unverified" | "reconciliation_required";

export type ProtocolErrorCode = "CAPABILITY_UNSUPPORTED" | "BINDING_CHANGED" | "REQUEST_STALE" | "PERMISSION_SCOPE_UNSUPPORTED" | "APP_UNAVAILABLE" | "EXECUTION_UNKNOWN" | "CURSOR_EXPIRED" | "INVALID_MESSAGE" | "UNAUTHORIZED" | "CONFLICT" | "RATE_LIMITED" | "PAYLOAD_TOO_LARGE";
export interface ProtocolError { code: ProtocolErrorCode; message: string; retryable: boolean; details?: JsonObject }
export interface LaneCursor { lane: "prompt" | "control"; seq: number }
export interface ProducerCursor { bridgeEpoch: string; producerSeq: number }
export interface ReplayWatermark { prompt: number; control: number; sessionSeq: number }
export interface PendingInput { requestId: string; requestRevision: number; question: string; expiresAt?: string }
export interface SessionSnapshot {
  sessionId: string; bindingRevision: number; leaseGeneration: number; turnState: TurnState; cursors: ReplayWatermark;
  pendingApprovals: ApprovalRequest[]; pendingInputs: PendingInput[];
}

export interface TurnSubmitPayload { content: ContentBlock[]; delivery: "queue" | "immediate"; expectedConversationRevision: number; nativeToolPolicy?: "deny" }
export interface TurnSteerPayload { content: ContentBlock[] }
export interface TurnCancelPayload { reason?: string }
export interface InputRespondPayload { requestId: string; requestRevision: number; answer: JsonValue }
export interface ApprovalDecisionPayload extends ApprovalDecisionProposal { expiresAt: string; assertion: string }
export interface SessionInspectPayload { includeTranscript?: boolean; includePendingInteractions?: boolean }
export interface SessionDisablePayload { reason: string }
export interface PermissionRevokePayload { grantId: string }

export interface CommandPayloads {
  "turn.submit": TurnSubmitPayload; "turn.steer": TurnSteerPayload; "turn.cancel": TurnCancelPayload;
  "input.respond": InputRespondPayload; "approval.decide": ApprovalDecisionPayload; "session.inspect": SessionInspectPayload;
  "session.disable": SessionDisablePayload; "permission.revoke": PermissionRevokePayload;
}
export type CommandType = keyof CommandPayloads;
export type CommandLane<T extends CommandType> = T extends "turn.submit" ? "prompt" : "control";
type CommandIdentityFields<T extends CommandType> = T extends "turn.submit" ? { turnId: string; promptId: string }
  : T extends "turn.steer" | "turn.cancel" ? { turnId: string } : {};
export type ProtocolCommand<T extends CommandType = CommandType> = {
  [K in T]: {
    protocolVersion: typeof PROTOCOL_VERSION; type: K; commandId: string; lane: CommandLane<K>; seq: number;
    sessionId: string; bindingRevision: number; leaseGeneration: number; createdAt: string; expiresAt?: string; payload: CommandPayloads[K];
  } & CommandIdentityFields<K>
}[T];

export interface OutputItem {
  itemId: string; turnId: string; kind: "assistant_message" | "user_message" | "tool_activity" | "status" | "other";
  revision: number; source: "native_event" | "accessibility" | "dom" | "screen_observation"; partial: boolean; content: ContentBlock[]; observedAt: string;
  /** Opaque app-observed category; it conveys no caller-tool or instruction authority. */
  nativeCategory?: string;
}
export interface OutputDelta { itemId: string; turnId: string; baseRevision: number; revision: number; source: OutputItem["source"]; textDelta: string; observedAt: string }
export interface EventPayloads {
  "command.received": { commandId: string; receivedAt: string };
  "command.rejected": { commandId: string; error: ProtocolError };
  "turn.started": { turnId: string; nativeTurnId?: string; conversationRevision?: number; state: "running" };
  "turn.state": { turnId: string; state: TurnState; reason?: string; conversationRevision?: number };
  "turn.completed": { turnId: string; terminalEvidence: string };
  "turn.failed": { turnId: string; error: ProtocolError };
  "turn.cancelled": { turnId: string; evidence: string };
  "output.item.created": OutputItem; "output.item.delta": OutputDelta; "output.item.replaced": OutputItem;
  "output.item.completed": { itemId: string; revision: number; turnId: string };
  "artifact.available": AttachmentReference & { artifactId: string };
  "input.required": { turnId?: string; nativeTurnId?: string; requestId: string; requestRevision: number; question: string; schema: JsonObject; allowedChoices?: string[]; expiresAt?: string };
  "input.resolved": { requestId: string; requestRevision: number; outcome: "answered" | "dismissed" | "expired" | "resolved_elsewhere" };
  "approval.required": ApprovalRequest; "approval.updated": ApprovalRequest;
  "approval.resolved": { requestId: string; requestRevision: number; decisionId?: string; state: ApprovalState };
  "approval.applied": { requestId: string; requestRevision: number; decisionId: string; evidence: string };
  "approval.apply_failed": { requestId: string; requestRevision: number; decisionId: string; error: ProtocolError; state: "apply_failed" | "reconciliation_required" };
  "permission.grant.recorded": { grantId: string; requestId: string; decisionId: string; grant: PermissionGrant; expiresAt?: string };
  "permission.grant.revoked": { grantId: string; outcome: "revoked" | "unsupported" | "unknown"; evidence?: string };
  "session.snapshot": SessionSnapshot;
  "session.reconciliation_required": { reason: string; affectedIds: string[] };
  "local_action.required": { actionId: string; kind: "sign_in" | "os_permission" | "unlock" | "confirm_binding" | "other"; description: string };
  "protocol.error": ProtocolError;
  "replay.gap": { lane: "prompt" | "control"; expectedSeq: number; earliestAvailableSeq: number };
}
export type EventType = keyof EventPayloads;
export type ProtocolEvent<T extends EventType = EventType> = {
  [K in T]: {
    protocolVersion: typeof PROTOCOL_VERSION; type: K; eventId: string; sessionId: string;
    bindingRevision: number; leaseGeneration: number; bridgeEpoch: string; producerSeq: number; createdAt: string; payload: EventPayloads[K];
  }
}[T];
export type ProtocolMessage = ProtocolCommand | ProtocolEvent;

/** Digest input binds all review-relevant context; set-valued arrays are normalized by canonical.ts. */
export interface ActionDigestInput {
  appId: string; appInstanceId: string; bindingId: string; sessionId: string; nativeConversationId: string; bindingRevision: number; leaseGeneration: number;
  turnId: string; nativeTurnId?: string; requestId: string; nativeRequestId?: string; requestRevision: number;
  action: ActionDescription; requestedPermissions: PermissionGrant[]; availableDecisions: ApprovalChoice[];
}

/** Connect tool arguments are model-visible; trusted origin arrives out-of-band from the host. */
export interface BridgeConnectToolInput { serverProfileId: string; displayLabel?: string }
export interface BridgeDisconnectToolInput { scope: "current-binding"; reason?: string }
export interface TrustedConnectContext { installationId: string; hostId: string; windowId: string; workspaceId: string; taskId: string; toolInvocationId: string }
export interface ConnectToolResult {
  status: "connected" | "already_connected" | "pending_local_confirmation" | "disconnected" | "no_connection" | "rejected";
  displayMessage: string; connectionId?: string;
}

export type AdapterOutcome<T> =
  | { outcome: "applied" | "accepted"; evidence: string; value?: T }
  | { outcome: "rejected" | "unsupported" | "unknown"; reason: string };
/** Native adapters must call assertAuthority immediately before every external mutation.
 * Never defer a mutation beyond the permit deadline or ignore its abort signal. */
export interface AdapterMutationContext { signal: AbortSignal; assertAuthority(): void }
export interface AppAdapter {
  probe(): Promise<CapabilitiesDocument>;
  attach(selection: BindingSelection): Promise<AdapterOutcome<Binding>>;
  inspect(binding: Binding): Promise<AdapterOutcome<SessionSnapshot>>;
  submit(binding: Binding, command: ProtocolCommand, context?: AdapterMutationContext): Promise<AdapterOutcome<{ nativeTurnId?: string }>>;
  subscribe(binding: Binding, checkpoint: ProducerCursor[], options?: { signal?: AbortSignal }): AsyncIterable<ProtocolEvent>;
  respondInput(binding: Binding, requestId: string, requestRevision: number, answer: JsonValue, context?: AdapterMutationContext): Promise<AdapterOutcome<void>>;
  resolveApproval(binding: Binding, request: ApprovalRequest, decision: ApprovalDecisionProposal, context?: AdapterMutationContext): Promise<AdapterOutcome<void>>;
  cancel(binding: Binding, turnId: string, context?: AdapterMutationContext): Promise<AdapterOutcome<void>>;
  revoke(binding: Binding, grantId: string, context?: AdapterMutationContext): Promise<AdapterOutcome<void>>;
  stageAttachment?(binding: Binding, reference: AttachmentReference, content: Uint8Array, context?: AdapterMutationContext): Promise<AdapterOutcome<AdapterAttachmentReceipt>>;
  detach(binding: Binding): Promise<AdapterOutcome<void>>;
}

/** Authenticated transport metadata; never a user-authored command or native event. */
export interface CommandSkip { deviceId: string; lane: "prompt" | "control"; laneSeq: number; commandId: string; reason: "obsolete_binding" }
export interface DispatchPermit { sessionId: string; bindingRevision: number; leaseGeneration: number; leaseExpiresAt: string; serverTime: string }
