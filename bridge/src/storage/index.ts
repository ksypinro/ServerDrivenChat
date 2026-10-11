import { DatabaseSync } from "node:sqlite";
import { canonicalJson, type ProducerCursor } from "@server-driven-chat/protocol";

export type BridgeLane = "prompt" | "control";
export type FaultPoint = "after_inbox_insert" | "before_cursor_advance" | "after_outbox_insert" | "before_attempt_start";
export type CommandInput = { commandId: string; sessionId: string; deviceId: string; lane: BridgeLane; laneSeq: number; payload: unknown };
export type OutputInput = { eventId: string; sessionId: string; eventSeq: number; bridgeEpoch?: string; payload: unknown };
export type AttemptState = "pending" | "applying" | "applied" | "rejected" | "reconciliation_required";
export type DispatchState = "queued" | "applying" | "applied" | "rejected" | "reconciliation_required";
export type ServerAckState = "received" | "applied" | "rejected" | "unknown" | "reconciliation_required";
export type RecoveryState = { cursors: Array<{ deviceId: string; lane: BridgeLane; lastContiguousSeq: number }>; pendingCommands: CommandInput[]; unackedOutput: OutputInput[]; attempts: Array<{ attemptId: string; sessionId: string; commandId: string; state: AttemptState; action: unknown }>; decisions: Array<{ decisionId: string; sessionId: string; requestId: string; requestRevision: number; actionDigest: string }> };

export class BridgeStorageConflict extends Error { constructor(message: string) { super(message); this.name = "BridgeStorageConflict"; } }
export class BridgeStorageCapacity extends RangeError { constructor(message: string) { super(message); this.name = "BridgeStorageCapacity"; } }
export interface BridgeStorageLimits { maxRecordBytes: number; maxHistoryBytes: number; maxUnackedBytes: number; maxPendingPrompts: number; maxPendingControls: number; maxDatabasePages: number }
export const DEFAULT_BRIDGE_STORAGE_LIMITS: Readonly<BridgeStorageLimits> = Object.freeze({ maxRecordBytes: 1024 * 1024, maxHistoryBytes: 64 * 1024 * 1024, maxUnackedBytes: 32 * 1024 * 1024, maxPendingPrompts: 1000, maxPendingControls: 2000, maxDatabasePages: 65536 });

/** SQLite-backed local bridge state. All multi-record transitions use synchronous transactions. */
export class BridgeStore {
    readonly #db: DatabaseSync;
    readonly #fault?: (point: FaultPoint) => void;
    readonly #limits: BridgeStorageLimits;

    constructor(options: { path: string; fault?: (point: FaultPoint) => void; limits?: Partial<BridgeStorageLimits> }) {
        this.#limits = { ...DEFAULT_BRIDGE_STORAGE_LIMITS, ...options.limits };
        if (!Object.values(this.#limits).every(value => Number.isSafeInteger(value) && value > 0)) throw new RangeError("Bridge storage limits must be positive integers");
        this.#db = new DatabaseSync(options.path);
        this.#fault = options.fault;
        this.#db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
        this.#migrate();
        const pages = this.#db.prepare(`PRAGMA max_page_count=${this.#limits.maxDatabasePages}`).get() as { max_page_count: number };
        if (pages.max_page_count > this.#limits.maxDatabasePages) { this.#db.close(); throw new BridgeStorageCapacity("Existing bridge database exceeds its configured page budget; preserve it for reconciliation"); }
        this.#db.exec("PRAGMA wal_autocheckpoint=1000; PRAGMA journal_size_limit=16777216;");
    }

    close(): void { this.#db.close(); }

    acceptCommand(input: CommandInput): "created" | "duplicate" {
        this.#validateSeq(input.laneSeq);
        const payload = canonicalJson(input.payload);
        return this.#transaction(() => {
            const prior = this.#db.prepare("SELECT session_id,device_id,lane,lane_seq,payload FROM inbox_commands WHERE command_id=?").get(input.commandId) as Record<string, unknown> | undefined;
            if (prior) {
                if (prior.session_id !== input.sessionId || prior.device_id !== input.deviceId || prior.lane !== input.lane || prior.lane_seq !== input.laneSeq || prior.payload !== payload) throw new BridgeStorageConflict("command ID was reused with different content");
                return "duplicate";
            }
            if (this.#db.prepare("SELECT 1 FROM command_skips WHERE device_id=? AND lane=? AND lane_seq=?").get(input.deviceId, input.lane, input.laneSeq)) throw new BridgeStorageConflict("command sequence was authoritatively skipped");
            const seqPrior = this.#db.prepare("SELECT command_id FROM inbox_commands WHERE device_id=? AND lane=? AND lane_seq=?").get(input.deviceId, input.lane, input.laneSeq) as { command_id: string } | undefined;
            if (seqPrior) throw new BridgeStorageConflict("lane sequence was reused by another command");
            this.#checkPayload(payload);
            const pending = this.#db.prepare("SELECT count(*) AS count FROM command_dispatch WHERE device_id=? AND lane=? AND state IN ('queued','applying','reconciliation_required')").get(input.deviceId, input.lane) as { count: number };
            if (pending.count >= (input.lane === "prompt" ? this.#limits.maxPendingPrompts : this.#limits.maxPendingControls)) throw new BridgeStorageCapacity("Durable command lane capacity is full");
            this.#db.prepare("INSERT INTO inbox_commands(command_id,session_id,device_id,lane,lane_seq,payload) VALUES(?,?,?,?,?,?)").run(input.commandId, input.sessionId, input.deviceId, input.lane, input.laneSeq, payload);
            this.#fault?.("after_inbox_insert");
            this.#db.prepare("INSERT INTO receipt_cursors(device_id,lane,last_contiguous_seq) VALUES(?,?,0) ON CONFLICT(device_id,lane) DO NOTHING").run(input.deviceId, input.lane);
            const row = this.#db.prepare("SELECT last_contiguous_seq FROM receipt_cursors WHERE device_id=? AND lane=?").get(input.deviceId, input.lane) as { last_contiguous_seq: number };
            let cursor = row.last_contiguous_seq;
            while (this.#hasReceipt(input.deviceId, input.lane, cursor + 1)) cursor += 1;
            this.#fault?.("before_cursor_advance");
            this.#db.prepare("UPDATE receipt_cursors SET last_contiguous_seq=? WHERE device_id=? AND lane=?").run(cursor, input.deviceId, input.lane);
            this.#db.prepare("INSERT INTO command_dispatch(command_id,device_id,lane,lane_seq,state) VALUES(?,?,?,?,'queued')").run(input.commandId, input.deviceId, input.lane, input.laneSeq);
            return "created";
        });
    }

    /** Read a bounded ordered batch that was durably received but has no final dispatch outcome. */
    listQueuedCommands(deviceId: string, lane: BridgeLane, limit = 100, sessionId?: string): CommandInput[] {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError("limit must be between 1 and 1000");
        const rows = this.#db.prepare("SELECT i.command_id,i.session_id,i.device_id,i.lane,i.lane_seq,i.payload FROM inbox_commands i JOIN command_dispatch d USING(command_id) WHERE i.device_id=? AND i.lane=? AND (? IS NULL OR i.session_id=?) AND d.state='queued' AND i.lane_seq<=(SELECT last_contiguous_seq FROM receipt_cursors WHERE device_id=i.device_id AND lane=i.lane) ORDER BY i.lane_seq LIMIT ?").all(deviceId, lane, sessionId ?? null, sessionId ?? null, limit) as Array<Record<string, unknown>>;
        return rows.map((row) => ({ commandId: String(row.command_id), sessionId: String(row.session_id), deviceId: String(row.device_id), lane: row.lane as BridgeLane, laneSeq: Number(row.lane_seq), payload: JSON.parse(String(row.payload)) }));
    }

    getDispatchState(commandId: string): DispatchState | undefined {
        const row = this.#db.prepare("SELECT state FROM command_dispatch WHERE command_id=?").get(commandId) as { state: DispatchState } | undefined;
        return row?.state;
    }

    setServerAck(commandId: string, state: ServerAckState, details?: string): void {
        const result = this.#db.prepare("UPDATE command_dispatch SET ack_state=?,ack_details=? WHERE command_id=?").run(state, details?.slice(0, 500) ?? null, commandId);
        if (Number(result.changes) !== 1) throw new BridgeStorageConflict("cannot acknowledge a command missing from the durable inbox");
    }

    listPendingServerAcks(deviceId: string, limit = 100, sessionId?: string): Array<CommandInput & { ackState: ServerAckState; ackDetails?: string }> {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError("limit must be between 1 and 1000");
        const rows = this.#db.prepare("SELECT i.command_id,i.session_id,i.device_id,i.lane,i.lane_seq,i.payload,d.ack_state,d.ack_details FROM inbox_commands i JOIN command_dispatch d USING(command_id) WHERE i.device_id=? AND (? IS NULL OR i.session_id=?) AND d.ack_sent_state IS NOT d.ack_state ORDER BY i.lane,i.lane_seq LIMIT ?").all(deviceId, sessionId ?? null, sessionId ?? null, limit) as Array<Record<string, unknown>>;
        return rows.map((row) => ({ commandId: String(row.command_id), sessionId: String(row.session_id), deviceId: String(row.device_id), lane: row.lane as BridgeLane, laneSeq: Number(row.lane_seq), payload: JSON.parse(String(row.payload)), ackState: row.ack_state as ServerAckState, ...(row.ack_details ? { ackDetails: String(row.ack_details) } : {}) }));
    }

    markServerAckSent(commandId: string, state: ServerAckState): boolean {
        return Number(this.#db.prepare("UPDATE command_dispatch SET ack_sent_state=? WHERE command_id=? AND ack_state=?").run(state, commandId, state).changes) === 1;
    }

    markCommandReconciliation(commandId: string): void {
        const changed = this.#db.prepare("UPDATE command_dispatch SET state='reconciliation_required',updated_at=unixepoch() WHERE command_id=? AND state='queued'").run(commandId);
        if (Number(changed.changes) !== 1 && this.getDispatchState(commandId) !== "reconciliation_required") throw new BridgeStorageConflict("only a queued command can be moved to reconciliation");
    }

    /** Atomically marks a dispatch applying before its external app side effect. */
    beginDispatch(commandId: string, attemptId: string, action: unknown): "started" | DispatchState {
        const canonicalAction = canonicalJson(action);
        return this.#transaction(() => {
            const row = this.#db.prepare("SELECT state FROM command_dispatch WHERE command_id=?").get(commandId) as { state: DispatchState } | undefined;
            if (!row) throw new BridgeStorageConflict("command is missing from the durable inbox");
            if (row.state !== "queued") return row.state;
            const existing = this.#db.prepare("SELECT command_id,action,state FROM application_attempts WHERE attempt_id=?").get(attemptId) as { command_id: string; action: string; state: AttemptState } | undefined;
            if (existing && (existing.command_id !== commandId || existing.action !== canonicalAction || existing.state !== "pending"))
                throw new BridgeStorageConflict("dispatch attempt already exists or is not safe to start");
            if (existing) this.#db.prepare("UPDATE application_attempts SET state='applying',updated_at=unixepoch() WHERE attempt_id=? AND state='pending'").run(attemptId);
            else this.#db.prepare("INSERT INTO application_attempts(attempt_id,session_id,command_id,action,state) SELECT ?,i.session_id,?,?,'applying' FROM inbox_commands i WHERE i.command_id=?").run(attemptId, commandId, canonicalAction, commandId);
            this.#db.prepare("UPDATE command_dispatch SET state='applying',updated_at=unixepoch() WHERE command_id=? AND state='queued'").run(commandId);
            this.#fault?.("before_attempt_start");
            return "started";
        });
    }

    /** Atomically records the durable dispatch outcome and matching application attempt. */
    finishDispatch(commandId: string, outcome: "applied" | "rejected" | "reconciliation_required"): void {
        this.#transaction(() => {
            const changed = this.#db.prepare("UPDATE application_attempts SET state=?,updated_at=unixepoch() WHERE command_id=? AND state='applying'").run(outcome, commandId);
            const dispatch = this.#db.prepare("UPDATE command_dispatch SET state=?,updated_at=unixepoch() WHERE command_id=? AND state='applying'").run(outcome, commandId);
            if (Number(changed.changes) !== 1 || Number(dispatch.changes) !== 1) throw new BridgeStorageConflict("only an applying dispatch can be finalized");
        });
    }

    /** Contiguous producer cursor within one epoch, including acknowledged history. */
    getLastOutputSeq(sessionId: string, bridgeEpoch = "legacy"): number {
        const rows = this.#db.prepare("SELECT event_seq FROM outbox_events WHERE session_id=? AND bridge_epoch=? ORDER BY event_seq").all(sessionId, bridgeEpoch) as Array<{event_seq: number}>;
        let seq = 0;
        for (const row of rows) { if (row.event_seq !== seq + 1) break; seq++; }
        return seq;
    }

    getOutputCheckpoints(sessionId: string): ProducerCursor[] {
        const epochs = this.#db.prepare("SELECT DISTINCT bridge_epoch FROM outbox_events WHERE session_id=?").all(sessionId) as Array<{bridge_epoch: string}>;
        return epochs.map(({bridge_epoch}) => ({bridgeEpoch: bridge_epoch, producerSeq: this.getLastOutputSeq(sessionId, bridge_epoch)}));
    }

    countUnackedOutput(sessionId?: string): number {
        const row = this.#db.prepare("SELECT count(*) AS count FROM outbox_events WHERE acked_at IS NULL AND (? IS NULL OR session_id=?)").get(sessionId ?? null, sessionId ?? null) as { count: number };
        return Number(row.count);
    }

    /** Only an authenticated server tombstone may account for a missing device-lane sequence. */
    acceptSkip(input: {deviceId: string; lane: BridgeLane; laneSeq: number; commandId: string; reason: string}): void {
        this.#validateSeq(input.laneSeq);
        this.#transaction(() => {
            const prior = this.#db.prepare("SELECT command_id,reason FROM command_skips WHERE device_id=? AND lane=? AND lane_seq=?").get(input.deviceId,input.lane,input.laneSeq) as {command_id: string; reason: string} | undefined;
            if (prior && (prior.command_id !== input.commandId || prior.reason !== input.reason)) throw new BridgeStorageConflict("conflicting skip identity");
            const command = this.#db.prepare("SELECT command_id FROM inbox_commands WHERE device_id=? AND lane=? AND lane_seq=?").get(input.deviceId,input.lane,input.laneSeq) as {command_id: string} | undefined;
            if (command && command.command_id !== input.commandId) throw new BridgeStorageConflict("skip conflicts with received command identity");
            this.#db.prepare("INSERT INTO command_skips(device_id,lane,lane_seq,command_id,reason) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING").run(input.deviceId,input.lane,input.laneSeq,input.commandId,input.reason);
            this.#db.prepare("UPDATE command_dispatch SET state='rejected',ack_state='rejected',ack_sent_state='rejected' WHERE command_id=? AND state='queued'").run(input.commandId);
            this.#db.prepare("INSERT INTO receipt_cursors VALUES(?,?,0) ON CONFLICT DO NOTHING").run(input.deviceId,input.lane);
            let cursor = this.getCursor(input.deviceId,input.lane);
            while (this.#hasReceipt(input.deviceId,input.lane,cursor+1)) cursor++;
            this.#db.prepare("UPDATE receipt_cursors SET last_contiguous_seq=? WHERE device_id=? AND lane=?").run(cursor,input.deviceId,input.lane);
        });
    }

    #hasReceipt(deviceId: string, lane: BridgeLane, seq: number): boolean {
        return !!this.#db.prepare("SELECT 1 FROM inbox_commands WHERE device_id=? AND lane=? AND lane_seq=? UNION ALL SELECT 1 FROM command_skips WHERE device_id=? AND lane=? AND lane_seq=?").get(deviceId,lane,seq,deviceId,lane,seq);
    }

    getCursor(deviceId: string, lane: BridgeLane): number {
        const row = this.#db.prepare("SELECT last_contiguous_seq FROM receipt_cursors WHERE device_id=? AND lane=?").get(deviceId, lane) as { last_contiguous_seq: number } | undefined;
        return row?.last_contiguous_seq ?? 0;
    }

    persistOutput(input: OutputInput, maxUnacked?: number): "created" | "duplicate" {
        this.#validateSeq(input.eventSeq);
        const payload = canonicalJson(input.payload);
        const epoch = outputEpoch(input);
        return this.#transaction(() => {
            const prior = this.#db.prepare("SELECT session_id,bridge_epoch,event_seq,payload FROM outbox_events WHERE event_id=?").get(input.eventId) as Record<string, unknown> | undefined;
            if (prior) {
                if (prior.session_id !== input.sessionId || prior.bridge_epoch !== epoch || prior.event_seq !== input.eventSeq || prior.payload !== payload) throw new BridgeStorageConflict("event ID was reused with different content");
                return "duplicate";
            }
            if (maxUnacked !== undefined && (!Number.isSafeInteger(maxUnacked) || maxUnacked < 1 || this.countUnackedOutput(input.sessionId) >= maxUnacked)) throw new RangeError("Durable output queue capacity is full");
            this.#checkPayload(payload);
            const bytes = this.#db.prepare("SELECT COALESCE(sum(length(CAST(payload AS BLOB))),0) AS bytes FROM outbox_events WHERE acked_at IS NULL").get() as { bytes: number };
            if (bytes.bytes + Buffer.byteLength(payload) > this.#limits.maxUnackedBytes) throw new BridgeStorageCapacity("Durable output byte capacity is full");
            this.#db.prepare("INSERT INTO outbox_events(event_id,session_id,bridge_epoch,event_seq,payload) VALUES(?,?,?,?,?)").run(input.eventId, input.sessionId, epoch, input.eventSeq, payload);
            this.#fault?.("after_outbox_insert");
            return "created";
        });
    }

    listUnackedOutput(limit = 100, sessionId?: string): OutputInput[] {
        if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("limit must be a positive safe integer");
        const rows = this.#db.prepare("SELECT event_id,session_id,bridge_epoch,event_seq,payload FROM outbox_events WHERE acked_at IS NULL AND (? IS NULL OR session_id=?) ORDER BY session_id,created_at,bridge_epoch,event_seq LIMIT ?").all(sessionId ?? null, sessionId ?? null, limit) as Array<Record<string, unknown>>;
        return rows.map((row) => ({ eventId: String(row.event_id), sessionId: String(row.session_id), eventSeq: Number(row.event_seq), bridgeEpoch: String(row.bridge_epoch), payload: JSON.parse(String(row.payload)) }));
    }

    acknowledgeOutput(eventId: string): boolean {
        return Number(this.#db.prepare("UPDATE outbox_events SET acked_at=unixepoch() WHERE event_id=? AND acked_at IS NULL").run(eventId).changes) === 1;
    }

    mapNativeId(input: { sessionId: string; entityKind: string; logicalId: string; nativeId: string }): "created" | "identical" {
        return this.#transaction(() => {
            const prior = this.#db.prepare("SELECT native_id FROM native_id_mappings WHERE session_id=? AND entity_kind=? AND logical_id=?").get(input.sessionId, input.entityKind, input.logicalId) as { native_id: string } | undefined;
            if (prior) { if (prior.native_id !== input.nativeId) throw new BridgeStorageConflict("logical ID already maps to another native ID"); return "identical"; }
            const reverse = this.#db.prepare("SELECT logical_id FROM native_id_mappings WHERE session_id=? AND entity_kind=? AND native_id=?").get(input.sessionId, input.entityKind, input.nativeId);
            if (reverse) throw new BridgeStorageConflict("native ID already maps to another logical ID");
            this.#db.prepare("INSERT INTO native_id_mappings(session_id,entity_kind,logical_id,native_id) VALUES(?,?,?,?)").run(input.sessionId, input.entityKind, input.logicalId, input.nativeId);
            return "created";
        });
    }

    createAttempt(input: { attemptId: string; sessionId: string; commandId: string; action: unknown }): "created" | "duplicate" {
        const action = canonicalJson(input.action);
        return this.#transaction(() => {
            const row = this.#db.prepare("SELECT session_id,command_id,action FROM application_attempts WHERE attempt_id=?").get(input.attemptId) as Record<string, unknown> | undefined;
            if (row) { if (row.session_id !== input.sessionId || row.command_id !== input.commandId || row.action !== action) throw new BridgeStorageConflict("attempt ID was reused with different content"); return "duplicate"; }
            this.#db.prepare("INSERT INTO application_attempts(attempt_id,session_id,command_id,action,state) VALUES(?,?,?,?,'pending')").run(input.attemptId, input.sessionId, input.commandId, action);
            return "created";
        });
    }

    markAttemptApplying(attemptId: string): void {
        this.#transaction(() => {
            this.#fault?.("before_attempt_start");
            const result = this.#db.prepare("UPDATE application_attempts SET state='applying',updated_at=unixepoch() WHERE attempt_id=? AND state='pending'").run(attemptId);
            if (Number(result.changes) !== 1) throw new BridgeStorageConflict("attempt is missing or is no longer pending");
        });
    }

    finishAttempt(attemptId: string, outcome: "applied" | "rejected"): void {
        const result = this.#db.prepare("UPDATE application_attempts SET state=?,updated_at=unixepoch() WHERE attempt_id=? AND state='applying'").run(outcome, attemptId);
        if (Number(result.changes) !== 1) throw new BridgeStorageConflict("only an applying attempt can be finalized");
    }

    markAttemptReconciliationRequired(attemptId: string): void {
        const result = this.#db.prepare("UPDATE application_attempts SET state='reconciliation_required',updated_at=unixepoch() WHERE attempt_id=? AND state IN ('pending','applying')").run(attemptId);
        if (Number(result.changes) !== 1) throw new BridgeStorageConflict("only a pending or applying attempt can require reconciliation");
    }

    consumeDecision(input: { decisionId: string; sessionId: string; requestId: string; requestRevision: number; actionDigest: string }): "created" | "duplicate" {
        if (!Number.isSafeInteger(input.requestRevision) || input.requestRevision < 1) throw new TypeError("requestRevision must be a positive safe integer");
        return this.#transaction(() => {
            const row = this.#db.prepare("SELECT session_id,request_id,request_revision,action_digest FROM decision_consumptions WHERE decision_id=?").get(input.decisionId) as Record<string, unknown> | undefined;
            if (row) { if (row.session_id !== input.sessionId || row.request_id !== input.requestId || row.request_revision !== input.requestRevision || row.action_digest !== input.actionDigest) throw new BridgeStorageConflict("decision ID was reused with different content"); return "duplicate"; }
            const winner = this.#db.prepare("SELECT decision_id FROM decision_consumptions WHERE session_id=? AND request_id=? AND request_revision=?").get(input.sessionId, input.requestId, input.requestRevision);
            if (winner) throw new BridgeStorageConflict("a decision is already consumed for this request revision");
            this.#db.prepare("INSERT INTO decision_consumptions(decision_id,session_id,request_id,request_revision,action_digest) VALUES(?,?,?,?,?)").run(input.decisionId, input.sessionId, input.requestId, input.requestRevision, input.actionDigest);
            return "created";
        });
    }

    /** Inspect an attempt without running startup recovery or changing live dispatches. */
    getAttempt(attemptId: string): RecoveryState["attempts"][number] | undefined {
        const row = this.#db.prepare("SELECT attempt_id,session_id,command_id,state,action FROM application_attempts WHERE attempt_id=?").get(attemptId) as Record<string, unknown> | undefined;
        return row ? { attemptId: String(row.attempt_id), sessionId: String(row.session_id), commandId: String(row.command_id), state: row.state as AttemptState, action: JSON.parse(String(row.action)) } : undefined;
    }

    recoverAfterRestart(sessionId?: string): RecoveryState {
        this.#transaction(() => {
            this.#db.prepare("UPDATE application_attempts SET state='reconciliation_required',updated_at=unixepoch() WHERE state='applying' AND (? IS NULL OR session_id=?)").run(sessionId ?? null, sessionId ?? null);
            this.#db.prepare("UPDATE command_dispatch SET state='reconciliation_required',ack_state='reconciliation_required',updated_at=unixepoch() WHERE state='applying' AND (? IS NULL OR command_id IN (SELECT command_id FROM inbox_commands WHERE session_id=?))").run(sessionId ?? null, sessionId ?? null);
        });
        const cursors = (this.#db.prepare("SELECT device_id,lane,last_contiguous_seq FROM receipt_cursors ORDER BY device_id,lane").all() as Array<Record<string, unknown>>).map((row) => ({ deviceId: String(row.device_id), lane: row.lane as BridgeLane, lastContiguousSeq: Number(row.last_contiguous_seq) }));
        const pendingCommands = (this.#db.prepare("SELECT command_id,session_id,device_id,lane,lane_seq,payload FROM inbox_commands WHERE lane_seq>(SELECT last_contiguous_seq FROM receipt_cursors c WHERE c.device_id=inbox_commands.device_id AND c.lane=inbox_commands.lane) ORDER BY device_id,lane,lane_seq").all() as Array<Record<string, unknown>>).map((row) => ({ commandId: String(row.command_id), sessionId: String(row.session_id), deviceId: String(row.device_id), lane: row.lane as BridgeLane, laneSeq: Number(row.lane_seq), payload: JSON.parse(String(row.payload)) }));
        const attempts = (this.#db.prepare("SELECT attempt_id,session_id,command_id,state,action FROM application_attempts WHERE state IN ('pending','applying','reconciliation_required') ORDER BY created_at").all() as Array<Record<string, unknown>>).map((row) => ({ attemptId: String(row.attempt_id), sessionId: String(row.session_id), commandId: String(row.command_id), state: row.state as AttemptState, action: JSON.parse(String(row.action)) }));
        const decisions = (this.#db.prepare("SELECT decision_id,session_id,request_id,request_revision,action_digest FROM decision_consumptions ORDER BY consumed_at DESC LIMIT 100").all() as Array<Record<string, unknown>>).map((row) => ({ decisionId: String(row.decision_id), sessionId: String(row.session_id), requestId: String(row.request_id), requestRevision: Number(row.request_revision), actionDigest: String(row.action_digest) }));
        return { cursors, pendingCommands, unackedOutput: this.listUnackedOutput(), attempts, decisions };
    }

    #migrate(): void {
        this.#db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS inbox_commands(command_id TEXT PRIMARY KEY,session_id TEXT NOT NULL,device_id TEXT NOT NULL,lane TEXT NOT NULL CHECK(lane IN ('prompt','control')),lane_seq INTEGER NOT NULL CHECK(lane_seq>0),payload TEXT NOT NULL,received_at INTEGER NOT NULL DEFAULT(unixepoch()),UNIQUE(device_id,lane,lane_seq));
            CREATE TABLE IF NOT EXISTS receipt_cursors(device_id TEXT NOT NULL,lane TEXT NOT NULL CHECK(lane IN ('prompt','control')),last_contiguous_seq INTEGER NOT NULL CHECK(last_contiguous_seq>=0),PRIMARY KEY(device_id,lane));
            CREATE TABLE IF NOT EXISTS command_dispatch(command_id TEXT PRIMARY KEY REFERENCES inbox_commands(command_id),device_id TEXT NOT NULL,lane TEXT NOT NULL CHECK(lane IN ('prompt','control')),lane_seq INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('queued','applying','applied','rejected','reconciliation_required')),ack_state TEXT NOT NULL DEFAULT 'received',ack_details TEXT,ack_sent_state TEXT,updated_at INTEGER NOT NULL DEFAULT(unixepoch()),UNIQUE(device_id,lane,lane_seq));
            CREATE INDEX IF NOT EXISTS command_dispatch_ready ON command_dispatch(device_id,lane,state,lane_seq);
            CREATE TABLE IF NOT EXISTS outbox_events(event_id TEXT PRIMARY KEY,session_id TEXT NOT NULL,event_seq INTEGER NOT NULL CHECK(event_seq>0),payload TEXT NOT NULL,created_at INTEGER NOT NULL DEFAULT(unixepoch()),acked_at INTEGER,UNIQUE(session_id,event_seq));
            CREATE TABLE IF NOT EXISTS native_id_mappings(session_id TEXT NOT NULL,entity_kind TEXT NOT NULL,logical_id TEXT NOT NULL,native_id TEXT NOT NULL,PRIMARY KEY(session_id,entity_kind,logical_id),UNIQUE(session_id,entity_kind,native_id));
            CREATE TABLE IF NOT EXISTS application_attempts(attempt_id TEXT PRIMARY KEY,session_id TEXT NOT NULL,command_id TEXT NOT NULL,action TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','applying','applied','rejected','reconciliation_required')),created_at INTEGER NOT NULL DEFAULT(unixepoch()),updated_at INTEGER NOT NULL DEFAULT(unixepoch()));
            CREATE TABLE IF NOT EXISTS decision_consumptions(decision_id TEXT PRIMARY KEY,session_id TEXT NOT NULL,request_id TEXT NOT NULL,request_revision INTEGER NOT NULL CHECK(request_revision>0),action_digest TEXT NOT NULL,consumed_at INTEGER NOT NULL DEFAULT(unixepoch()),UNIQUE(session_id,request_id,request_revision));
            CREATE INDEX IF NOT EXISTS application_attempts_recovery ON application_attempts(state,created_at);
            INSERT INTO schema_migrations(version,checksum) VALUES(1,'m07-bridge-storage-v1') ON CONFLICT(version) DO NOTHING;`);
        this.#db.exec("INSERT INTO command_dispatch(command_id,device_id,lane,lane_seq,state) SELECT command_id,device_id,lane,lane_seq,'queued' FROM inbox_commands WHERE 1 ON CONFLICT(command_id) DO NOTHING");
        this.#db.exec("CREATE TABLE IF NOT EXISTS command_skips(device_id TEXT NOT NULL,lane TEXT NOT NULL,lane_seq INTEGER NOT NULL,command_id TEXT NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(device_id,lane,lane_seq))");
        const outboxColumns = new Set((this.#db.prepare("PRAGMA table_info(outbox_events)").all() as Array<{name: string}>).map(row => row.name));
        if (!outboxColumns.has("bridge_epoch")) this.#transaction(() => {
            this.#db.exec(`CREATE TABLE outbox_events_v2(event_id TEXT PRIMARY KEY,session_id TEXT NOT NULL,bridge_epoch TEXT NOT NULL,event_seq INTEGER NOT NULL CHECK(event_seq>0),payload TEXT NOT NULL,created_at INTEGER NOT NULL DEFAULT(unixepoch()),acked_at INTEGER,UNIQUE(session_id,bridge_epoch,event_seq));
                INSERT INTO outbox_events_v2 SELECT event_id,session_id,COALESCE(json_extract(payload,'$.bridgeEpoch'),'legacy'),event_seq,payload,created_at,acked_at FROM outbox_events;
                DROP TABLE outbox_events; ALTER TABLE outbox_events_v2 RENAME TO outbox_events;
                INSERT INTO schema_migrations VALUES(2,'m07-epoch-and-skip-v2');`);
        });
        const dispatchColumns = new Set((this.#db.prepare("PRAGMA table_info(command_dispatch)").all() as Array<{ name: string }>).map((row) => row.name));
        if (!dispatchColumns.has("ack_state")) this.#db.exec("ALTER TABLE command_dispatch ADD COLUMN ack_state TEXT NOT NULL DEFAULT 'received'");
        if (!dispatchColumns.has("ack_details")) this.#db.exec("ALTER TABLE command_dispatch ADD COLUMN ack_details TEXT");
        if (!dispatchColumns.has("ack_sent_state")) this.#db.exec("ALTER TABLE command_dispatch ADD COLUMN ack_sent_state TEXT");
    }

    #transaction<T>(operation: () => T): T {
        this.#db.exec("BEGIN IMMEDIATE");
        try { const result = operation(); this.#db.exec("COMMIT"); return result; }
        catch (error) {
            try { this.#db.exec("ROLLBACK"); } catch { /* SQLITE_FULL may already roll back; preserve the original error. */ }
            if (error instanceof Error && /database or disk is full|SQLITE_FULL|ENOSPC/i.test(error.message)) throw new BridgeStorageCapacity("Bridge storage is full; preserve the ledger and reconcile native state");
            throw error;
        }
    }

    #checkPayload(payload: string): void {
        const size = Buffer.byteLength(payload);
        if (size > this.#limits.maxRecordBytes) throw new BridgeStorageCapacity("Bridge record exceeds the byte limit");
        const row = this.#db.prepare("SELECT (SELECT COALESCE(sum(length(CAST(payload AS BLOB))),0) FROM inbox_commands) + (SELECT COALESCE(sum(length(CAST(payload AS BLOB))),0) FROM outbox_events) AS bytes").get() as { bytes: number };
        if (row.bytes + size > this.#limits.maxHistoryBytes) throw new BridgeStorageCapacity("Bridge retained history byte capacity is full; archive and reconcile locally");
    }

    #validateSeq(value: number): void { if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("sequence must be a positive safe integer"); }
}

/** Legacy SDK rows have a separate epoch; protocol events always supply their real epoch. */
function outputEpoch(input: OutputInput): string {
    const payloadEpoch = input.payload && typeof input.payload === "object" && "bridgeEpoch" in input.payload ? input.payload.bridgeEpoch : undefined;
    if (input.bridgeEpoch && payloadEpoch && input.bridgeEpoch !== payloadEpoch) throw new BridgeStorageConflict("output epoch differs from its envelope");
    const epoch = input.bridgeEpoch ?? payloadEpoch ?? "legacy";
    if (typeof epoch !== "string" || !epoch) throw new TypeError("output bridge epoch is invalid");
    return epoch;
}
