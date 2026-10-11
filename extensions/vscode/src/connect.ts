import { createHash } from "node:crypto";
import { BridgeRuntime, BridgeStore, createApprovalDecisionHandler } from "@server-driven-chat/bridge";
import { ClineAppAdapter } from "@server-driven-chat/adapter-cline";
import { canonicalJson, validateConnectToolInput } from "@server-driven-chat/protocol";
import type { AppAdapter, Binding, ConnectToolResult, TrustedConnectContext, AdapterMutationContext } from "@server-driven-chat/protocol";
import type { NativeBridgeApi, NativeConnectRequest } from "@server-driven-chat/adapter-cline";

export type ControlCategory = "prompts" | "questions" | "approvals" | "cancel";
export interface ServerProfile { id: string; name: string; origin: string; categories: ControlCategory[] }
export interface PairedDevice { deviceId: string; credential: string; expiresAt: string }
export interface ConnectUi {
    profile(id: string): Promise<ServerProfile | undefined>;
    pair(profile: ServerProfile, request: NativeConnectRequest): Promise<PairedDevice>;
    confirm(profile: ServerProfile, origin: TrustedConnectContext, signal: AbortSignal): Promise<boolean>;
    storePath(profile: ServerProfile, device: PairedDevice): Promise<string>;
    changed(state: string, target?: { adapter: ClineAppAdapter; binding: Binding }): void;
}
export function serverOrigin(value: string): string {
    const url = new URL(value);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new TypeError("Use a server origin with HTTPS (HTTP is allowed only for loopback development)");
    return url.origin;
}
export async function apiJson<T>(profile: ServerProfile, path: string, body: unknown, token?: string, signal?: AbortSignal): Promise<T> {
    const requestSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]);
    const response = await cancellable(fetch(new URL(path, serverOrigin(profile.origin)), { method: "POST", redirect: "error", signal: requestSignal, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }), requestSignal);
    if (!response.ok) throw new Error(`Server request failed (${response.status}); repair sign-in/pairing or binding`);
    return await cancellable(response.json(), requestSignal) as T;
}
/** Release a cancelled review promptly, while observing and fencing its late result. */
export function cancellable<T>(work: PromiseLike<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const stop = (): void => { signal.removeEventListener("abort", stop); reject(new Error("Connection cancelled")); };
        if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true });
        Promise.resolve(work).then(value => { signal.removeEventListener("abort", stop); if (signal.aborted) stop(); else resolve(value); }, error => { signal.removeEventListener("abort", stop); reject(error); });
    });
}
interface Connected {
    key: string; profile: ServerProfile; device: PairedDevice; adapter: ClineAppAdapter; binding: Binding;
    runtime: BridgeRuntime; store: BridgeStore; enabled: boolean; closing?: Promise<void>;
}
/** Extension-owned listener, independent of the native model turn. Native tokens are never persisted. */
export class ConnectManager {
    #current?: Connected;
    #pending = false;
    #maintenance = false;
    #generation = 0;
    #pendingAbort?: AbortController;
    constructor(readonly api: NativeBridgeApi, readonly ui: ConnectUi) {}
    get current(): { adapter: ClineAppAdapter; binding: Binding } | undefined { return this.#current?.enabled ? this.#current : undefined; }
    get state(): string { return this.#current?.runtime.state ?? "disconnected"; }
    /** Fence new connections while removing the selected profile credentials. */
    async withDisconnected(work: () => Promise<void>): Promise<void> {
        if (this.#maintenance) throw new Error("Credential cleanup already in progress");
        this.#maintenance = true;
        try { await this.disconnect(); await work(); } finally { this.#maintenance = false; }
    }
    async handle(request: NativeConnectRequest): Promise<ConnectToolResult> {
        if (this.#maintenance) return { status: "rejected", displayMessage: "Credential cleanup is in progress. Connect again after it finishes." };
        const originalRequest = request, generation = this.#generation;
        request = { ...request, assertCurrent: () => { originalRequest.assertCurrent(); if (generation !== this.#generation || request.signal.aborted) throw new Error("Connection disabled locally"); } };
        const parsed = validateConnectToolInput(request.input);
        if (!parsed.valid) return { status: "rejected", displayMessage: "Connect accepts only configured profile IDs; URLs, task IDs, credentials and grants are not tool arguments." };
        const input = parsed.value!;
        try {
            request.assertCurrent();
            const native = this.api.context(), task = this.api.currentTask();
            if (task?.taskId !== request.origin.taskId || canonicalJson(native) !== canonicalJson({ installationId: request.origin.installationId, hostId: request.origin.hostId, windowId: request.origin.windowId, workspaceId: request.origin.workspaceId })) throw new Error("Origin mismatch");
            if (input.operation === "bridge.disconnect") {
                if (!this.#current) return { status: "no_connection", displayMessage: "This task has no bridge connection." };
                if (this.#current.binding.nativeConversationId !== request.origin.taskId || this.#current.binding.appInstanceId !== `${native.installationId}/${native.hostId}/${native.windowId}` || this.#current.binding.workspaceId !== native.workspaceId) throw new Error("Disconnect origin mismatch");
                await this.disconnect(); return { status: "disconnected", displayMessage: "Remote delivery stopped locally. Running work and native permissions are separate controls." };
            }
            const profile = await this.ui.profile(String(input.serverProfileId)); request.assertCurrent();
            if (!profile) return { status: "rejected", displayMessage: "Configure this server profile graphically before connecting." };
            profile.origin = serverOrigin(profile.origin);
            const key = canonicalJson({ profile, installationId: native.installationId, hostId: native.hostId, windowId: native.windowId, workspaceId: native.workspaceId, taskId: request.origin.taskId });
            if (this.#current?.enabled) {
                if (this.#current.key !== key) return { status: "rejected", displayMessage: "Disconnect the current binding and select the new server/task locally first." };
                this.#current.adapter.nativeSnapshot(this.#current.binding);
                return this.#current.runtime.state === "online" ? { status: "already_connected", displayMessage: "This exact server/task binding is already connected.", connectionId: this.#current.binding.bindingId } : { status: "pending_local_confirmation", displayMessage: "Existing listener needs connection repair; no new binding was created." };
            }
            if (this.#pending) return { status: "pending_local_confirmation", displayMessage: "A local connection review is already pending." };
            this.#pending = true;
            this.#pendingAbort = new AbortController();
            request.signal = AbortSignal.any([request.signal, this.#pendingAbort.signal]);
            let adapter: ClineAppAdapter | undefined, binding: Binding | undefined, device: PairedDevice | undefined, registered = false;
            let store: BridgeStore | undefined, connected: Connected | undefined;
            let removeAbort: (() => void) | undefined;
            try {
                if (!await cancellable(this.ui.confirm(profile, request.origin, request.signal), request.signal)) return { status: "rejected", displayMessage: "Local connection consent was declined." };
                request.assertCurrent(); device = await cancellable(this.ui.pair(profile, request), request.signal); request.assertCurrent();
                adapter = new ClineAppAdapter(this.api, { onInvalidated: () => { const current = this.#current; if (current && current.adapter === adapter) { current.runtime.disable(); void this.disconnect(); } } });
                const selection = adapter.selection();
                if (!selection || selection.conversationId !== request.origin.taskId) throw new Error("Origin changed before binding");
                request.assertCurrent(); const attached = await adapter.attach(selection);
                if (attached.outcome !== "accepted" || !attached.value) throw new Error("Native task could not be bound");
                binding = attached.value; request.assertCurrent();
                const receipt = await apiJson<{ binding: Binding; decisionPublicKey?: string }>(profile, `/v2/devices/${encodeURIComponent(device.deviceId)}/bindings`, { binding, conversationRevision: adapter.nativeSnapshot(binding).conversationRevision, capabilities: await delegatedCapabilities(adapter, profile) }, device.credential, request.signal);
                registered = true; request.assertCurrent();
                if (canonicalJson(receipt.binding) !== canonicalJson(binding)) throw new Error("Server handshake returned different binding");
                if (profile.categories.includes("approvals") && !receipt.decisionPublicKey) throw new Error("Server has no approval assertion key; configure without approvals or repair server");
                store = new BridgeStore({ path: await this.ui.storePath(profile, device) }); request.assertCurrent();
                const gate = (category: ControlCategory, context?: AdapterMutationContext): AdapterMutationContext => ({ signal: context?.signal ?? new AbortController().signal, assertAuthority() {
                    if (!connected?.enabled || !profile.categories.includes(category)) throw new Error("Local control delegation disabled");
                    context?.assertAuthority();
                } });
                const delegated: AppAdapter = { probe: () => adapter!.probe(), attach: selection => adapter!.attach(selection), inspect: b => adapter!.inspect(b), subscribe: (b,c,o) => adapter!.subscribe(b,c,o), detach: b => adapter!.detach(b),
                    submit: (b,c,o) => adapter!.submit(b,c,gate("prompts",o)), respondInput: (b,id,rev,a,o) => adapter!.respondInput(b,id,rev,a,gate("questions",o)), cancel: (b,id,o) => adapter!.cancel(b,id,gate("cancel",o)),
                    resolveApproval: (b,r,p,o) => adapter!.resolveApproval(b,r,p,gate("approvals",o)), revoke: (b,id,o) => adapter!.revoke(b,id,o), stageAttachment: (b,r,bytes,o) => adapter!.stageAttachment(b,r,bytes,gate("prompts",o)) };
                const trustedFetch: typeof fetch = (url, init) => fetch(url, { ...init, redirect: "error" });
                const runtime = new BridgeRuntime({ fetch: trustedFetch, serverUrl: profile.origin, deviceId: device.deviceId, credential: device.credential, binding, adapter: delegated, store,
                    ...(receipt.decisionPublicKey && profile.categories.includes("approvals") ? { approvalHandler: createApprovalDecisionHandler({ serverUrl: profile.origin, deviceId: device.deviceId, credential: device.credential, binding, adapter: delegated, store, publicKey: receipt.decisionPublicKey, fetch: trustedFetch }) } : {}),
                    onStateChange: state => this.ui.changed(state, connected?.enabled ? connected : undefined) });
                connected = { key, profile, device, adapter, binding, runtime, store, enabled: true }; this.#current = connected;
                const stopOnAbort = (): void => { if (connected) { connected.runtime.disable(); void this.#close(connected); } };
                request.signal.addEventListener("abort", stopOnAbort, { once: true }); removeAbort = () => request.signal.removeEventListener("abort", stopOnAbort);
                request.assertCurrent(); await runtime.start(); request.assertCurrent();
                if (runtime.state !== "online") throw new Error("Server listener handshake did not become online");
                this.ui.changed("online", connected);
                return { status: "connected", displayMessage: "Connected to the locally approved server for this task. The extension keeps listening after this turn ends.", connectionId: binding.bindingId };
            } catch {
                if (connected) await this.#close(connected);
                else { store?.close(); if (binding && adapter) await adapter.detach(binding); if (registered && binding && device) await apiJson(profile, `/v2/devices/${encodeURIComponent(device.deviceId)}/bindings/${encodeURIComponent(binding.bindingId)}/detach`, {}, device.credential).catch(() => {}); }
                return { status: "rejected", displayMessage: "Connection was not established. Inspect local status and repair authentication, consent or the exact task binding." };
            } finally { removeAbort?.(); this.#pending = false; this.#pendingAbort = undefined; }
        } catch { return { status: "rejected", displayMessage: "The native originating task changed. Select and connect again locally." }; }
    }
    async #close(current: Connected): Promise<void> {
        if (current.closing) return current.closing;
        current.enabled = false; current.runtime.disable();
        if (this.#current === current) { this.#current = undefined; this.ui.changed("disconnected"); }
        current.closing = (async () => {
            await current.runtime.stop(); await current.adapter.detach(current.binding); current.store.close();
            await apiJson(current.profile, `/v2/devices/${encodeURIComponent(current.device.deviceId)}/bindings/${encodeURIComponent(current.binding.bindingId)}/detach`, {}, current.device.credential).catch(() => {});
        })();
        return current.closing;
    }
    async disconnect(): Promise<void> {
        ++this.#generation; this.#pendingAbort?.abort();
        const current = this.#current;
        if (current) await this.#close(current);
    }

}
export const profileStorageKey = (profile: ServerProfile): string => `sdc.profile.${createHash("sha256").update(`${profile.id}\0${serverOrigin(profile.origin)}`).digest("hex")}`;

/** Report native support constrained by the exact local consent categories. Enforcement remains at each mutation. */
async function delegatedCapabilities(adapter: ClineAppAdapter, profile: ServerProfile) {
    const report = await adapter.probe();
    const categories = { submit: "prompts", stageAttachment: "prompts", respondInput: "questions", resolveApproval: "approvals", cancel: "cancel" } as const;
    for (const [operation, category] of Object.entries(categories)) {
        if (!profile.categories.includes(category)) report.operations[operation as keyof typeof report.operations] = { status: "unsupported", reason: "This control category was not delegated locally for this binding" };
    }
    return report;
}
