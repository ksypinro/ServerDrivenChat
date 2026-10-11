const now = "2026-10-05T11:00:00Z";
const digest = `sha256:${"a".repeat(64)}`;
const permission = { resource: "filesystem", operation: "write", scope: { path: "/workspace/README.md" } };
export const approvalRequest = {
  requestId: "approval-1", requestRevision: 1, nativeRequestId: "native-approval-1", kind: "action_approval",
  appId: "sample-app", appInstanceId: "sample-installation", bindingId: "binding-1", sessionId: "session-1", nativeConversationId: "conversation-native-1",
  bindingRevision: 2, leaseGeneration: 3, turnId: "turn-1", nativeTurnId: "native-turn-1",
  action: { tool: "file.write", arguments: { path: "/workspace/README.md", content: "approved text" }, workingDirectory: "/workspace", artifactChecksums: [{ artifactId: "diff-1", sha256: digest }] },
  requestedPermissions: [permission], availableDecisions: [
    { id: "allow_once", effect: "allow", scope: "action" }, { id: "deny_once", effect: "deny", scope: "action" }, { id: "cancel_turn", effect: "cancel", scope: "turn" }
  ], actionDigest: digest, evidence: { source: "native_event", snapshotId: "snapshot-1", complete: true }, expiresAt: "2026-10-05T11:10:00Z"
};
const error = { code: "APP_UNAVAILABLE", message: "app is unavailable", retryable: true };
const item = {
  itemId: "item-1", turnId: "turn-1", kind: "assistant_message", revision: 1,
  source: "native_event", partial: true, content: [{ type: "text", text: "working" }], observedAt: now
};
const snapshot = {
  sessionId: "session-1", bindingRevision: 2, leaseGeneration: 3, turnState: "waiting_for_approval",
  cursors: { prompt: 4, control: 7, sessionSeq: 12 }, pendingApprovals: [approvalRequest],
  pendingInputs: [{ requestId: "input-1", requestRevision: 1, question: "Which option?" }]
};

const commandPayloads = {
  "turn.submit": { turnId: "turn-1", promptId: "prompt-1", payload: { content: [{ type: "text", text: "review this" }], delivery: "queue", expectedConversationRevision: 5 } },
  "turn.steer": { turnId: "turn-1", payload: { content: [{ type: "text", text: "focus on security" }] } },
  "turn.cancel": { turnId: "turn-1", payload: { reason: "user requested" } },
  "input.respond": { payload: { requestId: "input-1", requestRevision: 1, answer: "option-a" } },
  "approval.decide": { payload: { decisionId: "decision-1", requestId: "approval-1", requestRevision: 1, actionDigest: digest, choiceId: "deny_once", grantedPermissions: [], expiresAt: "2026-10-05T11:05:00Z", assertion: "signed-assertion-placeholder" } },
  "session.inspect": { payload: {} },
  "session.disable": { payload: { reason: "local operator disabled" } },
  "permission.revoke": { payload: { grantId: "grant-1" } }
};
const eventPayloads = {
  "command.received": { commandId: "command-1", receivedAt: now },
  "command.rejected": { commandId: "command-1", error },
  "turn.started": { turnId: "turn-1", nativeTurnId: "native-turn-1", state: "running" },
  "turn.state": { turnId: "turn-1", state: "running", reason: "app reported generation" },
  "turn.completed": { turnId: "turn-1", terminalEvidence: "native completed event" },
  "turn.failed": { turnId: "turn-1", error },
  "turn.cancelled": { turnId: "turn-1", evidence: "native cancellation confirmed" },
  "output.item.created": item,
  "output.item.delta": { itemId: "item-1", turnId: "turn-1", baseRevision: 1, revision: 2, source: "native_event", textDelta: " now", observedAt: now },
  "output.item.replaced": { ...item, revision: 3, content: [{ type: "text", text: "replacement" }] },
  "output.item.completed": { itemId: "item-1", revision: 3, turnId: "turn-1" },
  "artifact.available": { attachmentId: "attachment-1", artifactId: "artifact-1", mimeType: "text/plain", sizeBytes: 10, sha256: digest, filename: "result.txt" },
  "input.required": { requestId: "input-1", requestRevision: 1, question: "Which option?", schema: { type: "string" }, allowedChoices: ["option-a", "option-b"], expiresAt: "2026-10-05T11:10:00Z" },
  "input.resolved": { requestId: "input-1", requestRevision: 1, outcome: "answered" },
  "approval.required": approvalRequest,
  "approval.updated": { ...approvalRequest, requestRevision: 2, actionDigest: `sha256:${"b".repeat(64)}` },
  "approval.resolved": { requestId: "approval-1", requestRevision: 1, decisionId: "decision-1", state: "decision_recorded" },
  "approval.applied": { requestId: "approval-1", requestRevision: 1, decisionId: "decision-1", evidence: "native request resolved" },
  "approval.apply_failed": { requestId: "approval-1", requestRevision: 1, decisionId: "decision-1", error, state: "apply_failed" },
  "permission.grant.recorded": { grantId: "grant-1", requestId: "approval-1", decisionId: "decision-1", grant: permission },
  "permission.grant.revoked": { grantId: "grant-1", outcome: "revoked", evidence: "host confirmed revocation" },
  "session.snapshot": snapshot,
  "session.reconciliation_required": { reason: "submission outcome unknown", affectedIds: ["command-1", "turn-1"] },
  "local_action.required": { actionId: "local-1", kind: "sign_in", description: "Sign in through the app" },
  "protocol.error": error,
  "replay.gap": { lane: "control", expectedSeq: 8, earliestAvailableSeq: 10 }
};

export const validMessages = [
  ...Object.entries(commandPayloads).map(([type, entry], index) => ({
    protocolVersion: "2.0", type, commandId: `command-${index + 1}`, lane: type === "turn.submit" ? "prompt" : "control", seq: index + 1,
    sessionId: "session-1", bindingRevision: 2, leaseGeneration: 3, createdAt: now,
    ...(entry.turnId ? { turnId: entry.turnId } : {}), ...(entry.promptId ? { promptId: entry.promptId } : {}), payload: entry.payload
  })),
  ...Object.entries(eventPayloads).map(([type, payload], index) => ({
    protocolVersion: "2.0", type, eventId: `event-${index + 1}`, sessionId: "session-1", bindingRevision: 2,
    leaseGeneration: 3, bridgeEpoch: "epoch-1", producerSeq: index + 1, createdAt: now, payload
  }))
];

export const validCapabilities = {
  protocolVersion: "2.0", adapterId: "adapter.example", adapterVersion: "1.0.0", appId: "sample-app", appVersion: "1.2", platform: "macOS",
  operations: { probe: { status: "supported", reason: "probe executed", evidenceRef: "evidence/probe.json" }, resolveApproval: { status: "unverified", reason: "not tested" } }, observedAt: now
};
export const validBinding = {
  bindingId: "binding-1", sessionId: "session-1", appId: "sample-app", appInstanceId: "sample-installation",
  conversationId: "conversation-selection-1", nativeConversationId: "conversation-native-1", bindingRevision: 2, leaseGeneration: 3, capabilitiesRevision: "capabilities-4"
};
export const validConnectContext = { installationId: "cline-extension-1", hostId: "vscode-host-1", windowId: "window-1", workspaceId: "workspace-1", taskId: "task-1", toolInvocationId: "invocation-1" };
export const validConnectResult = { status: "pending_local_confirmation", displayMessage: "Confirm this server and task in the companion." };
