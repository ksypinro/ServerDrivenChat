import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { acquireSharedLock, isLockHeld } from "@server-driven-chat/bridge";
import type { HeldLock } from "@server-driven-chat/bridge";

/** Recovery records live in global state, which every window of an installation shares. */
export interface HostOwnedRecord { hostId?: string }

const lockName = (hostId: string): string => `${createHash("sha256").update(hostId).digest("hex")}.lock`;

/** Held for the extension host's lifetime. The operating system releases it when the window exits or crashes. */
export async function holdHostLiveness(directory: string, hostId: string): Promise<HeldLock> {
    mkdirSync(directory, { recursive: true });
    return acquireSharedLock(join(directory, lockName(hostId)), { timeoutMs: 2_000 });
}

export function isHostAlive(directory: string, hostId: string): boolean {
    const path = join(directory, lockName(hostId));
    return existsSync(path) && isLockHeld(path);
}

/** This host's own records, plus those of exited windows and those written before records named their host.
 * Records of other live windows are never offered for recovery here. */
export function recoverableRecords<T extends HostOwnedRecord>(records: readonly T[], ownHostId: string, alive: (hostId: string) => boolean): T[] {
    return records.filter(record => !record.hostId || record.hostId === ownHostId || !alive(record.hostId));
}

/** Deletes the lock files of exited hosts that no record still names. */
export function pruneHostLocks(directory: string, referencedHostIds: Iterable<string>): void {
    if (!existsSync(directory)) return;
    const keep = new Set([...referencedHostIds].map(lockName));
    for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (name.endsWith(".lock") && !keep.has(name) && !isLockHeld(path)) rmSync(path, { force: true });
    }
}
