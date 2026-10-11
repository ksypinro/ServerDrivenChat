import { createHash } from "node:crypto";
import type { AdapterMutationContext, AdapterOutcome, AppAdapter, Binding, ProtocolCommand, ProtocolEvent } from "@server-driven-chat/protocol";
import { validateCommandSkip, validateDispatchPermit, validateProtocolMessage } from "@server-driven-chat/protocol";
import { BridgeStorageConflict, BridgeStore, type BridgeLane, type CommandInput, type DispatchState } from "../storage/index.js";

export type BridgeRuntimeState = "stopped" | "connecting" | "online" | "reconnecting" | "authentication_required" | "lease_lost" | "disabled" | "reconciliation_required";
export interface BridgeRuntimeOptions {
    serverUrl: string;
    deviceId: string;
    credential: string;
    binding: Binding;
    store: BridgeStore;
    adapter: AppAdapter;
    fetch?: typeof fetch;
    now?: () => number;
    random?: () => number;
    reconnectBaseMs?: number;
    reconnectCapMs?: number;
    leaseRenewIntervalMs?: number;
    maxOutboxEvents?: number;
    maxAttachmentBytes?: number;
    onStateChange?: (state: BridgeRuntimeState) => void;
    approvalHandler?: (binding: Binding, command: Extract<ProtocolCommand, { type: "approval.decide" }>, context: AdapterMutationContext) => Promise<AdapterOutcome<void>>;
}

type StoredCommand = { commandId: string; sessionId: string; deviceId: string; lane: BridgeLane; laneSeq: number; payload: ProtocolCommand };
type SseFrame = { id?: string; event?: string; data: string };

/** Persistent non-LLM bridge loop. It never retries an uncertain app side effect. */
export class BridgeRuntime {
    readonly #base: URL;
    readonly #fetch: typeof fetch;
    readonly #now: () => number;
    readonly #random: () => number;
    readonly #baseBackoff: number;
    readonly #backoffCap: number;
    readonly #renewInterval: number;
    readonly #outboxLimit: number;
    readonly #maxAttachmentBytes: number;
    #state: BridgeRuntimeState = "stopped";
    #controller?: AbortController;
    #tasks: Promise<void>[] = [];
    #starting?: Promise<void>;
    #leaseUntil = 0;
    #leaseGeneration: number;
    #busy = false;
    #reconciliationRequired = false;
    #wakePrompt?: () => void;
    #wakeOutput?: () => void;
    #wakeAcks?: () => void;

    constructor(readonly options: BridgeRuntimeOptions) {
        this.#base = new URL(options.serverUrl);
        if ((this.#base.protocol !== "https:" && !(this.#base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(this.#base.hostname))) ||
            this.#base.username || this.#base.password || this.#base.search || this.#base.hash || this.#base.pathname !== "/") throw new TypeError("Bridge server URL must use HTTPS (except loopback) and contain no credentials, path, query, or fragment");
        if (!options.deviceId || !options.credential) throw new TypeError("Device ID and credential are required");
        this.#fetch = options.fetch ?? fetch;
        this.#now = options.now ?? (() => performance.now());
        this.#random = options.random ?? Math.random;
        this.#baseBackoff = options.reconnectBaseMs ?? 500;
        this.#backoffCap = options.reconnectCapMs ?? 30_000;
        this.#renewInterval = options.leaseRenewIntervalMs ?? 20_000;
        this.#outboxLimit = options.maxOutboxEvents ?? 5_000;
        this.#maxAttachmentBytes = options.maxAttachmentBytes ?? 20 * 1024 * 1024;
        this.#leaseGeneration = options.binding.leaseGeneration;
        if (![this.#baseBackoff, this.#backoffCap, this.#renewInterval, this.#outboxLimit,this.#maxAttachmentBytes].every(Number.isSafeInteger) || this.#baseBackoff < 1 || this.#backoffCap < this.#baseBackoff || this.#renewInterval < 100 || this.#outboxLimit < 1 || this.#maxAttachmentBytes < 1)
            throw new RangeError("Bridge runtime limits are invalid");
    }

    get state(): BridgeRuntimeState { return this.#state; }
    get leaseExpiresAt(): number { return this.#leaseUntil; }

    /** Inspect native state and renew a lease before any subscription or mutation begins. */
    async start(): Promise<void> {
        if (this.#controller || this.#tasks.length || this.#starting) throw new Error("Bridge runtime is already started or still stopping");
        const controller = new AbortController();
        this.#controller = controller;
        const starting = this.#start(controller.signal);
        this.#starting = starting;
        try { await starting; } finally { if (this.#starting === starting) this.#starting = undefined; }
    }

    async #start(signal: AbortSignal): Promise<void> {
        this.#setState("connecting");
        const recovery = this.options.store.recoverAfterRestart(this.options.binding.sessionId);
        this.#reconciliationRequired = recovery.attempts.some((attempt) => attempt.sessionId === this.options.binding.sessionId && attempt.state === "reconciliation_required");
        const inspected = await abortableOperation(this.options.adapter.inspect(this.options.binding), signal).catch(error => { if (signal.aborted) return undefined; throw error; });
        if (signal.aborted || !inspected) return;
        if (inspected.outcome !== "accepted" && inspected.outcome !== "applied") {
            this.#setState("reconciliation_required");
            return;
        }
        const snapshot = inspected.value;
        if (!snapshot || snapshot.sessionId !== this.options.binding.sessionId || snapshot.bindingRevision !== this.options.binding.bindingRevision || snapshot.leaseGeneration !== this.#leaseGeneration) {
            this.#setState("reconciliation_required");
            return;
        }
        this.#busy = ["dispatching", "running", "waiting_for_input", "waiting_for_approval"].includes(snapshot.turnState);
        let failures = 0;
        while (!signal.aborted) {
            try { await this.#renewLease(signal); break; }
            catch (error) {
                if (signal.aborted) return;
                if (error instanceof BridgeHttpError && [401, 409].includes(error.status)) { this.#handleFatal(error); return; }
                failures++;
                this.#setState("reconnecting");
                await abortableDelay(reconnectDelay(this.#baseBackoff, this.#backoffCap, failures, this.#random), signal);
            }
        }
        if (signal.aborted) return;
        this.#setState(this.#reconciliationRequired ? "reconciliation_required" : "online");
        this.#tasks = [
            this.#commandLoop("prompt", signal), this.#commandLoop("control", signal),
            this.#dispatchLoop("prompt", signal), this.#dispatchLoop("control", signal),
            this.#leaseLoop(signal), this.#leaseWatchdog(signal), this.#adapterEventsLoop(signal), this.#outboxLoop(signal), this.#ackLoop(signal)
        ];
        for (const task of this.#tasks) void task.catch((error: unknown) => { if (!signal.aborted) this.#handleFatal(error); });
    }

    /** Local disable is synchronous with respect to dispatch: abort loops before returning. */
    disable(): void {
        this.#controller?.abort(new Error("Bridge locally disabled"));
        this.#leaseUntil = 0;
        this.#setState("disabled");
        this.#wakePrompt?.(); this.#wakeOutput?.(); this.#wakeAcks?.();
    }

    async stop(): Promise<void> {
        if (this.#controller) this.#controller.abort(new Error("Bridge stopped"));
        const tasks = this.#tasks;
        this.#leaseUntil = 0;
        this.#wakePrompt?.(); this.#wakeOutput?.(); this.#wakeAcks?.();
        await Promise.allSettled([...tasks, ...(this.#starting ? [this.#starting] : [])]);
        this.#controller = undefined;
        this.#tasks = [];
        if (this.#state !== "disabled") this.#setState("stopped");
    }

    async #commandLoop(lane: BridgeLane, signal: AbortSignal): Promise<void> {
        let failures = 0;
        while (!signal.aborted && !this.#isFatal()) {
            const after = this.options.store.getCursor(this.options.deviceId, lane);
            const url = new URL(`/v2/devices/${encodeURIComponent(this.options.deviceId)}/commands`, this.#base);
            url.searchParams.set("lane", lane); url.searchParams.set("after", String(after));
            try {
                const response = await this.#fetch(url, { headers: { authorization: `Bearer ${this.options.credential}`, accept: "text/event-stream", "last-event-id": String(after) }, signal });
                if (signal.aborted) break;
                if (response.status === 401) throw new BridgeHttpError(401, "Device authentication must be repaired");
                if (response.status === 409) throw new BridgeHttpError(409, "Command replay cursor is inconsistent; native state requires reconciliation");
                if (!response.ok || !response.body) throw new BridgeHttpError(response.status, `Command stream failed (${response.status})`);
                if (!response.headers.get("content-type")?.startsWith("text/event-stream")) throw new Error("Server command response is not an SSE stream");
                failures = 0;
                this.#setState(this.#reconciliationRequired ? "reconciliation_required" : "online");
                for await (const frame of parseSse(response.body, signal)) {
                    if (signal.aborted) break;
                    if (frame.event === "command.skipped") {
                        const parsed = validateCommandSkip(JSON.parse(frame.data));
                        if (!parsed.valid) throw new BridgeHttpError(409,"Malformed command tombstone");
                        const skip = parsed.value;
                        if (skip.deviceId !== this.options.deviceId || skip.lane !== lane || skip.reason !== "obsolete_binding" || !skip.commandId || Number(frame.id) !== skip.laneSeq) throw new BridgeHttpError(409,"Invalid command tombstone");
                        this.options.store.acceptSkip(skip); this.#wakePrompt?.(); continue;
                    }
                    if (frame.event !== "command" || frame.data.length === 0) continue;
                    const stored = parseStoredCommand(frame.data, lane);
                    if (stored.deviceId !== this.options.deviceId || Number(frame.id) !== stored.laneSeq)
                        throw new BridgeHttpError(409, "Command arrived for a different device or binding");
                    const disposition = this.options.store.acceptCommand({ ...stored, payload: stored.payload });
                    void disposition;
                    this.#wakeAcks?.();
                    this.#wakePrompt?.();
                }
                if (!signal.aborted) throw new Error("Command stream disconnected");
            } catch (error) {
                if (signal.aborted) break;
                if (error instanceof BridgeHttpError && error.status === 401) { this.#handleFatal(error); break; }
                if (error instanceof BridgeStorageConflict || error instanceof RangeError || (error instanceof BridgeHttpError && error.status < 500 && error.status !== 408 && error.status !== 429)) { this.#reconciliationRequired = true; this.#setState("reconciliation_required"); this.#abortLoops(); break; }
                failures++;
                this.#setState("reconnecting");
                await abortableDelay(reconnectDelay(this.#baseBackoff, this.#backoffCap, failures, this.#random), signal);
            }
        }
    }

    async #dispatchLoop(lane: BridgeLane, signal: AbortSignal): Promise<void> {
        while (!signal.aborted && !this.#isFatal()) {
            if (!this.#leaseIsValid()) { await abortableDelay(Math.min(250, this.#renewInterval), signal); continue; }
            if (lane === "prompt" && this.#reconciliationRequired) { await abortableDelay(100, signal); continue; }
            const commands = this.options.store.listQueuedCommands(this.options.deviceId, lane, 100, this.options.binding.sessionId);
            if (!commands.length) { await this.#wait(signal, lane === "prompt" ? "prompt" : "output", 100); continue; }
            for (const input of commands) {
                if (signal.aborted || !this.#leaseIsValid() || (lane === "prompt" && this.#reconciliationRequired)) break;
                if (lane === "prompt") await this.#waitUntilTurnIdle(signal);
                if (signal.aborted || !this.#leaseIsValid() || (lane === "prompt" && this.#reconciliationRequired)) break;
                await this.#dispatch(input, signal);
            }
        }
    }

    async #dispatch(input: CommandInput, signal: AbortSignal): Promise<void> {
        const validation = validateProtocolMessage(input.payload, { sessionId: this.options.binding.sessionId,
            bindingRevision: this.options.binding.bindingRevision, leaseGeneration: this.#leaseGeneration });
        if (!validation.valid || !("lane" in validation.value) || validation.value.lane !== input.lane || validation.value.commandId !== input.commandId) {
            this.options.store.markCommandReconciliation(input.commandId);
            await this.#postAck(input, "rejected", "Protocol or binding identity is stale");
            this.#reconciliationRequired = true;
            this.#setState("reconciliation_required");
            return;
        }
        const command = validation.value as ProtocolCommand;
        if (!this.#leaseIsValid()) return;
        const check = await abortableOperation(this.options.adapter.inspect(this.options.binding), signal).catch(error => { if (signal.aborted) return undefined; throw error; });
        if (signal.aborted || !this.#leaseIsValid() || !check) return;
        if ((check.outcome !== "accepted" && check.outcome !== "applied") || !check.value || check.value.sessionId !== this.options.binding.sessionId ||
            check.value.bindingRevision !== this.options.binding.bindingRevision || check.value.leaseGeneration !== this.#leaseGeneration) {
            this.options.store.markCommandReconciliation(command.commandId);
            await this.#postAck(input, "reconciliation_required", "Native binding could not be verified");
            this.#reconciliationRequired = true;
            this.#setState("reconciliation_required");
            return;
        }
        const appIsBusy = ["dispatching", "running", "waiting_for_input", "waiting_for_approval"].includes(check.value.turnState);
        if (command.type === "turn.submit" && appIsBusy) { this.#busy = true; return; }
        let release: (() => Promise<void>) | undefined;
        let outcome: AdapterOutcome<unknown>;
        let began = false;
        try {
            const permit = await this.#dispatchPermit(signal,command.commandId);
            release = permit.release;
            const context: AdapterMutationContext = {signal: permit.signal, assertAuthority: () => {
                if (permit.signal.aborted || !this.#leaseIsValid() || this.#now() + 1500 >= permit.deadline) throw new BridgeHttpError(409,"Dispatch authority expired or was withdrawn");
            }};
            context.assertAuthority();
            const started = this.options.store.beginDispatch(input.commandId, attemptId(input.commandId), command);
            if (started !== "started") return;
            began = true;
            if (command.type === "turn.submit") this.#busy = true;
            context.assertAuthority();
            outcome = await abortableOperation(this.#apply(command, context), context.signal);
        } catch (error) {
            if (began) {
                this.options.store.finishDispatch(command.commandId, "reconciliation_required");
                await this.#postAck(input, "reconciliation_required", safeMessage(error));
                this.#reconciliationRequired = true;
            }
            if (!signal.aborted) this.#handleFatal(error);
            return;
        } finally { await release?.(); }
        if (signal.aborted) {
            this.options.store.finishDispatch(command.commandId,"reconciliation_required");
            await this.#postAck(input,"reconciliation_required","Dispatch completed after lifecycle cancellation; verify native outcome");
            return;
        }
        if (outcome.outcome === "unknown") {
            this.options.store.finishDispatch(command.commandId, "reconciliation_required");
            await this.#postAck(input, "reconciliation_required", outcome.reason);
            this.#reconciliationRequired = true;
            this.#setState("reconciliation_required");
            return;
        }
        const accepted = outcome.outcome === "applied" || outcome.outcome === "accepted";
        this.options.store.finishDispatch(command.commandId, accepted ? "applied" : "rejected");
        await this.#postAck(input, accepted ? "applied" : "rejected", "reason" in outcome ? outcome.reason : outcome.evidence);
        if (!accepted && command.type === "turn.submit") { this.#busy = false; this.#wakePrompt?.(); }
        if (command.type === "session.disable" && accepted) this.disable();
    }

    async #apply(command: ProtocolCommand, context: AdapterMutationContext): Promise<AdapterOutcome<unknown>> {
        const adapter = this.options.adapter;
        switch (command.type) {
            case "turn.submit": return this.#submit(command,context);
            case "turn.cancel": return adapter.cancel(this.options.binding, command.turnId, context);
            case "input.respond": return adapter.respondInput(this.options.binding, command.payload.requestId, command.payload.requestRevision, command.payload.answer, context);
            case "approval.decide": return this.options.approvalHandler ? this.options.approvalHandler(this.options.binding, command, context) : { outcome: "unsupported", reason: "Request-bound approval engine is owned by M11 and is not configured" };
            case "permission.revoke": return adapter.revoke(this.options.binding, command.payload.grantId, context);
            case "session.inspect": return adapter.inspect(this.options.binding);
            case "session.disable": return { outcome: "applied", evidence: "Local remote dispatch disabled" };
            case "turn.steer": return { outcome: "unsupported", reason: "Adapter SDK does not expose an active-turn steering operation" };
        }
    }

    async #submit(command: Extract<ProtocolCommand,{type:"turn.submit"}>,context:AdapterMutationContext):Promise<AdapterOutcome<{nativeTurnId?:string}>> {
        const blocks=command.payload.content.filter(block=>block.type==="image"||block.type==="file");
        const unique=[...new Map(blocks.map(block=>[block.attachmentId,block])).values()];
        if(unique.length) {
            const capabilities=await this.options.adapter.probe();
            if(capabilities.operations.stageAttachment?.status!=="supported" || !this.options.adapter.stageAttachment)
                return {outcome:"unsupported",reason:capabilities.operations.stageAttachment?.reason ?? "Adapter cannot verify attachment staging; prompt was not submitted"};
            for(const block of unique) {
                context.assertAuthority();
                const response=await this.#fetch(new URL(`/v2/attachments/${encodeURIComponent(block.attachmentId)}`,this.#base),{headers:{authorization:`Bearer ${this.options.credential}`,accept:"application/octet-stream"},signal:AbortSignal.any([context.signal,AbortSignal.timeout(15_000)])});
                if(!response.ok) return {outcome:response.status===401?"rejected":"unknown",reason:`Committed attachment retrieval returned ${response.status}; prompt was not submitted`};
                const mimeType=response.headers.get("content-type")?.split(";")[0].trim() ?? "";
                const sizeBytes=Number(response.headers.get("content-length"));
                const sha256=response.headers.get("x-attachment-sha256") ?? "";
                if(mimeType!==block.mimeType || !Number.isSafeInteger(sizeBytes) || sizeBytes<1 || sizeBytes>this.#maxAttachmentBytes || !/^sha256:[a-f0-9]{64}$/.test(sha256))
                    return {outcome:"rejected",reason:"Attachment metadata or configured size limit is invalid; prompt was not submitted"};
                let content:Uint8Array;
                try { content=await readBoundedAttachment(response,this.#maxAttachmentBytes); }
                catch { return {outcome:"rejected",reason:"Attachment response exceeded its committed size or was truncated; prompt was not submitted"}; }
                if(content.byteLength!==sizeBytes || `sha256:${createHash("sha256").update(content).digest("hex")}`!==sha256) return {outcome:"rejected",reason:"Attachment response failed committed length or checksum verification; prompt was not submitted"};
                const filename=response.headers.get("x-attachment-filename") ? decodeURIComponent(response.headers.get("x-attachment-filename")!) : undefined;
                if(block.type==="file" && filename!==block.filename) return {outcome:"rejected",reason:"File reference name differs from committed metadata; prompt was not submitted"};
                const reference={attachmentId:block.attachmentId,mimeType,sizeBytes,sha256,...(block.type==="file"?{filename:block.filename}:{})};
                context.assertAuthority();
                const staged=await this.options.adapter.stageAttachment(this.options.binding,reference,content,context);
                if(staged.outcome!=="applied" || !staged.value || staged.value.attachmentId!==reference.attachmentId || staged.value.mimeType!==reference.mimeType || staged.value.sizeBytes!==reference.sizeBytes || staged.value.sha256!==reference.sha256 || !staged.value.receiptId)
                    return {outcome:staged.outcome==="unknown"?"unknown":"rejected",reason:"Adapter did not confirm staging the exact committed attachment; prompt was not submitted"};
                context.assertAuthority();
                const receipt=await this.#request(`/v2/devices/${encodeURIComponent(this.options.deviceId)}/attachments/${encodeURIComponent(block.attachmentId)}/staging-receipts`,{
                    sessionId:this.options.binding.sessionId,bindingId:this.options.binding.bindingId,receiptId:staged.value.receiptId,adapterId:capabilities.adapterId,
                    sha256:reference.sha256,sizeBytes:reference.sizeBytes,mimeType:reference.mimeType
                },context.signal);
                if(!receipt.ok) return {outcome:"unknown",reason:"Adapter staged the content but the durable staging receipt was not recorded; prompt was not submitted"};
            }
        }
        context.assertAuthority();
        return this.options.adapter.submit(this.options.binding,command,context);
    }

    async #leaseLoop(signal: AbortSignal): Promise<void> {
        let failures = 0;
        let waitMs = this.#renewInterval;
        while (!signal.aborted) {
            await abortableDelay(waitMs, signal);
            if (signal.aborted) break;
            try { await this.#renewLease(signal); failures = 0; waitMs = this.#renewInterval; }
            catch (error) {
                if (signal.aborted) break;
                if (error instanceof BridgeHttpError && error.status === 401) { this.#handleFatal(error); break; }
                if (error instanceof BridgeHttpError && error.status === 409) { this.#setState("lease_lost"); this.#abortLoops(); break; }
                failures++;
                this.#setState("reconnecting");
                const remaining = this.#leaseUntil - this.#now();
                if (remaining <= 0) { this.#setState("lease_lost"); this.#abortLoops(); break; }
                waitMs = Math.min(reconnectDelay(this.#baseBackoff, this.#backoffCap, failures, this.#random), remaining);
            }
        }
    }

    async #leaseWatchdog(signal: AbortSignal): Promise<void> {
        while (!signal.aborted) {
            await abortableDelay(100,signal);
            if (!signal.aborted && this.#now() + 1500 >= this.#leaseUntil) { this.#setState("lease_lost"); this.#abortLoops(); }
        }
    }

    #fence(): {sessionId: string;bindingRevision: number;leaseGeneration: number} {
        return {sessionId: this.options.binding.sessionId,bindingRevision: this.options.binding.bindingRevision,leaseGeneration: this.#leaseGeneration};
    }

    #deadline(body: {leaseExpiresAt?: string;serverTime?: string;bindingRevision?: number;leaseGeneration?: number}, sentAt: number): number {
        if (!body.leaseExpiresAt || !body.serverTime || body.bindingRevision !== this.options.binding.bindingRevision || body.leaseGeneration !== this.#leaseGeneration)
            throw new BridgeHttpError(409,"Lease response does not match the active binding fence");
        const duration = Date.parse(body.leaseExpiresAt) - Date.parse(body.serverTime);
        const deadline = sentAt + duration;
        if (!Number.isFinite(duration) || deadline <= this.#now() + 1500) throw new BridgeHttpError(409,"Lease was exhausted in transit");
        return deadline;
    }

    async #renewLease(signal: AbortSignal): Promise<void> {
        const sentAt = this.#now();
        const response = await this.#request(`/v2/devices/${encodeURIComponent(this.options.deviceId)}/lease/renew`,this.#fence(),signal);
        if (!response.ok) throw await httpError(response);
        const body = await response.json() as {status?: string;leaseExpiresAt?: string;serverTime?: string;bindingRevision?: number;leaseGeneration?: number};
        if (signal.aborted) return;
        if (body.status !== "renewed") throw new BridgeHttpError(409,"Lease was not renewed");
        this.#leaseUntil = this.#deadline(body,sentAt);
        this.#setState(this.#reconciliationRequired ? "reconciliation_required" : "online");
    }

    async #dispatchPermit(signal: AbortSignal, commandId: string): Promise<{deadline: number;signal: AbortSignal;release: () => Promise<void>}> {
        const sentAt = this.#now();
        const permitController = new AbortController();
        const permitSignal = AbortSignal.any([signal,permitController.signal,AbortSignal.timeout(10_000)]);
        const response = await this.#request(`/v2/devices/${encodeURIComponent(this.options.deviceId)}/dispatch`,{...this.#fence(),commandId},permitSignal);
        if (!response.ok) throw await httpError(response);
        if (!response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) throw new BridgeHttpError(409,"Server did not provide a fenced dispatch channel");
        const iterator = parseSse(response.body,permitSignal)[Symbol.asyncIterator]();
        try {
            const frame = await abortableOperation(iterator.next(),signal);
            if (!frame.value || frame.value.event !== "dispatch.permit") throw new BridgeHttpError(409,"Missing dispatch permit");
            const parsed = validateDispatchPermit(JSON.parse(frame.value.data));
            if (!parsed.valid || parsed.value.sessionId !== this.options.binding.sessionId) throw new BridgeHttpError(409,"Invalid dispatch permit identity");
            const body = parsed.value;
            const deadline = Math.min(this.#leaseUntil,this.#deadline(body,sentAt));
            const ended = iterator.next().then(() => permitController.abort(new Error("Dispatch channel closed")), () => permitController.abort(new Error("Dispatch channel failed")));
            return {deadline,signal: permitSignal,release: async () => { permitController.abort(); await ended; await iterator.return?.(undefined); }};
        } catch (error) { permitController.abort(); await iterator.return?.(undefined); throw error; }
    }

    async #adapterEventsLoop(signal: AbortSignal): Promise<void> {
        let failures = 0;
        while (!signal.aborted && !this.#isFatal()) {
            try {
                const checkpoint = this.options.store.getOutputCheckpoints(this.options.binding.sessionId);
                for await (const event of this.options.adapter.subscribe(this.options.binding, checkpoint, { signal })) {
                    if (signal.aborted) break;
                    const checked = validateProtocolMessage(event, { sessionId: this.options.binding.sessionId,
                        bindingRevision: this.options.binding.bindingRevision, leaseGeneration: this.#leaseGeneration });
                    if (!checked.valid || !("producerSeq" in checked.value)) { this.#setState("reconciliation_required"); this.#abortLoops(); return; }
                    if (event.producerSeq > this.options.store.getLastOutputSeq(event.sessionId, event.bridgeEpoch) + 1) throw new RangeError("Native producer cursor has a gap; reconciliation required");
                    if (event.type === "turn.started") this.#busy = true;
                    if (["turn.completed", "turn.failed", "turn.cancelled"].includes(event.type)) { this.#busy = false; this.#wakePrompt?.(); }
                    this.options.store.persistOutput({ eventId: event.eventId, sessionId: event.sessionId, eventSeq: event.producerSeq, bridgeEpoch: event.bridgeEpoch, payload: event },this.#outboxLimit);
                    this.#wakeOutput?.();
                }
                if (!signal.aborted) throw new Error("Native event stream disconnected");
            } catch (error) {
                if (signal.aborted) break;
                failures++;
                if (error instanceof BridgeStorageConflict || error instanceof RangeError || /does not match|binding|unknown/i.test(safeMessage(error))) { this.#setState("reconciliation_required"); this.#abortLoops(); break; }
                this.#setState("reconnecting");
                await abortableDelay(reconnectDelay(this.#baseBackoff, this.#backoffCap, failures, this.#random), signal);
            }
        }
    }

    async #outboxLoop(signal: AbortSignal): Promise<void> {
        let failures = 0;
        while (!signal.aborted) {
            const batch = this.options.store.listUnackedOutput(100, this.options.binding.sessionId);
            if (!batch.length) { await this.#wait(signal, "output", 200); continue; }
            try {
                for (const output of batch) {
                    if (signal.aborted) break;
                    const response = await this.#request(`/v2/devices/${encodeURIComponent(this.options.deviceId)}/events`, { event: output.payload });
                    if (response.status === 401) throw new BridgeHttpError(401, "Device authentication must be repaired");
                    if (!response.ok) throw await httpError(response);
                    this.options.store.acknowledgeOutput(output.eventId);
                }
                failures = 0;
            } catch (error) {
                if (signal.aborted) break;
                if (error instanceof BridgeHttpError && error.status === 401) { this.#handleFatal(error); break; }
                if (error instanceof RangeError || (error instanceof BridgeHttpError && error.status >= 400 && error.status < 500 && ![408,429].includes(error.status))) { this.#setState("reconciliation_required"); this.#abortLoops(); break; }
                failures++;
                this.#setState("reconnecting");
                await abortableDelay(reconnectDelay(this.#baseBackoff, this.#backoffCap, failures, this.#random), signal);
            }
        }
    }

    async #ackLoop(signal: AbortSignal): Promise<void> {
        let failures = 0;
        while (!signal.aborted) {
            const pending = this.options.store.listPendingServerAcks(this.options.deviceId, 100, this.options.binding.sessionId);
            if (!pending.length) { await this.#waitAck(signal, 150); continue; }
            try {
                for (const ack of pending) {
                    const response = await this.#request(`/v2/devices/${encodeURIComponent(this.options.deviceId)}/acks`, {
                        sessionId: ack.sessionId, lane: ack.lane, laneSeq: ack.laneSeq,
                        bindingRevision: this.options.binding.bindingRevision, leaseGeneration: this.#leaseGeneration,
                        state: ack.ackState, ...(ack.ackDetails ? { details: { message: ack.ackDetails } } : {})
                    });
                    if (response.status === 401) throw new BridgeHttpError(401, "Device authentication must be repaired");
                    if (response.status === 409) throw new BridgeHttpError(409, "Lease or command acknowledgement was fenced");
                    if (!response.ok) throw await httpError(response);
                    this.options.store.markServerAckSent(ack.commandId, ack.ackState);
                }
                failures = 0;
            } catch (error) {
                if (signal.aborted) break;
                if (error instanceof BridgeHttpError && error.status === 401) { this.#handleFatal(error); break; }
                if (error instanceof BridgeHttpError && error.status === 409) { this.#setState("lease_lost"); this.#abortLoops(); break; }
                failures++;
                await abortableDelay(reconnectDelay(this.#baseBackoff, this.#backoffCap, failures, this.#random), signal);
            }
        }
    }

    async #postAck(command: CommandInput, state: "received" | "applied" | "rejected" | "unknown" | "reconciliation_required", details?: string): Promise<void> {
        this.options.store.setServerAck(command.commandId, state, details);
        this.#wakeAcks?.();
    }

    async #waitAck(signal: AbortSignal, ms: number): Promise<void> {
        await new Promise<void>((resolve) => {
            const wake = (): void => { clearTimeout(timer); signal.removeEventListener("abort", wake); this.#wakeAcks = undefined; resolve(); };
            const timer = setTimeout(wake, ms);
            this.#wakeAcks = wake;
            signal.addEventListener("abort", wake, { once: true });
        });
    }

    async #request(path: string, body: unknown, signal = this.#controller?.signal): Promise<Response> {
        if (!signal || signal.aborted) throw new Error("Bridge lifecycle is not active");
        const requestSignal = AbortSignal.any([signal,AbortSignal.timeout(10_000)]);
        return abortableOperation(this.#fetch(new URL(path, this.#base), { method: "POST", headers: { authorization: `Bearer ${this.options.credential}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: requestSignal }),requestSignal);
    }

    async #waitUntilTurnIdle(signal: AbortSignal): Promise<void> {
        while (this.#busy && !signal.aborted && this.#leaseIsValid()) await this.#wait(signal, "prompt", 100);
    }

    async #wait(signal: AbortSignal, lane: "prompt" | "output", ms: number): Promise<void> {
        await new Promise<void>((resolve) => {
            const wake = (): void => { clearTimeout(timer); signal.removeEventListener("abort", wake); if (lane === "prompt") this.#wakePrompt = undefined; else this.#wakeOutput = undefined; resolve(); };
            const timer = setTimeout(wake, ms);
            if (lane === "prompt") this.#wakePrompt = wake; else this.#wakeOutput = wake;
            signal.addEventListener("abort", wake, { once: true });
        });
    }

    #leaseIsValid(): boolean { return this.#leaseUntil > this.#now() + 1500 && this.#state !== "disabled" && !this.#isFatal(); }
    #isFatal(): boolean { return ["authentication_required", "lease_lost", "disabled"].includes(this.#state); }
    #setState(state: BridgeRuntimeState): void { if (this.#state !== state) { this.#state = state; this.options.onStateChange?.(state); } }
    #handleFatal(error: unknown): void {
        if (error instanceof BridgeHttpError && error.status === 401) { this.#setState("authentication_required"); this.#abortLoops(); }
        else if (error instanceof BridgeHttpError && error.status === 409) { this.#setState("lease_lost"); this.#abortLoops(); }
        else { this.#setState("reconciliation_required"); this.#abortLoops(); }
    }
    #abortLoops(): void { this.#controller?.abort(); this.#leaseUntil = 0; this.#wakePrompt?.(); this.#wakeOutput?.(); this.#wakeAcks?.(); }
}

class BridgeHttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
function safeMessage(value: unknown): string { return value instanceof Error ? value.message : "Bridge operation failed"; }
function attemptId(commandId: string): string { return `dispatch:${commandId}`; }
export function reconnectDelay(base: number, cap: number, failures: number, random: () => number): number {
    const ceiling = Math.min(cap, base * (2 ** Math.min(20, Math.max(0, failures - 1))));
    return Math.min(cap, Math.max(1, Math.floor(ceiling * (0.5 + Math.max(0, Math.min(1, random()))))));
}
async function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    await new Promise<void>((resolve) => {
        const done = (): void => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, ms);
        signal.addEventListener("abort", done, { once: true });
    });
}
async function readBoundedAttachment(response:Response,limit:number):Promise<Uint8Array> {
    if(!response.body) throw new Error("Attachment response has no body");
    const reader=response.body.getReader(); const chunks:Uint8Array[]=[]; let size=0;
    try {
        while(true) {
            const part=await reader.read(); if(part.done) break;
            size+=part.value.byteLength;
            if(size>limit) { await reader.cancel(); throw new Error("Attachment exceeded configured staging limit"); }
            chunks.push(part.value);
        }
    } finally { reader.releaseLock(); }
    const content=new Uint8Array(size); let offset=0;
    for(const chunk of chunks) { content.set(chunk,offset); offset+=chunk.byteLength; }
    return content;
}
async function httpError(response: Response): Promise<BridgeHttpError> {
    let message = `Bridge request failed (${response.status})`;
    try { const body = await response.json() as { error?: { message?: string } }; if (body.error?.message) message = body.error.message; } catch { /* omit response text */ }
    return new BridgeHttpError(response.status, message);
}
function parseStoredCommand(text: string, lane: BridgeLane): StoredCommand {
    let record: unknown;
    try { record = JSON.parse(text); } catch { throw new BridgeHttpError(400, "Command stream contained invalid JSON"); }
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new BridgeHttpError(400, "Command record is malformed");
    const item = record as Record<string, unknown>;
    if (typeof item.commandId !== "string" || typeof item.sessionId !== "string" || typeof item.deviceId !== "string" || item.lane !== lane || !Number.isSafeInteger(item.laneSeq) || Number(item.laneSeq) < 1 || !item.payload || typeof item.payload !== "object")
        throw new BridgeHttpError(400, "Command record identity or lane sequence is malformed");
    return item as unknown as StoredCommand;
}

/** Minimal incremental SSE decoder; TextDecoder streaming mode preserves split multibyte UTF-8. */
export async function* parseSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal, maxFrameBytes = 1_048_576): AsyncGenerator<SseFrame> {
    const reader = body.getReader();
    const cancel = (): void => { void reader.cancel().catch(() => {}); };
    signal?.addEventListener("abort",cancel,{once:true});
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "";
    let frameBytes = 0;
    let id: string | undefined;
    let event: string | undefined;
    let data: string[] = [];
    try {
        while (!signal?.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let newline = buffer.indexOf("\n");
            while (newline >= 0) {
                let line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
                frameBytes += Buffer.byteLength(line,"utf8") + 1;
                if (frameBytes > maxFrameBytes) throw new RangeError("SSE frame exceeds the configured limit");
                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (line === "") {
                    if (data.length) yield { ...(id !== undefined ? { id } : {}), ...(event !== undefined ? { event } : {}), data: data.join("\n") };
                    id = undefined; event = undefined; data = []; frameBytes = 0;
                } else if (!line.startsWith(":")) {
                    const separator = line.indexOf(":");
                    const field = separator < 0 ? line : line.slice(0, separator);
                    const valueText = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
                    if (field === "id" && !valueText.includes("\u0000")) id = valueText;
                    else if (field === "event") event = valueText;
                    else if (field === "data") data.push(valueText);
                }
                newline = buffer.indexOf("\n");
            }
            if (frameBytes + Buffer.byteLength(buffer,"utf8") > maxFrameBytes) throw new RangeError("SSE frame exceeds the configured limit");
        }
        decoder.decode();
    } finally { signal?.removeEventListener("abort",cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function abortableOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Aborted"));
    return new Promise<T>((resolve,reject) => {
        const aborted = (): void => reject(signal.reason ?? new Error("Aborted"));
        signal.addEventListener("abort",aborted,{once:true});
        operation.then(resolve,reject).finally(() => signal.removeEventListener("abort",aborted));
    });
}
