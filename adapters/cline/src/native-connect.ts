import { randomUUID } from "node:crypto";
import type { ConnectToolResult } from "@server-driven-chat/protocol";
import type { NativeConnectApi, NativeConnectRequest, NativeContext } from "./native-api.js";

/** Exact structural subset of the pinned SDK AgentTool / startNewSession contract. */
export interface ConnectTool {
    name: string; description: string; inputSchema: Record<string, unknown>;
    executionMode: "sequential"; timeoutMs: number; retryable: false;
    execute(input: unknown, context: { sessionId?: string; toolCallId?: string; signal?: AbortSignal }): Promise<ConnectToolResult>;
}
export interface ConnectLifecycle {
    startNewSession(input: { config: { sessionId?: string; extraTools?: unknown[]; [key: string]: unknown }; [key: string]: unknown }): Promise<unknown>;
    getActiveSession(): { sessionId: string; sdkHost: object } | undefined;
}

/** Installed inside Cline before native session creation. Origin is captured from SDK context, never arguments. */
export function installConnectTools(options: {
    sessions: ConnectLifecycle; task(): { taskId: string } | undefined;
    context(): Omit<NativeContext, "taskId" | "generation">;
    disposed(): boolean;
}): { api: NativeConnectApi; dispose(): void } {
    const original = options.sessions.startNewSession.bind(options.sessions);
    let registration: { handler: (request: NativeConnectRequest) => Promise<ConnectToolResult>; profiles: () => string[] } | undefined;
    const rejected = (): ConnectToolResult => ({ status: "rejected", displayMessage: "Connect origin changed, was cancelled, or is unavailable. Select and connect the current task graphically." });
    const tool = (operation: "bridge.connect" | "bridge.disconnect", expectedSessionId: string | undefined): ConnectTool => ({
        name: operation === "bridge.connect" ? "bridge_connect" : "bridge_disconnect",
        description: operation === "bridge.connect"
            ? `Connect this existing Cline task to a configured server and follow its instructions. Local sign-in, pairing and consent are required. Returns promptly; the extension listens after this turn ends. Configured profile IDs: ${registration?.profiles().join(", ") || "none; use Cline Bridge: Configure Server"}. Never pass a URL, task ID or secret.`
            : "Disconnect only this task's current bridge binding. Does not cancel running work or revoke native permissions.",
        inputSchema: operation === "bridge.connect"
            ? { type: "object", properties: { serverProfileId: { type: "string", minLength: 1, maxLength: 128 }, displayLabel: { type: "string", maxLength: 160 } }, required: ["serverProfileId"], additionalProperties: false }
            : { type: "object", properties: { scope: { type: "string", enum: ["current-binding"] }, reason: { type: "string", maxLength: 512 } }, required: ["scope"], additionalProperties: false },
        executionMode: "sequential", timeoutMs: 125000, retryable: false,
        execute: async (args, sdk) => {
            const task = options.task(), session = options.sessions.getActiveSession(), hostContext = options.context(), captured = registration;
            if (!captured || !expectedSessionId || !task || !session || !sdk.toolCallId || sdk.sessionId !== expectedSessionId || task.taskId !== expectedSessionId || session.sessionId !== expectedSessionId || options.disposed() || sdk.signal?.aborted) return rejected();
            if (!args || typeof args !== "object" || Array.isArray(args)) return rejected();
            const raw = args as Record<string, unknown>;
            const keys = operation === "bridge.connect" ? ["serverProfileId", "displayLabel"] : ["scope", "reason"];
            if (Object.keys(raw).some(key => !keys.includes(key)) || (operation === "bridge.connect" ? typeof raw.serverProfileId !== "string" || raw.serverProfileId.length < 1 || raw.serverProfileId.length > 128 || (raw.displayLabel !== undefined && (typeof raw.displayLabel !== "string" || raw.displayLabel.length > 160)) : raw.scope !== "current-binding" || (raw.reason !== undefined && (typeof raw.reason !== "string" || raw.reason.length > 512)))) return rejected();
            const abort = new AbortController();
            const cancel = (): void => abort.abort(); sdk.signal?.addEventListener("abort", cancel, { once: true });
            const timer = setTimeout(cancel, 120000); timer.unref();
            const assertCurrent = (): void => {
                const current = options.sessions.getActiveSession();
                if (abort.signal.aborted || options.disposed() || registration !== captured || options.task() !== task || task.taskId !== expectedSessionId || current !== session || JSON.stringify(options.context()) !== JSON.stringify(hostContext)) throw new Error("CONNECT_ORIGIN_CHANGED");
            };
            const origin = Object.freeze({ ...hostContext, taskId: expectedSessionId, toolInvocationId: sdk.toolCallId });
            try {
                assertCurrent();
                const work = captured.handler({ input: structuredClone({ ...raw, operation }), origin, signal: abort.signal, assertCurrent });
                const cancelled = new Promise<ConnectToolResult>(resolve => abort.signal.addEventListener("abort", () => resolve(rejected()), { once: true }));
                const result = await Promise.race([work, cancelled]); assertCurrent();
                // Only bounded public fields leave the native API; credentials cannot be returned by an accidental handler value.
                const statuses = ["connected", "already_connected", "pending_local_confirmation", "disconnected", "no_connection", "rejected"];
                if (!statuses.includes(result.status) || typeof result.displayMessage !== "string" || result.displayMessage.length > 1024 || (result.connectionId !== undefined && (typeof result.connectionId !== "string" || result.connectionId.length > 128))) return rejected();
                return { status: result.status, displayMessage: result.displayMessage, ...(result.connectionId ? { connectionId: result.connectionId } : {}) };
            } catch { return rejected(); }
            finally { clearTimeout(timer); sdk.signal?.removeEventListener("abort", cancel); abort.abort(); }
        }
    });
    options.sessions.startNewSession = input => {
        if (options.disposed()) throw new Error("Cline host disposed");
        const existing = input.config.extraTools ?? [];
        if (existing.some(value => value && typeof value === "object" && ["bridge_connect", "bridge_disconnect"].includes(String((value as { name?: unknown }).name)))) throw new Error("Connect tool name conflict");
        return original({ ...input, config: { ...input.config, extraTools: [...existing, tool("bridge.connect", input.config.sessionId), tool("bridge.disconnect", input.config.sessionId)] } });
    };
    return { api: { register: (handler, profiles) => {
        if (registration || options.disposed()) throw new Error("Connect handler already registered or host disposed");
        const current = { handler, profiles, id: randomUUID() }; registration = current;
        return () => { if (registration === current) registration = undefined; };
    } }, dispose: () => { registration = undefined; options.sessions.startNewSession = original; } };
}
