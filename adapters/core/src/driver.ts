import { ADAPTER_OPERATIONS, canonicalJson, validateCapabilities } from "@server-driven-chat/protocol";
import type { AdapterOperation, AppAdapter, Binding, BindingSelection, CapabilitiesDocument, CapabilityEvidence } from "@server-driven-chat/protocol";

/** Local extension-host contract; independent of wire protocol 2.0 and native API versions. */
export const BACKEND_DRIVER_CONTRACT_VERSION = "1.0" as const;
export interface BackendDriverDescriptor {
    contractVersion: typeof BACKEND_DRIVER_CONTRACT_VERSION;
    backendId: string;
    driverId: string;
    driverVersion: string;
    appId: string;
    displayName: string;
    hostKind: "vscode-local";
    extensionIds: string[];
}

/** Host-measured complete artifact identities. Entry-file hashes alone are insufficient. */
export interface BackendArtifact {
    role: "host" | "driver" | "native" | "runtime";
    id: string;
    version: string;
    sha256: string;
}
export interface BackendInventory {
    platform: string;
    nativeApiVersion: string;
    artifacts: BackendArtifact[];
}
/** Supplied by the host's reviewed catalog, never accepted from the driver as authority. */
export interface BackendQualification {
    qualificationId: string;
    descriptor: BackendDriverDescriptor;
    inventory: BackendInventory;
    appVersion: string;
    evidenceRef: string;
    evidenceLevel: "native" | "simulation" | "evaluation";
    effectBoundary: "synchronous-fenced" | "queued-fenced" | "unverified";
    operations: Partial<Record<AdapterOperation, CapabilityEvidence>>;
    nativeToolsDenied?: CapabilityEvidence;
}
export interface BackendHostIdentity {
    installationId: string;
    hostId: string;
    windowId: string;
    workspaceId: string;
}
export interface BackendHostContext extends BackendHostIdentity {
    signal: AbortSignal;
    assertCurrent(): void;
    /** Synchronous invalidation must fence effects before asynchronous cleanup begins. */
    invalidate(reason: string): void;
}
export interface BackendSelection {
    label: string;
    /** Opaque native task/window generation, stable only while this exact selection remains valid. */
    revision: string;
    selection: BindingSelection;
}
/** Discovery must not create a conversation, sign in, grant permission, or execute a model. */
export interface BackendDriver {
    descriptor: BackendDriverDescriptor;
    discover(context: BackendHostContext, signal: AbortSignal): Promise<BackendSelection[]>;
    createAdapter(context: BackendHostContext, selected: BackendSelection): Promise<AppAdapter>;
    /** Read the exact attached native conversation revision used by existing server admission. */
    readConversationRevision(adapter: AppAdapter, binding: Binding): Promise<number>;
    dispose(): Promise<void>;
}
export interface BackendPolicy {
    /** These lists come from authenticated server policy and the local consent review. */
    serverOperations: readonly AdapterOperation[];
    localOperations: readonly AdapterOperation[];
    live: boolean;
    reason?: string;
}

const mutationOperations: readonly AdapterOperation[] = ["submit", "respondInput", "resolveApproval", "cancel", "revoke", "stageAttachment"];
const requiredTextOperations: readonly AdapterOperation[] = ["probe", "attach", "inspect", "submit", "subscribe", "detach"];
const idPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const exactVersion = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,127}$/;

function record(value: unknown, keys: readonly string[], name: string): asserts value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new TypeError(`Invalid ${name}`);
}
function nonempty(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0 && value.length <= 2048;
}

/** Reject unknown contract versions/fields rather than silently accepting new semantics. */
export function parseBackendDescriptor(value: unknown): BackendDriverDescriptor {
    record(value, ["contractVersion", "backendId", "driverId", "driverVersion", "appId", "displayName", "hostKind", "extensionIds"], "driver descriptor");
    if (value.contractVersion !== BACKEND_DRIVER_CONTRACT_VERSION || value.hostKind !== "vscode-local" ||
        ![value.backendId, value.driverId, value.appId].every(v => typeof v === "string" && idPattern.test(v)) ||
        typeof value.driverVersion !== "string" || !exactVersion.test(value.driverVersion) || !nonempty(value.displayName) ||
        !Array.isArray(value.extensionIds) || value.extensionIds.length === 0 || value.extensionIds.length > 16 ||
        !value.extensionIds.every(v => typeof v === "string" && /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/.test(v)) ||
        new Set(value.extensionIds).size !== value.extensionIds.length) throw new TypeError("Unsupported or malformed driver descriptor");
    return structuredClone(value) as unknown as BackendDriverDescriptor;
}

export function parseBackendInventory(value: unknown): BackendInventory {
    record(value, ["platform", "nativeApiVersion", "artifacts"], "backend inventory");
    if (!nonempty(value.platform) || typeof value.nativeApiVersion !== "string" || !exactVersion.test(value.nativeApiVersion) ||
        !Array.isArray(value.artifacts) || value.artifacts.length < 3 || value.artifacts.length > 128) throw new TypeError("Incomplete backend inventory");
    const identities = new Set<string>();
    const roles = new Set<string>();
    for (const artifact of value.artifacts) {
        record(artifact, ["role", "id", "version", "sha256"], "artifact");
        if (typeof artifact.role !== "string" || !["host", "driver", "native", "runtime"].includes(artifact.role) ||
            typeof artifact.id !== "string" || !idPattern.test(artifact.id) || typeof artifact.version !== "string" || !exactVersion.test(artifact.version) ||
            typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new TypeError("Invalid artifact identity");
        const key = `${artifact.role}:${artifact.id}`;
        if (identities.has(key)) throw new TypeError("Duplicate artifact identity");
        identities.add(key); roles.add(artifact.role);
    }
    if (!["host", "driver", "native"].every(role => roles.has(role))) throw new TypeError("Inventory requires host, driver, and native artifacts");
    const result = structuredClone(value) as unknown as BackendInventory;
    result.artifacts.sort((a, b) => `${a.role}:${a.id}`.localeCompare(`${b.role}:${b.id}`));
    return result;
}

function evidence(value: unknown): asserts value is CapabilityEvidence {
    record(value, ["status", "reason", "evidenceRef", "limits"], "capability evidence");
    if (!["supported", "unsupported", "unverified"].includes(String(value.status)) || !nonempty(value.reason) ||
        (value.evidenceRef !== undefined && !nonempty(value.evidenceRef)) ||
        (value.status === "supported" && !nonempty(value.evidenceRef))) throw new TypeError("Supported qualification needs evidence");
    // Reuse the wire schema for limits and the complete capability evidence shape.
    const result = validateCapabilities({ protocolVersion: "2.0", adapterId: "validation", adapterVersion: "1.0", appId: "validation", appVersion: "1.0", platform: "vscode-local", observedAt: "2026-10-11T00:00:00Z", operations: { probe: value } });
    if (!result.valid) throw new TypeError("Invalid capability evidence shape");
}

export function parseBackendQualification(value: unknown): BackendQualification {
    record(value, ["qualificationId", "descriptor", "inventory", "appVersion", "evidenceRef", "evidenceLevel", "effectBoundary", "operations", "nativeToolsDenied"], "qualification");
    if (!nonempty(value.qualificationId) || !nonempty(value.evidenceRef) || !nonempty(value.appVersion) ||
        !["native", "simulation", "evaluation"].includes(String(value.evidenceLevel)) ||
        !["synchronous-fenced", "queued-fenced", "unverified"].includes(String(value.effectBoundary))) throw new TypeError("Invalid qualification");
    const descriptor = parseBackendDescriptor(value.descriptor), inventory = parseBackendInventory(value.inventory);
    record(value.operations, ADAPTER_OPERATIONS, "qualified operations");
    for (const item of Object.values(value.operations)) evidence(item);
    if (value.nativeToolsDenied !== undefined) evidence(value.nativeToolsDenied);
    const result = structuredClone(value) as unknown as BackendQualification;
    return { ...result, descriptor, inventory };
}

/** Eligibility only: never a durable permission grant. Recompute on inventory/lifecycle changes. */
export function qualifyBackendCapabilities(descriptor: BackendDriverDescriptor, inventory: BackendInventory,
    native: CapabilitiesDocument, trustedQualification?: BackendQualification, mode: boolean | "evaluation" = false): CapabilitiesDocument {
    const d = parseBackendDescriptor(descriptor), measured = parseBackendInventory(inventory);
    if (!validateCapabilities(native).valid) throw new TypeError("Invalid native capability report");
    const q = trustedQualification === undefined ? undefined : parseBackendQualification(trustedQualification);
    let mismatch: string | undefined;
    if (!q) mismatch = "No host-trusted qualification record";
    else if (q.evidenceLevel === "simulation" && mode !== true) mismatch = "Simulation evidence cannot qualify native control";
    else if (q.evidenceLevel === "evaluation" && mode !== "evaluation") mismatch = "Evaluation plan cannot qualify production control";
    else if (canonicalJson(q.descriptor) !== canonicalJson(d) || canonicalJson(q.inventory) !== canonicalJson(measured)) mismatch = "Driver or installed artifact identity differs from the reviewed record";
    else if (native.adapterId !== d.driverId || native.adapterVersion !== d.driverVersion || native.appId !== d.appId || native.appVersion !== q.appVersion || native.platform !== d.hostKind) mismatch = "Native capability identity differs from the reviewed record";
    const result = structuredClone(native);
    result.operations = {};
    delete result.effectPolicies;
    for (const operation of ADAPTER_OPERATIONS) {
        const actual = native.operations[operation], reviewed = q?.operations[operation];
        result.operations[operation] = mismatch ? { status: "unverified", reason: mismatch } :
            actual?.status !== "supported" ? actual ?? { status: "unverified", reason: "Native operation not reported" } :
            reviewed?.status !== "supported" ? reviewed ?? { status: "unverified", reason: "Operation has no qualification evidence" } :
            canonicalJson(actual.limits ?? {}) !== canonicalJson(reviewed.limits ?? {}) ? { status: "unverified", reason: "Native operation limits differ from qualified limits" } :
            mutationOperations.includes(operation) && q?.effectBoundary === "unverified" ? { status: "unverified", reason: "Effect-time authority fencing is unverified" } :
            { ...actual, reason: `${actual.reason}; ${q!.evidenceLevel === "evaluation" ? "UNQUALIFIED EVALUATION under" : "qualified by"} ${q!.qualificationId}`, evidenceRef: reviewed.evidenceRef };
    }
    if (!mismatch && q?.effectBoundary !== "unverified" && q?.nativeToolsDenied?.status === "supported" && native.effectPolicies?.nativeToolsDenied?.status === "supported" &&
        canonicalJson(q.nativeToolsDenied.limits ?? {}) === canonicalJson(native.effectPolicies.nativeToolsDenied.limits ?? {})) {
        result.effectPolicies = { nativeToolsDenied: structuredClone(q.nativeToolsDenied) };
    }
    return structuredClone(result);
}

/** Caller resolves server scopes into operations; neither policy layer can expand native eligibility. */
export function effectiveBackendCapabilities(qualified: CapabilitiesDocument, policy: BackendPolicy): CapabilitiesDocument {
    const result = structuredClone(qualified);
    for (const operation of ADAPTER_OPERATIONS) {
        const reason = !policy.live ? policy.reason ?? "Binding is not live" :
            !policy.serverOperations.includes(operation) ? "Server policy does not permit this operation" :
            !policy.localOperations.includes(operation) ? "Local consent does not permit this operation" : undefined;
        if (reason) result.operations[operation] = { status: "unsupported", reason };
    }
    return result;
}

export function hasQualifiedTextControl(capabilities: CapabilitiesDocument): boolean {
    return requiredTextOperations.every(operation => capabilities.operations[operation]?.status === "supported");
}
