import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** The directory in which the pinned Cline 4.1.22 keeps tasks and sessions, by Cline's own environment rules.
 * Every VS Code window, and every isolated installation of one account, shares it unless launched with its own. */
export function clineDataDirectory(env: Readonly<Record<string, string | undefined>> = process.env, home = homedir()): string {
    const explicit = env.CLINE_DATA_DIR?.trim();
    if (explicit) return resolve(explicit);
    return resolve(env.CLINE_DIR?.trim() || join(home, ".cline"), "data");
}

/** Opaque binding namespace: one Cline data directory on one machine, within which task IDs are unique. */
export function clineNativeScopeId(machineId: string, directory = clineDataDirectory()): string {
    if (!machineId) throw new TypeError("A machine identity is required for the Cline native scope");
    let canonical = directory;
    try { canonical = realpathSync(directory); } catch { /* Cline creates the directory on first use */ }
    return `cline-data:${createHash("sha256").update(`${machineId}\u0000${canonical}`).digest("hex")}`;
}
