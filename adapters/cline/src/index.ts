import { createHash, randomUUID } from "node:crypto";
import { ADAPTER_OPERATIONS, canonicalJson, normalizeActionDigestInput, validateDecisionAgainstRequest } from "@server-driven-chat/protocol";
import type { AdapterAttachmentReceipt, AdapterMutationContext, AdapterOutcome, AppAdapter, ApprovalDecisionProposal, ApprovalRequest, AttachmentReference,
    Binding, BindingSelection, CapabilitiesDocument, JsonValue, ProducerCursor, ProtocolCommand, ProtocolEvent, SessionSnapshot, TurnState } from "@server-driven-chat/protocol";
import { AdapterStreamError, adapterIdentityMatches } from "@server-driven-chat/adapter-core";
import type { NativeBridgeApi, NativeEvent, NativeMessage, NativeSnapshot, NativeInteraction, NativeControlReceipt } from "./native-api.js";
export type * from "./native-api.js";
export { createClineTaskBridge } from "./native-patch.js";

const reason = (error: unknown): string => error instanceof Error ? error.message : String(error);
const phaseState = (phase: string): TurnState => ({ streaming: "running", awaiting_approval: "waiting_for_approval", awaiting_input: "waiting_for_input",
    completed: "completed", awaiting_followup: "completed", error: "failed", resumable: "completion_unverified", idle: "completion_unverified" } as Record<string, TurnState>)[phase] ?? "reconciliation_required";

/** Adapter for the separately identified, pinned app-owned Cline API patch. Never accesses stock Cline internals. */
export class ClineAppAdapter implements AppAdapter {
    readonly #api: NativeBridgeApi;
    readonly #events: ProtocolEvent[] = [];
    readonly #commands = new Map<string, { turnId: string; text: string; imageIds: string[]; digest: string }>();
    readonly #items = new Map<string, { revision: number; turnId: string; partial: boolean }>();
    readonly #interactions = new Map<string, { native: NativeInteraction; request?: ApprovalRequest }>();
    readonly #decisions = new Map<string, { digest: string; receipt: NativeControlReceipt }>();
    readonly #nativeTurns = new Map<string, string>();
    readonly #staged = new Map<string, AdapterAttachmentReceipt>();
    readonly #epoch = randomUUID();
    #binding?: Binding;
    #token?: string;
    #unsubscribe?: () => void;
    #seq = 0;
    #turnId?: string;
    #state: TurnState = "completion_unverified";
    #invalidated = false;
    readonly #waiters = new Set<() => void>();

    constructor(api: NativeBridgeApi, private readonly options: { sessionId?: string; now?: () => string; onInvalidated?: (reason: string) => void } = {}) {
        if (!(["1.0", "1.1", "1.2", "1.3"].includes(api.apiVersion)) || api.clineVersion !== "4.1.22") throw new Error("Unsupported app-owned Cline API version");
        this.#api = api;
    }
    selection(): BindingSelection | undefined {
        const task = this.#api.currentTask(); if (!task) return;
        const context = this.#api.context();
        return { appId: "cline.vscode", appInstanceId: `${context.installationId}/${context.hostId}/${context.windowId}`, workspaceId: context.workspaceId, conversationId: task.taskId };
    }
    #now(): string { return this.options.now?.() ?? new Date().toISOString(); }
    #emit<T extends ProtocolEvent["type"]>(type: T, payload: Extract<ProtocolEvent, { type: T }>["payload"]): void {
        if (!this.#binding) return;
        this.#events.push({ protocolVersion: "2.0", type, eventId: randomUUID(), sessionId: this.#binding.sessionId, bindingRevision: this.#binding.bindingRevision,
            leaseGeneration: this.#binding.leaseGeneration, bridgeEpoch: this.#epoch, producerSeq: ++this.#seq, createdAt: this.#now(), payload } as ProtocolEvent);
        if (this.#events.length > 2048) this.#events.shift();
        for (const wake of this.#waiters) wake(); this.#waiters.clear();
    }
    #sameBinding(binding: Binding): boolean {
        return !!this.#binding && adapterIdentityMatches(this.#binding, binding) &&
            this.#binding.bindingId === binding.bindingId && this.#binding.sessionId === binding.sessionId && this.#binding.nativeConversationId === binding.nativeConversationId &&
            this.#binding.bindingRevision === binding.bindingRevision && this.#binding.leaseGeneration === binding.leaseGeneration;
    }
    #matches(binding: Binding): boolean { return !this.#invalidated && this.#sameBinding(binding); }
    #message(message: NativeMessage, commandId?: string, baseline = false, interactionId?: string): void {
        const prior = this.#items.get(message.id);
        const user = message.type === "say" && ["task", "user_feedback"].includes(message.category);
        if (user && !prior && !interactionId) {
            this.#turnId = commandId ? this.#commands.get(commandId)?.turnId : `local:${message.id}`;
            if (!this.#turnId) { this.#invalidate("Native echo refers to an unknown command"); return; }
            this.#nativeTurns.set(`${this.#binding!.nativeConversationId}:${message.id}`, this.#turnId);
            if (!baseline) { this.#state = "running"; this.#emit("turn.started", { turnId: this.#turnId, nativeTurnId: `${this.#binding!.nativeConversationId}:${message.id}`, conversationRevision: this.nativeSnapshot(this.#binding!).conversationRevision, state: "running" }); }
        }
        if (user && !prior && !baseline && interactionId && this.#turnId) this.#emit("turn.state", { turnId: this.#turnId, state: this.#state, conversationRevision: this.nativeSnapshot(this.#binding!).conversationRevision, reason: "Native answer message observed" });
        const turnId = prior?.turnId ?? this.#turnId ?? `history:${this.#binding!.nativeConversationId}`;
        const revision = (prior?.revision ?? 0) + 1;
        const item = { itemId: `${this.#binding!.bindingId}:${message.id}`, turnId, kind: user ? "user_message" as const : ["text", "completion_result", "plan_completion_result"].includes(message.category) ? "assistant_message" as const : "tool_activity" as const,
            revision, nativeCategory: message.category, source: "native_event" as const, partial: message.partial, content: [{ type: "text" as const, text: message.text }], observedAt: this.#now() };
        this.#items.set(message.id, { revision, turnId, partial: message.partial });
        this.#emit(prior ? "output.item.replaced" : "output.item.created", item);
        if (!message.partial && (!prior || prior.partial)) this.#emit("output.item.completed", { itemId: item.itemId, revision, turnId });
    }
    #invalidate(detail: string): void {
        if (this.#invalidated) return;
        this.#invalidated = true;
        this.#emit("session.reconciliation_required", { reason: detail, affectedIds: this.#binding ? [this.#binding.bindingId] : [] });
        this.options.onInvalidated?.(detail);
        for (const wake of this.#waiters) wake(); this.#waiters.clear();
    }
    #native(event: NativeEvent): void {
        if (this.#invalidated) return;
        if (event.type === "invalidated") { this.#invalidate(event.reason); return; }
        if (event.type === "message") {
            this.#message(event.message, event.commandId, false, event.interactionId);
            if (event.local) { this.#invalidate("A local user prompt changed the selected conversation; confirm binding again"); this.#api.detach(this.#token!); }
        } else if (event.type === "interaction") {
            this.#interaction(event.interaction);
        } else if (event.type === "resolved") {
            const pending = this.#interactions.get(event.receipt.askId);
            if (!pending || pending.native.askRevision !== event.receipt.askRevision || pending.native.nativeTurnId !== event.receipt.nativeTurnId) return;
            this.#interactions.delete(event.receipt.askId);
            if (pending.native.kind === "approval") {
                this.#emit("approval.resolved", { requestId: event.receipt.askId, requestRevision: event.receipt.askRevision,
                    ...(event.receipt.decisionId ? { decisionId: event.receipt.decisionId } : {}),
                    state: event.receipt.source === "local" ? "resolved_elsewhere" : event.receipt.outcome === "denied" ? "denied" : "applied" });
                if (event.receipt.source !== "local" && event.receipt.decisionId) this.#emit("approval.applied", {
                    requestId: event.receipt.askId, requestRevision: event.receipt.askRevision,
                    decisionId: event.receipt.decisionId, evidence: event.receipt.evidence
                });
            } else this.#emit("input.resolved", { requestId: event.receipt.askId, requestRevision: event.receipt.askRevision,
                outcome: event.receipt.source === "local" ? "resolved_elsewhere" : event.receipt.outcome === "answered" ? "answered" : "dismissed" });
            this.#state = "running";
        } else if (event.type === "cancelled") {
            const turnId = this.#nativeTurns.get(event.nativeTurnId);
            if (turnId) { this.#state = "cancelled"; this.#emit("turn.cancelled", { turnId, evidence: event.evidence }); }
        } else if (event.type === "phase") {
            this.#state = event.phase === "awaiting_followup" && event.isRunning === true ? "waiting_for_input" : phaseState(event.phase);
            if (!this.#turnId) return;
            if (this.#state === "completed") this.#emit("turn.completed", { turnId: this.#turnId, terminalEvidence: `App-owned Cline authoritative phase: ${event.phase}` });
            else if (this.#state === "failed") this.#emit("turn.failed", { turnId: this.#turnId, error: { code: "EXECUTION_UNKNOWN", message: "Cline entered native error phase", retryable: false } });
            else this.#emit("turn.state", { turnId: this.#turnId, state: this.#state, reason: `Cline native phase: ${event.phase}` });
        }
    }
    #interaction(native: NativeInteraction): void {
        if (!this.#binding || native.taskId !== this.#binding.nativeConversationId || this.#interactions.has(native.askId)) return;
        const turnId = this.#nativeTurns.get(native.nativeTurnId) ?? this.#turnId ?? `local:${native.nativeTurnId}`;
        this.#nativeTurns.set(native.nativeTurnId, turnId);
        if (native.kind === "question") {
            this.#interactions.set(native.askId, { native: structuredClone(native) }); this.#state = "waiting_for_input";
            this.#emit("input.required", { turnId, nativeTurnId: native.nativeTurnId, requestId: native.askId, requestRevision: native.askRevision, question: native.question ?? "",
                schema: { type: "string", minLength: 1 }, allowedChoices: native.choices ?? [], expiresAt: native.expiresAt });
        } else {
            const b = this.#binding;
            const input = { appId: b.appId, appInstanceId: b.appInstanceId, bindingId: b.bindingId, sessionId: b.sessionId,
                nativeConversationId: b.nativeConversationId, bindingRevision: b.bindingRevision, leaseGeneration: b.leaseGeneration,
                turnId, nativeTurnId: native.nativeTurnId, requestId: native.askId, nativeRequestId: native.toolCallId!, requestRevision: native.askRevision,
                action: { tool: native.toolName ?? "unknown", arguments: { input: native.input ?? null, nativePreview: native.preview ?? "" } as JsonValue,
                    ...(native.cwd ? { workingDirectory: native.cwd } : {}) },
                requestedPermissions: [], availableDecisions: [{ id: "allow_once", effect: "allow" as const, scope: "action" as const }, { id: "deny", effect: "deny" as const, scope: "action" as const }] };
            const request: ApprovalRequest = { ...input, kind: "action_approval",
                actionDigest: `sha256:${createHash("sha256").update(canonicalJson(normalizeActionDigestInput(input))).digest("hex")}`,
                evidence: { source: "native_event", snapshotId: native.messageId, complete: native.complete }, expiresAt: native.expiresAt };
            this.#interactions.set(native.askId, { native: structuredClone(native), request }); this.#state = "waiting_for_approval";
            this.#emit("approval.required", request);
        }
    }
    async probe(): Promise<CapabilitiesDocument> {
        return { protocolVersion: "2.0", adapterId: "server-driven-chat.cline", adapterVersion: "0.1.0", appId: "cline.vscode", appVersion: this.#api.apiVersion === "1.3" ? "4.1.22+sdc-m30.1" : this.#api.connect ? "4.1.22+sdc-m21.3" : this.#api.controls ? "4.1.22+sdc-m20.2" : "4.1.22+sdc-m19.1", platform: "vscode-local",
            operations: Object.fromEntries(ADAPTER_OPERATIONS.map(operation => [operation, ["probe", "attach", "inspect", "submit", "subscribe", "stageAttachment", "detach", ...(this.#api.controls ? ["resolveApproval", "respondInput", "cancel"] : [])].includes(operation)
                ? { status: "supported", reason: "Pinned app-owned API v1; local VS Code host only", evidenceRef: "docs/cline-bridge.md", ...(operation === "stageAttachment" ? { limits: { mimeTypes: ["image/png", "image/jpeg"], maxBytes: 10485760 } } : {}) }
                : { status: "unsupported", reason: operation === "revoke" ? "Native approvals allow one whole action once; the pinned app has no grant/revocation or persistent/narrowed permission API" : "Native request-bound controls are outside M19" }])),
            ...(this.#api.apiVersion === "1.3" ? {effectPolicies:{nativeToolsDenied:{status:"supported" as const,reason:"Exact per-turn native approval and question callbacks are denied before the app executor in caller-tool proposal mode",evidenceRef:"evidence/M30/native-tool-run/native-tool-denial.json"}}} : {}),
            observedAt: this.#now() };
    }
    async attach(selection: BindingSelection): Promise<AdapterOutcome<Binding>> {
        const actual = this.selection();
        if (this.#binding || !actual || !adapterIdentityMatches(actual as Binding, selection)) return { outcome: "rejected", reason: "Explicit host/workspace/task selection does not match, or adapter is already bound" };
        try {
            const native = this.#api.bind({ ...this.#api.context(), taskId: selection.conversationId });
            this.#token = native.token;
            this.#binding = { ...selection, bindingId: randomUUID(), sessionId: this.options.sessionId ?? randomUUID(), nativeConversationId: selection.conversationId,
                bindingRevision: 1, leaseGeneration: 1, capabilitiesRevision: this.#api.apiVersion === "1.3" ? "cline-4.1.22-sdc-m30.1" : this.#api.connect ? "cline-4.1.22-sdc-m21.3" : this.#api.controls ? "cline-4.1.22-sdc-m20.2" : "cline-4.1.22-sdc-m19.1" };
            this.#state = phaseState(native.snapshot.phase);
            for (const message of native.snapshot.messages) this.#message(message, undefined, true);
            for (const pending of native.snapshot.pending ?? []) this.#interaction(pending);
            this.#unsubscribe = this.#api.subscribe(native.token, native.snapshot.cursor, event => this.#native(event));
            return { outcome: "accepted", evidence: `App-owned exact native task binding ${native.snapshot.context.generation}`, value: structuredClone(this.#binding) };
        } catch (error) { if (this.#token) this.#api.detach(this.#token); this.#binding = undefined; return { outcome: "rejected", reason: reason(error) }; }
    }
    nativeSnapshot(binding: Binding): NativeSnapshot {
        if (!this.#matches(binding)) throw new Error("Binding changed");
        return this.#api.snapshot(this.#token!);
    }
    activeTurnId(binding: Binding): string | undefined {
        const native = this.nativeSnapshot(binding).nativeTurnId; return native ? this.#nativeTurns.get(native) : undefined;
    }
    async inspect(binding: Binding): Promise<AdapterOutcome<SessionSnapshot>> {
        if (!this.#matches(binding)) return { outcome: "unknown", reason: "Native binding requires reconciliation" };
        try { const snapshot = this.nativeSnapshot(binding);
            if (["awaiting_approval", "awaiting_input"].includes(snapshot.phase) && !snapshot.pending?.length) return { outcome: "unknown", reason: "Cline is waiting for native control; pending request enumeration requires the M20 API or the exact resolver is still being prepared" };
            for (const pending of snapshot.pending ?? []) this.#interaction(pending);
            const current = new Set(snapshot.pending?.map(value => value.askId) ?? []);
            const pending = [...this.#interactions.values()].filter(value => current.has(value.native.askId));
            const state = pending.some(value => value.native.kind === "approval") ? "waiting_for_approval" : pending.length ? "waiting_for_input" : snapshot.phase === "awaiting_followup" && snapshot.isRunning === true ? "waiting_for_input" : this.#state === "cancelled" && snapshot.phase === "resumable" ? "cancelled" : phaseState(snapshot.phase);
            return { outcome: "accepted", evidence: "Filtered app-owned Cline snapshot; auto-approval settings are reported by nativeSnapshot and remain app-owned", value: { sessionId: binding.sessionId, bindingRevision: binding.bindingRevision, leaseGeneration: binding.leaseGeneration,
                turnState: state, cursors: { prompt: 0, control: 0, sessionSeq: this.#seq }, pendingApprovals: pending.flatMap(value => value.request ? [structuredClone(value.request)] : []),
                pendingInputs: pending.filter(value => value.native.kind === "question").map(({ native }) => ({ requestId: native.askId, requestRevision: native.askRevision, question: native.question ?? "", expiresAt: native.expiresAt })) } };
        } catch (error) { this.#invalidate(reason(error)); return { outcome: "unknown", reason: reason(error) }; }
    }
    async submit(binding: Binding, command: ProtocolCommand, context?: AdapterMutationContext): Promise<AdapterOutcome<{ nativeTurnId?: string }>> {
        if (!context) return { outcome: "rejected", reason: "Native mutation authority context is required" };
        if (!this.#matches(binding) || command.sessionId !== binding.sessionId || command.bindingRevision !== binding.bindingRevision || command.leaseGeneration !== binding.leaseGeneration)
            return { outcome: "rejected", reason: "Command identity does not match the native binding" };
        if (command.type !== "turn.submit") return { outcome: "unsupported", reason: "Only turn.submit is implemented in M19" };
        if (command.payload.nativeToolPolicy === "deny" && this.#api.apiVersion !== "1.3") return { outcome: "unsupported", reason: "This native pin cannot deny tools for caller-function proposals" };
        if (command.payload.content.some(block => block.type !== "text" && block.type !== "image")) return { outcome: "unsupported", reason: "Native patch supports text and staged PNG/JPEG images; files/artifacts are unsupported" };
        const text = command.payload.content.filter(block => block.type === "text").map(block => block.text).join("\n");
        const imageIds = command.payload.content.filter(block => block.type === "image").map(block => block.attachmentId);
        if (command.payload.content.some(block => block.type === "image" && this.#staged.get(block.attachmentId)?.mimeType !== block.mimeType))
            return { outcome: "rejected", reason: "Image MIME type or staging identity does not match the submitted block" };
        const previous = this.#commands.get(command.commandId);
        if (previous && previous.digest !== canonicalJson(command)) return { outcome: "rejected", reason: "Command ID conflicts with an earlier native submission" };
        if (!previous && this.#commands.size >= 256) return { outcome: "rejected", reason: "Binding command receipt limit reached; reconcile before rebinding" };
        if (!previous) this.#commands.set(command.commandId, { turnId: command.turnId, text, imageIds, digest: canonicalJson(command) });
        try {
            const receipt = await this.#api.submit(this.#token!, { commandId: command.commandId, text, attachmentIds: imageIds, expectedConversationRevision: command.payload.expectedConversationRevision,
                ...(command.payload.nativeToolPolicy ? {nativeToolPolicy:command.payload.nativeToolPolicy} : {}) }, context);
            const echo = this.nativeSnapshot(binding).messages.find(message => message.id === receipt.messageId);
            if (!echo || echo.category !== "user_feedback" || echo.text !== text || JSON.stringify(echo.imageChecksums ?? []) !== JSON.stringify(receipt.imageChecksums))
                return { outcome: "unknown", reason: "Native acceptance lacks exact text/image echo evidence" };
            return { outcome: "accepted", evidence: `Native user-message echo ${receipt.messageId}; image checksums ${receipt.imageChecksums.join(",")}`, value: {} };
        } catch (error) { return { outcome: /EXECUTION_UNKNOWN/.test(reason(error)) ? "unknown" : "rejected", reason: reason(error) }; }
    }
    async *subscribe(binding: Binding, checkpoint: ProducerCursor[], options: { signal?: AbortSignal } = {}): AsyncIterable<ProtocolEvent> {
        if (!this.#sameBinding(binding)) throw new AdapterStreamError("rejected", "Stream binding mismatch");
        let after = Math.max(0, ...checkpoint.filter(cursor => cursor.bridgeEpoch === this.#epoch).map(cursor => cursor.producerSeq));
        while (!options.signal?.aborted) {
            if (after > this.#seq || (this.#events.length && after < this.#events[0].producerSeq - 1)) throw new AdapterStreamError("unknown", "Adapter cursor expired; snapshot and reconciliation required");
            const event = this.#events.find(candidate => candidate.producerSeq > after);
            if (event) { after = event.producerSeq; yield structuredClone(event); continue; }
            if (this.#invalidated) throw new AdapterStreamError("unknown", "Cline binding invalidated");
            await new Promise<void>(resolve => {
                const wake = (): void => { this.#waiters.delete(wake); options.signal?.removeEventListener("abort", wake); resolve(); };
                this.#waiters.add(wake); options.signal?.addEventListener("abort", wake, { once: true });
                if (options.signal?.aborted) wake();
            });
        }
    }
    async stageAttachment(binding: Binding, reference: AttachmentReference, bytes: Uint8Array, context?: AdapterMutationContext): Promise<AdapterOutcome<AdapterAttachmentReceipt>> {
        if (!context || !this.#matches(binding)) return { outcome: "rejected", reason: "Matching binding and native mutation authority are required" };
        if (!["image/png", "image/jpeg"].includes(reference.mimeType)) return { outcome: "unsupported", reason: "Only PNG/JPEG staging is supported by the pinned patch" };
        try { const receipt = this.#api.stageImage(this.#token!, reference, bytes, context); this.#staged.set(reference.attachmentId, receipt);
            return { outcome: "applied", evidence: "App-owned image staging receipt; submit separately verifies native echo", value: receipt }; }
        catch (error) { return { outcome: "rejected", reason: reason(error) }; }
    }
    async respondInput(binding: Binding, requestId: string, revision: number, answer: JsonValue, context?: AdapterMutationContext): Promise<AdapterOutcome<void>> {
        if (!this.#api.controls) return { outcome: "unsupported", reason: "M20 native input controls require API 1.1" };
        if (!context || !this.#matches(binding)) return { outcome: "rejected", reason: "Matching binding and mutation authority required" };
        const pending = this.#interactions.get(requestId)?.native;
        if (!pending || pending.kind !== "question" || pending.askRevision !== revision || typeof answer !== "string" || !answer.trim()) return { outcome: "rejected", reason: "REQUEST_STALE: exact question/revision and a nonempty native text answer required" };
        try { const receipt = this.#api.controls.resolve(this.#token!, { askId: requestId, askRevision: revision, decisionId: randomUUID(), decision: "answer", answer }, context);
            return { outcome: "applied", evidence: receipt.evidence }; }
        catch (error) { return { outcome: /EXECUTION_UNKNOWN/.test(reason(error)) ? "unknown" : "rejected", reason: reason(error) }; }
    }
    async resolveApproval(binding: Binding, request: ApprovalRequest, decision: ApprovalDecisionProposal, context?: AdapterMutationContext): Promise<AdapterOutcome<void>> {
        if (!this.#api.controls) return { outcome: "unsupported", reason: "M20 atomic approvals require API 1.1" };
        if (!context || !this.#matches(binding)) return { outcome: "rejected", reason: "Matching binding and mutation authority required" };
        let digest: string;
        try { digest = canonicalJson({ request, decision }); } catch { return { outcome: "rejected", reason: "Invalid native review JSON" }; }
        const prior = this.#decisions.get(decision.decisionId);
        if (prior) return prior.digest === digest ? { outcome: "applied", evidence: prior.receipt.evidence } : { outcome: "rejected", reason: "CONFLICT: decision ID has different review content" };
        const pending = this.#interactions.get(request.requestId);
        if (!pending?.request || canonicalJson(pending.request) !== canonicalJson(request)) return { outcome: "rejected", reason: "REQUEST_STALE: request differs from the exact native review" };
        if (decision.grantedPermissions.length || !["allow_once", "deny"].includes(decision.choiceId)) return { outcome: "unsupported", reason: "PERMISSION_SCOPE_UNSUPPORTED: only one whole native action once or denial is supported; narrowed/persistent grants are unavailable" };
        if (this.#decisions.size >= 256) return { outcome: "rejected", reason: "Control receipt limit reached; reconcile before rebinding" };
        const valid = await validateDecisionAgainstRequest(request, decision, this.#now());
        if (!valid.valid) return { outcome: "rejected", reason: JSON.stringify(valid.issues) };
        const recorded = this.#decisions.get(decision.decisionId);
        if (recorded) return recorded.digest === digest ? { outcome: "applied", evidence: recorded.receipt.evidence } : { outcome: "rejected", reason: "CONFLICT: concurrent decision ID reuse" };
        if (!this.#matches(binding) || this.#interactions.get(request.requestId) !== pending) return { outcome: "rejected", reason: "REQUEST_STALE: native request resolved during decision validation" };
        try { const receipt = this.#api.controls.resolve(this.#token!, { askId: request.requestId, askRevision: request.requestRevision, decisionId: decision.decisionId, decision: decision.choiceId as "allow_once" | "deny" }, context);
            this.#decisions.set(decision.decisionId, { digest, receipt });
            return { outcome: "applied", evidence: receipt.evidence }; }
        catch (error) { return { outcome: /EXECUTION_UNKNOWN/.test(reason(error)) ? "unknown" : "rejected", reason: reason(error) }; }
    }
    async cancel(binding: Binding, turnId: string, context?: AdapterMutationContext): Promise<AdapterOutcome<void>> {
        if (!this.#api.controls) return { outcome: "unsupported", reason: "M20 addressed cancellation requires API 1.1" };
        if (!context || !this.#matches(binding)) return { outcome: "rejected", reason: "Matching binding and mutation authority required" };
        try { const snapshot = this.nativeSnapshot(binding);
            if (!snapshot.nativeTurnId || this.#nativeTurns.get(snapshot.nativeTurnId) !== turnId) return { outcome: "rejected", reason: "REQUEST_STALE: cancellation targets a different native turn" };
            const receipt = await this.#api.controls.cancel(this.#token!, snapshot.nativeTurnId, context);
            return { outcome: "applied", evidence: receipt.evidence }; }
        catch (error) { return { outcome: /EXECUTION_UNKNOWN/.test(reason(error)) ? "unknown" : "rejected", reason: reason(error) }; }
    }
    async revoke(_binding: Binding, _grantId: string, _context?: AdapterMutationContext): Promise<AdapterOutcome<void>> { return { outcome: "unsupported", reason: "The pinned app supports one whole action once and exposes no revocable grants; an already executed action cannot be undone by revocation" }; }
    async detach(binding: Binding): Promise<AdapterOutcome<void>> {
        if (!this.#sameBinding(binding)) return { outcome: "rejected", reason: "Detach binding mismatch" };
        this.#unsubscribe?.(); if (this.#token) this.#api.detach(this.#token); this.#invalidate("Adapter detached");
        return { outcome: "applied", evidence: "Selected native task detached; task preserved" };
    }
}
