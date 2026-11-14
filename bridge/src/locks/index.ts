import { DatabaseSync } from "node:sqlite";

/** A lock held through an open SQLite transaction. The operating system releases it if the process dies. */
export interface HeldLock { release(): void }
export interface LockWaitOptions { signal?: AbortSignal; timeoutMs?: number; pollMs?: number; onWait?: () => void }
export class LockTimeoutError extends Error { constructor(message: string) { super(message); this.name = "LockTimeoutError"; } }

const isBusy = (error: unknown): boolean => error instanceof Error && /database (table )?is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(error.message);

/** Lock files stay in rollback-journal mode, where a reader's shared lock is visible to other processes. */
function open(path: string): DatabaseSync {
    const db = new DatabaseSync(path);
    try { db.exec("PRAGMA busy_timeout=0"); } catch (error) { db.close(); throw error; }
    return db;
}

function held(db: DatabaseSync): HeldLock {
    let released = false;
    return { release() {
        if (released) return;
        released = true;
        try { db.exec("ROLLBACK"); } catch { /* closing the connection ends the transaction and its lock */ }
        db.close();
    } };
}

/** One non-blocking attempt; `undefined` while any other connection, in any process, holds the lock. */
export function tryExclusiveLock(path: string): HeldLock | undefined {
    const db = open(path);
    try { db.exec("BEGIN EXCLUSIVE"); }
    catch (error) { db.close(); if (isBusy(error)) return undefined; throw error; }
    return held(db);
}

/** One non-blocking attempt; shared holders coexist and only exclude an exclusive holder. */
export function trySharedLock(path: string): HeldLock | undefined {
    const db = open(path);
    try {
        db.exec("BEGIN");
        // Reading the schema takes the shared lock and keeps it until the transaction ends.
        db.prepare("SELECT count(*) AS count FROM sqlite_master").get();
    } catch (error) {
        try { db.exec("ROLLBACK"); } catch { /* no transaction began */ }
        db.close();
        if (isBusy(error)) return undefined;
        throw error;
    }
    return held(db);
}

/** True while another holder exists. Briefly takes and releases the exclusive lock when it is free. */
export function isLockHeld(path: string): boolean {
    const lock = tryExclusiveLock(path);
    if (!lock) return true;
    lock.release();
    return false;
}

async function waitFor(attempt: () => HeldLock | undefined, options: LockWaitOptions): Promise<HeldLock> {
    const deadline = options.timeoutMs === undefined ? Number.POSITIVE_INFINITY : Date.now() + options.timeoutMs;
    let notified = false;
    for (;;) {
        if (options.signal?.aborted) throw new Error("Waiting for another VS Code window was cancelled");
        const lock = attempt();
        if (lock) return lock;
        if (!notified) { notified = true; options.onWait?.(); }
        if (Date.now() >= deadline) throw new LockTimeoutError("Timed out waiting for another VS Code window");
        await delay(Math.min(options.pollMs ?? 200, Math.max(1, deadline - Date.now())), options.signal);
    }
}

export function acquireExclusiveLock(path: string, options: LockWaitOptions = {}): Promise<HeldLock> { return waitFor(() => tryExclusiveLock(path), options); }
export function acquireSharedLock(path: string, options: LockWaitOptions = {}): Promise<HeldLock> { return waitFor(() => trySharedLock(path), options); }

function delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise(resolve => {
        const done = (): void => { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, ms);
        signal?.addEventListener("abort", done, { once: true });
    });
}
