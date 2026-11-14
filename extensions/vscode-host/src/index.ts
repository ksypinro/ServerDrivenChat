import * as vscode from "vscode";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { BackendHost, BackendRegistry } from "@server-driven-chat/adapter-core";
import { canonicalJson } from "@server-driven-chat/protocol";
import type { Binding } from "@server-driven-chat/protocol";
import { createConnectUi } from "./connect-ui.js";
import { apiJson, createBackendServices, profileStorageKey } from "./connect.js";
import type { PairedDevice, ServerProfile } from "./connect.js";
import { reviewedBackendCatalog } from "./catalog.js";
import { createInstalledLoaderPorts } from "./installed-loader.js";
import { loadEvaluationBackend, loadReviewedBackend } from "./loader.js";

import { verifyBackendEnvelope } from "./envelope.js";
import type { BackendEnvelopePayload } from "./envelope.js";
import { evaluationKeys } from "./trusted-keys.js";
import { measureMacEditor } from "./runtime.js";
import { holdHostLiveness, isHostAlive, pruneHostLocks, recoverableRecords } from "./recovery.js";

interface PendingBinding { scope: string; profile: ServerProfile; binding: Binding; deviceId: string; hostId?: string }
const pendingKey = "sdc.backendHost.pendingBindings.v1";
let activeHost: BackendHost | undefined;

/** Experimental host. The native qualification catalog is empty until MB-04 onward passes. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    context.globalState.setKeysForSync([]);
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 19);
    status.text = "$(plug) SDC backends: disconnected"; status.command = "sdcBackend.status"; status.show();
    context.subscriptions.push(status);
    const registry = new BackendRegistry();
    let maintenance = false;
    let evaluation: BackendEnvelopePayload | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const loader = createInstalledLoaderPorts({
        platform: `${process.platform}-${process.arch}`,
        runtime: () => measureMacEditor(vscode.env.appRoot, vscode.version),
        extension(id) {
            const installed = vscode.extensions.getExtension<unknown>(id);
            return installed && { id: installed.id, directory: installed.extensionUri.fsPath, activate: async () => installed.activate() };
        }
    });
    // A dependency install/update invalidates all existing authority immediately. Reload
    // and remeasure instead of hot-swapping a driver underneath a live binding.
    let installationChanged = false;
    const ui = createConnectUi(context, state => { status.text = `$(plug) SDC ${evaluation ? "UNQUALIFIED EVALUATION" : "backends"}: ${state}`; });
    context.subscriptions.push({ dispose: ui.dispose });
    const hostContext = {
        installationId: `sdc-host:${createHash("sha256").update(`${vscode.env.machineId}:${context.globalStorageUri.toString()}`).digest("hex")}`,
        hostId: `extension-host:${randomUUID()}`, windowId: `vscode-session:${vscode.env.sessionId}`,
        workspaceId: `workspace:${createHash("sha256").update(JSON.stringify((vscode.workspace.workspaceFolders ?? []).map(f => f.uri.toString()).sort())).digest("hex")}`
    };
    const pending = (): PendingBinding[] => context.globalState.get<PendingBinding[]>(pendingKey, []);
    // Global state is shared by every window: another live window's binding is never this window's to recover.
    const hostLocks = join(context.globalStorageUri.fsPath, "hosts");
    pruneHostLocks(hostLocks, pending().flatMap(item => item.hostId ? [item.hostId] : []));
    const liveness = await holdHostLiveness(hostLocks, hostContext.hostId);
    context.subscriptions.push({ dispose: () => liveness.release() });
    const recoverable = (): PendingBinding[] => recoverableRecords(pending(), hostContext.hostId, hostId => isHostAlive(hostLocks, hostId));
    const services = createBackendServices(ui.ui, hostContext, ui.rememberScope, async (scope, value) => {
        const entries = pending().filter(item => item.scope !== scope);
        // Keep credentials exclusively in SecretStorage. Recovery metadata contains only IDs.
        if (value) entries.push({ scope, profile: value.profile, binding: value.binding, deviceId: value.device.deviceId, hostId: hostContext.hostId });
        await context.globalState.update(pendingKey, entries);
    });
    let host = new BackendHost(registry, hostContext, services); activeHost = host;
    context.subscriptions.push(vscode.extensions.onDidChange(() => {
        installationChanged = true;
        host.invalidate("Installed extensions changed; reload to reverify backend artifacts");
    }));
    if (vscode.workspace.isTrusted && !vscode.env.remoteName) {
        for (const entry of reviewedBackendCatalog) {
            try {
                await loadReviewedBackend(registry, entry, loader);
                if (installationChanged) await registry.remove(entry.qualification.descriptor.backendId);
            } catch (error) {
                void vscode.window.showErrorMessage(`Backend unavailable: ${error instanceof Error ? error.message : "artifact verification failed"}`);
            }
        }
    }
    const run = (operation: () => Promise<void>): (() => Promise<void>) => async () => {
        try { await operation(); } catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : "Backend operation failed"); }
    };
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => host.invalidate("Workspace changed; reload the host before selecting again")));
    context.subscriptions.push({ dispose: () => { if (expiryTimer) clearTimeout(expiryTimer); } });
    context.subscriptions.push(vscode.commands.registerCommand("sdcBackend.evaluate", run(async () => {
        if (maintenance || evaluation || host.state !== "disconnected" || recoverable().length || registry.list().length) throw new Error("Reload a disconnected host with no retained bindings before evaluation");
        if (!vscode.workspace.isTrusted || vscode.env.remoteName || installationChanged) throw new Error("Evaluation requires a trusted, unchanged local editor");
        maintenance = true;
        try {
            const selected = await vscode.window.showOpenDialog({ title: "Select signed MB-04 evaluation manifest", canSelectMany: false, filters: { JSON: ["json"] } });
            if (!selected?.[0]) return;
            const plan = verifyBackendEnvelope(await readFile(selected[0].fsPath, "utf8"), evaluationKeys);
            if (plan.purpose !== "evaluation") throw new Error("This key and command admit evaluation plans only, not production qualification");
            const artifacts = plan.registration.qualification.inventory.artifacts;
            if (!artifacts.some(a => a.role === "host" && a.id === context.extension.id)) throw new Error("Evaluation does not pin this host");
            const answer = await vscode.window.showWarningMessage(`UNQUALIFIED EVALUATION: ${plan.registration.qualification.descriptor.displayName}. Server ${plan.serverOrigin}. Expires ${plan.expiresAt}. Loading verifies and activates the reviewed driver; task selection and control consent follow separately.`, { modal: true }, "Load evaluation driver");
            if (answer !== "Load evaluation driver") return;
            await loadEvaluationBackend(registry, plan.registration, loader);
            if (installationChanged || Date.now() >= Date.parse(plan.expiresAt)) {
                await registry.remove(plan.registration.qualification.descriptor.backendId);
                throw new Error("Evaluation expired or installation changed during verification");
            }
            await host.dispose();
            evaluation = plan;
            host = new BackendHost(registry, { ...hostContext, installationId: `${hostContext.installationId}:evaluation:${plan.registration.qualification.qualificationId}` }, services, "evaluation", Date.parse(plan.expiresAt));
            activeHost = host;
            expiryTimer = setTimeout(() => host.invalidate("Evaluation manifest expired"), Date.parse(plan.expiresAt) - Date.now());
            status.text = "$(beaker) SDC UNQUALIFIED EVALUATION: select conversation";
        } finally { maintenance = false; }
    })));
    context.subscriptions.push(vscode.commands.registerCommand("sdcBackend.configure", run(ui.configure)));
    context.subscriptions.push(vscode.commands.registerCommand("sdcBackend.connect", run(async () => {
        if (maintenance) throw new Error("Credential cleanup is in progress");
        if (installationChanged) throw new Error("Installed extensions changed; reload before connecting");
        if (!vscode.workspace.isTrusted) throw new Error("Trust the selected workspace before connecting a backend");
        if (vscode.env.remoteName) throw new Error("This host supports local VS Code only");
        if (recoverable().length) throw new Error("An earlier binding needs recovery. Use Connection Status to detach it before reconnecting.");
        const available = registry.list();
        if (!available.length) {
            void vscode.window.showInformationMessage("No native drivers are qualified in this experimental build. Cline still uses the accepted companion; Claude and Codex require supported attachment routes. See task.md for current gates."); return;
        }
        const selected = await vscode.window.showQuickPick(available.map(d => ({ label: d.displayName, description: d.driverVersion, backendId: d.backendId })), { title: "Select native backend", ignoreFocusOut: true });
        if (!selected) return;
        const choices = await host.discover(selected.backendId, new AbortController().signal);
        const choice = await vscode.window.showQuickPick(choices.map(c => ({ label: c.label, description: c.selection.conversationId, choiceId: c.choiceId })), { title: "Select existing native conversation", ignoreFocusOut: true });
        if (!choice) return;
        const id = await vscode.window.showQuickPick(ui.profiles(), { title: "Select configured server", ignoreFocusOut: true });
        const profile = id && await ui.ui.profile(id); if (!profile) return;
        if (evaluation) {
            if (profile.origin !== evaluation.serverOrigin) throw new Error("Evaluation is restricted to its signed server origin");
            if (Date.now() >= Date.parse(evaluation.expiresAt)) throw new Error("Evaluation expired");
            const measured = await loader.measure(evaluation.registration);
            if (canonicalJson(measured) !== canonicalJson(evaluation.registration.qualification.inventory)) throw new Error("Evaluation installation changed since loading");
            const answer = await vscode.window.showWarningMessage(`UNQUALIFIED EVALUATION of ${choice.label} at ${profile.origin}. Native control consent is still required. Continue?`, { modal: true }, "Review native consent");
            if (answer !== "Review native consent") return;
        }
        await host.connect(choice.choiceId, { id: profile.id, origin: profile.origin });
    })));
    context.subscriptions.push(vscode.commands.registerCommand("sdcBackend.disconnect", run(async () => { await host.disconnect(); status.text = `$(plug) SDC ${evaluation ? "UNQUALIFIED EVALUATION" : "backends"}: ${host.state}`; })));
    context.subscriptions.push(vscode.commands.registerCommand("sdcBackend.status", run(async () => {
        const retained = recoverable(), elsewhere = pending().length - retained.length;
        const action = await vscode.window.showInformationMessage(`Backend host${evaluation ? " (UNQUALIFIED EVALUATION)" : ""}: ${host.state}. ${retained.length} retained binding record(s)${elsewhere ? `; ${elsewhere} held by other open windows` : ""}. ${host.failure ?? ""}`, ...(retained.length && host.state === "disconnected" ? ["Detach retained bindings"] : []));
        if (action !== "Detach retained bindings" || maintenance) return;
        maintenance = true;
        try {
            for (const item of retained) {
                const raw = await context.secrets.get(profileStorageKey(item.profile) + ".device");
                if (!raw) throw new Error("Saved device credential is unavailable; use Revoke and Forget Connection Credentials to retire this scope");
                const device = JSON.parse(raw) as PairedDevice;
                if (device.deviceId !== item.deviceId) throw new Error("Retained device identity changed; reconcile before reconnecting");
                await apiJson(item.profile, `/v2/devices/${encodeURIComponent(item.deviceId)}/bindings/${encodeURIComponent(item.binding.bindingId)}/detach`, {}, device.credential);
                await context.globalState.update(pendingKey, pending().filter(p => p.scope !== item.scope));
            }
        } finally { maintenance = false; }
    })));
    context.subscriptions.push(vscode.commands.registerCommand("sdcBackend.forget", run(async () => {
        if (maintenance) throw new Error("Another maintenance operation is pending");
        if (host.state === "connecting") { await host.disconnect(); throw new Error("Connection cancelled. Retry cleanup after its pending operation finishes."); }
        maintenance = true;
        try {
            const before = context.globalState.get<ServerProfile[]>("sdc.backendHost.scopes.v1", []);
            await ui.forget(async work => { await host.disconnect(); await work(); });
            const scopes = context.globalState.get<ServerProfile[]>("sdc.backendHost.scopes.v1", []);
            const retired = before.filter(p => !scopes.some(after => after.scope === p.scope));
            await context.globalState.update(pendingKey, pending().filter(item => !retired.some(p => p.scope === item.scope)));
        } finally { maintenance = false; }
    })));
}

export async function deactivate(): Promise<void> { await activeHost?.dispose(); activeHost = undefined; }
