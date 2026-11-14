import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, realpath } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { BackendArtifact } from "@server-driven-chat/adapter-core";
import { measureInstalledTree } from "./artifacts.js";

/** Actual graphical host bundle, not a path supplied by the driver/envelope. */
export async function measureMacEditor(appRoot: string, runningVersion: string): Promise<BackendArtifact> {
    if (process.platform !== "darwin") throw new Error("Evaluation currently requires macOS");
    const root = await realpath(resolve(appRoot, "../../.."));
    if (!root.endsWith(".app") || await realpath(join(root, "Contents/Resources/app")) !== await realpath(appRoot)) throw new Error("Unexpected VS Code application layout");
    await promisify(execFile)("/usr/bin/codesign", ["--verify", "--deep", "--strict", root], { timeout: 60000 });
    const measurement = await measureInstalledTree(root, true);
    const metadata: unknown = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
    if (!metadata || typeof metadata !== "object" || !("version" in metadata) || metadata.version !== runningVersion) throw new Error("Running editor version differs from installed bundle");
    await promisify(execFile)("/usr/bin/codesign", ["--verify", "--deep", "--strict", root], { timeout: 60000 });
    return { role: "runtime", id: "microsoft.vscode", version: runningVersion, sha256: measurement.sha256 };
}
