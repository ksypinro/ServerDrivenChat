import { createHash } from "node:crypto";
import { BridgeRuntime, BridgeStore, createApprovalDecisionHandler } from "@server-driven-chat/bridge";
import type { BackendHostServices, BackendHostSession, BackendHostIdentity } from "@server-driven-chat/adapter-core";
import { canonicalJson } from "@server-driven-chat/protocol";
import type { AdapterOperation, Binding, BindingDisplay, TrustedConnectContext } from "@server-driven-chat/protocol";

export type ControlCategory = "prompts" | "questions" | "approvals" | "cancel";
export interface ServerProfile { id: string; name: string; origin: string; categories: ControlCategory[]; scope?: string }
export interface PairedDevice { deviceId: string; credential: string; expiresAt: string }
export interface ConnectionRequest { origin: TrustedConnectContext; signal: AbortSignal; assertCurrent(): void }
export interface ConnectUi {
    profile(id: string): Promise<ServerProfile | undefined>;
    pair(profile: ServerProfile, request: ConnectionRequest): Promise<PairedDevice>;
    confirm(profile: ServerProfile, origin: TrustedConnectContext, signal: AbortSignal): Promise<boolean>;
    /** Inbox location for one binding; older callers may ignore the binding. */
    storePath(profile: ServerProfile, device: PairedDevice, binding?: Binding): Promise<string>;
    changed(state: string): void;
    /** Labels for people who can view the session. Return nothing to share none. */
    display?(conversationTitle: string | undefined): BindingDisplay | undefined;
    /** Deletes a cleanly closed inbox. */
    removeInbox?(path: string): Promise<void>;
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
    const response = await fetch(new URL(path, serverOrigin(profile.origin)), { method: init.method, redirect: "error", signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]),
        headers: { ...(init.method === "POST" ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(init.method === "POST" ? { body: JSON.stringify(init.body) } : {}) });
    if (!response.ok) {
        let code: string | undefined, detail: string | undefined;
        try {
            const failure = await response.json() as { error?: { code?: unknown; message?: unknown } };
            if (typeof failure.error?.code === "string") code = failure.error.code.slice(0, 64);
            if (typeof failure.error?.message === "string") detail = failure.error.message.slice(0, 500);
        } catch { /* the status alone describes the failure */ }
        throw new ServerRequestError(response.status, code, detail);
    }
    return await response.json() as T;
}
export function apiJson<T>(profile: ServerProfile, path: string, body: unknown, token?: string, signal?: AbortSignal): Promise<T> { return serverRequest(profile, path, { method: "POST", body }, token, signal); }
export function apiGet<T>(profile: ServerProfile, path: string, token?: string, signal?: AbortSignal): Promise<T> { return serverRequest(profile, path, { method: "GET" }, token, signal); }
/** Optional registration features the server advertises. An older server lists none, so none are sent. */
export async function serverFeatures(profile: ServerProfile, credential: string, signal?: AbortSignal): Promise<ReadonlySet<string>> {
    const health = await apiGet<{ features?: unknown }>(profile, "/v2/health", credential, signal);
    return new Set(Array.isArray(health.features) ? health.features.filter((feature): feature is string => typeof feature === "string") : []);
}
export function cancellable<T>(work: PromiseLike<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const stop = (): void => { signal.removeEventListener("abort", stop); reject(new Error("Connection cancelled")); };
        if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true });
        Promise.resolve(work).then(value => { signal.removeEventListener("abort", stop); if (signal.aborted) stop(); else resolve(value); }, error => { signal.removeEventListener("abort", stop); reject(error); });
    });
}
export const profileStorageKey = (profile: ServerProfile): string => {
    if (!profile.scope) throw new Error("Backend credentials require an exact connection scope");
    return `sdc.backendHost.v1.${createHash("sha256").update(canonicalJson({ id: profile.id, origin: serverOrigin(profile.origin), scope: profile.scope })).digest("hex")}`;
};
const categories: Record<ControlCategory, AdapterOperation[]> = { prompts: ["submit", "stageAttachment"], questions: ["respondInput"], approvals: ["resolveApproval"], cancel: ["cancel"] };

/** Existing HTTP/SQLite bridge, parameterized by a qualified neutral adapter. */
export function createBackendServices(ui: ConnectUi, hostContext: BackendHostIdentity,
    rememberScope: (profile: ServerProfile) => Promise<void>, pendingBinding: (scope: string, value: { profile: ServerProfile; device: PairedDevice; binding: Binding } | undefined) => Promise<void>): BackendHostServices {
    return {
        async confirm(choice, profile, capabilities, signal) {
            const configured = await ui.profile(profile.id);
            if (!configured || serverOrigin(configured.origin) !== profile.origin) throw new Error("Server profile changed");
            const eligible = configured.categories.filter(category => capabilities.operations[categories[category][0]]?.status === "supported");
            const review = { ...configured, name: `${choice.backendId} · ${choice.label} · ${configured.name}`, categories: eligible };
            if (!await cancellable(ui.confirm(review, { ...hostContext, taskId: choice.selection.conversationId, toolInvocationId: `graphical:${choice.choiceId}` }, signal), signal)) return;
            return ["probe", "attach", "inspect", "subscribe", "detach", ...eligible.flatMap(category => categories[category].filter(op => capabilities.operations[op]?.status === "supported"))];
        },
        async start(input) {
            const { binding, context, adapter, capabilities } = input;
            const configured = await ui.profile(input.profile.id); context.assertAuthority();
            if (!configured || serverOrigin(configured.origin) !== input.profile.origin) throw new Error("Server profile changed");
            const profile: ServerProfile = { ...configured, name: `${input.choice.backendId} · ${input.choice.label} · ${configured.name}`, scope: input.scope,
                categories: (Object.keys(categories) as ControlCategory[]).filter(c => capabilities.operations[categories[c][0]]?.status === "supported") };
            await rememberScope(profile); context.assertAuthority();
            const device = await ui.pair(profile, { origin: { ...hostContext, taskId: input.choice.selection.conversationId, toolInvocationId: `graphical:${input.choice.choiceId}` }, signal: context.signal, assertCurrent: context.assertAuthority });
            context.assertAuthority();
            let store: BridgeStore | undefined, inbox: string | undefined, runtime: BridgeRuntime | undefined, recorded = false, closed: Promise<void> | undefined;
            const session: BackendHostSession = {
                disable() { runtime?.disable(); },
                close() {
                    closed ??= (async () => {
                        runtime?.disable(); await runtime?.stop();
                        const unresolved = store?.countUnresolvedAttempts(binding.sessionId) ?? 0;
                        store?.close();
                        if (recorded) {
                            await apiJson(profile, `/v2/devices/${encodeURIComponent(device.deviceId)}/bindings/${encodeURIComponent(binding.bindingId)}/detach`, {}, device.credential);
                            await pendingBinding(input.scope, undefined);
                        }
                        // Keep an inbox whose native outcome is uncertain; a failed detach above also keeps it.
                        if (store && inbox && !unresolved) await ui.removeInbox?.(inbox).catch(() => {});
                        ui.changed("disconnected");
                    })();
                    return closed;
                }
            };
            try {
                // Send optional registration fields only to a server that advertises them; older servers reject unknown fields.
                const features = await serverFeatures(profile, device.credential, context.signal); context.assertAuthority();
                if (binding.nativeScopeId !== undefined && !features.has("binding.nativeScope")) throw new Error("This server cannot refuse a second live binding of the native conversation; update the server before connecting this driver");
                const display = features.has("binding.display") ? ui.display?.(input.choice.label) : undefined;
                // Persist intent before registration: loss of its reply must not permit silent rebind.
                await pendingBinding(input.scope, { profile, device, binding }); recorded = true; context.assertAuthority();
                const receipt = await apiJson<{ binding: Binding; decisionPublicKey?: string; laneWatermarks?: { prompt: number; control: number } }>(profile, `/v2/devices/${encodeURIComponent(device.deviceId)}/bindings`,
                    { binding, conversationRevision: input.conversationRevision, capabilities, ...(display ? { display } : {}) }, device.credential, context.signal);
                context.assertAuthority();
                if (canonicalJson(receipt.binding) !== canonicalJson(binding)) throw new Error("Server returned a different binding");
                if (profile.categories.includes("approvals") && !receipt.decisionPublicKey) throw new Error("Server has no signed approval key");
                inbox = await ui.storePath(profile, device, binding); context.assertAuthority();
                store = new BridgeStore({ path: inbox, sessionId: binding.sessionId });
                store.initializeCursors(device.deviceId, receipt.laneWatermarks ?? { prompt: 0, control: 0 }); context.assertAuthority();
                const trustedFetch: typeof fetch = (url, init) => fetch(url, { ...init, redirect: "error" });
                runtime = new BridgeRuntime({ serverUrl: profile.origin, deviceId: device.deviceId, credential: device.credential, binding, adapter, store, fetch: trustedFetch,
                    ...(profile.categories.includes("approvals") && receipt.decisionPublicKey ? { approvalHandler: createApprovalDecisionHandler({ serverUrl: profile.origin, deviceId: device.deviceId, credential: device.credential, binding, adapter, store, publicKey: receipt.decisionPublicKey, fetch: trustedFetch }) } : {}),
                    onStateChange: state => ui.changed(state) });
                await runtime.start(); context.assertAuthority();
                if (runtime.state !== "online") throw new Error("Bridge handshake did not become online");
                return session;
            } catch (error) { await session.close(); throw error; }
        }
    };
}
