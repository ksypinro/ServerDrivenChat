import type { ConnectToolResult, TrustedConnectContext } from "@server-driven-chat/protocol";

/** The app-owned API. Stock Cline does not export this interface. */
export interface NativeContext {
    installationId: string; hostId: string; windowId: string; workspaceId: string;
    taskId: string; generation: string;
}
export interface NativeMessage {
    id: string; type: "ask" | "say"; category: string; text: string; partial: boolean;
    imageChecksums?: string[];
}
export interface NativeSnapshot {
    context: NativeContext; conversationRevision: number; phase: string;
    ready: boolean; isRunning?: boolean; messages: NativeMessage[]; cursor: number;
    pending?: NativeInteraction[]; nativeTurnId?: string;
    autoApproval?: Record<string, boolean>;
}
export interface NativeInteraction {
    askId: string; askRevision: number; taskId: string; nativeTurnId: string;
    kind: "approval" | "question"; messageId: string; expiresAt: string;
    toolCallId?: string; toolName?: string; input?: unknown; cwd?: string; preview?: string;
    question?: string; choices?: string[]; complete: boolean;
}
export interface NativeControlReceipt {
    askId: string; askRevision: number; taskId: string; nativeTurnId: string;
    outcome: "allowed" | "denied" | "answered" | "dismissed";
    source: "local" | "remote"; decisionId?: string; evidence: string;
}
export interface NativeControlsApi {
    resolve(token: string, command: { askId: string; askRevision: number; decisionId: string; decision: "allow_once" | "deny" | "answer"; answer?: string }, permit: NativePermit): NativeControlReceipt;
    cancel(token: string, nativeTurnId: string, permit: NativePermit): Promise<{ nativeTurnId: string; taskId: string; evidence: string }>;
}
export type NativeEvent =
    | { seq: number; type: "message"; message: NativeMessage; local: boolean; commandId?: string; interactionId?: string }
    | { seq: number; type: "phase"; phase: string; isRunning?: boolean }
    | { seq: number; type: "interaction"; interaction: NativeInteraction }
    | { seq: number; type: "resolved"; receipt: NativeControlReceipt }
    | { seq: number; type: "cancelled"; nativeTurnId: string; evidence: string }
    | { seq: number; type: "invalidated"; reason: string };
export interface NativePermit { signal: AbortSignal; assertAuthority(): void }
export interface NativeConnectRequest {
    input: unknown; origin: TrustedConnectContext; signal: AbortSignal;
    /** Recheck captured task/session/host identity at every asynchronous effect boundary. */
    assertCurrent(): void;
}
export interface NativeConnectApi {
    register(handler: (request: NativeConnectRequest) => Promise<ConnectToolResult>, profiles: () => string[]): () => void;
}
export interface NativeBridgeApi {
    apiVersion: "1.0" | "1.1" | "1.2" | "1.3"; clineVersion: "4.1.22";
    connect?: NativeConnectApi;
    controls?: NativeControlsApi;
    context(): Omit<NativeContext, "taskId" | "generation">;
    currentTask(): { taskId: string; ready: boolean; generation?: string } | undefined;
    bind(expected: Omit<NativeContext, "generation">): { token: string; snapshot: NativeSnapshot };
    snapshot(token: string): NativeSnapshot;
    subscribe(token: string, cursor: number, listener: (event: NativeEvent) => void): () => void;
    submit(token: string, command: { commandId: string; text: string; attachmentIds: string[]; expectedConversationRevision: number; nativeToolPolicy?: "deny" }, permit: NativePermit): Promise<{ messageId: string; imageChecksums: string[] }>;
    stageImage(token: string, reference: { attachmentId: string; mimeType: string; sizeBytes: number; sha256: string }, bytes: Uint8Array, permit: NativePermit): { receiptId: string; attachmentId: string; mimeType: string; sizeBytes: number; sha256: string };
    detach(token: string): void;
    dispose(): void;
}
