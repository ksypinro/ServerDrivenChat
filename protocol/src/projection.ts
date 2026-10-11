import type { ApprovalRequest, OutputItem, ProtocolEvent } from "./contracts.js";
import { canonicalJson } from "./canonical.js";

export interface SequencedEvent { sessionSeq: number; event: ProtocolEvent }
export interface ProjectedItem extends OutputItem { completed: boolean; evidence: "observed" | "partial" | "unknown" }
export interface ProjectedArtifact { artifactId: string; attachmentId: string; mimeType: string; sizeBytes: number; sha256: string; state: "available" | "unknown" }
export interface ProjectionSnapshot {
    sessionId: string; watermark: number; items: ProjectedItem[]; artifacts: ProjectedArtifact[];
    pendingApprovals: ApprovalRequest[]; interactionStates: Record<string, string>;
    turnStates: Record<string, string>; completion: Record<string, "verified" | "unknown">;
    needsRepair: boolean; repairAfter: number | null;
}

/** Deterministic sequenced event reducer. Approval cards are indexed immediately, even across transcript gaps. */
export class TranscriptProjector {
    readonly #items = new Map<string, ProjectedItem>();
    readonly #artifacts = new Map<string, ProjectedArtifact>();
    readonly #approvals = new Map<string, ApprovalRequest>();
    readonly #interactions = new Map<string, string>();
    readonly #turns = new Map<string, string>();
    readonly #completion = new Map<string, "verified" | "unknown">();
    readonly #buffer = new Map<number, ProtocolEvent>();
    readonly #seen = new Map<string, string>();
    #watermark: number;
    #needsRepair = false;
    #repairAfter: number | null = null;
    #semanticRepair = false;

    constructor(readonly sessionId: string, replayWatermark = 0) {
        if (!sessionId || !Number.isSafeInteger(replayWatermark) || replayWatermark < 0) throw new TypeError("Projection identity and watermark are invalid");
        this.#watermark = replayWatermark;
    }

    ingest(input: SequencedEvent): { applied: number; duplicate: boolean; needsRepair: boolean } {
        const { event, sessionSeq } = input;
        if (!Number.isSafeInteger(sessionSeq) || sessionSeq < 1 || event.sessionId !== this.sessionId) throw new TypeError("Sequenced event has invalid session identity or cursor");
        const fingerprint = canonicalJson(event);
        const previous = this.#seen.get(event.eventId);
        if (previous !== undefined) {
            if (previous !== fingerprint) { this.#markRepair(this.#watermark,true); throw new Error("Event ID was replayed with conflicting content"); }
            return { applied: 0, duplicate: true, needsRepair: this.#needsRepair };
        }
        this.#seen.set(event.eventId, fingerprint);
        // Approval requests are complete cards; keep them responsive during transcript replay repair.
        if (event.type === "approval.required" || event.type === "approval.updated") {
            const request = event.payload;
            const key = this.#interactionKey(request.requestId, request.requestRevision);
            const current = this.#approvals.get(key);
            if (!current || canonicalJson(request) !== canonicalJson(current)) this.#approvals.set(key, request);
        }
        if (sessionSeq <= this.#watermark) return { applied: 0, duplicate: true, needsRepair: this.#needsRepair };
        const queued = this.#buffer.get(sessionSeq);
        if (queued && canonicalJson(queued) !== fingerprint) { this.#markRepair(this.#watermark,true); throw new Error("Session replay cursor was reused with conflicting content"); }
        this.#buffer.set(sessionSeq, event);
        let applied = 0;
        while (this.#buffer.has(this.#watermark + 1)) {
            const next = this.#buffer.get(this.#watermark + 1)!;
            this.#buffer.delete(this.#watermark + 1);
            this.#reduce(next);
            this.#watermark++;
            applied++;
        }
        if (this.#buffer.size && !this.#buffer.has(this.#watermark + 1)) this.#markRepair(this.#watermark);
        else if (!this.#buffer.size && !this.#semanticRepair) { this.#needsRepair = false; this.#repairAfter = null; }
        return { applied, duplicate: false, needsRepair: this.#needsRepair };
    }

    /** Install a server snapshot then replay only events strictly beyond its consistent watermark. */
    installSnapshot(snapshot: ProjectionSnapshot): void {
        if (snapshot.sessionId !== this.sessionId || !Number.isSafeInteger(snapshot.watermark) || snapshot.watermark < this.#watermark) throw new TypeError("Projection snapshot identity or watermark is stale");
        this.#items.clear(); for (const item of snapshot.items) this.#items.set(item.itemId, { ...item, content: [...item.content] });
        this.#artifacts.clear(); for (const artifact of snapshot.artifacts) this.#artifacts.set(artifact.artifactId, { ...artifact });
        this.#approvals.clear(); for (const approval of snapshot.pendingApprovals) this.#approvals.set(this.#interactionKey(approval.requestId,approval.requestRevision), approval);
        this.#interactions.clear(); for (const [key,value] of Object.entries(snapshot.interactionStates)) this.#interactions.set(key,value);
        this.#turns.clear(); for (const [key,value] of Object.entries(snapshot.turnStates)) this.#turns.set(key,value);
        this.#completion.clear(); for (const [key,value] of Object.entries(snapshot.completion)) this.#completion.set(key,value);
        this.#watermark = snapshot.watermark;
        for (const seq of this.#buffer.keys()) if (seq <= this.#watermark) this.#buffer.delete(seq);
        this.#needsRepair = false; this.#repairAfter = null; this.#semanticRepair = false;
        while (this.#buffer.has(this.#watermark + 1)) {
            const next=this.#buffer.get(this.#watermark+1)!;
            this.#buffer.delete(this.#watermark+1);
            this.#reduce(next);
            this.#watermark++;
        }
        if (this.#buffer.size && !this.#buffer.has(this.#watermark+1)) this.#markRepair(this.#watermark);
    }

    seedInteraction(requestId: string, requestRevision: number, state: string, request?: ApprovalRequest): void {
        const key = this.#interactionKey(requestId,requestRevision);
        this.#interactions.set(key,state);
        if (request && state === "pending") this.#approvals.set(key,request);
        else if (state !== "pending") this.#approvals.delete(key);
    }

    snapshot(): ProjectionSnapshot {
        return { sessionId: this.sessionId, watermark: this.#watermark, items: [...this.#items.values()],
            artifacts: [...this.#artifacts.values()],
            pendingApprovals: [...this.#approvals.values()].sort((a,b) => a.requestId.localeCompare(b.requestId) || a.requestRevision - b.requestRevision),
            interactionStates: Object.fromEntries([...this.#interactions].sort(([a],[b]) => a.localeCompare(b))), turnStates: Object.fromEntries([...this.#turns].sort(([a],[b]) => a.localeCompare(b))),
            completion: Object.fromEntries([...this.#completion].sort(([a],[b]) => a.localeCompare(b))), needsRepair: this.#needsRepair, repairAfter: this.#repairAfter };
    }

    #reduce(event: ProtocolEvent): void {
        switch (event.type) {
            case "output.item.created": case "output.item.replaced": {
                const payload = event.payload;
                const old = this.#items.get(payload.itemId);
                if (!old || payload.revision >= old.revision) this.#items.set(payload.itemId,{ ...payload, completed: old?.completed ?? false, evidence: payload.partial ? "partial" : payload.source === "native_event" ? "observed" : "unknown" });
                break;
            }
            case "output.item.delta": {
                const payload = event.payload;
                const old = this.#items.get(payload.itemId);
                if (!old || old.revision !== payload.baseRevision || payload.revision !== payload.baseRevision + 1) { this.#markRepair(this.#watermark,true); break; }
                const content = [...old.content];
                const last = content.at(-1);
                if (last?.type === "text") content[content.length - 1] = { type: "text", text: last.text + payload.textDelta };
                else content.push({ type: "text", text: payload.textDelta });
                this.#items.set(payload.itemId,{ ...old, revision: payload.revision, source: payload.source, partial: true, evidence: "partial", observedAt: payload.observedAt, content });
                break;
            }
            case "output.item.completed": {
                const payload = event.payload;
                const old = this.#items.get(payload.itemId);
                if (!old || old.revision !== payload.revision) { this.#markRepair(this.#watermark,true); break; }
                this.#items.set(payload.itemId,{ ...old, completed: true, partial: false, evidence: old.source === "native_event" ? "observed" : "unknown" });
                break;
            }
            case "artifact.available": { const payload = event.payload; this.#artifacts.set(payload.artifactId,{ artifactId: payload.artifactId, attachmentId: payload.attachmentId, mimeType: payload.mimeType, sizeBytes: payload.sizeBytes, sha256: payload.sha256, state: "available" }); break; }
            case "input.required": { const payload = event.payload; this.#interactions.set(this.#interactionKey(payload.requestId,payload.requestRevision),"pending"); break; }
            case "input.resolved": { const payload = event.payload; this.#interactions.set(this.#interactionKey(payload.requestId,payload.requestRevision),payload.outcome); break; }
            case "approval.required": case "approval.updated": { const payload = event.payload; this.#approvals.set(this.#interactionKey(payload.requestId,payload.requestRevision),payload); this.#interactions.set(this.#interactionKey(payload.requestId,payload.requestRevision),"pending"); break; }
            case "approval.resolved": { const payload = event.payload; this.#approvals.delete(this.#interactionKey(payload.requestId,payload.requestRevision)); this.#interactions.set(this.#interactionKey(payload.requestId,payload.requestRevision),payload.state); break; }
            case "turn.state": { const payload = event.payload; this.#turns.set(payload.turnId,payload.state); if(payload.state==="completion_unverified") this.#completion.set(payload.turnId,"unknown"); break; }
            case "turn.started": { const payload = event.payload; this.#turns.set(payload.turnId,"running"); break; }
            case "turn.completed": { const payload = event.payload; this.#turns.set(payload.turnId,"completed"); this.#completion.set(payload.turnId,payload.terminalEvidence ? "verified" : "unknown"); break; }
            case "turn.failed": { const payload = event.payload; this.#turns.set(payload.turnId,"failed"); break; }
            case "turn.cancelled": { const payload = event.payload; this.#turns.set(payload.turnId,"cancelled"); break; }
            default: break;
        }
    }
    #interactionKey(id: string, revision: number): string { return `${id}@${revision}`; }
    #markRepair(after: number, semantic = false): void { this.#needsRepair = true; this.#semanticRepair ||= semantic; this.#repairAfter = this.#repairAfter === null ? after : Math.min(this.#repairAfter,after); }
}
