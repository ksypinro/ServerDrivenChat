import { canonicalJson } from "@server-driven-chat/protocol";
import { BackendRegistry, parseBackendDescriptor, parseBackendInventory, parseBackendQualification } from "@server-driven-chat/adapter-core";
import type { BackendDriver, BackendInventory, BackendQualification } from "@server-driven-chat/adapter-core";

export interface ReviewedBackendRegistration {
    extensionId: string;
    qualification: BackendQualification;
}
export interface BackendLoaderPorts {
    /** Host-owned complete artifact measurement, never data returned by the vendor export. */
    measure(record: ReviewedBackendRegistration): Promise<BackendInventory>;
    /** Activate only the already-verified installed registration extension. */
    activate(extensionId: string): Promise<unknown>;
}

/** Load a catalog-approved driver. Catalog selection must not come from workspace or model text. */
export async function loadReviewedBackend(registry: BackendRegistry, entry: ReviewedBackendRegistration, ports: BackendLoaderPorts): Promise<void> {
    return loadBackend(registry, entry, ports, "native");
}

/** Explicit evaluation admission only; this never changes a plan into native evidence. */
export async function loadEvaluationBackend(registry: BackendRegistry, entry: ReviewedBackendRegistration, ports: BackendLoaderPorts): Promise<void> {
    return loadBackend(registry, entry, ports, "evaluation");
}

async function loadBackend(registry: BackendRegistry, entry: ReviewedBackendRegistration, ports: BackendLoaderPorts, level: "native" | "evaluation"): Promise<void> {
    const record = { extensionId: entry.extensionId, qualification: parseBackendQualification(entry.qualification) };
    if (record.qualification.evidenceLevel !== level) throw new Error(`Driver loading requires ${level} evidence`);
    if (!record.qualification.inventory.artifacts.some(a => a.role === "driver" && a.id === record.extensionId)) throw new Error("Registration extension is not the reviewed driver artifact");
    const expected = canonicalJson(record.qualification.inventory);
    const before = parseBackendInventory(await ports.measure(record));
    if (canonicalJson(before) !== expected) throw new Error("Installed backend artifacts differ from qualification");
    const exports = await ports.activate(record.extensionId);
    if (!exports || typeof exports !== "object" || !("sdcBackendDriver" in exports)) throw new Error("Missing backend driver export");
    const api = exports.sdcBackendDriver;
    if (!api || typeof api !== "object" || !("descriptor" in api) || !("createDriver" in api) || typeof api.createDriver !== "function") throw new Error("Invalid backend driver export");
    const descriptor = parseBackendDescriptor(api.descriptor);
    if (canonicalJson(descriptor) !== canonicalJson(record.qualification.descriptor)) throw new Error("Exported descriptor differs from qualification");
    const created: unknown = await api.createDriver();
    if (!created || typeof created !== "object" || !("descriptor" in created) || !("dispose" in created) || typeof created.dispose !== "function") throw new Error("Invalid driver factory result");
    // Structural validation continues in registry.register; the reviewed factory is the code boundary.
    const driver = created as BackendDriver;
    try {
        const after = parseBackendInventory(await ports.measure(record));
        if (canonicalJson(after) !== expected) throw new Error("Backend artifacts changed during activation");
        if (canonicalJson(parseBackendDescriptor(driver.descriptor)) !== canonicalJson(descriptor)) throw new Error("Factory returned a different driver identity");
        registry.register(driver, after, record.qualification);
    } catch (error) { await driver.dispose(); throw error; }
}
