import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseBackendInventory } from "@server-driven-chat/adapter-core";
import type { BackendArtifact, BackendInventory } from "@server-driven-chat/adapter-core";
import { measureInstalledTree } from "./artifacts.js";
import type { BackendLoaderPorts, ReviewedBackendRegistration } from "./loader.js";

export interface InstalledExtension {
    id: string;
    directory: string;
    activate(): Promise<unknown>;
}
/** Supplied by the graphical host, never by a driver or workspace setting. */
export interface InstalledExtensionResolver {
    platform: string;
    extension(id: string): InstalledExtension | undefined;
    runtime?(): Promise<BackendArtifact>;
}

export function createInstalledLoaderPorts(resolver: InstalledExtensionResolver): BackendLoaderPorts {
    return {
        async measure(record: ReviewedBackendRegistration): Promise<BackendInventory> {
            const expected = parseBackendInventory(record.qualification.inventory);
            const artifacts = [];
            for (const artifact of expected.artifacts) {
                if (artifact.role === "runtime") {
                    if (artifact.id !== "microsoft.vscode" || !resolver.runtime) throw new Error("Unsupported runtime artifact");
                    artifacts.push(await resolver.runtime()); continue;
                }
                const installed = resolver.extension(artifact.id);
                if (!installed || installed.id !== artifact.id) throw new Error(`Reviewed extension is not installed: ${artifact.id}`);
                // Hash before parsing metadata and again afterward so metadata is part of the
                // measured identity, rather than a detached claim from the extension export.
                const before = await measureInstalledTree(installed.directory);
                const metadata: unknown = JSON.parse(await readFile(join(installed.directory, "package.json"), "utf8"));
                if (!metadata || typeof metadata !== "object" || !("name" in metadata) || !("publisher" in metadata) || !("version" in metadata) || typeof metadata.version !== "string" || `${metadata.publisher}.${metadata.name}` !== artifact.id) throw new Error("Installed extension manifest identity differs from catalog");
                const after = await measureInstalledTree(installed.directory);
                if (before.sha256 !== after.sha256) throw new Error("Installed extension changed during metadata inspection");
                artifacts.push({ ...artifact, version: metadata.version, sha256: after.sha256 });
            }
            // The API version is the reviewed mapping for these exact bytes. Runtime probe
            // identity/capabilities are checked independently before any attachment.
            return parseBackendInventory({ platform: resolver.platform, nativeApiVersion: expected.nativeApiVersion, artifacts });
        },
        async activate(extensionId: string): Promise<unknown> {
            const installed = resolver.extension(extensionId);
            if (!installed || installed.id !== extensionId) throw new Error("Reviewed registration extension disappeared");
            return installed.activate();
        }
    };
}
