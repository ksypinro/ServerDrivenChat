import * as vscode from "vscode";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { clineBackendDescriptor, createClineBackendDriver } from "@server-driven-chat/adapter-cline";
import type { NativeBridgeApi } from "@server-driven-chat/adapter-cline";
import type { BackendDriver, BackendDriverDescriptor } from "@server-driven-chat/adapter-core";

/** Declarative export only. Native activation follows the generic host's verified catalog load. */
export function activate(): { sdcBackendDriver: { descriptor: BackendDriverDescriptor; createDriver(): Promise<BackendDriver> } } {
    return { sdcBackendDriver: {
        descriptor: structuredClone(clineBackendDescriptor),
        async createDriver() {
            if (vscode.env.remoteName) throw new Error("Cline driver requires local VS Code");
            const native = vscode.extensions.getExtension<{ serverDrivenChat?: NativeBridgeApi }>("saoudrizwan.claude-dev");
            if (!native) throw new Error("Install the reviewed maintained Cline package in this isolated host first");
            const metadata = native.packageJSON;
            if (metadata.version !== "4.1.2204" || metadata.sdcPatch?.baseVersion !== "4.1.22" || metadata.sdcPatch?.revision !== 4) throw new Error("Stock or changed Cline package is unsupported");
            const expected = [
                ["dist/extension.js", "8da2f0506aacc06906d81783cd9ad540b93f68fdc64606d2c5e77b15d2ef1f29"],
                ["dist/sdc-native.cjs", "81bc1d836ba694910ea895fa63902d9b9272bca6ef547591e56d8c910bf4da72"]
            ];
            for (const [path, fingerprint] of expected) {
                const bytes = await readFile(vscode.Uri.joinPath(native.extensionUri, path).fsPath);
                if (createHash("sha256").update(bytes).digest("hex") !== fingerprint) throw new Error("Maintained Cline fingerprint changed; review and acceptance required");
            }
            const api = (await native.activate()).serverDrivenChat;
            if (!api) throw new Error("Maintained Cline native API is unavailable");
            return createClineBackendDriver(api);
        }
    } };
}
