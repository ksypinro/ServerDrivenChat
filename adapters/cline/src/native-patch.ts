import { createHash, randomUUID } from "node:crypto";
import type { NativeBridgeApi, NativeContext, NativeEvent, NativeMessage, NativeSnapshot } from "./native-api.js";
import { instrumentInteractions } from "./native-controls.js";
import type { PinnedInteractions } from "./native-controls.js";
import { installConnectTools } from "./native-connect.js";
import type { ConnectLifecycle } from "./native-connect.js";

interface ClineMessage {
    ts: number; type: "ask" | "say"; say?: string; ask?: string; text?: string; partial?: boolean; images?: string[];
}
interface Task {
    taskId: string;
    messageStateHandler: { getClineMessages(): ClineMessage[]; on(name: string, listener: () => void): unknown; off(name: string, listener: () => void): unknown };
}
interface ActiveSession { sessionId: string; isRunning: boolean; sdkHost: object & { abort?(sessionId: string): Promise<void> } }
/** Structural boundary to the exact pinned native Controller, inside the maintained Cline patch.
 * This module is installed in Cline's package, never called by the companion on stock internals. */
export interface PinnedController {
    task?: Task;
    sessions: { getActiveSession(): ActiveSession | undefined; setRunning(running: boolean): void; fireAndForgetSend(host: object, sessionId: string, text: string, images: string[]): void };
    turnStateTracker: { currentPhase: string; set(phase: string): void };
    messages: { appendAndEmit(messages: ClineMessage[], event: object): void };
    messageTranslatorState: { clearTurnOutcome(): void };
    resolveContextMentions(text: string): Promise<string>;
    resetMessageTranslatorAndFence(): void;
    postStateToWebview(): Promise<void>;
    dispose(): Promise<void>;
    interactions?: PinnedInteractions;
    taskControl?: { options: { raiseCancelFence?: () => void } };
    stateManager?: { getGlobalSettingsKey(key: string): unknown };
}
export interface NativeEnvironment {
    installationId: string; hostId: string; windowId: string;
    workspaceId(): string;
    onWorkspaceChanged(listener: () => void): { dispose(): void };
    remote: boolean;
    controls?: boolean;
    connect?: boolean;
    callerToolFence?: boolean;
}
const hash = (bytes: string | Uint8Array): string => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const project = (message: ClineMessage): NativeMessage => ({ id: String(message.ts), type: message.type,
    category: message.say ?? message.ask ?? "unknown", text: message.text ?? "", partial: message.partial === true,
    ...(message.images?.length ? { imageChecksums: message.images.map(image => hash(Buffer.from(image.split(",").at(-1) ?? "", "base64"))) } : {}) });
interface BoundTask {
    token: string; task: Task; context: NativeContext; revision: number; seq: number;
    events: NativeEvent[]; listeners: Set<(event: NativeEvent) => void>; messages: Map<string, NativeMessage>;
    phase: string; isRunning?: boolean; valid: boolean; messageListener: () => void;
    commands: Map<string, { digest: string; result: Promise<{ messageId: string; imageChecksums: string[] }> }>;
    images: Map<string, { data: string; reference: { attachmentId: string; mimeType: string; sizeBytes: number; sha256: string }; receiptId: string }>;
    remoteMessages: Map<string, string>;
    deniedNativeToolTurns: Set<string>;
    imageBytes: number;
}

/** Native patch for Cline 4.1.22 only. No model runtime or private transport is created. */
export function createClineTaskBridge(controller: PinnedController, env: NativeEnvironment): NativeBridgeApi {
    if (env.remote) throw new Error("Remote extension hosts are unsupported by this pinned M19 patch");
    if (!controller.sessions?.getActiveSession || !controller.messages?.appendAndEmit || !controller.turnStateTracker ||
        !controller.resolveContextMentions || !controller.resetMessageTranslatorAndFence) throw new Error("Pinned Cline controller shape mismatch");
    const descriptor = Object.getOwnPropertyDescriptor(controller, "task");
    if (!descriptor || !descriptor.configurable || !("value" in descriptor)) throw new Error("Pinned Cline task field shape mismatch");
    const tasks = new Map<string, BoundTask>();
    let activeToolDeny: { bound: BoundTask; session: ActiveSession } | undefined;
    const setRunning = controller.sessions.setRunning.bind(controller.sessions);
    controller.sessions.setRunning = running => { if (!running) activeToolDeny = undefined; setRunning(running); };
    let currentTask = controller.task;
    let taskGeneration = randomUUID();
    let disposed = false;
    const context = (): Omit<NativeContext, "taskId" | "generation"> => ({ installationId: env.installationId, hostId: env.hostId, windowId: env.windowId, workspaceId: env.workspaceId() });
    const emit = (bound: BoundTask, value: NativeEvent extends infer E ? E extends NativeEvent ? Omit<E, "seq"> : never : never): void => {
        const event = { ...value, seq: ++bound.seq } as NativeEvent;
        bound.events.push(event); if (bound.events.length > 512) bound.events.shift();
        for (const listener of [...bound.listeners]) { try { listener(structuredClone(event)); } catch { /* One consumer cannot corrupt native state. */ } }
    };
    const invalidate = (bound: BoundTask, reason: string): void => {
        if (!bound.valid) return;
        bound.valid = false; bound.task.messageStateHandler.off("clineMessagesChanged", bound.messageListener);
        bound.images.clear(); bound.imageBytes = 0;
        bound.deniedNativeToolTurns.clear();
        emit(bound, { type: "invalidated", reason }); bound.listeners.clear();
        tasks.delete(bound.token);
    };
    const invalidateAll = (reason: string): void => { for (const bound of tasks.values()) invalidate(bound, reason); };
    Object.defineProperty(controller, "task", { configurable: true, enumerable: true,
        get: () => currentTask, set: (task: Task | undefined) => { invalidateAll("Cline task selection or proxy changed"); currentTask = task; taskGeneration = randomUUID(); } });
    const get = (token: string): BoundTask => {
        const bound = tasks.get(token);
        if (disposed || !bound?.valid || controller.task !== bound.task || controller.task.taskId !== bound.context.taskId || env.workspaceId() !== bound.context.workspaceId)
            throw new Error("BINDING_CHANGED: native task, host generation, or workspace changed; select again");
        return bound;
    };
    const ready = (task: Task): boolean => {
        const session = controller.sessions.getActiveSession();
        return !!session && session.sessionId === task.taskId && !session.isRunning && ["idle", "completed", "awaiting_followup"].includes(controller.turnStateTracker.currentPhase);
    };
    const responseMessages = new Set<number>();
    const nativeIdentity = () => {
        const task = controller.task, session = controller.sessions.getActiveSession();
        if (!task || !session || session.sessionId !== task.taskId) return undefined;
        const message = task.messageStateHandler.getClineMessages().filter(value => value.type === "say" && ["task", "user_feedback"].includes(value.say ?? "") && !responseMessages.has(value.ts)).at(-1);
        return message ? { task, session, taskId: task.taskId, nativeTurnId: `${task.taskId}:${message.ts}` } : undefined;
    };
    const controlEvent = (event: NativeEvent extends infer E ? E extends NativeEvent ? Omit<E, "seq"> : never : never): void => {
        for (const bound of tasks.values()) if (bound.valid) emit(bound, event);
    };
    if (env.controls && !controller.interactions) throw new Error("Pinned native interactions unavailable");
    const controls = env.controls ? instrumentInteractions(controller.interactions!, {
        identity: nativeIdentity,
        anchor: () => (controller.turnStateTracker as typeof controller.turnStateTracker & { get(): { anchorTs?: number } }).get().anchorTs,
        preview: id => controller.task?.messageStateHandler.getClineMessages().find(message => String(message.ts) === id)?.text,
        denyNativeTool: identity => env.callerToolFence === true && (activeToolDeny?.session === identity.session && activeToolDeny.bound.task === identity.task ||
            [...tasks.values()].some(bound => bound.valid && bound.task === identity.task && bound.context.taskId === identity.taskId && bound.deniedNativeToolTurns.has(identity.nativeTurnId))),
        pending: interaction => controlEvent({ type: "interaction", interaction }),
        resolved: receipt => controlEvent({ type: "resolved", receipt }), now: () => Date.now()
    }) : undefined;
    if (controls) {
        if (!controller.taskControl?.options.raiseCancelFence) throw new Error("Pinned native cancellation fence unavailable");
        const append = controller.messages.appendAndEmit.bind(controller.messages);
        controller.messages.appendAndEmit = (messages, event) => {
            if (controls.responseId()) for (const message of messages) if (message.type === "say" && message.say === "user_feedback") responseMessages.add(message.ts);
            append(messages, event);
        };
    }
    const refresh = (bound: BoundTask): void => {
        if (!bound.valid) return;
        get(bound.token);
        const messages = bound.task.messageStateHandler.getClineMessages().map(project);
        const ids = new Set(messages.map(message => message.id));
        if ([...bound.messages.keys()].some(id => !ids.has(id))) { invalidate(bound, "Native transcript replaced or truncated; select again"); return; }
        for (const message of messages) {
            const before = bound.messages.get(message.id);
            if (JSON.stringify(before) === JSON.stringify(message)) continue;
            const user = !before && message.type === "say" && ["task", "user_feedback"].includes(message.category);
            const commandId = bound.remoteMessages.get(message.id);
            if (user) ++bound.revision;
            const interactionId = controls?.responseId();
            bound.messages.set(message.id, message); emit(bound, { type: "message", message, local: user && !commandId && !interactionId, ...(commandId ? { commandId } : {}), ...(user && interactionId ? { interactionId } : {}) });
        }
        const phase = controller.turnStateTracker.currentPhase;
        const isRunning = controller.sessions.getActiveSession()?.isRunning;
        if (bound.phase !== phase || (controls && bound.isRunning !== isRunning)) { bound.phase = phase; bound.isRunning = isRunning; emit(bound, { type: "phase", phase, ...(controls ? { isRunning } : {}) }); }
    };
    const snapshot = (bound: BoundTask): NativeSnapshot => {
        refresh(bound); get(bound.token);
        return { context: structuredClone(bound.context), conversationRevision: bound.revision, phase: bound.phase,
            ready: ready(bound.task), messages: structuredClone([...bound.messages.values()]), cursor: bound.seq,
            ...(controls ? { pending: controls.pending(), isRunning: controller.sessions.getActiveSession()?.isRunning, nativeTurnId: nativeIdentity()?.nativeTurnId, autoApproval: autoApproval() } : {}) };
    };
    const autoApproval = (): Record<string, boolean> => {
        const value = controller.stateManager?.getGlobalSettingsKey("autoApprovalSettings") as { enabled?: boolean; actions?: Record<string, boolean> } | undefined;
        return value ? { enabled: value.enabled === true, ...Object.fromEntries(Object.entries(value.actions ?? {}).filter(([key, flag]) => /^[a-zA-Z]+$/.test(key) && typeof flag === "boolean")) } : {};
    };
    const watcher = env.onWorkspaceChanged(() => invalidateAll("Workspace configuration changed"));
    const timer = setInterval(() => {
        for (const bound of tasks.values()) if (bound.valid) { try { refresh(bound); } catch { invalidate(bound, "Native context changed"); } }
    }, 50); timer.unref();
    const originalDispose = controller.dispose.bind(controller);
    const connect = env.connect ? installConnectTools({ sessions: controller.sessions as typeof controller.sessions & ConnectLifecycle,
        task: () => controller.task, context, disposed: () => disposed }) : undefined;
    const api: NativeBridgeApi = {
        apiVersion: env.callerToolFence && connect ? "1.3" : connect ? "1.2" : controls ? "1.1" : "1.0", clineVersion: "4.1.22", context,
        ...(connect ? { connect: connect.api } : {}),
        ...(controls ? { controls: {
            resolve: (token, command, permit) => controls.resolve(command, permit, () => { get(token); }),
            cancel: async (token, nativeTurnId, permit) => {
                const bound = get(token), identity = nativeIdentity();
                const check = (): void => {
                    get(token); const current = nativeIdentity();
                    if (!identity || !current || current.task !== identity.task || current.session !== identity.session || current.nativeTurnId !== nativeTurnId || !controller.sessions.getActiveSession()?.isRunning || permit.signal.aborted) throw new Error("REQUEST_STALE: addressed native turn is not running");
                };
                check(); permit.assertAuthority(); check();
                const session = identity!.session as ActiveSession;
                if (!session.sdkHost.abort) throw new Error("Pinned native SDK abort unavailable");
                controller.turnStateTracker.set("resumable");
                controller.taskControl!.options.raiseCancelFence!();
                controller.interactions!.clearPending("Task cancelled by addressed bridge control");
                // The captured native host/session is used even if the sidebar switches while abort awaits.
                try { await session.sdkHost.abort(session.sessionId); }
                catch (error) { if (!(error instanceof Error) || error.name !== "AbortError") throw new Error("EXECUTION_UNKNOWN: native abort acknowledgement failed"); }
                try { get(token); } catch { throw new Error("EXECUTION_UNKNOWN: binding changed after native abort; reconcile without replay"); }
                if (controller.sessions.getActiveSession() !== session || nativeIdentity()?.nativeTurnId !== nativeTurnId) throw new Error("EXECUTION_UNKNOWN: native turn changed during abort; reconcile without replay");
                controller.sessions.setRunning(false);
                const ts = bound.task.messageStateHandler.getClineMessages().reduce((max, message) => Math.max(max, message.ts + 1), Date.now());
                controller.messages.appendAndEmit([{ ts, type: "ask", ask: "resume_task", text: "", partial: false }], { type: "status", payload: { sessionId: session.sessionId, status: "cancelled" } });
                const evidence = `Native SDK abort acknowledged for ${nativeTurnId}; resume_task ${ts} observed`;
                emit(bound, { type: "cancelled", nativeTurnId, evidence });
                void controller.postStateToWebview().catch(() => {});
                return { nativeTurnId, taskId: session.sessionId, evidence };
            }
        } } : {}),
        currentTask: () => !disposed && controller.task ? { taskId: controller.task.taskId, ready: ready(controller.task), ...(env.connect ? { generation: taskGeneration } : {}) } : undefined,
        bind: (expected) => {
            const task = controller.task;
            const actual = task ? { ...context(), taskId: task.taskId } : undefined;
            if (disposed || !task || !actual || Object.keys(actual).some(key => expected[key as keyof typeof actual] !== actual[key as keyof typeof actual]))
                throw new Error("BINDING_CHANGED: explicit native context does not match");
            if ([...tasks.values()].some(bound => bound.valid)) throw new Error("A task is already bound in this host; disconnect first");
            const token = randomUUID();
            const messages = task.messageStateHandler.getClineMessages().map(project);
            const bound: BoundTask = { token, task, context: { ...context(), taskId: task.taskId, generation: randomUUID() },
                revision: messages.filter(message => message.type === "say" && ["task", "user_feedback"].includes(message.category)).length,
                seq: 0, events: [], listeners: new Set(), messages: new Map(messages.map(message => [message.id, message])),
                phase: controller.turnStateTracker.currentPhase, valid: true, commands: new Map(), images: new Map(), remoteMessages: new Map(), imageBytes: 0,
                deniedNativeToolTurns: new Set(), messageListener: () => { try { refresh(bound); } catch { invalidate(bound, "Native context changed"); } } };
            tasks.set(token, bound); task.messageStateHandler.on("clineMessagesChanged", bound.messageListener);
            return { token, snapshot: snapshot(bound) };
        },
        snapshot: token => snapshot(get(token)),
        subscribe: (token, cursor, listener) => {
            const bound = get(token); refresh(bound);
            if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > bound.seq || (bound.events.length && cursor < bound.events[0].seq - 1)) throw new Error("CURSOR_EXPIRED: native snapshot required");
            bound.listeners.add(listener);
            for (const event of bound.events.filter(event => event.seq > cursor)) listener(structuredClone(event));
            return () => { bound.listeners.delete(listener); };
        },
        submit: async (token, command, permit) => {
            const bound = get(token);
            const digest = hash(JSON.stringify(command));
            const previous = bound.commands.get(command.commandId);
            if (previous) { if (previous.digest !== digest) throw new Error("CONFLICT: command ID reused with different content"); return previous.result; }
            if (bound.commands.size >= 256) throw new Error("Native command receipt limit reached; disconnect and reconcile before rebinding");
            if (command.nativeToolPolicy === "deny" && (!env.callerToolFence || !controls)) throw new Error("Native tool-denial policy is unavailable in this app-owned pin");
            if (!command.text.trim() && !command.attachmentIds.length) throw new Error("Empty prompt");
            const images = command.attachmentIds.map(id => { const image = bound.images.get(id); if (!image) throw new Error("Attachment not staged in this binding"); return image; });
            const session = controller.sessions.getActiveSession();
            if (!session || !ready(bound.task) || command.expectedConversationRevision !== bound.revision) throw new Error("Task is busy, unavailable, or conversation revision changed");
            const result = (async () => {
                // Prepare context with the app's normal resolver. Nothing is echoed or sent yet.
                const resolved = await controller.resolveContextMentions(command.text);
                get(token);
                if (controller.sessions.getActiveSession() !== session || !ready(bound.task) || command.expectedConversationRevision !== bound.revision) throw new Error("BINDING_CHANGED: native session or input state changed during preparation");
                if (permit.signal.aborted) throw new Error("Dispatch cancelled before native submission");
                permit.assertAuthority();
                get(token);
                if (permit.signal.aborted || controller.sessions.getActiveSession() !== session || !ready(bound.task) || command.expectedConversationRevision !== bound.revision)
                    throw new Error("BINDING_CHANGED: native session, permit, or input state changed at authority check");
                // All effect-boundary checks and the addressed send are synchronous in this turn.
                controller.sessions.setRunning(true); controller.turnStateTracker.set("streaming");
                controller.messageTranslatorState.clearTurnOutcome(); controller.resetMessageTranslatorAndFence();
                const ts = bound.task.messageStateHandler.getClineMessages().reduce((value, message) => Math.max(value, message.ts + 1), Date.now());
                const data = images.map(image => image.data);
                bound.remoteMessages.set(String(ts), command.commandId);
                controller.messages.appendAndEmit([{ ts, type: "say", say: "user_feedback", text: command.text, images: data, partial: false }], { type: "status", payload: { sessionId: session.sessionId, status: "running" } });
                const echo = bound.task.messageStateHandler.getClineMessages().find(message => message.ts === ts);
                if (!echo || echo.text !== command.text || JSON.stringify(echo.images) !== JSON.stringify(data)) throw new Error("EXECUTION_UNKNOWN: native user-message echo could not be confirmed");
                try {
                    get(token); if (controller.sessions.getActiveSession() !== session || permit.signal.aborted) throw new Error("Session or permit changed during echo");
                    permit.assertAuthority(); get(token);
                    if (controller.sessions.getActiveSession() !== session || permit.signal.aborted) throw new Error("Session or permit changed at final authority check");
                }
                catch { throw new Error("EXECUTION_UNKNOWN: native echo exists but dispatch was fenced before execution"); }
                activeToolDeny = command.nativeToolPolicy === "deny" ? { bound, session } : undefined;
                if (command.nativeToolPolicy === "deny") bound.deniedNativeToolTurns.add(`${bound.task.taskId}:${ts}`);
                controller.sessions.fireAndForgetSend(session.sdkHost, session.sessionId, resolved, data);
                void controller.postStateToWebview().catch(() => {});
                return { messageId: String(ts), imageChecksums: images.map(image => image.reference.sha256) };
            })();
            bound.commands.set(command.commandId, { digest, result });
            return result;
        },
        stageImage: (token, reference, bytes, permit) => {
            const bound = get(token);
            if (!["image/png", "image/jpeg"].includes(reference.mimeType)) throw new Error("Unsupported attachment type; this patch supports PNG/JPEG images only");
            if (bytes.byteLength !== reference.sizeBytes || hash(bytes) !== reference.sha256 || reference.sizeBytes > 10 * 1024 * 1024) throw new Error("Attachment size or checksum mismatch");
            const png = [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
            const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
            if (!(reference.mimeType === "image/png" ? png : jpeg)) throw new Error("Image signature mismatch");
            const prior = bound.images.get(reference.attachmentId);
            if (prior && JSON.stringify(prior.reference) !== JSON.stringify(reference)) throw new Error("Attachment ID conflict");
            if (!prior && bound.imageBytes + bytes.byteLength > 10 * 1024 * 1024) throw new Error("Binding image staging limit exceeded");
            if (permit.signal.aborted) throw new Error("Image staging cancelled");
            permit.assertAuthority();
            get(token);
            if (permit.signal.aborted) throw new Error("Image staging cancelled at authority check");
            if (!prior) { bound.imageBytes += bytes.byteLength; bound.images.set(reference.attachmentId, { data: `data:${reference.mimeType};base64,${Buffer.from(bytes).toString("base64")}`, reference: structuredClone(reference), receiptId: randomUUID() }); }
            return { ...structuredClone(reference), receiptId: bound.images.get(reference.attachmentId)!.receiptId };
        },
        detach: token => { const bound = tasks.get(token); if (bound) { invalidate(bound, "Detached locally"); tasks.delete(token); } },
        dispose: () => { if (disposed) return; disposed = true; connect?.dispose(); controls?.dispose(); clearInterval(timer); watcher.dispose(); invalidateAll("Cline extension controller disposed"); tasks.clear(); }
    };
    controller.dispose = async () => { api.dispose(); await originalDispose(); };
    return api;
}
