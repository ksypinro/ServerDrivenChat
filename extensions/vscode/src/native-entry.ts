import * as vscode from "vscode";
import { createHash, randomUUID } from "node:crypto";
import { createClineTaskBridge } from "../../../adapters/cline/src/native-patch.js";
import type { PinnedController } from "../../../adapters/cline/src/native-patch.js";

/** Loaded inside the explicitly pinned Cline application package, not in the companion. */
export function createPinnedClineApi(controller: unknown): ReturnType<typeof createClineTaskBridge> | undefined {
    if (vscode.env.remoteName) return undefined;
    const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
    const location = vscode.extensions.getExtension("saoudrizwan.claude-dev")?.extensionUri.toString();
    if (!location) throw new Error("Cline installation identity unavailable");
    return createClineTaskBridge(controller as PinnedController, {
        installationId: `cline:${digest(`${vscode.env.machineId}:${location}`)}`,
        hostId: `extension-host:${randomUUID()}`,
        windowId: `vscode-session:${vscode.env.sessionId}`,
        workspaceId: () => `workspace:${digest(JSON.stringify((vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.toString()).sort()))}`,
        onWorkspaceChanged: listener => vscode.workspace.onDidChangeWorkspaceFolders(listener), remote: false, controls: true, connect: true, callerToolFence: true
    });
}
