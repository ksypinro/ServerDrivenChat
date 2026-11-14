import { ADAPTER_OPERATIONS, canonicalJson } from "@server-driven-chat/protocol";
import type { AdapterMutationContext, AdapterOperation, AppAdapter, Binding, CapabilitiesDocument } from "@server-driven-chat/protocol";
import { effectiveBackendCapabilities, hasQualifiedTextControl, parseBackendDescriptor, parseBackendInventory, parseBackendQualification, qualifyBackendCapabilities } from "./driver.js";
import type { BackendDriver, BackendDriverDescriptor, BackendHostContext, BackendHostIdentity, BackendInventory, BackendQualification, BackendSelection } from "./driver.js";

interface Registration {
    driver: BackendDriver;
    descriptor: BackendDriverDescriptor;
    inventory: BackendInventory;
    qualification?: BackendQualification;
}

/** Host-owned registry. Call only after verifying the extension/export and artifact provenance. */
export class BackendRegistry {
    readonly #entries = new Map<string, Registration>();
    readonly #listeners = new Set<(backendId: string) => void>();
    register(driver: BackendDriver, measuredInventory: BackendInventory, trustedQualification?: BackendQualification): void {
        const descriptor = parseBackendDescriptor(driver.descriptor);
        if (this.#entries.has(descriptor.backendId) || [...this.#entries.values()].some(r => r.descriptor.driverId === descriptor.driverId)) throw new Error("Duplicate backend or driver registration");
        if (typeof driver.discover !== "function" || typeof driver.createAdapter !== "function" || typeof driver.readConversationRevision !== "function" || typeof driver.dispose !== "function") throw new TypeError("Missing driver export");
        const inventory = parseBackendInventory(measuredInventory);
        const qualification = trustedQualification ? parseBackendQualification(trustedQualification) : undefined;
        if (qualification && (canonicalJson(descriptor) !== canonicalJson(qualification.descriptor) || canonicalJson(inventory) !== canonicalJson(qualification.inventory))) throw new Error("Registration does not match trusted qualification");
        this.#entries.set(descriptor.backendId, { driver, descriptor, inventory, qualification });
    }
    list(): BackendDriverDescriptor[] { return [...this.#entries.values()].map(r => structuredClone(r.descriptor)); }
    /** Internal trusted-host access; returned metadata is copied, driver code remains an effect boundary. */
    resolve(backendId: string): Registration {
        const entry = this.#entries.get(backendId);
        if (!entry) throw new Error("Backend driver is not registered");
        if (canonicalJson(parseBackendDescriptor(entry.driver.descriptor)) !== canonicalJson(entry.descriptor)) throw new Error("Registered driver identity changed");
        return { ...entry, descriptor: structuredClone(entry.descriptor), inventory: structuredClone(entry.inventory), qualification: entry.qualification && structuredClone(entry.qualification) };
    }
    onRemoved(listener: (backendId: string) => void): () => void {
        this.#listeners.add(listener); return () => { this.#listeners.delete(listener); };
    }
    async remove(backendId: string): Promise<void> {
        const entry = this.#entries.get(backendId);
        if (!entry) return;
        this.#entries.delete(backendId);
        // Fence all consumers before asynchronous vendor cleanup.
        for (const listener of this.#listeners) listener(backendId);
        await entry.driver.dispose();
    }
}

export interface BackendServerProfile { id: string; origin: string }
export interface BackendHostChoice extends BackendSelection { choiceId: string; backendId: string }
export interface BackendHostSession {
    disable(): void;
    /** Stop bridge, detach server binding and close its durable store. Do not erase history. */
    close(): Promise<void>;
}
export interface BackendHostServices {
    /** Must show exact backend/identity/server/operations and return only explicit local selections. */
    confirm(choice: BackendHostChoice, profile: BackendServerProfile, capabilities: CapabilitiesDocument, signal: AbortSignal): Promise<readonly AdapterOperation[] | undefined>;
    /** Performs graphical sign-in/pairing, registers the binding and starts durable delivery. */
    start(input: {
        choice: BackendHostChoice; profile: BackendServerProfile; scope: string; binding: Binding;
        adapter: AppAdapter; capabilities: CapabilitiesDocument; conversationRevision: number; context: AdapterMutationContext;
    }): Promise<BackendHostSession>;
}
interface Active {
    registration: Registration;
    adapter: AppAdapter;
    binding: Binding;
    abort: AbortController;
    session?: BackendHostSession;
    closing?: Promise<void>;
}

function sameSelection(a: BackendSelection["selection"], b: BackendSelection["selection"]): boolean {
    return a.appId === b.appId && a.appInstanceId === b.appInstanceId && a.accountId === b.accountId && a.workspaceId === b.workspaceId && a.conversationId === b.conversationId;
}
function serverProfile(value: BackendServerProfile): BackendServerProfile {
    const url = new URL(value.origin);
    if (!value.id || url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
        (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Invalid server profile origin");
    return { id: value.id, origin: url.origin };
}
/** Namespace data, not a credential: storage implementations hash this before forming paths/keys. */
export function backendStorageScope(context: BackendHostIdentity, descriptor: BackendDriverDescriptor,
    profile: BackendServerProfile, choice: BackendSelection): string {
    return canonicalJson({ contract: "sdc.backend-host.1", context, backendId: descriptor.backendId, driverId: descriptor.driverId,
        profile: serverProfile(profile), selection: choice.selection, selectionRevision: choice.revision });
}

/** Generic lifecycle engine. Actual auth/SQLite/HTTP and graphical UI are provided by the host. */
export class BackendHost {
    readonly #choices = new Map<string, { choice: BackendHostChoice; registration: Registration }>();
    readonly #context: BackendHostIdentity;
    readonly #unlisten: () => void;
    #active?: Active;
    #pending?: AbortController;
    #closing?: Promise<void>;
    #generation = 0;
    #discovering = false;
    #disposed = false;
    #failure?: string;
    readonly #evaluationDeadline?: number;
    constructor(readonly registry: BackendRegistry, context: BackendHostIdentity,
        readonly services: BackendHostServices, readonly simulation: boolean | "evaluation" = false, readonly evaluationExpiresAt?: number) {
        if (simulation === "evaluation") {
            if (!Number.isFinite(evaluationExpiresAt) || evaluationExpiresAt! <= Date.now()) throw new Error("Evaluation requires a future expiry");
            this.#evaluationDeadline = performance.now() + evaluationExpiresAt! - Date.now();
        }
        this.#context = structuredClone(context);
        this.#unlisten = registry.onRemoved(id => {
            this.#choices.forEach((value, key) => { if (value.choice.backendId === id) this.#choices.delete(key); });
            // A removed driver may own a pending factory/review too.
            this.invalidate("Backend driver removed");
        });
    }
    get state(): "disconnected" | "connecting" | "connected" | "reconciliation_required" {
        return this.#failure ? "reconciliation_required" : this.#pending ? "connecting" : this.#active && !this.#active.abort.signal.aborted ? "connected" : "disconnected";
    }
    get failure(): string | undefined { return this.#failure; }
    #driverContext(generation: number, signal: AbortSignal): BackendHostContext {
        return { ...this.#context, signal, assertCurrent: () => this.#check(generation, signal), invalidate: reason => this.invalidate(reason) };
    }
    #check(generation: number, signal: AbortSignal): void {
        if (this.#disposed || generation !== this.#generation || signal.aborted || (this.#evaluationDeadline !== undefined && (performance.now() >= this.#evaluationDeadline || Date.now() >= this.evaluationExpiresAt!))) throw new Error("Backend connection invalidated");
    }
    async discover(backendId: string, signal: AbortSignal): Promise<BackendHostChoice[]> {
        if (this.#disposed || this.#pending || this.#active || this.#closing || this.#failure || this.#discovering) throw new Error("Disconnect or reconcile the current backend before selection");
        this.#discovering = true;
        const generation = this.#generation;
        try {
            const registration = this.registry.resolve(backendId);
            const selections = await registration.driver.discover(this.#driverContext(generation, signal), signal);
            this.#check(generation, signal);
            this.#choices.clear();
            const unique = new Set<string>();
            for (const candidate of selections) {
                const selection = candidate.selection;
                if (typeof candidate.label !== "string" || !candidate.label.trim() || typeof candidate.revision !== "string" || !candidate.revision || !selection || selection.appId !== registration.descriptor.appId ||
                    ![selection.conversationId, selection.appInstanceId].every(value => typeof value === "string" && value.length > 0 && value.length <= 2048) ||
                    (selection.accountId !== undefined && (typeof selection.accountId !== "string" || !selection.accountId)) || selection.workspaceId !== this.#context.workspaceId) throw new Error("Invalid discovered backend identity");
                const identity = canonicalJson(selection);
                if (unique.has(identity)) throw new Error("Duplicate native selection");
                unique.add(identity);
                const choice = { ...structuredClone(candidate), backendId, choiceId: crypto.randomUUID() };
                this.#choices.set(choice.choiceId, { choice, registration });
            }
            return [...this.#choices.values()].map(item => structuredClone(item.choice));
        } finally { this.#discovering = false; }
    }
    async connect(choiceId: string, profileInput: BackendServerProfile): Promise<void> {
        if (this.#disposed || this.#pending || this.#active || this.#closing || this.#failure || this.#discovering) throw new Error("Disconnect or reconcile before connecting another backend");
        const selected = this.#choices.get(choiceId);
        if (!selected) throw new Error("Select an existing conversation locally in this host");
        const choice = structuredClone(selected.choice), registration = this.registry.resolve(choice.backendId);
        if (registration.driver !== selected.registration.driver) throw new Error("Selected backend registration changed");
        const profile = serverProfile(profileInput), abort = new AbortController(), generation = this.#generation;
        this.#pending = abort;
        let active: Active | undefined;
        try {
            const adapter = await registration.driver.createAdapter(this.#driverContext(generation, abort.signal), structuredClone(choice));
            this.#check(generation, abort.signal);
            const report = qualifyBackendCapabilities(registration.descriptor, registration.inventory, await adapter.probe(), registration.qualification, this.simulation);
            this.#check(generation, abort.signal);
            if (!hasQualifiedTextControl(report)) throw new Error("Backend has no qualified core text route");
            const operations = await this.services.confirm(structuredClone(choice), structuredClone(profile), structuredClone(report), abort.signal);
            this.#check(generation, abort.signal);
            if (!operations) throw new Error("Local consent declined");
            const consent = [...operations];
            if (consent.some(op => !ADAPTER_OPERATIONS.includes(op) || report.operations[op]?.status !== "supported")) throw new Error("Consent includes an unavailable operation");
            const permitted = effectiveBackendCapabilities(report, { serverOperations: ADAPTER_OPERATIONS, localOperations: consent, live: true });
            if (!hasQualifiedTextControl(permitted)) throw new Error("Local consent does not allow core text control");
            const fresh = await registration.driver.discover(this.#driverContext(generation, abort.signal), abort.signal);
            this.#check(generation, abort.signal);
            if (!fresh.some(item => item.revision === choice.revision && sameSelection(item.selection, choice.selection))) throw new Error("Selected native conversation changed during review");
            const attached = await adapter.attach(structuredClone(choice.selection));
            if ((attached.outcome !== "accepted" && attached.outcome !== "applied") || !attached.value) throw new Error("Native attach was not confirmed");
            const binding = structuredClone(attached.value);
            active = { registration, adapter, binding, abort }; this.#active = active;
            this.#check(generation, abort.signal);
            if (!sameSelection(binding, choice.selection)) throw new Error("Native attachment returned a different identity");
            const current = active;
            const assertCurrent = (): void => {
                this.#check(generation, abort.signal);
                if (this.#active !== current || this.registry.resolve(choice.backendId).driver !== registration.driver) throw new Error("Backend binding changed");
            };
            const guarded = this.#guard(current, permitted, assertCurrent);
            const conversationRevision = await registration.driver.readConversationRevision(adapter, structuredClone(binding));
            assertCurrent();
            if (!Number.isSafeInteger(conversationRevision) || conversationRevision < 0) throw new Error("Native conversation revision is unavailable");
            const session = await this.services.start({ choice: structuredClone(choice), profile, scope: backendStorageScope(this.#context, registration.descriptor, profile, choice),
                binding: structuredClone(binding), adapter: guarded, capabilities: structuredClone(permitted), conversationRevision, context: { signal: abort.signal, assertAuthority: assertCurrent } });
            current.session = session;
            try { assertCurrent(); } catch (error) { session.disable(); await session.close(); current.session = undefined; throw error; }
            this.#choices.clear();
        } catch (error) {
            if (active) {
                active.abort.abort();
                await this.#close(active);
            }
            throw error;
        } finally { if (this.#pending === abort) this.#pending = undefined; }
    }
    #guard(active: Active, capabilities: CapabilitiesDocument, assertCurrent: () => void): AppAdapter {
        const exact = (binding: Binding): void => { assertCurrent(); if (canonicalJson(binding) !== canonicalJson(active.binding)) throw new Error("Wrong or stale binding"); };
        const gate = (operation: AdapterOperation, binding: Binding, context?: AdapterMutationContext): AdapterMutationContext => {
            if (!context) throw new Error("Authenticated dispatch authority is required");
            const result = { signal: AbortSignal.any([active.abort.signal, context.signal]), assertAuthority: (): void => {
                exact(binding);
                if (result.signal.aborted || capabilities.operations[operation]?.status !== "supported") throw new Error("Operation no longer permitted");
                context.assertAuthority();
            } };
            result.assertAuthority(); return result;
        };
        const adapter = active.adapter;
        return {
            probe: async () => { assertCurrent(); return structuredClone(capabilities); },
            attach: async () => ({ outcome: "rejected", reason: "Select and consent through the host" }),
            inspect: binding => { exact(binding); return adapter.inspect(binding); },
            subscribe: (binding, checkpoint, options) => { exact(binding); return adapter.subscribe(binding, checkpoint, { signal: AbortSignal.any([active.abort.signal, ...(options?.signal ? [options.signal] : [])]) }); },
            submit: (b, command, context) => adapter.submit(b, command, gate("submit", b, context)),
            respondInput: (b, id, revision, answer, context) => adapter.respondInput(b, id, revision, answer, gate("respondInput", b, context)),
            resolveApproval: (b, request, decision, context) => adapter.resolveApproval(b, request, decision, gate("resolveApproval", b, context)),
            cancel: (b, turn, context) => adapter.cancel(b, turn, gate("cancel", b, context)),
            revoke: (b, grant, context) => adapter.revoke(b, grant, gate("revoke", b, context)),
            stageAttachment: (b, ref, bytes, context) => {
                const authority = gate("stageAttachment", b, context);
                return adapter.stageAttachment ? adapter.stageAttachment(b, ref, bytes, authority) : Promise.resolve({ outcome: "unsupported", reason: "Native attachment staging unavailable" });
            },
            detach: async b => { exact(b); await this.disconnect(); return this.#failure ? { outcome: "unknown", reason: this.#failure } : { outcome: "applied", evidence: "Host detached local binding" }; }
        };
    }
    /** Fences synchronously, then schedules cleanup; errors leave reconciliation required. */
    invalidate(_reason: string): void {
        ++this.#generation; this.#choices.clear(); this.#pending?.abort();
        const active = this.#active;
        if (active) { active.abort.abort(); void this.#close(active); }
    }
    async #close(active: Active): Promise<void> {
        if (active.closing) return active.closing;
        active.closing = (async () => {
            let failure: string | undefined;
            try {
                active.session?.disable(); await active.session?.close();
            } catch (error) { failure = error instanceof Error ? error.message : "Backend cleanup failed"; }
            try {
                const detached = await active.adapter.detach(structuredClone(active.binding));
                if (detached.outcome !== "applied" && detached.outcome !== "accepted") throw new Error("Native detach is uncertain; reconcile before switching");
            } catch (error) { failure ??= error instanceof Error ? error.message : "Native detach failed"; }
            if (failure !== undefined) this.#failure = failure || "Backend cleanup failed";
            if (this.#active === active) this.#active = undefined;
        })();
        this.#closing = active.closing;
        try { await active.closing; } finally { if (this.#closing === active.closing) this.#closing = undefined; }
    }
    async disconnect(): Promise<void> { this.invalidate("Disconnected locally"); await this.#closing; }
    async dispose(): Promise<void> { this.#disposed = true; this.#unlisten(); await this.disconnect(); }
}
