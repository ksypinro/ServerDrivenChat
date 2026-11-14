import { createHash } from "node:crypto";
import { BridgeRuntime, BridgeStore, createApprovalDecisionHandler } from "@server-driven-chat/bridge";
import { ClineAppAdapter, ClineHistoryReconciliationError } from "@server-driven-chat/adapter-cline";
import { canonicalJson, validateConnectToolInput } from "@server-driven-chat/protocol";
import type { AppAdapter, Binding, BindingDisplay, BindingOutputCheckpoint, ConnectToolResult, TrustedConnectContext, AdapterMutationContext } from "@server-driven-chat/protocol";
import type { NativeBridgeApi, NativeConnectRequest } from "@server-driven-chat/adapter-cline";

export type ControlCategory = "prompts" | "questions" | "approvals" | "cancel";
export interface ServerProfile { id: string; name: string; origin: string; categories: ControlCategory[] }
export interface PairedDevice { deviceId: string; credential: string; expiresAt: string }
export interface ConnectUi {
    profile(id: string): Promise<ServerProfile | undefined>;
    pair(profile: ServerProfile, request: NativeConnectRequest): Promise<PairedDevice>;
    confirm(profile: ServerProfile, origin: TrustedConnectContext, signal: AbortSignal): Promise<boolean>;
    /** Inbox location for one binding; older callers may ignore the binding. */
    storePath(profile: ServerProfile, device: PairedDevice, binding?: Binding): Promise<string>;
    changed(state: string, target?: { adapter: ClineAppAdapter; binding: Binding }): void;
    /** Opaque Cline data namespace that lets the server refuse a second live binding of the same task. */
    nativeScopeId?(): string | undefined;
    /** Labels for people who can view the session. Return nothing to share none. */
    display?(conversationTitle: string | undefined): BindingDisplay | undefined;
    /** Explicit local consent to move a binding that holds this task in another window or installation. */
    confirmTakeover?(profile: ServerProfile, origin: TrustedConnectContext, holder: string, signal: AbortSignal): Promise<boolean>;
    /** Marks an inbox as in use by this window until the returned release runs. */
    holdInbox?(path: string): Promise<() => void>;
    /** Deletes a cleanly closed inbox. */
    removeInbox?(path: string): Promise<void>;
    /** Persist only the adapter's bounded, content-free reconciliation evidence. */
    historyDiagnostic?(diagnostic: ClineHistoryReconciliationError["diagnostic"]): Promise<void>;
}
export function serverOrigin(value: string): string {
    const url = new URL(value);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new TypeError("Use a server origin with HTTPS (HTTP is allowed only for loopback development)");
    return url.origin;
}
/** Server refusal with its error code; `detail` is the server's human-readable explanation. */
export class ServerRequestError extends Error {
    constructor(readonly status: number, readonly code: string | undefined, readonly detail: string | undefined) {
        super(`Server request failed (${status}${code ? ` ${code}` : ""}); repair sign-in/pairing or binding`);
        this.name = "ServerRequestError";
    }
}
async function serverRequest<T>(profile: ServerProfile, path: string, init: { method: "GET" | "POST"; body?: unknown }, token?: string, signal?: AbortSignal): Promise<T> {
    const requestSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]);
    const response = await cancellable(fetch(new URL(path, serverOrigin(profile.origin)), { method: init.method, redirect: "error", signal: requestSignal,
        headers: { ...(init.method === "POST" ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(init.method === "POST" ? { body: JSON.stringify(init.body) } : {}) }), requestSignal);
    if (!response.ok) {
        let code: string | undefined, detail: string | undefined;
        try {
            const failure = await cancellable(response.json(), requestSignal) as { error?: { code?: unknown; message?: unknown } };
            if (typeof failure.error?.code === "string") code = failure.error.code.slice(0, 64);
            if (typeof failure.error?.message === "string") detail = failure.error.message.slice(0, 500);
        } catch { /* the status alone describes the failure */ }
        throw new ServerRequestError(response.status, code, detail);
    }
    return await cancellable(response.json(), requestSignal) as T;
}
export function apiJson<T>(profile: ServerProfile, path: string, body: unknown, token?: string, signal?: AbortSignal): Promise<T> { return serverRequest(profile, path, { method: "POST", body }, token, signal); }
export function apiGet<T>(profile: ServerProfile, path: string, token?: string, signal?: AbortSignal): Promise<T> { return serverRequest(profile, path, { method: "GET" }, token, signal); }
/** Optional registration features the server advertises. An older server lists none, so none are sent. */
export async function serverFeatures(profile: ServerProfile, credential: string, signal?: AbortSignal): Promise<ReadonlySet<string>> {
    const health = await apiGet<{ features?: unknown }>(profile, "/v2/health", credential, signal);
    return new Set(Array.isArray(health.features) ? health.features.filter((feature): feature is string => typeof feature === "string") : []);
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
    runtime: BridgeRuntime; store: BridgeStore; inbox: string; releaseInbox?: () => void; enabled: boolean; closing?: Promise<void>;
}
type RegistrationReceipt = { binding: Binding; decisionPublicKey?: string; laneWatermarks?: { prompt: number; control: number }; replacedBindingId?: string; outputCheckpoint?: BindingOutputCheckpoint };
/** The task is held by another live binding and was not moved here; the message is safe to show the model. */
class BoundElsewhereError extends Error {}
/** Extension-owned listener, independent of the native model turn. Native tokens are never persisted. */
export class ConnectManager {
    #current?: Connected;
    #pending = false;
    #pendingProfileKey?: string;
    #maintenance = false;
    #generation = 0;
    #pendingAbort?: AbortController;
    constructor(readonly api: NativeBridgeApi, readonly ui: ConnectUi) {}
    get current(): { adapter: ClineAppAdapter; binding: Binding } | undefined { return this.#current?.enabled ? this.#current : undefined; }
    get state(): string { return this.#current?.runtime.state ?? "disconnected"; }
    /** True when the enabled or pending connection uses this profile's credentials. */
    usesProfile(storageKey: string): boolean {
        return (this.#current?.enabled === true && profileStorageKey(this.#current.profile) === storageKey) || this.#pendingProfileKey === storageKey;
    }
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
            if (task?.taskId !== request.origin.taskId || canonicalJson(native) !== canonicalJson({ installationId: request.origin.installationId, hostId: request.origin.hostId, windowId: request.origin.windowId, workspaceId: request.origin.workspaceId, ...(request.origin.nativeScopeId ? { nativeScopeId: request.origin.nativeScopeId } : {}) })) throw new Error("Origin mismatch");
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
            this.#pendingProfileKey = profileStorageKey(profile);
            this.#pendingAbort = new AbortController();
            request.signal = AbortSignal.any([request.signal, this.#pendingAbort.signal]);
            let adapter: ClineAppAdapter | undefined, binding: Binding | undefined, device: PairedDevice | undefined, registered = false;
            let store: BridgeStore | undefined, connected: Connected | undefined, inbox: string | undefined, releaseInbox: (() => void) | undefined;
            let removeAbort: (() => void) | undefined;
            try {
                if (!await cancellable(this.ui.confirm(profile, request.origin, request.signal), request.signal)) return { status: "rejected", displayMessage: "Local connection consent was declined." };
                request.assertCurrent(); device = await cancellable(this.ui.pair(profile, request), request.signal); request.assertCurrent();
                // Send optional registration fields only to a server that advertises them; older servers reject unknown fields.
                const features = await serverFeatures(profile, device.credential, request.signal); request.assertCurrent();
                const nativeScopeId = features.has("binding.nativeScope") ? native.nativeScopeId ?? this.ui.nativeScopeId?.() : undefined;
                adapter = new ClineAppAdapter(this.api, { onInvalidated: () => { const current = this.#current; if (current && current.adapter === adapter) { current.runtime.disable(); void this.disconnect(); } }, ...(nativeScopeId ? { nativeScopeId } : {}) });
                const selection = adapter.selection();
                if (!selection || selection.conversationId !== request.origin.taskId) throw new Error("Origin changed before binding");
                request.assertCurrent(); const attached = await adapter.attach(selection);
                if (attached.outcome !== "accepted" || !attached.value) throw new Error("Native task could not be bound");
                binding = attached.value; request.assertCurrent();
                const snapshot = adapter.nativeSnapshot(binding);
                const display = features.has("binding.display") ? this.ui.display?.(snapshot.messages.find(message => message.type === "say" && message.category === "task")?.text) : undefined;
                const continuity = Boolean(nativeScopeId && features.has("binding.continuity"));
                const receipt = await this.#register(profile, device, { binding, conversationRevision: snapshot.conversationRevision, capabilities: await delegatedCapabilities(adapter, profile), ...(continuity ? { continuity: true } : {}), ...(display ? { display } : {}) }, features, request);
                registered = true; request.assertCurrent();
                if (continuity) binding = adapter.adoptRegistration(binding, receipt.binding, receipt.outputCheckpoint);
                else if (canonicalJson(receipt.binding) !== canonicalJson(binding)) throw new Error("Server handshake returned different binding");
                if (profile.categories.includes("approvals") && !receipt.decisionPublicKey) throw new Error("Server has no approval assertion key; configure without approvals or repair server");
                inbox = await this.ui.storePath(profile, device, binding); request.assertCurrent();
                releaseInbox = await this.ui.holdInbox?.(inbox); request.assertCurrent();
                // A per-binding inbox keeps other windows' commands as sequence receipts and starts after this registration.
                store = new BridgeStore({ path: inbox, sessionId: binding.sessionId });
                store.initializeCursors(device.deviceId, receipt.laneWatermarks ?? { prompt: 0, control: 0 }); request.assertCurrent();
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
                connected = { key, profile, device, adapter, binding, runtime, store, inbox, releaseInbox, enabled: true }; this.#current = connected;
                const stopOnAbort = (): void => { if (connected) { connected.runtime.disable(); void this.#close(connected); } };
                request.signal.addEventListener("abort", stopOnAbort, { once: true }); removeAbort = () => request.signal.removeEventListener("abort", stopOnAbort);
                request.assertCurrent(); await runtime.start(); request.assertCurrent();
                if (runtime.state !== "online") throw new Error("Server listener handshake did not become online");
                this.ui.changed("online", connected);
                return { status: "connected", displayMessage: "Connected to the locally approved server for this task. The extension keeps listening after this turn ends.", connectionId: binding.bindingId };
            } catch (error) {
                if (connected) await this.#close(connected);
                else {
                    store?.close(); releaseInbox?.();
                    if (binding && adapter) await adapter.detach(binding);
                    if (registered && binding && device) {
                        const detached = await apiJson(profile, `/v2/devices/${encodeURIComponent(device.deviceId)}/bindings/${encodeURIComponent(binding.bindingId)}/detach`, {}, device.credential).then(() => true, () => false);
                        // Only an inbox this attempt opened is removed; a refused open never touches another session's file.
                        if (detached && store && inbox) await this.ui.removeInbox?.(inbox).catch(() => {});
                    }
                }
                if (error instanceof BoundElsewhereError) return { status: "rejected", displayMessage: error.message };
                if (error instanceof ClineHistoryReconciliationError) {
                    console.warn("SDC_HISTORY_RECONCILIATION", JSON.stringify(error.diagnostic));
                    await this.ui.historyDiagnostic?.(error.diagnostic).catch(() => {});
                    return { status: "rejected", displayMessage: "Native history needs reconciliation. Existing server history was preserved and this task was not connected. The extension host log contains content-free diagnostic code MI04_HISTORY_PREFIX." };
                }
                return { status: "rejected", displayMessage: "Connection was not established. Inspect local status and repair authentication, consent or the exact task binding." };
            } finally { removeAbort?.(); this.#pending = false; this.#pendingProfileKey = undefined; this.#pendingAbort = undefined; }
        } catch { return { status: "rejected", displayMessage: "The native originating task changed. Select and connect again locally." }; }
    }
    /** One registration, then at most one locally consented takeover of the live binding that holds the task. */
    async #register(profile: ServerProfile, device: PairedDevice, body: Record<string, unknown>, features: ReadonlySet<string>, request: NativeConnectRequest): Promise<RegistrationReceipt> {
        const path = `/v2/devices/${encodeURIComponent(device.deviceId)}/bindings`;
        try { return await apiJson<RegistrationReceipt>(profile, path, body, device.credential, request.signal); }
        catch (error) {
            if (!(error instanceof ServerRequestError) || error.code !== "CONVERSATION_BOUND_ELSEWHERE") throw error;
            request.assertCurrent();
            const consented = features.has("binding.takeover") && this.ui.confirmTakeover
                ? await cancellable(this.ui.confirmTakeover(profile, request.origin, error.detail ?? "", request.signal), request.signal) : false;
            request.assertCurrent();
            if (!consented) throw new BoundElsewhereError("This Cline task is connected in another window or installation. Disconnect it there, or connect again and approve moving the connection here.");
            try { return await apiJson<RegistrationReceipt>(profile, path, { ...body, takeover: true }, device.credential, request.signal); }
            catch (retry) {
                if (retry instanceof ServerRequestError && retry.code === "CONVERSATION_BOUND_ELSEWHERE") throw new BoundElsewhereError("This Cline task is still connected through a binding that this account cannot move.");
                throw retry;
            }
        }
    }
    async #close(current: Connected): Promise<void> {
        if (current.closing) return current.closing;
        current.enabled = false; current.runtime.disable();
        if (this.#current === current) { this.#current = undefined; this.ui.changed("disconnected"); }
        current.closing = (async () => {
            await current.runtime.stop(); await current.adapter.detach(current.binding);
            const unresolved = current.store.countUnresolvedAttempts(current.binding.sessionId);
            current.store.close(); current.releaseInbox?.();
            const detached = await apiJson(current.profile, `/v2/devices/${encodeURIComponent(current.device.deviceId)}/bindings/${encodeURIComponent(current.binding.bindingId)}/detach`, {}, current.device.credential).then(() => true, () => false);
            // Keep an inbox whose native outcome is uncertain, or whose binding may still be live on the server.
            if (detached && unresolved === 0) await this.ui.removeInbox?.(current.inbox).catch(() => {});
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

/** One row of `GET /v2/sessions`, as far as the connections list uses it. */
export interface ConnectionRow { sessionId: string; state: string; role?: string; binding: { bindingId: string; state: string; leaseExpiresAt?: string; payload?: unknown } | null }
/** Read-only quick-pick rows: live bindings first, then the most recent offline sessions. */
export function describeConnections(rows: readonly ConnectionRow[], currentBindingId: string | undefined, now = Date.now(), limit = 100): Array<{ label: string; description: string; detail: string }> {
    const items = rows.map(row => {
        const payload = (row.binding?.payload ?? {}) as { display?: BindingDisplay; binding?: { nativeConversationId?: unknown } };
        const live = row.binding?.state === "active" && Date.parse(row.binding.leaseExpiresAt ?? "") > now;
        const task = typeof payload.binding?.nativeConversationId === "string" ? `Cline task ${payload.binding.nativeConversationId}` : `Session ${row.sessionId}`;
        const description = [payload.display?.workspaceLabel, live ? "online" : "offline", currentBindingId && row.binding?.bindingId === currentBindingId ? "this window" : undefined];
        return { live, item: { label: `${live ? "$(circle-filled)" : "$(circle-outline)"} ${payload.display?.conversationLabel ?? task}`,
            description: description.filter((part): part is string => typeof part === "string" && part.length > 0).join(" · "), detail: `Session ${row.sessionId}${row.role ? ` · ${row.role}` : ""}` } };
    });
    return [...items.filter(entry => entry.live), ...items.filter(entry => !entry.live)].slice(0, limit).map(entry => entry.item);
}

/** Report native support constrained by the exact local consent categories. Enforcement remains at each mutation. */
async function delegatedCapabilities(adapter: ClineAppAdapter, profile: ServerProfile) {
    const report = await adapter.probe();
    const categories = { submit: "prompts", stageAttachment: "prompts", respondInput: "questions", resolveApproval: "approvals", cancel: "cancel" } as const;
    for (const [operation, category] of Object.entries(categories)) {
        if (!profile.categories.includes(category)) report.operations[operation as keyof typeof report.operations] = { status: "unsupported", reason: "This control category was not delegated locally for this binding" };
    }
    return report;
}
