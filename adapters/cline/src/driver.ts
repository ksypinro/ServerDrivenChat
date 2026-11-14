import { canonicalJson } from "@server-driven-chat/protocol";
import type { AdapterOutcome, AppAdapter, Binding, BindingSelection } from "@server-driven-chat/protocol";
import type { BackendDriver, BackendDriverDescriptor, BackendHostContext, BackendSelection } from "@server-driven-chat/adapter-core";
import { ClineAppAdapter } from "./index.js";
import type { NativeBridgeApi } from "./native-api.js";

export const clineBackendDescriptor: BackendDriverDescriptor = {
    contractVersion: "1.0", backendId: "cline", driverId: "server-driven-chat.cline", driverVersion: "0.1.0",
    appId: "cline.vscode", displayName: "Cline — maintained native API 1.3", hostKind: "vscode-local", extensionIds: ["saoudrizwan.claude-dev"]
};

/** Candidate driver for the adopted API, not stock Cline. The host must verify package fingerprints separately.
 * `nativeScopeId` lets the server refuse a second live binding of the same task; omit it for older servers. */
export function createClineBackendDriver(api: NativeBridgeApi, options: { nativeScopeId?: string } = {}): BackendDriver {
    if (api.apiVersion !== "1.3" || api.clineVersion !== "4.1.22") throw new Error("Cline driver requires the adopted native API 1.3");
    const adapters = new Map<AppAdapter, { context: BackendHostContext; binding?: Binding }>();
    let disposed = false;
    const discover = (context: BackendHostContext): BackendSelection | undefined => {
        context.assertCurrent();
        if (disposed || context.signal.aborted) throw new Error("Cline driver is unavailable");
        const native = api.context(), task = api.currentTask();
        if (native.windowId !== context.windowId || native.workspaceId !== context.workspaceId) throw new Error("Cline belongs to a different window or workspace");
        if (!task) return;
        return { label: `Cline task ${task.taskId}`, revision: canonicalJson({ context: native, taskId: task.taskId, generation: task.generation }),
            selection: { appId: "cline.vscode", appInstanceId: `${native.installationId}/${native.hostId}/${native.windowId}`, workspaceId: native.workspaceId, conversationId: task.taskId } };
    };
    return {
        descriptor: structuredClone(clineBackendDescriptor),
        async discover(context, signal) {
            if (signal.aborted) throw new Error("Discovery cancelled");
            const selected = discover(context); return selected ? [selected] : [];
        },
        async createAdapter(context, selected) {
            const assertSelected = (): void => {
                const current = discover(context);
                if (!current || current.revision !== selected.revision || canonicalJson(current.selection) !== canonicalJson(selected.selection)) throw new Error("Cline selection changed after local discovery");
            };
            assertSelected();
            class SelectedClineAdapter extends ClineAppAdapter {
                override async attach(selection: BindingSelection): Promise<AdapterOutcome<Binding>> {
                    assertSelected();
                    if (canonicalJson(selection) !== canonicalJson(selected.selection)) return { outcome: "rejected", reason: "Wrong locally selected Cline task" };
                    // The adopted native bind is synchronous; validate immediately before its effect.
                    const result = await super.attach(selection);
                    if ((result.outcome === "accepted" || result.outcome === "applied") && result.value) adapters.get(this)!.binding = structuredClone(result.value);
                    return result;
                }
            }
            const adapter = new SelectedClineAdapter(api, { onInvalidated: reason => context.invalidate(reason), ...(options.nativeScopeId ? { nativeScopeId: options.nativeScopeId } : {}) });
            adapters.set(adapter, { context });
            return adapter;
        },
        async readConversationRevision(adapter, binding) {
            const record = adapters.get(adapter);
            if (!record?.binding || !(adapter instanceof ClineAppAdapter) || canonicalJson(record.binding) !== canonicalJson(binding)) throw new Error("Unknown Cline driver binding");
            record.context.assertCurrent();
            return adapter.nativeSnapshot(binding).conversationRevision;
        },
        async dispose() {
            disposed = true;
            const retained = [...adapters.entries()];
            for (const [, record] of retained) record.context.invalidate("Cline driver disposed");
            for (const [adapter, record] of retained) {
                if (record.binding) {
                    const result = await adapter.detach(record.binding);
                    if (result.outcome !== "accepted" && result.outcome !== "applied") throw new Error("Cline driver cleanup requires reconciliation");
                }
            }
            adapters.clear();
        }
    };
}
