import * as vscode from "vscode";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { ClineAppAdapter, NativeBridgeApi, NativeConnectRequest } from "@server-driven-chat/adapter-cline";
import type { Binding, ConnectToolResult, ProtocolEvent } from "@server-driven-chat/protocol";

/** Evidence capture only; it does not submit prompts or bypass the native Connect route. */
export class ConnectCapture {
    #record?: { milestone: string; status: string; startedAt: string; finishedAt?: string; apiVersion: string; initialTaskId?: string; artifacts: unknown; tools: object[]; states: object[]; trace: ProtocolEvent[] };
    #abort?: AbortController;
    #saving: Promise<void> = Promise.resolve();
    #uri?: vscode.Uri;
    #bindingId?: string;
    constructor(readonly context: vscode.ExtensionContext) {}
    async start(api: NativeBridgeApi, milestone: "M21" | "M22" | "M23" = "M21"): Promise<void> {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (folder?.uri.fsPath !== "/private/tmp/sdc-m19-vscode-probe") throw new Error("M21 acceptance capture is restricted to the disposable workspace");
        this.#abort?.abort(); this.#bindingId = undefined;
        const cline = vscode.extensions.getExtension("saoudrizwan.claude-dev");
        if (cline?.packageJSON.sdcPatch?.revision !== 3) throw new Error("Capture requires the M21 pinned build");
        const hash = (bytes: Uint8Array): string => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        this.#uri = vscode.Uri.joinPath(folder.uri, `${milestone.toLowerCase()}-live-evidence.json`);
        this.#record = { milestone, status: "recording", startedAt: new Date().toISOString(), apiVersion: api.apiVersion, initialTaskId: api.currentTask()?.taskId,
            artifacts: { patch: cline.packageJSON.sdcPatch, nativeAddon: hash(await readFile(vscode.Uri.joinPath(cline.extensionUri, "dist/sdc-native.cjs").fsPath)), companion: hash(await readFile(vscode.Uri.joinPath(this.context.extensionUri, "dist/extension.cjs").fsPath)) }, tools: [], states: [], trace: [] };
        await this.#save();
    }
    async tool(request: NativeConnectRequest, work: () => Promise<ConnectToolResult>): Promise<ConnectToolResult> {
        const result = await work();
        if (this.#record) {
            const input = request.input as { operation?: string; serverProfileId?: string };
            this.#record.tools.push({ observedAt: new Date().toISOString(), source: "sdk_custom_tool", origin: request.origin, operation: input.operation, ...(input.serverProfileId ? { serverProfileId: input.serverProfileId } : {}), result });
            await this.#save();
        }
        return result;
    }
    state(state: string, target?: { adapter: ClineAppAdapter; binding: Binding }): void {
        const record = this.#record; if (!record) return;
        // Let the passive subscription drain native invalidation evidence before ending.
        record.states.push({ observedAt: new Date().toISOString(), state, ...(target ? { binding: target.binding } : {}) });
        if (target && this.#bindingId !== target.binding.bindingId) {
            this.#abort?.abort(); this.#abort = new AbortController(); this.#bindingId = target.binding.bindingId;
            const signal = this.#abort.signal;
            void (async () => { try { for await (const event of target.adapter.subscribe(target.binding, [], { signal })) { record.trace.push(event); await this.#save(); } } catch { if (!signal.aborted) record.states.push({ state: "binding_invalidated", observedAt: new Date().toISOString() }); } })();
        }
        void this.#save();
    }
    async finish(): Promise<void> {
        if (!this.#record) throw new Error("Start capture before the initial Connect prompt");
        this.#record.status = "captured"; this.#record.finishedAt = new Date().toISOString(); await this.#save(); this.#abort?.abort();
    }
    dispose(): void { this.#abort?.abort(); }
    #save(): Promise<void> {
        if (!this.#record || !this.#uri) return Promise.resolve();
        const bytes = Buffer.from(JSON.stringify(this.#record, null, 2)+"\n"), uri = this.#uri;
        this.#saving = this.#saving.catch(() => {}).then(() => vscode.workspace.fs.writeFile(uri, bytes)); return this.#saving;
    }
}
