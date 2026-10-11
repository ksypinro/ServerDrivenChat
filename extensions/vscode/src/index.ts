import * as vscode from "vscode";
import { readFile } from "node:fs/promises";
import { assertReviewedClinePin } from "./pin.js";
import { createHash, randomUUID } from "node:crypto";
import { ClineAppAdapter } from "@server-driven-chat/adapter-cline";
import type { NativeBridgeApi } from "@server-driven-chat/adapter-cline";
import type { AdapterMutationContext, ApprovalRequest, Binding, ProtocolCommand, ProtocolEvent } from "@server-driven-chat/protocol";
import { ConnectCapture } from "./connect-capture.js";
import { ConnectManager } from "./connect.js";
import { createConnectUi, graphicalConnect } from "./connect-ui.js";

let active: { adapter: ClineAppAdapter; binding: Binding } | undefined;
let status: vscode.StatusBarItem | undefined;
let probeAbort: AbortController | undefined;
let connectManager: ConnectManager | undefined;
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error);

async function disconnect(): Promise<void> {
    probeAbort?.abort();
    await connectManager?.disconnect();
    if (active) await active.adapter.detach(active.binding);
    active = undefined;
    if (status) { status.text = "$(plug) Cline bridge: disconnected"; status.tooltip = "Select an existing Cline task"; }
}

export async function activate(context: vscode.ExtensionContext): Promise<{ getAdapter(): typeof active }> {
    status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
    status.command = "sdcCline.selectTask"; status.text = "$(plug) Cline bridge: disconnected"; status.show();
    context.subscriptions.push(status);
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => { void disconnect(); }));
    const capture = new ConnectCapture(context);
    context.subscriptions.push({ dispose: () => capture.dispose() });
    const connectUi = createConnectUi(context, (state, target) => {
        capture.state(state, target);
        active = target;
        if (status) {
            status.text = `$(plug) Cline bridge: ${state}`;
            status.tooltip = target ? `Task ${target.binding.nativeConversationId}; native app permissions still apply` : "Configure a server and connect the current task";
            status.command = "sdcCline.connectionStatus";
        }
    });
    context.subscriptions.push({ dispose: connectUi.dispose });
    context.subscriptions.push(vscode.commands.registerCommand("sdcCline.configureServer", connectUi.configure));
    context.subscriptions.push(vscode.commands.registerCommand("sdcCline.forgetCredentials", async () => {
        try {
            await connectUi.forget(async work => {
                if (connectManager) await connectManager.withDisconnected(work);
                else { await disconnect(); await work(); }
            });
        } catch (error) { void vscode.window.showErrorMessage(errorText(error)); }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("sdcCline.connectionStatus", () => {
        void vscode.window.showInformationMessage(`Cline bridge: ${connectManager?.state ?? "disconnected"}${active ? ` · task ${active.binding.nativeConversationId}` : ""}`, "Disconnect", "Configure server").then(choice => {
            if (choice === "Disconnect") void disconnect();
            if (choice === "Configure server") void connectUi.configure();
        });
    }));
    try {
        const cline = vscode.extensions.getExtension<{ serverDrivenChat?: NativeBridgeApi }>("saoudrizwan.claude-dev");
        if (cline && [3, 4].includes(cline.packageJSON.sdcPatch?.revision)) {
            await verifyNativePin(cline);
            const api = (await cline.activate()).serverDrivenChat;
            if (!api?.connect || !["1.2", "1.3"].includes(api.apiVersion)) throw new Error("Requires the exact app-owned API 1.2 or M30 candidate API 1.3");
            connectManager = new ConnectManager(api, connectUi.ui);
            context.subscriptions.push({ dispose: api.connect.register(request => capture.tool(request, () => connectManager!.handle(request)), connectUi.profiles) });
            context.subscriptions.push(vscode.commands.registerCommand("sdcCline.m21CaptureStart", async () => {
                try { await capture.start(api); void vscode.window.showInformationMessage("M21 recording started. Configure a server, then type the initial Connect prompt in this disposable Cline task."); } catch (error) { void vscode.window.showErrorMessage(errorText(error)); }
            }));
            context.subscriptions.push(vscode.commands.registerCommand("sdcCline.m21CaptureFinish", async () => {
                try { await capture.finish(); void vscode.window.showInformationMessage("M21 capture saved; validate it independently before claiming acceptance."); } catch (error) { void vscode.window.showErrorMessage(errorText(error)); }
            }));
            for (const milestone of ["M22", "M23"] as const) {
                context.subscriptions.push(vscode.commands.registerCommand(`sdcCline.${milestone.toLowerCase()}CaptureStart`, async () => {
                    try { await capture.start(api, milestone); void vscode.window.showInformationMessage(`${milestone} recording started for this disposable task.`); } catch (error) { void vscode.window.showErrorMessage(errorText(error)); }
                }));
                context.subscriptions.push(vscode.commands.registerCommand(`sdcCline.${milestone.toLowerCase()}CaptureFinish`, async () => {
                    try { await capture.finish(); void vscode.window.showInformationMessage(`${milestone} capture saved; independent validation is required.`); } catch (error) { void vscode.window.showErrorMessage(errorText(error)); }
                }));
            }
            context.subscriptions.push(vscode.commands.registerCommand("sdcCline.connectServer", async () => {
                if (active && !connectManager?.current) await disconnect();
                await graphicalConnect(api, connectManager!, connectUi.profiles());
            }));
        }
    } catch (error) { void vscode.window.showErrorMessage(`Connect unavailable: ${errorText(error)}`); }
    context.subscriptions.push(vscode.commands.registerCommand("sdcCline.selectTask", async () => {
        try {
            if (vscode.env.remoteName) throw new Error("This M19 package supports local VS Code only. Remote hosts require separate validation.");
            const cline = vscode.extensions.getExtension<{ serverDrivenChat?: NativeBridgeApi }>("saoudrizwan.claude-dev");
            if (!cline || cline.packageJSON.sdcPatch?.baseVersion !== "4.1.22" || ![2, 3, 4].includes(cline.packageJSON.sdcPatch?.revision)) throw new Error("Requires an exact Cline 4.1.22 API patch");
            await verifyNativePin(cline);
            const api = (await cline.activate()).serverDrivenChat;
            if (!api) throw new Error("Stock Cline lacks the required task-bound API. Install the reviewed Cline patch package first.");
            await disconnect();
            const adapter = new ClineAppAdapter(api, { onInvalidated: detail => {
                if (status) { status.text = "$(warning) Cline bridge: select again"; status.tooltip = detail; }
            } });
            const selection = adapter.selection();
            if (!selection) throw new Error("Open an existing task in Cline before selecting it here");
            const picked = await vscode.window.showQuickPick([{ label: `Cline task ${selection.conversationId}`, description: "Current native sidebar task", detail: `Workspace ${selection.workspaceId} · ${selection.appInstanceId}`, selection }],
                { title: "Select the existing Cline task for the bridge", ignoreFocusOut: true });
            if (!picked) return;
            const result = await adapter.attach(picked.selection);
            if (result.outcome !== "accepted" || !result.value) throw new Error("reason" in result ? result.reason : "No binding returned");
            active = { adapter, binding: result.value };
            status!.text = `$(plug) Cline bridge: ${selection.conversationId.slice(0, 12)}`;
            status!.tooltip = "Exact existing task selected. Server pairing/Connect is M21. Native request controls are available; persistent/narrowed grants are unsupported.";
        } catch (error) { void vscode.window.showErrorMessage(errorText(error)); }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("sdcCline.disconnect", disconnect));
    context.subscriptions.push(vscode.commands.registerCommand("sdcCline.inspect", async () => {
        if (!active) { void vscode.window.showInformationMessage("Select an existing Cline task first"); return; }
        try {
            const snapshot = active.adapter.nativeSnapshot(active.binding);
            void vscode.window.showInformationMessage(`Cline task ${snapshot.context.taskId}: ${snapshot.phase}; conversation revision ${snapshot.conversationRevision}; ${snapshot.ready ? "ready" : "input unavailable"}`);
        } catch (error) { await disconnect(); void vscode.window.showErrorMessage(errorText(error)); }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("sdcCline.reviewRequest", async () => {
        const target = active; if (!target || probeAbort) return;
        try {
            const snapshot = await target.adapter.inspect(target.binding);
            if (snapshot.outcome !== "accepted" || !snapshot.value) throw new Error("Pending requests unavailable; inspect binding again");
            const request = snapshot.value.pendingApprovals[0];
            if (!request) { void vscode.window.showInformationMessage("No native approval is pending"); return; }
            const document = await vscode.workspace.openTextDocument({ content: JSON.stringify(request, null, 2), language: "json" });
            await vscode.window.showTextDocument(document, { preview: true });
            const choice = await vscode.window.showQuickPick(request.availableDecisions.map(value => ({ label: value.id === "allow_once" ? "Allow this whole action once" : "Deny this action", detail: `${request.action.tool} · request ${request.requestId} revision ${request.requestRevision}`, choice: value.id })),
                { title: "Review the complete native action shown in the editor", ignoreFocusOut: true });
            if (!choice || active !== target) return;
            const result = await target.adapter.resolveApproval(target.binding, request, { decisionId: randomUUID(), requestId: request.requestId, requestRevision: request.requestRevision, actionDigest: request.actionDigest, choiceId: choice.choice, grantedPermissions: [] }, localAuthority(target));
            void vscode.window.showInformationMessage("reason" in result ? result.reason : result.evidence);
        } catch (error) { void vscode.window.showErrorMessage(errorText(error)); }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("sdcCline.answerQuestion", async () => {
        const target = active; if (!target || probeAbort) return;
        try {
            const snapshot = await target.adapter.inspect(target.binding);
            const request = snapshot.outcome === "accepted" ? snapshot.value?.pendingInputs[0] : undefined;
            if (!request) { void vscode.window.showInformationMessage("No native question is pending"); return; }
            const answer = await vscode.window.showInputBox({ title: request.question, prompt: `Native question ${request.requestId}; free text answer`, ignoreFocusOut: true });
            if (!answer || active !== target) return;
            const result = await target.adapter.respondInput(target.binding, request.requestId, request.requestRevision, answer, localAuthority(target));
            void vscode.window.showInformationMessage("reason" in result ? result.reason : result.evidence);
        } catch (error) { void vscode.window.showErrorMessage(errorText(error)); }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("sdcCline.cancelTurn", async () => {
        const target = active; if (!target || probeAbort) return;
        try {
            const turn = target.adapter.activeTurnId(target.binding); if (!turn) throw new Error("No addressed active native turn");
            const result = await target.adapter.cancel(target.binding, turn, localAuthority(target));
            void vscode.window.showInformationMessage("reason" in result ? result.reason : result.evidence);
        } catch (error) { void vscode.window.showErrorMessage(errorText(error)); }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("sdcCline.m20Probe", async () => {
        if (!active || probeAbort) { void vscode.window.showErrorMessage("Select an idle disposable Cline task first"); return; }
        const target = active, folder = vscode.workspace.workspaceFolders?.[0];
        if (folder?.uri.fsPath !== "/private/tmp/sdc-m19-vscode-probe") { void vscode.window.showErrorMessage("M20 probe is restricted to /private/tmp/sdc-m19-vscode-probe"); return; }
        probeAbort = new AbortController();
        try {
            await runM20Probe(target.adapter, target.binding, probeAbort.signal, folder.uri);
            void vscode.window.showInformationMessage("M20 native controls acceptance passed; m20-live-evidence.json saved");
        } catch (error) { void vscode.window.showErrorMessage(`M20 acceptance incomplete: ${errorText(error)}`); }
        finally { probeAbort = undefined; }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("sdcCline.m19Probe", async () => {
        if (!active || probeAbort) { void vscode.window.showErrorMessage("Select an idle disposable Cline task first; a probe may already be running"); return; }
        const target = active;
        // Explicit graphical action authorizes these two harmless turns in the selected task.
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) { void vscode.window.showErrorMessage("A workspace is required to save the bounded probe evidence"); return; }
        const mode = await vscode.window.showQuickPick([
            { label: "Text and PNG", withImage: true, detail: "Two turns; first includes a PNG. Requires a native image-capable model." },
            { label: "Text only", withImage: false, detail: "Two continuity turns. Image acceptance remains unverified." }
        ], { title: "M19 disposable task probe", ignoreFocusOut: true });
        if (!mode || probeAbort || active !== target) return;
        probeAbort = new AbortController();
        try {
            const trace = await runM19Probe(target.adapter, target.binding, probeAbort.signal, mode.withImage);
            const path = vscode.Uri.joinPath(folder.uri, "m19-live-evidence.json");
            await vscode.workspace.fs.writeFile(path, Buffer.from(JSON.stringify(trace, null, 2) + "\n"));
            void vscode.window.showInformationMessage(`M19 two-message probe passed. Evidence saved to ${path.fsPath}`);
        } catch (error) { void vscode.window.showErrorMessage(`M19 probe incomplete: ${errorText(error)}`); }
        finally { probeAbort = undefined; }
    }));
    // Host teardown always detaches; a host reload never silently reuses a persisted native token.
    context.subscriptions.push({ dispose: () => { void disconnect(); } });
    return { getAdapter: () => active };
}

function localAuthority(target: NonNullable<typeof active>): AdapterMutationContext {
    return { signal: new AbortController().signal, assertAuthority() { if (active !== target) throw new Error("Binding changed during native control review"); } };
}

export async function deactivate(): Promise<void> { await disconnect(); }

/** Bounded developer acceptance probe, using the real adapter in the visible existing task. */
export async function runM19Probe(adapter: ClineAppAdapter, binding: Binding, parentSignal: AbortSignal, withImage = true): Promise<object> {
    const marker = `M19-${randomUUID().slice(0, 8)}`;
    const trace: ProtocolEvent[] = [];
    const abort = new AbortController();
    const cancel = (): void => abort.abort(); parentSignal.addEventListener("abort", cancel, { once: true });
    if (parentSignal.aborted) abort.abort();
    const timer = setTimeout(cancel, 120000);
    const stream = (async () => { for await (const event of adapter.subscribe(binding, [], { signal: abort.signal })) trace.push(event); })();
    const authority: AdapterMutationContext = { signal: abort.signal, assertAuthority: () => { if (abort.signal.aborted) throw new Error("Bounded probe permit expired or was cancelled"); } };
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeklEQVR4nO3PUQkAIBTAwBfNqEYziiH8OITBAtxm7fN1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWPHYBxnMBpXoCA1sAAAAASUVORK5CYII=", "base64");
    const image = { attachmentId: randomUUID(), mimeType: "image/png", sizeBytes: png.byteLength, sha256: `sha256:${createHash("sha256").update(png).digest("hex")}` };
    const results: object[] = [];
    try {
        const initial = adapter.nativeSnapshot(binding);
        const isolation = [];
        const nativeApi = vscode.extensions.getExtension<{ serverDrivenChat?: NativeBridgeApi }>("saoudrizwan.claude-dev")?.exports.serverDrivenChat;
        if (!nativeApi) throw new Error("Native public API disappeared during acceptance");
        for (const changes of [{ appInstanceId: "m19-foreign-window" }, { conversationId: "m19-foreign-task" }]) {
            // Native bind is never reached for a mismatched explicit selection.
            const foreignAdapter = new ClineAppAdapter(nativeApi);
            const selection = foreignAdapter.selection()!;
            const rejected = await foreignAdapter.attach({ ...selection, ...changes });
            if (rejected.outcome !== "rejected") throw new Error("Foreign host/task selection was not rejected");
            isolation.push({ changes, outcome: rejected });
        }
        if (adapter.nativeSnapshot(binding).conversationRevision !== initial.conversationRevision) throw new Error("Isolation checks changed the selected native transcript");
        const staged = withImage ? await adapter.stageAttachment(binding, image, png, authority) : undefined;
        if (withImage && staged?.outcome !== "applied") throw new Error("Image staging did not apply");
        for (const [index, prompt] of [
            `Remember this marker in this task: ${marker}. Reply only FIRST-OK.${withImage ? " The PNG is an attachment test;" : ""} No tools, shell, network, or file operations.`,
            "What marker did I ask you to remember in the previous message? Reply with that marker followed by CONTINUITY-OK. Do not use tools."
        ].entries()) {
            const before = adapter.nativeSnapshot(binding);
            const turnId = randomUUID();
            const command: ProtocolCommand<"turn.submit"> = { protocolVersion: "2.0", type: "turn.submit", commandId: randomUUID(), lane: "prompt", seq: index + 1,
                sessionId: binding.sessionId, bindingRevision: binding.bindingRevision, leaseGeneration: binding.leaseGeneration, turnId, promptId: randomUUID(), createdAt: new Date().toISOString(),
                payload: { content: [{ type: "text", text: prompt }, ...(withImage && index === 0 ? [{ type: "image" as const, attachmentId: image.attachmentId, mimeType: image.mimeType }] : [])], delivery: "immediate", expectedConversationRevision: before.conversationRevision } };
            const outcome = await adapter.submit(binding, command, authority);
            if (outcome.outcome !== "accepted") throw new Error("reason" in outcome ? outcome.reason : "No native acceptance");
            // Each short wait is interruptible; completion requires a native terminal event.
            while (!abort.signal.aborted && !trace.some(event => event.type === "turn.completed" && event.payload.turnId === turnId)) {
                if (trace.some(event => event.type === "turn.failed" && event.payload.turnId === turnId)) throw new Error("Cline reported a native turn failure");
                await new Promise<void>(resolve => setTimeout(resolve, 100));
            }
            if (abort.signal.aborted) throw new Error("Timed out waiting for native terminal/output evidence");
            const output = trace.filter(event => (event.type === "output.item.created" || event.type === "output.item.replaced") && event.payload.turnId === turnId && event.payload.kind === "assistant_message")
                .map(event => "content" in event.payload ? event.payload.content.filter(block => block.type === "text").map(block => block.text).join("\n") : "").join("\n");
            if (!(index === 0 ? output.includes("FIRST-OK") : output.includes(marker) && output.includes("CONTINUITY-OK"))) throw new Error("Native output did not satisfy the bounded prompt");
            const echoedItem = trace.find(event => event.type === "output.item.created" && event.payload.turnId === turnId && event.payload.kind === "user_message");
            const echoId = echoedItem && "itemId" in echoedItem.payload ? echoedItem.payload.itemId.slice(binding.bindingId.length + 1) : undefined;
            const nativeEcho = adapter.nativeSnapshot(binding).messages.find(message => message.id === echoId);
            if (!nativeEcho || nativeEcho.text !== prompt || JSON.stringify(nativeEcho.imageChecksums ?? []) !== JSON.stringify(withImage && index === 0 ? [image.sha256] : []))
                throw new Error("Saved evidence lacks an exact native input/image echo");
            results.push({ command, outcome, output, nativeEcho });
        }
        const relevantTurnIds = new Set(results.map(result => (result as { command: ProtocolCommand<"turn.submit"> }).command.turnId));
        return { milestone: "M19", host: "vscode", clineVersion: "4.1.22+sdc-m19.1", observedAt: new Date().toISOString(), binding, marker,
            isolation, imageAcceptance: withImage ? "native echo and image checksums confirmed" : "not tested", stagingReceipt: staged, results,
            trace: trace.filter(event => "turnId" in event.payload && relevantTurnIds.has(event.payload.turnId as string)) };
    } finally { clearTimeout(timer); abort.abort(); parentSignal.removeEventListener("abort", cancel); await stream.catch(() => {}); }
}

/** Real-host acceptance only; no model/provider runtime is supplied by this extension. */
export async function runM20Probe(adapter: ClineAppAdapter, binding: Binding, parentSignal: AbortSignal, folder: vscode.Uri): Promise<void> {
    const marker = `M20-${randomUUID().slice(0, 8)}`, trace: ProtocolEvent[] = [], results: object[] = [];
    const abort = new AbortController(); const cancel = (): void => abort.abort(); parentSignal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 480000); if (parentSignal.aborted) abort.abort();
    let phase = "starting", failure: string | undefined;
    const initial = adapter.nativeSnapshot(binding), turns = new Set<string>();
    const artifact = vscode.Uri.joinPath(folder, "m20-live-evidence.json");
    const persist = async (): Promise<void> => {
        const cline = vscode.extensions.getExtension("saoudrizwan.claude-dev");
        const companion = vscode.extensions.getExtension("server-driven-chat.sdc-cline-bridge");
        const bundleHash = async (uri: vscode.Uri): Promise<string> => `sha256:${createHash("sha256").update(await vscode.workspace.fs.readFile(uri)).digest("hex")}`;
        await vscode.workspace.fs.writeFile(artifact, Buffer.from(JSON.stringify({ milestone: "M20", status: phase === "passed" ? "Done" : "In Progress", phase, failure, observedAt: new Date().toISOString(),
            marker, binding, initial: { context: initial.context, nativeTurnId: initial.nativeTurnId, autoApproval: initial.autoApproval }, results,
            artifacts: cline && companion ? { patch: cline.packageJSON.sdcPatch, nativeAddon: await bundleHash(vscode.Uri.joinPath(cline.extensionUri, "dist/sdc-native.cjs")),
                companion: await bundleHash(vscode.Uri.joinPath(companion.extensionUri, "dist/extension.cjs")) } : undefined,
            trace: trace.filter(event => ("turnId" in event.payload && turns.has(event.payload.turnId as string)) || event.type.startsWith("approval.") || event.type.startsWith("input.")) }, null, 2) + "\n"));
    };
    const stream = (async () => { for await (const event of adapter.subscribe(binding, [], { signal: abort.signal })) trace.push(event); })();
    stream.catch(() => {});
    const authority: AdapterMutationContext = { signal: abort.signal, assertAuthority() { if (abort.signal.aborted || active?.binding.bindingId !== binding.bindingId) throw new Error("Bounded native acceptance permit expired or binding changed"); } };
    const wait = async <T>(label: string, predicate: () => T | undefined): Promise<T> => {
        phase = label; await persist(); const deadline = Date.now() + 120000;
        while (!abort.signal.aborted && Date.now() < deadline) {
            const found = predicate(); if (found !== undefined) return found;
            if (trace.some(event => event.type === "turn.failed" && turns.has(event.payload.turnId))) throw new Error("Native Cline turn failed");
            await new Promise<void>(resolve => setTimeout(resolve, 100));
        }
        throw new Error(`Timed out or interrupted at ${label}`);
    };
    const submit = async (prompt: string): Promise<string> => {
        const turnId = randomUUID(); turns.add(turnId);
        const command: ProtocolCommand<"turn.submit"> = { protocolVersion: "2.0", type: "turn.submit", commandId: randomUUID(), lane: "prompt", seq: turns.size, sessionId: binding.sessionId,
            bindingRevision: binding.bindingRevision, leaseGeneration: binding.leaseGeneration, turnId, promptId: randomUUID(), createdAt: new Date().toISOString(),
            payload: { content: [{ type: "text", text: prompt }], delivery: "immediate", expectedConversationRevision: adapter.nativeSnapshot(binding).conversationRevision } };
        const outcome = await adapter.submit(binding, command, authority); results.push({ kind: "submit", command, outcome });
        if (outcome.outcome !== "accepted") throw new Error("Native prompt was not accepted"); return turnId;
    };
    const approval = async (label: string, filename: string): Promise<ApprovalRequest> => wait(label, () => {
        const snapshot = adapter.nativeSnapshot(binding), native = snapshot.pending?.find(value => value.kind === "approval");
        if (!native) return;
        if (!/(write|edit|replace|patch)/i.test(native.toolName ?? "") || !JSON.stringify(native.input).includes(filename)) throw new Error("Unexpected native action; inspect locally, do not approve");
        const event = trace.findLast(event => event.type === "approval.required" && event.payload.requestId === native.askId);
        return event?.type === "approval.required" ? event.payload : undefined;
    });
    const decide = async (request: ApprovalRequest, choiceId: string): Promise<void> => {
        const proposal = { decisionId: randomUUID(), requestId: request.requestId, requestRevision: request.requestRevision, actionDigest: request.actionDigest, choiceId, grantedPermissions: [] };
        const outcome = await adapter.resolveApproval(binding, request, proposal, authority); results.push({ kind: "decision", request, proposal, outcome });
        if (outcome.outcome !== "applied") throw new Error(`Native ${choiceId} did not apply`);
    };
    const completed = async (turnId: string): Promise<void> => { await wait("awaiting-native-completion", () => trace.some(event => event.type === "turn.completed" && event.payload.turnId === turnId) ? true : undefined); };
    const file = (name: string): vscode.Uri => vscode.Uri.joinPath(folder, name);
    const exists = async (name: string): Promise<boolean> => { try { await vscode.workspace.fs.stat(file(name)); return true; } catch (error) { if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return false; throw error; } };
    try {
        const allowed = `${marker}-allowed.txt`, localDenied = `${marker}-local-denied.txt`, remoteDenied = `${marker}-remote-denied.txt`;
        const turn = await submit(`M20 disposable approval test. Use your native file editing tool to create ${file(allowed).fsPath} with exactly this content: ${marker}-ALLOWED. Wait for the normal approval. After the action runs, reply ALLOW_DONE. Do not use shell, network, or any other file. Do not retry if denied.`);
        const a = await approval("awaiting-allow", allowed);
        for (const proposal of [{ decisionId: randomUUID(), requestId: a.requestId, requestRevision: a.requestRevision, actionDigest: a.actionDigest, choiceId: "allow_persistent", grantedPermissions: [] },
            { decisionId: randomUUID(), requestId: a.requestId, requestRevision: a.requestRevision, actionDigest: a.actionDigest, choiceId: "allow_once", grantedPermissions: [{ resource: file(allowed).fsPath, operation: "write", scope: {} }] }]) {
            const outcome = await adapter.resolveApproval(binding, a, proposal, authority); results.push({ kind: "unsupported-scope", proposal, outcome }); if (outcome.outcome !== "unsupported") throw new Error("Unsupported grant was not rejected");
        }
        const revoke = await adapter.revoke(binding, a.requestId, authority); results.push({ kind: "unsupported-revoke", outcome: revoke }); if (revoke.outcome !== "unsupported") throw new Error("Revocation unexpectedly supported");
        await decide(a, "allow_once"); await completed(turn);
        const content = Buffer.from(await vscode.workspace.fs.readFile(file(allowed))).toString("utf8");
        if (content.trim() !== `${marker}-ALLOWED`) throw new Error("Approved native file action outcome mismatch"); results.push({ kind: "allow-outcome", path: file(allowed).fsPath, content });
        const raceTurn = await submit(`M20 two sequential denial tests. First use your native file editing tool to create ${file(localDenied).fsPath} with content ${marker}-LOCAL. If rejected, do not retry that file. Then request creating ${file(remoteDenied).fsPath} with content ${marker}-REMOTE. If also rejected, do not retry; reply DENIALS_DONE. Use only these two native file actions, no shell or network. The first will be rejected locally, the second remotely.`);
        const first = await approval("awaiting-local-deny", localDenied); results.push({ kind: "local-review", request: first }); await persist();
        void vscode.window.showInformationMessage(`M20: Click Reject on Cline's native ${localDenied} approval. The probe will then reject the second action remotely.`);
        await wait("awaiting-local-resolution", () => trace.some(event => event.type === "approval.resolved" && event.payload.requestId === first.requestId && event.payload.state === "resolved_elsewhere") ? true : undefined);
        const next = await approval("awaiting-next-ask-race", remoteDenied);
        const stale = await adapter.resolveApproval(binding, first, { decisionId: randomUUID(), requestId: first.requestId, requestRevision: first.requestRevision, actionDigest: first.actionDigest, choiceId: "allow_once", grantedPermissions: [] }, authority);
        results.push({ kind: "stale-local-race", first, next, outcome: stale }); if (stale.outcome !== "rejected") throw new Error("Old local-resolved request was accepted against next ask");
        if (adapter.nativeSnapshot(binding).pending?.[0]?.askId !== next.requestId) throw new Error("Old decision changed the next native ask");
        await decide(next, "deny"); await completed(raceTurn);
        const deniedFiles = { local: await exists(localDenied), remote: await exists(remoteDenied) }; results.push({ kind: "deny-outcome", paths: [file(localDenied).fsPath, file(remoteDenied).fsPath], exists: deniedFiles });
        if (deniedFiles.local || deniedFiles.remote) throw new Error("Denied native action created a file");
        const questionTurn = await submit(`Use your native ask_question tool to ask "M20 ${marker}: choose a label" with options blue and green. Wait for the answer. Then reply with the answer followed by QUESTION_DONE. No other tools, shell, network or files.`);
        const question = await wait("awaiting-question", () => adapter.nativeSnapshot(binding).pending?.find(value => value.kind === "question"));
        const answer = await adapter.respondInput(binding, question.askId, question.askRevision, "blue", authority); results.push({ kind: "question", request: question, answer: "blue", outcome: answer });
        if (answer.outcome !== "applied") throw new Error("Native question answer did not apply"); await completed(questionTurn);
        const output = trace.filter(event => ["output.item.created", "output.item.replaced"].includes(event.type) && "turnId" in event.payload && event.payload.turnId === questionTurn && "kind" in event.payload && event.payload.kind === "assistant_message")
            .map(event => "content" in event.payload ? JSON.stringify(event.payload.content) : "").join("\n");
        if (!output.includes("blue") || !output.includes("QUESTION_DONE")) throw new Error("Native subsequent question answer outcome missing"); results.push({ kind: "question-outcome", output });
        const cancelTurn = await submit(`Use your native ask_question tool to ask "M20 ${marker}: wait for cancellation" with options wait and continue. Wait for its answer before doing anything else. Do not use other tools, files, shell, or network. This turn will be cancelled while blocked on that question.`);
        const cancelQuestion = await wait("awaiting-cancel-question", () => adapter.nativeSnapshot(binding).pending?.find(value => value.kind === "question"));
        const cancellation = await adapter.cancel(binding, cancelTurn, authority); results.push({ kind: "cancel", request: cancelQuestion, turnId: cancelTurn, outcome: cancellation });
        if (cancellation.outcome !== "applied") throw new Error("Native cancellation lacked abort acknowledgement");
        await wait("awaiting-cancel-outcome", () => trace.some(event => event.type === "turn.cancelled" && event.payload.turnId === cancelTurn) ? true : undefined);
        const after = adapter.nativeSnapshot(binding); results.push({ kind: "cancel-outcome", snapshot: { phase: after.phase, isRunning: after.isRunning, pending: after.pending, messages: after.messages.filter(value => value.category === "resume_task").slice(-1) } });
        if (after.isRunning || after.pending?.length || !after.messages.some(value => value.category === "resume_task")) throw new Error("Native turn remained active after cancellation");
        if (JSON.stringify(initial.autoApproval) !== JSON.stringify(after.autoApproval)) throw new Error("Native auto-approval settings changed during acceptance");
        phase = "passed"; await persist();
    } catch (error) { failure = errorText(error); phase = "incomplete"; await persist().catch(() => {}); throw error; }
    finally { clearTimeout(timer); abort.abort(); parentSignal.removeEventListener("abort", cancel); await stream.catch(() => {}); }
}

async function verifyNativePin(cline: vscode.Extension<unknown>): Promise<void> {
    if (vscode.env.remoteName) throw new Error("The reviewed native pin supports local VS Code only");
    const [extension, native] = await Promise.all([readFile(vscode.Uri.joinPath(cline.extensionUri, "dist/extension.js").fsPath), readFile(vscode.Uri.joinPath(cline.extensionUri, "dist/sdc-native.cjs").fsPath)]);
    assertReviewedClinePin(cline.packageJSON, extension, native);
}
