import { createHash, randomUUID } from "node:crypto";
import type { NativeInteraction, NativeControlReceipt, NativePermit } from "./native-api.js";

interface ApprovalResult { approved: boolean; reason?: string }
interface ToolRequest { toolCallId: string; toolName: string; input: unknown; policy: { autoApprove?: boolean } }
/** Structural boundary inside the reviewed pinned application, never exposed to its companion. */
export interface PinnedInteractions {
    pendingAskResolve?: (answer: string) => void;
    pendingToolApprovalResolve?: (answer: ApprovalResult) => void;
    pendingToolApprovalMessage?: { toolCallId: string; messageTs: number; toolName: string };
    handleRequestToolApproval(request: ToolRequest): Promise<ApprovalResult>;
    handleAskQuestion(question: string, options: string[], context: unknown): Promise<string>;
    resolvePendingToolApproval(prompt: string | undefined, response: string | undefined, images?: string[], files?: string[]): boolean;
    resolvePendingAskQuestion(prompt: string | undefined): boolean;
    clearPending(reason: string): void;
    options: { getCwd?: () => string | undefined };
}
interface Identity { task: object; session: object; taskId: string; nativeTurnId: string }
interface Slot {
    interaction: NativeInteraction; identity: Identity; callback: object;
    material: string; liveMaterial?: () => string; state: "pending" | "resolved"; receipt?: NativeControlReceipt;
}
function jsonClone(value: unknown): unknown {
    const seen = new Set<object>();
    const check = (item: unknown): void => {
        if (item === null || typeof item === "boolean") return;
        if (typeof item === "string") { if (/[\uD800-\uDFFF]/u.test(item)) throw new Error("Malformed Unicode"); return; }
        if (typeof item === "number" && Number.isFinite(item)) return;
        if (!item || typeof item !== "object" || seen.has(item)) throw new Error("Incomplete native JSON");
        seen.add(item);
        if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new Error("Non-JSON native object");
        for (const key of Reflect.ownKeys(item)) {
            if (Array.isArray(item) && key === "length") continue;
            const field = Object.getOwnPropertyDescriptor(item, key);
            if (typeof key !== "string" || /[\uD800-\uDFFF]/u.test(key) || !field?.enumerable || !("value" in field)) throw new Error("Non-JSON native field");
            if (Array.isArray(item) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)) throw new Error("Non-JSON array field");
            check(field.value);
        }
        if (Array.isArray(item)) for (let i = 0; i < item.length; i++) if (!(i in item)) throw new Error("Sparse native array");
        seen.delete(item);
    };
    check(value); return JSON.parse(JSON.stringify(value));
}
const fingerprint = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Both native UI and addressed remote responses settle the very same captured native promise.
 * Local fields are intercepted inside the maintained app build; no button automation is used. */
export function instrumentInteractions(native: PinnedInteractions, hooks: {
    identity(): Identity | undefined;
    anchor(): number | undefined;
    preview(messageId: string): string | undefined;
    denyNativeTool?(identity: Identity): boolean;
    pending(interaction: NativeInteraction): void;
    resolved(receipt: NativeControlReceipt): void;
    now(): number;
}) {
    for (const name of ["pendingAskResolve", "pendingToolApprovalResolve", "pendingToolApprovalMessage"] as const) {
        const field = Object.getOwnPropertyDescriptor(native, name);
        if (!field?.configurable || !("value" in field)) throw new Error(`Pinned native interaction field mismatch: ${name}`);
    }
    if (![native.handleRequestToolApproval, native.handleAskQuestion, native.resolvePendingToolApproval, native.resolvePendingAskQuestion, native.clearPending].every(value => typeof value === "function")) throw new Error("Pinned native interaction methods mismatch");
    let approvalCallback = native.pendingToolApprovalResolve;
    let questionCallback = native.pendingAskResolve;
    let approvalMessage = native.pendingToolApprovalMessage;
    let approvalPreparation: { request: ToolRequest; identity: Identity } | undefined;
    let questionPreparation: { question: string; choices: string[]; identity: Identity } | undefined;
    let approval: Slot | undefined, question: Slot | undefined;
    let response: NativeInteraction | undefined;
    let remote: { slot: Slot; decisionId: string } | undefined;
    let disposed = false;
    const sameIdentity = (a: Identity, b: Identity | undefined): boolean => !!b && a.task === b.task && a.session === b.session && a.taskId === b.taskId && a.nativeTurnId === b.nativeTurnId;
    const make = (kind: "approval" | "question", messageId: string, identity: Identity, callback: object, material: Partial<NativeInteraction>): Slot => {
        const interaction: NativeInteraction = { askId: randomUUID(), askRevision: 1, taskId: identity.taskId, nativeTurnId: identity.nativeTurnId,
            kind, messageId, expiresAt: new Date(hooks.now() + 10 * 60 * 1000).toISOString(), complete: true, ...material };
        const slot: Slot = { interaction, identity, callback, material: fingerprint(interaction), state: "pending" };
        return slot;
    };
    const settle = (slot: Slot | undefined, outcome: NativeControlReceipt["outcome"]): void => {
        if (!slot || slot.state !== "pending") return;
        slot.state = "resolved";
        const isRemote = remote?.slot === slot;
        slot.receipt = { askId: slot.interaction.askId, askRevision: slot.interaction.askRevision, taskId: slot.identity.taskId,
            nativeTurnId: slot.identity.nativeTurnId, outcome, source: isRemote ? "remote" : "local",
            ...(isRemote ? { decisionId: remote!.decisionId } : {}), evidence: `Captured native ${slot.interaction.kind} resolver settled for ${slot.interaction.messageId}; whole action once` };
        if (sameIdentity(slot.identity, hooks.identity())) hooks.resolved(structuredClone(slot.receipt));
    };
    Object.defineProperty(native, "pendingToolApprovalResolve", { configurable: true, enumerable: true,
        get: () => approvalCallback, set: (callback: ((result: ApprovalResult) => void) | undefined) => {
            if (!callback) { approvalCallback = undefined; return; }
            let captured: Slot | undefined;
            const wrapped = (result: ApprovalResult): void => { if (captured?.state === "resolved") return; callback(result); settle(captured, result.approved ? "allowed" : "denied"); };
            approvalCallback = wrapped;
            // The native coordinator assigns message identity immediately after this resolver.
            captureApproval = () => {
                if (!approvalPreparation || !approvalMessage || approvalMessage.toolCallId !== approvalPreparation.request.toolCallId) return;
                const { request, identity } = approvalPreparation;
                if (!sameIdentity(identity, hooks.identity())) return;
                let input: unknown, complete = true;
                try { input = jsonClone(request.input); } catch { input = null; complete = false; }
                captured = approval = make("approval", String(approvalMessage.messageTs), identity, wrapped, {
                    toolCallId: request.toolCallId, toolName: request.toolName, input, preview: hooks.preview(String(approvalMessage.messageTs)) ?? "", complete,
                    ...(native.options.getCwd?.() ? { cwd: native.options.getCwd() } : {}) });
                const baseline = fingerprint([request.toolCallId, request.toolName, request.input, native.options.getCwd?.(), hooks.preview(captured.interaction.messageId)]);
                captured.liveMaterial = () => { try { jsonClone(request.input); return fingerprint([request.toolCallId, request.toolName, request.input, native.options.getCwd?.(), hooks.preview(captured!.interaction.messageId)]) === baseline ? captured!.material : "changed"; } catch { return "changed"; } };
                hooks.pending(structuredClone(captured.interaction));
            };
        } });
    let captureApproval: (() => void) | undefined;
    Object.defineProperty(native, "pendingToolApprovalMessage", { configurable: true, enumerable: true,
        get: () => approvalMessage, set: (message: PinnedInteractions["pendingToolApprovalMessage"]) => { approvalMessage = message; if (message) captureApproval?.(); } });
    Object.defineProperty(native, "pendingAskResolve", { configurable: true, enumerable: true,
        get: () => questionCallback, set: (callback: ((answer: string) => void) | undefined) => {
            if (!callback) { questionCallback = undefined; return; }
            const prep = questionPreparation, anchor = hooks.anchor();
            let captured: Slot | undefined;
            const wrapped = (answer: string): void => { if (captured?.state === "resolved") return; callback(answer); settle(captured, answer ? "answered" : "dismissed"); };
            questionCallback = wrapped;
            if (prep && anchor !== undefined && sameIdentity(prep.identity, hooks.identity())) {
                captured = question = make("question", String(anchor), prep.identity, wrapped, { question: prep.question, choices: [...prep.choices] });
                hooks.pending(structuredClone(captured.interaction));
            }
        } });
    const originalTool = native.handleRequestToolApproval.bind(native);
    native.handleRequestToolApproval = async request => {
        const identity = hooks.identity();
        if (disposed || !identity) return { approved: false, reason: "Native task/session identity unavailable" };
        if (hooks.denyNativeTool?.(identity)) return { approved: false, reason: "Caller-function proposal turn forbids native tool execution" };
        if (approvalPreparation || questionPreparation || approvalCallback || questionCallback) return { approved: false, reason: "Concurrent native interaction unsupported by the pinned single-slot coordinator" };
        approvalPreparation = { request, identity };
        try { return await originalTool(request); } finally { approvalPreparation = undefined; }
    };
    const originalQuestion = native.handleAskQuestion.bind(native);
    native.handleAskQuestion = async (text, choices, context) => {
        const identity = hooks.identity();
        if (identity && hooks.denyNativeTool?.(identity)) throw new Error("Caller-function proposal turn forbids native questions");
        if (disposed || !identity || approvalPreparation || questionPreparation || approvalCallback || questionCallback) throw new Error("Concurrent or unaddressable native question");
        questionPreparation = { question: text, choices: [...(choices ?? [])], identity };
        try { return await originalQuestion(text, choices, context); } finally { questionPreparation = undefined; }
    };
    const originalResolveTool = native.resolvePendingToolApproval.bind(native);
    native.resolvePendingToolApproval = (prompt, choice, images, files) => {
        const prev = response;
        if (approval?.state === "pending" && choice !== "messageResponse") response = approval.interaction;
        try { return originalResolveTool(prompt, choice, images, files); } finally { response = prev; }
    };
    const originalResolveQuestion = native.resolvePendingAskQuestion.bind(native);
    native.resolvePendingAskQuestion = prompt => {
        const prev = response;
        if (question?.state === "pending") response = question.interaction;
        try { return originalResolveQuestion(prompt); } finally { response = prev; }
    };
    const pending = (): NativeInteraction[] => [approval, question].filter((slot): slot is Slot => !!slot && slot.state === "pending" && sameIdentity(slot.identity, hooks.identity()))
        .map(slot => structuredClone(slot.interaction));
    return {
        pending, responseId: () => response?.askId,
        resolve(command: { askId: string; askRevision: number; decisionId: string; decision: "allow_once" | "deny" | "answer"; answer?: string }, permit: NativePermit, assertBinding: () => void): NativeControlReceipt {
            const slot = [approval, question].find(value => value?.interaction.askId === command.askId);
            const check = (): void => {
                assertBinding();
                if (disposed || !slot || slot.state !== "pending" || !sameIdentity(slot.identity, hooks.identity()) || slot.interaction.askRevision !== command.askRevision ||
                    (fingerprint(slot.interaction) !== slot.material || (slot.liveMaterial && slot.liveMaterial() !== slot.material)) || Date.parse(slot.interaction.expiresAt) <= hooks.now() || !slot.interaction.complete ||
                    (slot.interaction.kind === "approval" ? approvalCallback !== slot.callback || approvalMessage?.messageTs !== Number(slot.interaction.messageId) : questionCallback !== slot.callback)) throw new Error("REQUEST_STALE: exact native resolver/revision is no longer pending");
                if (permit.signal.aborted) throw new Error("Control permit cancelled");
            };
            if (slot?.receipt && slot.receipt.decisionId === command.decisionId && slot.receipt.source === "remote") throw new Error("REQUEST_STALE: native decision already consumed; inspect recorded receipt");
            check();
            if (slot!.interaction.kind === "approval" ? !["allow_once", "deny"].includes(command.decision) : command.decision !== "answer" || typeof command.answer !== "string" || !command.answer.trim()) throw new Error("Unsupported native decision or empty question answer");
            permit.assertAuthority(); check();
            remote = { slot: slot!, decisionId: command.decisionId };
            try {
                const applied = slot!.interaction.kind === "approval" ? native.resolvePendingToolApproval(undefined, command.decision === "allow_once" ? "yesButtonClicked" : "noButtonClicked") : native.resolvePendingAskQuestion(command.answer);
                if (!applied || !slot!.receipt || slot!.receipt.decisionId !== command.decisionId) throw new Error("EXECUTION_UNKNOWN: native resolver receipt unavailable");
                return structuredClone(slot!.receipt);
            } finally { remote = undefined; }
        },
        dispose(): void { disposed = true; }
    };
}
