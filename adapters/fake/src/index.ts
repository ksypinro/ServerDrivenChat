import { createHash } from "node:crypto";
import type {
  AdapterAttachmentReceipt, AdapterMutationContext, AdapterOutcome, AppAdapter, ApprovalDecisionProposal, ApprovalRequest, AttachmentReference, Binding, BindingSelection,
  CapabilitiesDocument, JsonValue, ProducerCursor, ProtocolCommand, ProtocolEvent, SessionSnapshot
} from "@server-driven-chat/protocol";
import { ADAPTER_OPERATIONS, canonicalJson } from "@server-driven-chat/protocol";
import { AdapterStreamError, adapterIdentityMatches, adapterProtocolDependency } from "@server-driven-chat/adapter-core";

export const fakeAdapterModule = "adapter-fake" as const;
export const fakeAdapterIsSimulation = true as const;
export type FakeOperation = typeof ADAPTER_OPERATIONS[number];
export type FakeFault = "reject" | "unknown" | "unsupported";

export type FakeTurnStep =
  | { type: "partial"; text: string }
  | { type: "replace"; text: string }
  | { type: "input"; requestId: string; requestRevision: number; question: string }
  | { type: "approval"; request: ApprovalRequest }
  | { type: "complete"; text?: string };
export interface FakeAdapterOptions {
  appId?: string;
  appInstanceId?: string;
  conversationId?: string;
  sessionId?: string;
  bridgeEpoch?: string;
  nativeConversationId?: string;
  now?: () => string;
  unsupported?: FakeOperation[];
  /** Each queued fault is consumed by the next invocation of that operation. */
  faults?: Partial<Record<FakeOperation, FakeFault[]>>;
  script?: FakeTurnStep[];
}

const SIMULATED = "SIMULATED fake-adapter evidence; no native application was contacted";
const copy = <T>(value: T): T => structuredClone(value);

/** Deterministic in-memory adapter for SDK/conformance tests only. */
export class FakeAppAdapter implements AppAdapter {
  readonly #options: Required<Pick<FakeAdapterOptions, "appId" | "appInstanceId" | "conversationId" | "nativeConversationId" | "now">> & FakeAdapterOptions;
  readonly #events: ProtocolEvent[] = [];
  readonly #stagedAttachments = new Map<string,{ reference: AttachmentReference; content: Uint8Array }>();
  readonly #faults = new Map<FakeOperation, FakeFault[]>();
  readonly #unsupported: Set<FakeOperation>;
  readonly #scripts: FakeTurnStep[][];
  readonly #queued: ProtocolCommand[] = [];
  #binding?: Binding;
  #turnState: SessionSnapshot["turnState"] = "queued";
  #activeTurnId?: string;
  #pendingInput?: SessionSnapshot["pendingInputs"][number];
  #pendingApproval?: ApprovalRequest;
  #detached = false;
  #eventSeq = 0;
  #counter = 0;
  #wake?: () => void;
  #itemRevision = 0;

  constructor(options: FakeAdapterOptions = {}) {
    this.#options = {
      appId: options.appId ?? "fake.app", appInstanceId: options.appInstanceId ?? "fake-instance",
      conversationId: options.conversationId ?? "fake-conversation", nativeConversationId: options.nativeConversationId ?? "native:fake-conversation",
      now: options.now ?? (() => "2026-01-01T00:00:00.000Z"), ...options
    };
    this.#unsupported = new Set(options.unsupported ?? []);
    for (const [op, faults] of Object.entries(options.faults ?? {}) as [FakeOperation, FakeFault[]][]) this.#faults.set(op, [...faults]);
    this.#scripts = (options.script ? [options.script] : []).map((script) => copy(script));
  }

  #id(prefix: string): string { this.#counter += 1; return `${prefix}-${String(this.#counter).padStart(4, "0")}`; }
  #fault<T>(op: FakeOperation): AdapterOutcome<T> | undefined {
    if (this.#unsupported.has(op)) return { outcome: "unsupported", reason: `${op} is configured unsupported in this simulation` };
    const queue = this.#faults.get(op); const fault = queue?.shift();
    if (fault === "unknown") return { outcome: "unknown", reason: `${op} result was intentionally made unknown for fault testing` };
    if (fault === "unsupported") return { outcome: "unsupported", reason: `${op} fault injected unsupported` };
    if (fault === "reject") return { outcome: "rejected", reason: `${op} rejection fault injected` };
    return undefined;
  }
  #event<T extends ProtocolEvent["type"]>(type: T, payload: Extract<ProtocolEvent, { type: T }>["payload"]): void {
    if (!this.#binding) return;
    this.#eventSeq += 1;
    this.#events.push({ protocolVersion: "2.0", type, eventId: `${this.#options.bridgeEpoch ? this.#options.bridgeEpoch + ":" : ""}${this.#id("fake-event")}`, sessionId: this.#binding.sessionId,
      bindingRevision: this.#binding.bindingRevision, leaseGeneration: this.#binding.leaseGeneration, bridgeEpoch: this.#options.bridgeEpoch ?? "fake-epoch-1",
      producerSeq: this.#eventSeq, createdAt: this.#options.now(), payload } as ProtocolEvent);
    this.#wake?.(); this.#wake = undefined;
  }
  #result<T>(value: T, evidence = SIMULATED): AdapterOutcome<T> { return { outcome: "accepted", evidence, value }; }

  async probe(): Promise<CapabilitiesDocument> {
    const operations = Object.fromEntries(ADAPTER_OPERATIONS.map((op) => [op,
      this.#unsupported.has(op) ? { status: "unsupported" as const, reason: "Configured unsupported in fake adapter" } :
        { status: "supported" as const, reason: "Deterministic simulation only", evidenceRef: "simulated://fake-adapter" }
    ]));
    return { protocolVersion: "2.0", adapterId: "server-driven-chat.fake", adapterVersion: "0.1.0", appId: this.#options.appId,
      appVersion: "simulated", platform: "simulation", operations, observedAt: this.#options.now() };
  }

  async attach(selection: BindingSelection): Promise<AdapterOutcome<Binding>> {
    const fault = this.#fault<Binding>("attach"); if (fault) return fault;
    if (selection.appId !== this.#options.appId || selection.appInstanceId !== this.#options.appInstanceId || selection.conversationId !== this.#options.conversationId)
      return { outcome: "rejected", reason: "Selection does not identify the configured fake native conversation" };
    this.#detached = false;
    this.#binding = { ...copy(selection), bindingId: this.#id("fake-binding"), sessionId: this.#options.sessionId ?? this.#id("fake-session"),
      nativeConversationId: this.#options.nativeConversationId, bindingRevision: 1, leaseGeneration: 1, capabilitiesRevision: "fake-capabilities-1" };
    return this.#result(copy(this.#binding));
  }

  async inspect(binding: Binding): Promise<AdapterOutcome<SessionSnapshot>> {
    const fault = this.#fault<SessionSnapshot>("inspect"); if (fault) return fault;
    if (!this.#matches(binding)) return { outcome: "unknown", reason: "No matching active fake binding" };
    return this.#result({ sessionId: binding.sessionId, bindingRevision: binding.bindingRevision, leaseGeneration: binding.leaseGeneration,
      turnState: this.#turnState, cursors: { prompt: 0, control: 0, sessionSeq: this.#eventSeq },
      pendingApprovals: this.#pendingApproval ? [copy(this.#pendingApproval)] : [], pendingInputs: this.#pendingInput ? [copy(this.#pendingInput)] : [] });
  }

  async submit(binding: Binding, command: ProtocolCommand, context?: AdapterMutationContext): Promise<AdapterOutcome<{ nativeTurnId?: string }>> {
    context?.assertAuthority();
    const fault = this.#fault<{ nativeTurnId?: string }>("submit"); if (fault) return fault;
    if (!this.#matches(binding) || command.sessionId !== binding.sessionId || command.bindingRevision !== binding.bindingRevision || command.leaseGeneration !== binding.leaseGeneration)
      return { outcome: "unknown", reason: "Command identity or lease does not match the active fake binding" };
    if (command.type !== "turn.submit") return { outcome: "unsupported", reason: "Fake adapter accepts only turn.submit through submit" };
    if (this.#pendingInput || this.#pendingApproval || this.#activeTurnId) {
      if (command.payload.delivery === "queue" && !context) { this.#queued.push(copy(command)); return this.#result({}, `${SIMULATED}; prompt queued behind suspended turn`); }
      return { outcome: "rejected", reason: "A turn is suspended; immediate prompt cannot displace it" };
    }
    const foreignApproval = this.#scripts[0]?.some(step => step.type === "approval" &&
      (step.request.appId !== binding.appId || step.request.appInstanceId !== binding.appInstanceId || step.request.bindingId !== binding.bindingId ||
       step.request.sessionId !== binding.sessionId || step.request.nativeConversationId !== binding.nativeConversationId ||
       step.request.bindingRevision !== binding.bindingRevision || step.request.leaseGeneration !== binding.leaseGeneration || step.request.turnId !== command.turnId ||
       (step.request.nativeTurnId !== undefined && step.request.nativeTurnId !== `native:${command.turnId}`)));
    if (foreignApproval) return {outcome: "rejected", reason: "Scripted native approval does not belong to this binding and turn"};
    this.#runTurn(command);
    return this.#result({ nativeTurnId: `native:${command.turnId}` });
  }

  async *subscribe(binding: Binding, checkpoint: ProducerCursor[], options: { signal?: AbortSignal } = {}): AsyncIterable<ProtocolEvent> {
    const fault = this.#fault<never>("subscribe");
    if (fault && (fault.outcome === "rejected" || fault.outcome === "unsupported" || fault.outcome === "unknown"))
      throw new AdapterStreamError(fault.outcome, fault.reason);
    if (!this.#matches(binding)) throw new AdapterStreamError("unknown", "No matching active fake binding for subscription");
    let index = this.#events.findIndex((event) => event.producerSeq > Math.max(0, ...checkpoint.filter(cursor => cursor.bridgeEpoch === (this.#options.bridgeEpoch ?? "fake-epoch-1")).map((cursor) => cursor.producerSeq)));
    if (index < 0) index = this.#events.length;
    const wakeOnAbort = (): void => this.#wake?.();
    options.signal?.addEventListener("abort", wakeOnAbort, { once: true });
    try { while (!options.signal?.aborted && !this.#detached && this.#matches(binding)) {
      if (index < this.#events.length) { yield copy(this.#events[index++]); continue; }
      await new Promise<void>((resolve) => { this.#wake = resolve; });
    } } finally { options.signal?.removeEventListener("abort", wakeOnAbort); }
  }

  async respondInput(binding: Binding, requestId: string, requestRevision: number, _answer: JsonValue, context?: AdapterMutationContext): Promise<AdapterOutcome<void>> {
    context?.assertAuthority();
    const fault = this.#fault<void>("respondInput"); if (fault) return fault;
    if (!this.#matches(binding) || !this.#pendingInput || this.#pendingInput.requestId !== requestId || this.#pendingInput.requestRevision !== requestRevision)
      return { outcome: "unknown", reason: "Input request identity/revision is not the pending fake request" };
    this.#event("input.resolved", { requestId, requestRevision, outcome: "answered" }); this.#pendingInput = undefined;
    this.#resumeTurn(); return { outcome: "applied", evidence: SIMULATED };
  }

  async resolveApproval(binding: Binding, request: ApprovalRequest, decision: ApprovalDecisionProposal, context?: AdapterMutationContext): Promise<AdapterOutcome<void>> {
    context?.assertAuthority();
    const fault = this.#fault<void>("resolveApproval"); if (fault) return fault;
    if (!this.#matches(binding) || !this.#pendingApproval || request.requestId !== this.#pendingApproval.requestId || request.requestRevision !== this.#pendingApproval.requestRevision ||
      decision.requestId !== request.requestId || decision.requestRevision !== request.requestRevision || decision.actionDigest !== request.actionDigest)
      return { outcome: "unknown", reason: "Approval request identity, revision, or digest is stale in the fake adapter" };
    if (canonicalJson(request) !== canonicalJson(this.#pendingApproval))
      return { outcome: "rejected", reason: "Native review content differs from the stored pending request" };
    request = this.#pendingApproval;
    const choice = request.availableDecisions.find((candidate) => candidate.id === decision.choiceId);
    if (!choice) return { outcome: "rejected", reason: "Choice was not offered by the simulated approval request" };
    if (choice.effect !== "allow" && decision.grantedPermissions.length) return { outcome: "rejected", reason: "Deny/cancel decisions cannot grant permissions" };
    if (decision.grantedPermissions.some((grant) => !request.requestedPermissions.some((permission) => canonicalJson(permission) === canonicalJson(grant))))
      return { outcome: "rejected", reason: "Granted permissions must be an exact subset of the simulated request" };
    if (choice.scope === "action" && decision.grantedPermissions.some((grant) => grant.scope.session === true || grant.scope.persistent === true))
      return { outcome: "rejected", reason: "Action-scoped choice cannot create a broader grant" };
    this.#event("approval.resolved", { requestId: request.requestId, requestRevision: request.requestRevision, decisionId: decision.decisionId,
      state: choice.effect === "allow" ? "applied" : choice.effect === "deny" ? "denied" : "superseded" });
    if (choice.effect === "allow") this.#event("approval.applied", { requestId: request.requestId, requestRevision: request.requestRevision, decisionId: decision.decisionId, evidence: SIMULATED });
    this.#pendingApproval = undefined; this.#resumeTurn(); return { outcome: "applied", evidence: SIMULATED };
  }

  async cancel(binding: Binding, turnId: string, context?: AdapterMutationContext): Promise<AdapterOutcome<void>> {
    context?.assertAuthority();
    const fault = this.#fault<void>("cancel"); if (fault) return fault;
    if (!this.#matches(binding) || this.#activeTurnId !== turnId) return { outcome: "unknown", reason: "Turn is not the active fake turn" };
    this.#event("turn.cancelled", { turnId, evidence: SIMULATED }); this.#clearSuspension(); this.#activeTurnId = undefined; this.#turnState = "cancelled";
    this.#drainQueue(); return { outcome: "applied", evidence: SIMULATED };
  }

  async revoke(binding: Binding, grantId: string, context?: AdapterMutationContext): Promise<AdapterOutcome<void>> {
    context?.assertAuthority();
    const fault = this.#fault<void>("revoke"); if (fault) return fault;
    if (!this.#matches(binding)) return { outcome: "unknown", reason: "No matching active fake binding" };
    this.#event("permission.grant.revoked", { grantId, outcome: "revoked", evidence: SIMULATED }); return { outcome: "applied", evidence: SIMULATED };
  }

  async stageAttachment(binding: Binding, reference: AttachmentReference, content: Uint8Array, context?: AdapterMutationContext): Promise<AdapterOutcome<AdapterAttachmentReceipt>> {
    context?.assertAuthority();
    const fault = this.#fault<AdapterAttachmentReceipt>("stageAttachment"); if (fault) return fault;
    if (!this.#matches(binding)) return { outcome: "unknown", reason: "No matching active fake binding" };
    const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    if (digest !== reference.sha256 || content.byteLength !== reference.sizeBytes) return { outcome: "rejected", reason: "Attachment bytes do not match committed checksum and size" };
    const receiptId = this.#id("fake-attachment-stage");
    this.#stagedAttachments.set(receiptId,{ reference: copy(reference),content: Uint8Array.from(content) });
    return { outcome: "applied", evidence: SIMULATED, value: { receiptId, attachmentId: reference.attachmentId, mimeType: reference.mimeType, sizeBytes: content.byteLength, sha256: digest } };
  }

  readStagedAttachment(receiptId: string): Uint8Array | undefined {
    const staged = this.#stagedAttachments.get(receiptId);
    return staged ? Uint8Array.from(staged.content) : undefined;
  }

  async detach(binding: Binding): Promise<AdapterOutcome<void>> {
    const fault = this.#fault<void>("detach"); if (fault) return fault;
    if (!this.#matches(binding)) return { outcome: "unknown", reason: "No matching active fake binding" };
    this.#detached = true; this.#binding = undefined; this.#wake?.(); this.#wake = undefined;
    return { outcome: "applied", evidence: SIMULATED };
  }

  #matches(binding: Binding): boolean { return !!this.#binding && !this.#detached && adapterIdentityMatches(this.#binding, binding) && this.#binding.bindingId === binding.bindingId && this.#binding.sessionId === binding.sessionId; }
  #clearSuspension(): void { this.#pendingInput = undefined; this.#pendingApproval = undefined; }
  #resumeTurn(): void { if (!this.#activeTurnId) return; this.#turnState = "running"; this.#event("turn.state", { turnId: this.#activeTurnId, state: "running", reason: SIMULATED }); this.#finishTurn(); }
  #drainQueue(): void { if (this.#activeTurnId || this.#pendingInput || this.#pendingApproval) return; const next = this.#queued.shift(); if (next?.type === "turn.submit") this.#runTurn(next); }
  #runTurn(command: Extract<ProtocolCommand, { type: "turn.submit" }>): void {
    this.#activeTurnId = command.turnId; this.#turnState = "running";
    this.#event("turn.started", { turnId: command.turnId, nativeTurnId: `native:${command.turnId}`, state: "running" });
    const script = this.#scripts.shift() ?? [{ type: "complete" as const, text: "simulated response" }];
    for (const step of script) {
      if (step.type === "partial") this.#output(command.turnId, step.text, false, false);
      else if (step.type === "replace") this.#output(command.turnId, step.text, true, false);
      else if (step.type === "input") { this.#pendingInput = { requestId: step.requestId, requestRevision: step.requestRevision, question: step.question }; this.#turnState = "waiting_for_input"; this.#event("input.required", { requestId: step.requestId, requestRevision: step.requestRevision, question: step.question, schema: { type: "string" } }); return; }
      else if (step.type === "approval") { this.#pendingApproval = copy(step.request); this.#turnState = "waiting_for_approval"; this.#event("approval.required", copy(step.request)); return; }
      else if (step.type === "complete") { if (step.text) this.#output(command.turnId, step.text, true, true); this.#finishTurn(); return; }
    }
    this.#finishTurn();
  }
  #output(turnId: string, text: string, replace: boolean, complete: boolean): void {
    const itemId = `fake-output-${turnId}`; const existing = this.#events.find((event) => event.payload && "itemId" in event.payload && event.payload.itemId === itemId);
    if (!existing) {
      this.#itemRevision = 1;
      this.#event("output.item.created", { itemId, turnId, kind: "assistant_message", revision: 1, source: "native_event", partial: true, content: [{ type: "text", text }], observedAt: this.#options.now() });
    } else {
      const baseRevision = this.#itemRevision; this.#itemRevision += 1;
      if (replace) this.#event("output.item.replaced", { itemId, turnId, kind: "assistant_message", revision: this.#itemRevision, source: "native_event", partial: !complete, content: [{ type: "text", text }], observedAt: this.#options.now() });
      else this.#event("output.item.delta", { itemId, turnId, baseRevision, revision: this.#itemRevision, source: "native_event", textDelta: text, observedAt: this.#options.now() });
    }
    if (complete) this.#event("output.item.completed", { itemId, turnId, revision: this.#itemRevision });
  }
  #finishTurn(): void {
    if (!this.#activeTurnId) return;
    const turnId = this.#activeTurnId; this.#event("turn.completed", { turnId, terminalEvidence: SIMULATED });
    this.#activeTurnId = undefined; this.#turnState = "completed"; this.#drainQueue();
  }
}

export { adapterProtocolDependency };
