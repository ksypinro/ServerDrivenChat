import * as vscode from "vscode";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forgetProfileCredentials } from "./credentials.js";
import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:http";
import { acquireExclusiveLock } from "@server-driven-chat/bridge";
import { normalizeDisplayLabel } from "@server-driven-chat/protocol";
import type { BindingDisplay } from "@server-driven-chat/protocol";
import { apiJson, cancellable, profileStorageKey, serverOrigin } from "./connect.js";
import type { ControlCategory, ServerProfile, PairedDevice, ConnectUi } from "./connect.js";
import type { ConnectionRequest } from "./connect.js";

type AuthenticationRequest = Pick<ConnectionRequest, "assertCurrent" | "signal">;
interface UserTokens { accessToken: string; refreshToken?: string; expiresAt: string; userId: string }
const LOOPBACK_REDIRECT = "http://127.0.0.1:15945/callback";
// Shared with the Cline companion and every installation of this account, which use the same callback port.
const SIGN_IN_LOCK = join(tmpdir(), "sdc-oidc-callback-15945.lock");
/** Profiles are machine-scoped local consent, never workspace settings or model-provided URLs. */
export function createConnectUi(context: vscode.ExtensionContext, changed: ConnectUi["changed"], options: { signInLockPath?: string } = {}): {
    ui: ConnectUi; configure(): Promise<void>; rememberScope(profile: ServerProfile): Promise<void>; profiles(): string[]; forget(disconnect: (work: () => Promise<void>) => Promise<void>): Promise<void>; dispose(): void;
} {
    let auth: { state: string; resolve(tokens: UserTokens): void; reject(error: Error): void; profile: ServerProfile; request: AuthenticationRequest; cleanup(): void } | undefined;
    const signInLockPath = options.signInLockPath ?? SIGN_IN_LOCK;
    const notify = (message: string): void => { void Promise.resolve(vscode.window.showInformationMessage(message)).catch(() => {}); };
    /** One window at a time signs in or pairs; the others wait for the callback port. */
    const withSignInLock = async <T>(request: AuthenticationRequest, work: () => Promise<T>): Promise<T> => {
        const lock = await acquireExclusiveLock(signInLockPath, { signal: request.signal, timeoutMs: 330_000,
            onWait: () => notify("Sign-in or pairing is in progress in another VS Code window. This window continues when it finishes.") });
        try { request.assertCurrent(); return await work(); } finally { lock.release(); }
    };
    const profiles = (): ServerProfile[] => context.globalState.get<ServerProfile[]>("sdc.backendHost.serverProfiles.v1", []);
    const complete = async (state: string | null, code: string | null): Promise<boolean> => {
        const pending = auth; if (!pending || state !== pending.state || !code) return false;
        auth = undefined; pending.cleanup();
        try { pending.request.assertCurrent(); const tokens = await apiJson<UserTokens>(pending.profile, "/v2/auth/oidc/exchange", { state: pending.state, code }, undefined, pending.request.signal); pending.request.assertCurrent(); pending.resolve(tokens); }
        catch { pending.reject(new Error("Sign-in failed or originating task changed")); }
        return true;
    };
    const handler = vscode.window.registerUriHandler({ handleUri: async uri => {
        if (uri.path !== "/auth") return;
        const query = new URLSearchParams(uri.query); await complete(query.get("state"), query.get("code"));
    } });
    context.subscriptions.push(handler);
    context.globalState.setKeysForSync([]);
    /** Refresh or interactive sign-in. Call only while holding the sign-in lock. */
    const signInHoldingLock = async (profile: ServerProfile, request: AuthenticationRequest, force = false): Promise<UserTokens> => {
        const key = profileStorageKey(profile)+".user", prior = await context.secrets.get(key); request.assertCurrent();
        if (prior && !force) {
            const stored = JSON.parse(prior) as UserTokens;
            if (Date.parse(stored.expiresAt) > Date.now()+30000) return stored;
            if (stored.refreshToken) {
                const refreshed = await apiJson<UserTokens>(profile, "/v2/auth/oidc/refresh", { userId: stored.userId, refreshToken: stored.refreshToken }, undefined, request.signal); request.assertCurrent();
                refreshed.refreshToken ??= stored.refreshToken; await context.secrets.store(key, JSON.stringify(refreshed)); return refreshed;
            }
        }
        if (auth) throw new Error("Another sign-in is pending");
        // A fixed loopback callback keeps the authorization result in the extension host
        // that initiated sign-in. A vscode:// callback can be routed by macOS to a second
        // VS Code installation or window when the release is physically isolated.
        const redirectUri = vscode.Uri.parse(LOOPBACK_REDIRECT);
        const listener = createServer((incoming, response) => {
            const url = new URL(incoming.url ?? "/", LOOPBACK_REDIRECT);
            if (incoming.method !== "GET" || url.pathname !== "/callback") {
                response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }); response.end("Not found"); return;
            }
            const pending = auth;
            if (!pending || url.searchParams.get("state") !== pending.state || !url.searchParams.get("code")) {
                response.writeHead(400, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }); response.end("Invalid or expired sign-in callback"); return;
            }
            response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "connection": "close", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "referrer-policy": "no-referrer" });
            response.once("finish", () => { void complete(url.searchParams.get("state"), url.searchParams.get("code")); });
            response.end("<!doctype html><meta charset=utf-8><title>Server-Driven Chat connected</title><style>body{font:16px system-ui;margin:3rem;max-width:42rem}h1{font-size:1.5rem}</style><h1>Sign-in complete</h1><p>Return to the original VS Code window to finish device pairing.</p>");
        });
        await new Promise<void>((resolve, reject) => {
            const failed = (error: NodeJS.ErrnoException): void => reject(error.code === "EADDRINUSE" ? new Error("The sign-in callback port 15945 is in use. Finish or cancel the sign-in in the other window or app, then retry.") : error);
            listener.once("error", failed);
            listener.listen(15945, "127.0.0.1", () => { listener.off("error", failed); resolve(); });
        });
        let start: { state: string; authorizationUrl: string };
        try {
            request.assertCurrent();
            start = await apiJson(profile, "/v2/auth/oidc/start", { redirectUri: redirectUri.toString() }, undefined, request.signal);
            request.assertCurrent();
        } catch (error) {
            listener.close(); throw error;
        }
        const tokens = await new Promise<UserTokens>((resolve, reject) => {
            const cleanup = (): void => { listener.close(); };
            const stop = (): void => { request.signal.removeEventListener("abort", stop); cleanup(); if (auth?.state === start.state) auth = undefined; reject(new Error("Sign-in cancelled")); };
            request.signal.addEventListener("abort", stop, { once: true });
            auth = { state: start.state, profile, request, cleanup,
                resolve: value => { request.signal.removeEventListener("abort", stop); resolve(value); },
                reject: error => { request.signal.removeEventListener("abort", stop); reject(error); } };
            if (request.signal.aborted) { stop(); return; }
            void vscode.env.openExternal(vscode.Uri.parse(start.authorizationUrl)).then(opened => { if (!opened) stop(); },stop);
        });
        request.assertCurrent(); await context.secrets.store(key, JSON.stringify(tokens)); return tokens;
    };
    const pair = async (profile: ServerProfile, request: ConnectionRequest): Promise<PairedDevice> => {
        const key = profileStorageKey(profile)+".device";
        const saved = async (): Promise<PairedDevice | undefined> => {
            const stored = await context.secrets.get(key); request.assertCurrent();
            if (!stored) return undefined;
            const prior = JSON.parse(stored) as PairedDevice;
            return Date.parse(prior.expiresAt)>Date.now()+30000 ? prior : undefined;
        };
        const existing = await saved(); if (existing) return existing;
        return withSignInLock(request, async () => pairHoldingLock(profile, request, key, await saved()));
    };
    const pairHoldingLock = async (profile: ServerProfile, request: ConnectionRequest, key: string, paired: PairedDevice | undefined): Promise<PairedDevice> => {
        if (paired) return paired;
        const user = await signInHoldingLock(profile, request); request.assertCurrent();
        const localSecret = randomBytes(32).toString("base64url");
        const start = await apiJson<{ pairingId: string; pairingCode: string; deviceId: string; expiresAt: string }>(profile, "/v2/pairings", { label: `VS Code · ${profile.name}`, localConfirmationSecret: localSecret }, user.accessToken, request.signal);
        request.assertCurrent();
        const server = await cancellable(vscode.window.showInformationMessage(`Confirm server pairing code ${start.pairingCode} at ${profile.origin} as your signed-in account?`, { modal: true, detail: "This authenticated server confirmation does not enable local remote control. Local consent is required next." }, "Confirm on server"), request.signal);
        request.assertCurrent(); if (server !== "Confirm on server") throw new Error("Server confirmation declined");
        await apiJson(profile, `/v2/pairings/${encodeURIComponent(start.pairingId)}/confirm`, { pairingCode: start.pairingCode }, user.accessToken, request.signal); request.assertCurrent();
        const local = await cancellable(vscode.window.showInformationMessage(`Allow this paired device to control native conversation ${request.origin.taskId}?`, { modal: true, detail: `${profile.name} · ${profile.origin}\nAllowed controls: ${profile.categories.join(", ")}\nNative app and OS approvals still apply. Disable remote control stops new delivery locally.` }, "Allow this binding"), request.signal);
        request.assertCurrent(); if (local !== "Allow this binding") throw new Error("Local pairing consent declined");
        const issued = await apiJson<PairedDevice>(profile, `/v2/pairings/${encodeURIComponent(start.pairingId)}/local-confirm`, { localConfirmationSecret: localSecret, explicitConsent: true }, undefined, request.signal);
        request.assertCurrent(); await context.secrets.store(key, JSON.stringify(issued)); return issued;
    };
    const deviceHash = (profile: ServerProfile, device: PairedDevice): string => createHash("sha256").update(`${profileStorageKey(profile)}:${device.deviceId}`).digest("hex");
    const inboxDirectory = (profile: ServerProfile, device: PairedDevice): string => vscode.Uri.joinPath(context.globalStorageUri, "inboxes", deviceHash(profile, device)).fsPath;
    return {
        rememberScope: async profile => {
            const scopes = context.globalState.get<ServerProfile[]>("sdc.backendHost.scopes.v1", []);
            await context.globalState.update("sdc.backendHost.scopes.v1", [...scopes.filter(p => profileStorageKey(p) !== profileStorageKey(profile)), profile]);
        },
        profiles: () => profiles().map(profile => profile.id), dispose: () => { const pending = auth; auth = undefined; pending?.cleanup(); pending?.reject(new Error("Host closing")); },
        forget: async disconnect => {
            const scopes = context.globalState.get<ServerProfile[]>("sdc.backendHost.scopes.v1", []);
            const selected = await vscode.window.showQuickPick(scopes.map(profile => ({ label: profile.name, description: profile.origin, profile })), { title: "Select backend connection credentials to revoke", ignoreFocusOut: true });
            const profile = selected?.profile; if (!profile) return;
            const id = profile.name;
            const choice = await vscode.window.showWarningMessage(`Revoke and forget ${profile.name}?`, { modal: true, detail: `Server: ${profile.origin}\nRemote delivery will stop. This paired device is revoked on the server. Only this profile's saved sign-in/device credentials and local bridge inbox are removed. Server history, native conversations and other profiles remain. A new connection requires sign-in and fresh pairing consent.` }, "Revoke and forget");
            if (choice !== "Revoke and forget") return;
            await disconnect(async () => {
                const pending = auth; auth = undefined; pending?.cleanup(); pending?.reject(new Error("Credentials being removed"));
                const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 300000);
                try {
                    const request = { signal: abort.signal, assertCurrent: () => { if (abort.signal.aborted) throw new Error("Credential cleanup sign-in expired"); } };
                    await withSignInLock(request, () => forgetProfileCredentials(profile, context.secrets, async device => {
                        // A connection scope belongs to one window, so no other window shares these inboxes.
                        await rm(inboxDirectory(profile, device), { recursive: true, force: true });
                        const filename = `bridge-${deviceHash(profile, device)}.sqlite`;
                        for (const suffix of ["", "-wal", "-shm"]) await rm(vscode.Uri.joinPath(context.globalStorageUri, filename + suffix).fsPath, { force: true });
                    }, apiJson, async () => {
                        notify("Your saved sign-in has expired. Sign in again in the browser to revoke this device. Credentials stay saved until revocation succeeds.");
                        return signInHoldingLock(profile, request, true);
                    }, context.globalState.get<Array<{ scope: string; deviceId: string }>>("sdc.backendHost.pendingBindings.v1", []).find(item => item.scope === profile.scope)?.deviceId));
                } finally { clearTimeout(timer); abort.abort(); }

            });
            await context.globalState.update("sdc.backendHost.scopes.v1", scopes.filter(p => profileStorageKey(p) !== profileStorageKey(profile)));
            void vscode.window.showInformationMessage(`Profile ${id}: device revoked, saved credentials and local bridge inbox removed. Connect again to sign in and pair.`);
        },
        configure: async () => {
            const id = await vscode.window.showInputBox({ title: "Configured server profile ID", prompt: "A local name, e.g. team-staging. Model tool calls can select only this ID.", value: "default", ignoreFocusOut: true, validateInput: value => /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? undefined : "Use 1–64 letters, numbers, underscores or hyphens" });
            if (!id) return;
            const existing = profiles().find(profile => profile.id===id);
            const origin = await vscode.window.showInputBox({ title: "Server origin", prompt: "HTTPS server origin; loopback HTTP is allowed for development", value: existing?.origin ?? "https://", ignoreFocusOut: true, validateInput: value => { try { serverOrigin(value); return undefined; } catch { return "Enter an HTTPS origin without path, query, fragment or credentials"; } } });
            if (!origin) return;
            const categories = await vscode.window.showQuickPick((["prompts", "questions", "approvals", "cancel"] as ControlCategory[]).map(category => ({ label: category, picked: existing?.categories.includes(category) ?? category!=="approvals" })), { title: "Allowed controls for this server profile", canPickMany: true, ignoreFocusOut: true });
            if (!categories?.length) return;
            const profile: ServerProfile = { id, name: id, origin: serverOrigin(origin), categories: categories.map(item => item.label) };
            await context.globalState.update("sdc.backendHost.serverProfiles.v1", [...profiles().filter(item=>item.id!==id),profile]);
            void vscode.window.showInformationMessage(`Profile ${id} saved locally. Existing bindings keep their reviewed profile. Sign-in callback: ${LOOPBACK_REDIRECT}`);
        },
        ui: { profile: async id => { const profile = profiles().find(item=>item.id===id); return profile ? structuredClone(profile) : undefined; }, pair,
            confirm: async (profile, origin, signal) => { if (signal.aborted) return false; const choice = await vscode.window.showInformationMessage(`Connect ${profile.name} to this exact native conversation?`, { modal: true, detail: `Server: ${profile.origin}\nTask: ${origin.taskId}\nWorkspace: ${origin.workspaceId}\nHost: ${origin.hostId}\nControls: ${profile.categories.join(", ")}\nListener continues after the model turn. Native permissions remain in force.` }, "Connect this task"); return !signal.aborted && choice==="Connect this task"; },
            display: title => {
                const labels: BindingDisplay = {};
                const workspaceLabel = vscode.workspace.name ? normalizeDisplayLabel(vscode.workspace.name) : undefined;
                const conversationLabel = title ? normalizeDisplayLabel(title) : undefined;
                if (workspaceLabel) labels.workspaceLabel = workspaceLabel;
                if (conversationLabel) labels.conversationLabel = conversationLabel;
                return Object.keys(labels).length ? labels : undefined;
            },
            storePath: async (profile, device, binding) => {
                if (!binding) { await vscode.workspace.fs.createDirectory(context.globalStorageUri); return vscode.Uri.joinPath(context.globalStorageUri,`bridge-${deviceHash(profile, device)}.sqlite`).fsPath; }
                const directory = inboxDirectory(profile, device); await mkdir(directory, { recursive: true });
                return join(directory, `binding-${createHash("sha256").update(binding.sessionId).digest("hex")}.sqlite`);
            },
            removeInbox: async path => { for (const suffix of ["", "-wal", "-shm"]) await rm(path + suffix, { force: true }); }, changed }
    };
}
