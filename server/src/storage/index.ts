import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import { canonicalJson } from "@server-driven-chat/protocol";

export const storageModule = "server-storage" as const;
export type Lane = "prompt" | "control";
export type InteractionKind = "input" | "approval";
export type RecordDisposition = "created" | "identical";

export class StorageConflictError extends Error {
  constructor(message: string) { super(message); this.name = "StorageConflictError"; }
}
export class StorageNotFoundError extends Error {
  constructor(message: string) { super(message); this.name = "StorageNotFoundError"; }
}

export class StorageCapacityError extends Error { constructor(message: string) { super(message); this.name = "StorageCapacityError"; } }
export interface BindingFence { deviceId: string; sessionId: string; bindingRevision: number; leaseGeneration: number; credentialHash?: string }
export interface UserFence {sessionId: string; userId: string; permission: "prompt" | "approve" | "administer"; publicCredentialHash?: string}
export interface WriteOptions { userFence?: UserFence; fence?: BindingFence; client?: PoolClient; pendingLimit?: number; singleOutstanding?: boolean }

export interface ServerStorageLimits { maxRecordBytes: number; maxSessionEvents: number; maxSessionEventBytes: number; maxLaneCommands: number; maxLaneCommandBytes: number }
export const DEFAULT_SERVER_STORAGE_LIMITS: Readonly<ServerStorageLimits> = Object.freeze({ maxRecordBytes: 1024 * 1024, maxSessionEvents: 10000, maxSessionEventBytes: 32 * 1024 * 1024, maxLaneCommands: 50000, maxLaneCommandBytes: 32 * 1024 * 1024 });
export interface ServerDatabaseOptions { pool?: Pool; poolConfig?: PoolConfig; limits?: Partial<ServerStorageLimits> }
export interface UserRecord { userId: string; email: string; createdAt?: string }
export interface DeviceRecord { deviceId: string; userId: string; status: "pending" | "active" | "revoked"; payload: unknown }
export interface SessionRecord { sessionId: string; ownerUserId: string }
export interface BindingRecord { bindingId: string; sessionId: string; deviceId: string; bindingRevision: number; leaseGeneration: number; state: "active" | "stale" | "detached" | "revoked"; payload: unknown }
export interface CommandRecord { commandId: string; sessionId: string; deviceId: string; lane: Lane; payload: unknown }
export interface EventRecord { eventId: string; sessionId: string; bridgeEpoch: string; producerSeq: number; payload: unknown }
export interface InteractionRecord { interactionId: string; sessionId: string; requestId: string; requestRevision: number; kind: InteractionKind; state: string; payload: unknown }
export interface DecisionRecord { decisionId: string; sessionId: string; requestId: string; requestRevision: number; payload: unknown }
export interface GrantRecord { grantId: string; sessionId: string; requestId: string; decisionId: string; state: "pending" | "active" | "revoked" | "expired" | "unknown"; payload: unknown }
export interface AttachmentMetadataRecord { attachmentId: string; sessionId: string; state: "pending" | "committed" | "expired" | "deleted"; payload: unknown }
export interface AuditRecord { auditId: string; sessionId?: string; actorId?: string; action: string; payload: unknown }
export interface StoredCommand extends CommandRecord { laneSeq: number; disposition: RecordDisposition }
export interface StoredEvent extends EventRecord { sessionSeq: number; disposition: RecordDisposition }
export type CommandAckState = "received" | "applied" | "rejected" | "unknown" | "reconciliation_required";
export interface CommandAckRecord { deviceId: string; lane: Lane; laneSeq: number; state: CommandAckState; payload: unknown }
export interface StoredSnapshot {
  session: { sessionId: string; ownerUserId: string; state: string };
  bindings: BindingRecord[];
  events: StoredEvent[];
  interactions: InteractionRecord[];
  watermark: { prompt: number; control: number; sessionSeq: number };
}

const JSON_VALUE = (value: unknown): string => canonicalJson(value);
const dateOrNow = (date?: string): string | undefined => date;
const asNumber = (value: string | number | bigint): number => Number(value);

async function lockKeys(client: PoolClient, ...keys: string[]): Promise<void> {
  for (const key of [...new Set(keys)].sort()) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
}

export class ServerDatabase {
  readonly pool: Pool;
  readonly #ownsPool: boolean;
  readonly #limits: ServerStorageLimits;
  #closed = false;

  constructor(options: ServerDatabaseOptions = {}) {
    this.#limits = { ...DEFAULT_SERVER_STORAGE_LIMITS, ...options.limits };
    if (!Object.values(this.#limits).every(value => Number.isSafeInteger(value) && value > 0)) throw new RangeError("Server storage limits must be positive integers");
    if (options.pool && options.poolConfig) throw new TypeError("Pass either an existing pool or pool configuration, not both");
    this.#ownsPool = !options.pool;
    this.pool = options.pool ?? new Pool(options.poolConfig ?? { connectionString: process.env.DATABASE_URL });
  }

  async close(): Promise<void> { if (this.#ownsPool && !this.#closed) { this.#closed = true; await this.pool.end(); } }

  /** Apply checksum-pinned SQL migrations once, under a database-wide advisory lock. */
  async migrate(): Promise<void> {
    const directory = new URL("../../migrations/", import.meta.url);
    const files = (await readdir(directory)).filter((file) => /^\d{3}_.+\.sql$/.test(file)).sort();
    await this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock($1, $2)", [6006, 1]);
      await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
      for (const file of files) {
        const version = Number(file.slice(0, 3));
        const sql = await readFile(new URL(file, directory), "utf8");
        const checksum = createHash("sha256").update(sql).digest("hex");
        const existing = await client.query<{ checksum: string }>("SELECT checksum FROM schema_migrations WHERE version = $1", [version]);
        if (existing.rowCount) {
          if (existing.rows[0].checksum !== checksum) throw new StorageConflictError(`Applied migration ${version} checksum differs from the checked-in migration`);
          continue;
        }
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)", [version, checksum]);
      }
    });
  }

  /** Compose atomic storage operations. A thrown error always rolls back the full callback. */
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original transaction error */ }
      throw error;
    } finally { client.release(); }
  }

  /** Lock the authority rows before validating; evaluate expiry after every lock wait. */
  async lockBindingFence(client: PoolClient, fence: BindingFence): Promise<{leaseExpiresAt: string; serverTime: string}> {
    const rows = await client.query("SELECT b.binding_id FROM bindings b JOIN devices d USING(device_id) WHERE b.device_id=$1 AND b.session_id=$2 FOR NO KEY UPDATE OF b,d", [fence.deviceId,fence.sessionId]);
    if (!rows.rowCount) throw new StorageConflictError("Binding fence no longer exists");
    if (fence.credentialHash) {
      await client.query("SELECT credential_id FROM device_credentials WHERE device_id=$1 AND token_hash=$2 FOR UPDATE", [fence.deviceId,fence.credentialHash]);
      const credential = await client.query("SELECT 1 FROM device_credentials WHERE device_id=$1 AND token_hash=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp()", [fence.deviceId,fence.credentialHash]);
      if (!credential.rowCount) throw new StorageConflictError("Device credential was revoked or expired during admission");
    }
    const valid = await client.query<{lease_expires_at: Date; server_time: Date}>("SELECT b.lease_expires_at,clock_timestamp() AS server_time FROM bindings b JOIN devices d USING(device_id) WHERE b.device_id=$1 AND b.session_id=$2 AND b.state='active' AND d.status='active' AND b.binding_revision=$3 AND b.lease_generation=$4 AND b.lease_expires_at>clock_timestamp()", [fence.deviceId,fence.sessionId,fence.bindingRevision,fence.leaseGeneration]);
    if (!valid.rowCount) throw new StorageConflictError("Binding revision, lease generation, or expiry was fenced");
    return {leaseExpiresAt: valid.rows[0].lease_expires_at.toISOString(), serverTime: valid.rows[0].server_time.toISOString()};
  }

  /** Hold revocation and scope checks through the committing authority boundary. */
  async lockPublicCredential(client: PoolClient, tokenHash: string, sessionId: string, permission: string): Promise<void> {
    await client.query("SELECT credential_id FROM public_credentials WHERE token_hash=$1 FOR SHARE", [tokenHash]);
    const valid = await client.query("SELECT 1 FROM public_credentials c JOIN bindings b USING(binding_id) WHERE c.token_hash=$1 AND c.session_id=$2 AND $3=ANY(c.scopes) AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() AND b.state='active' AND b.lease_expires_at>clock_timestamp()", [tokenHash,sessionId,permission]);
    if (!valid.rowCount) throw new Error("Session permission denied: public credential revoked, expired or out of scope");
  }

  async #writeTransaction<T>(options: WriteOptions, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const perform = async (client: PoolClient): Promise<T> => {
      if (options.userFence?.publicCredentialHash) await this.lockPublicCredential(client,options.userFence.publicCredentialHash,options.userFence.sessionId,options.userFence.permission);
      // All fenced writes acquire binding/device before session or membership locks.
      if (options.fence) await this.lockBindingFence(client, options.fence);
      if (options.userFence) {
        const user = options.userFence;
        await client.query("SELECT session_id FROM sessions WHERE session_id=$1 FOR SHARE", [user.sessionId]);
        await client.query("SELECT user_id FROM session_memberships WHERE session_id=$1 AND user_id=$2 FOR SHARE", [user.sessionId,user.userId]);
        const authorized = await client.query("SELECT 1 FROM sessions s LEFT JOIN session_memberships m ON m.session_id=s.session_id AND m.user_id=$2 WHERE s.session_id=$1 AND (s.owner_user_id=$2 OR ($3='prompt' AND m.role='operator'))", [user.sessionId,user.userId,user.permission]);
        if (!authorized.rowCount) throw new Error("Session permission denied during command admission");
      }
      const result = await work(client);
      // Work can wait on unrelated storage locks: expiry must still hold at commit admission.
      if (options.fence) await this.lockBindingFence(client, options.fence);
      if (options.userFence?.publicCredentialHash) await this.lockPublicCredential(client,options.userFence.publicCredentialHash,options.userFence.sessionId,options.userFence.permission);
      return result;
    };
    return options.client ? perform(options.client) : this.transaction(perform);
  }

  async skipCommand(record: StoredCommand): Promise<void> {
    await this.transaction(async client => {
      await lockKeys(client, `command:${record.commandId}`);
      await client.query("INSERT INTO command_skips(device_id,lane,lane_seq,command_id,reason) VALUES($1,$2,$3,$4,'obsolete_binding') ON CONFLICT DO NOTHING", [record.deviceId,record.lane,record.laneSeq,record.commandId]);
      await client.query("INSERT INTO command_acknowledgements(device_id,lane,lane_seq,state,payload) VALUES($1,$2,$3,'rejected',$4::jsonb) ON CONFLICT(device_id,lane,lane_seq) DO NOTHING", [record.deviceId,record.lane,record.laneSeq,JSON_VALUE({sessionId: record.sessionId,details: {reason: 'obsolete_binding'}})]);
    });
  }

  async putUser(record: UserRecord): Promise<RecordDisposition> {
    return this.transaction(async (client) => {
      await lockKeys(client, `user-id:${record.userId}`, `user-email:${record.email}`);
      const existing = await client.query("SELECT email FROM app_users WHERE user_id=$1 FOR UPDATE", [record.userId]);
      if (existing.rowCount) {
        if (existing.rows[0].email === record.email) return "identical";
        throw new StorageConflictError(`User ${record.userId} already has different immutable data`);
      }
      const emailOwner = await client.query("SELECT user_id FROM app_users WHERE email=$1", [record.email]);
      if (emailOwner.rowCount) throw new StorageConflictError(`Email ${record.email} is already assigned to another user`);
      await client.query("INSERT INTO app_users(user_id,email,created_at) VALUES($1,$2,COALESCE($3::timestamptz,now()))", [record.userId, record.email, dateOrNow(record.createdAt) ?? null]);
      return "created";
    });
  }

  async putDevice(record: DeviceRecord): Promise<RecordDisposition> {
    return this.transaction(async (client) => {
      await lockKeys(client, `device:${record.deviceId}`);
      const rows = await client.query("SELECT user_id,status,payload FROM devices WHERE device_id=$1 FOR UPDATE", [record.deviceId]);
      if (rows.rowCount) {
        const row = rows.rows[0];
        if (row.user_id === record.userId && row.status === record.status && JSON_VALUE(row.payload) === JSON_VALUE(record.payload)) return "identical";
        throw new StorageConflictError(`Device ${record.deviceId} already exists with different data`);
      }
      await client.query("INSERT INTO devices(device_id,user_id,status,payload) VALUES($1,$2,$3,$4::jsonb)", [record.deviceId, record.userId, record.status, JSON_VALUE(record.payload)]);
      return "created";
    });
  }

  async putSession(record: SessionRecord): Promise<RecordDisposition> {
    return this.transaction(async (client) => {
      await lockKeys(client, `session:${record.sessionId}`);
      const rows = await client.query("SELECT owner_user_id FROM sessions WHERE session_id=$1 FOR UPDATE", [record.sessionId]);
      if (rows.rowCount) {
        if (rows.rows[0].owner_user_id === record.ownerUserId) return "identical";
        throw new StorageConflictError(`Session ${record.sessionId} already belongs to another user`);
      }
      await client.query("INSERT INTO sessions(session_id,owner_user_id) VALUES($1,$2)", [record.sessionId, record.ownerUserId]);
      return "created";
    });
  }

  async putBinding(record: BindingRecord): Promise<RecordDisposition> {
    return this.transaction(async (client) => {
      await lockKeys(client, `binding:${record.bindingId}`, `binding-session:${record.sessionId}`);
      const occupied = await client.query("SELECT binding_id FROM bindings WHERE session_id=$1 AND (binding_revision=$2 OR ($3='active' AND state='active'))", [record.sessionId, record.bindingRevision, record.state]);
      if (occupied.rowCount && occupied.rows[0].binding_id !== record.bindingId)
        throw new StorageConflictError(`Session ${record.sessionId} already has a binding at this revision or an active binding`);
      const existing = await client.query("SELECT session_id,device_id,binding_revision,lease_generation,state,payload FROM bindings WHERE binding_id=$1 FOR UPDATE", [record.bindingId]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (row.session_id === record.sessionId && row.device_id === record.deviceId && row.binding_revision === record.bindingRevision && row.lease_generation === record.leaseGeneration && row.state === record.state && JSON_VALUE(row.payload) === JSON_VALUE(record.payload)) return "identical";
        throw new StorageConflictError(`Binding ${record.bindingId} already exists with different data`);
      }
      await client.query("INSERT INTO bindings(binding_id,session_id,device_id,binding_revision,lease_generation,state,payload,lease_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,CASE WHEN $6='active' THEN clock_timestamp()+interval '60 seconds' ELSE NULL END)",
        [record.bindingId, record.sessionId, record.deviceId, record.bindingRevision, record.leaseGeneration, record.state, JSON_VALUE(record.payload)]);
      return "created";
    });
  }

  async recordCommand(record: CommandRecord, options: WriteOptions = {}): Promise<StoredCommand> {
    return this.#writeTransaction(options, async (client) => {
      await lockKeys(client, `command:${record.commandId}`);
      const existing = await client.query("SELECT session_id,device_id,lane,lane_seq,payload FROM commands WHERE command_id=$1", [record.commandId]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (row.session_id === record.sessionId && row.device_id === record.deviceId && row.lane === record.lane && JSON_VALUE(row.payload) === JSON_VALUE(record.payload))
          return { ...record, payload: row.payload, laneSeq: asNumber(row.lane_seq), disposition: "identical" };
        throw new StorageConflictError(`Command ${record.commandId} was retried with conflicting content`);
      }
      if (record.lane === "prompt") {
        // Shared by every ingress; locks serialize the opt-in and all subsequent prompts.
        await lockKeys(client, `public-admission:${record.sessionId}`);
        if (options.singleOutstanding) await client.query("INSERT INTO public_session_admission(session_id) VALUES($1) ON CONFLICT DO NOTHING", [record.sessionId]);
        const guarded = await client.query("SELECT 1 FROM public_session_admission WHERE session_id=$1", [record.sessionId]);
        if (guarded.rowCount) {
          const outstanding = await client.query(`SELECT 1 FROM commands c
            LEFT JOIN command_acknowledgements a USING(device_id,lane,lane_seq)
            LEFT JOIN command_skips k USING(device_id,lane,lane_seq)
            WHERE c.session_id=$1 AND c.lane='prompt' AND k.command_id IS NULL
            AND (a.state IS NULL OR a.state <> 'rejected')
            AND NOT EXISTS (SELECT 1 FROM events e WHERE e.session_id=c.session_id AND
              ((e.payload->>'type' IN ('turn.completed','turn.failed','turn.cancelled') AND e.payload->'payload'->>'turnId'=c.payload->>'turnId')
               OR (e.payload->>'type'='command.rejected' AND e.payload->'payload'->>'commandId'=c.command_id))) LIMIT 1`, [record.sessionId]);
          if (outstanding.rowCount) throw new StorageConflictError("Session already has an outstanding prompt; wait for terminal evidence or reconcile");
        }
      }
      await lockKeys(client, `lane:${record.deviceId}:${record.lane}`);
      const payloadBytes = Buffer.byteLength(JSON_VALUE(record.payload));
      const history = await client.query<{count: string; bytes: string; incoming_bytes: number}>("SELECT count(*) AS count,COALESCE(sum(octet_length(payload::text)),0) AS bytes,octet_length($3::jsonb::text) AS incoming_bytes FROM commands WHERE device_id=$1 AND lane=$2", [record.deviceId,record.lane,JSON_VALUE(record.payload)]);
      if (payloadBytes > this.#limits.maxRecordBytes || Number(history.rows[0].count) >= this.#limits.maxLaneCommands || Number(history.rows[0].bytes) + history.rows[0].incoming_bytes > this.#limits.maxLaneCommandBytes) throw new StorageCapacityError("Retained command lane capacity is full; preserve history and reconcile before archival");
      if (options.pendingLimit !== undefined) {
        if (!Number.isSafeInteger(options.pendingLimit) || options.pendingLimit < 1) throw new RangeError("Pending queue limit is invalid");
        const pending = await client.query<{count: string}>("SELECT count(*) FROM commands c LEFT JOIN command_acknowledgements a USING(device_id,lane,lane_seq) WHERE c.device_id=$1 AND c.lane=$2 AND (a.state IS NULL OR a.state NOT IN ('applied','rejected'))", [record.deviceId,record.lane]);
        if (Number(pending.rows[0].count) >= options.pendingLimit) throw new StorageCapacityError("Pending command lane capacity is full");
      }
      const seq = await client.query<{ last_seq: string }>(
        "INSERT INTO lane_counters(device_id,lane,last_seq) VALUES($1,$2,1) ON CONFLICT(device_id,lane) DO UPDATE SET last_seq=lane_counters.last_seq+1 RETURNING last_seq",
        [record.deviceId, record.lane]);
      const laneSeq = asNumber(seq.rows[0].last_seq);
      await client.query("INSERT INTO commands(command_id,session_id,device_id,lane,lane_seq,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
        [record.commandId, record.sessionId, record.deviceId, record.lane, laneSeq, JSON_VALUE(record.payload)]);
      return { ...record, laneSeq, disposition: "created" };
    });
  }

  async recordEvent(record: EventRecord, options: WriteOptions = {}): Promise<StoredEvent> {
    return this.#writeTransaction(options, async (client) => {
      await lockKeys(client, `event:${record.eventId}`, `event-producer:${record.sessionId}:${record.bridgeEpoch}:${record.producerSeq}`);
      const existing = await client.query("SELECT session_id,bridge_epoch,producer_seq,session_seq,payload FROM events WHERE event_id=$1", [record.eventId]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (row.session_id === record.sessionId && row.bridge_epoch === record.bridgeEpoch && asNumber(row.producer_seq) === record.producerSeq && JSON_VALUE(row.payload) === JSON_VALUE(record.payload))
          return { ...record, payload: row.payload, sessionSeq: asNumber(row.session_seq), disposition: "identical" };
        throw new StorageConflictError(`Event ${record.eventId} was retried with conflicting content`);
      }
      const producerOwner = await client.query("SELECT event_id FROM events WHERE session_id=$1 AND bridge_epoch=$2 AND producer_seq=$3", [record.sessionId, record.bridgeEpoch, record.producerSeq]);
      if (producerOwner.rowCount) throw new StorageConflictError(`Producer sequence ${record.producerSeq} already belongs to event ${producerOwner.rows[0].event_id}`);
      const counter = await client.query<{ last_event_seq: string }>("UPDATE sessions SET last_event_seq=last_event_seq+1 WHERE session_id=$1 RETURNING last_event_seq", [record.sessionId]);
      if (!counter.rowCount) throw new StorageNotFoundError(`Session ${record.sessionId} does not exist`);
      const payloadBytes = Buffer.byteLength(JSON_VALUE(record.payload));
      const history = await client.query<{count: string; bytes: string; incoming_bytes: number}>("SELECT count(*) AS count,COALESCE(sum(octet_length(payload::text)),0) AS bytes,octet_length($2::jsonb::text) AS incoming_bytes FROM events WHERE session_id=$1", [record.sessionId,JSON_VALUE(record.payload)]);
      if (payloadBytes > this.#limits.maxRecordBytes || Number(history.rows[0].count) >= this.#limits.maxSessionEvents || Number(history.rows[0].bytes) + history.rows[0].incoming_bytes > this.#limits.maxSessionEventBytes) throw new StorageCapacityError("Retained session output capacity is full; preserve history and reconcile before archival");
      const sessionSeq = asNumber(counter.rows[0].last_event_seq);
      await client.query("INSERT INTO events(event_id,session_id,bridge_epoch,producer_seq,session_seq,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
        [record.eventId, record.sessionId, record.bridgeEpoch, record.producerSeq, sessionSeq, JSON_VALUE(record.payload)]);
      const event = record.payload as { type?: string; bindingRevision?: number; leaseGeneration?: number; payload?: Record<string, unknown> };
      // Persist the app-observed revision in the same transaction as its accepted turn event.
      // Replays return above; stale binding/lease events cannot update a newer binding.
      const revision = event.payload?.conversationRevision;
      if (["turn.started", "turn.state"].includes(event.type ?? "") && Number.isSafeInteger(revision) && Number(revision) >= 0) {
        await client.query("UPDATE bindings SET payload=jsonb_set(payload,'{conversationRevision}',$4::jsonb,true) WHERE session_id=$1 AND binding_revision=$2 AND lease_generation=$3 AND state='active' AND COALESCE((payload->>'conversationRevision')::bigint,0)<$5", [record.sessionId,event.bindingRevision,event.leaseGeneration,JSON_VALUE(revision),revision]);
      }
      if ((event.type === "approval.required" || event.type === "approval.updated") && event.payload && typeof event.payload.requestId === "string" && Number.isSafeInteger(event.payload.requestRevision)) {
        const request=event.payload;
        if (request.sessionId!==record.sessionId) throw new StorageConflictError("Approval request session differs from its event envelope");
        const current=await client.query<{interaction_id:string;state:string;payload:Record<string,unknown>}>("SELECT interaction_id,state,payload FROM interactions WHERE session_id=$1 AND request_id=$2 AND request_revision=$3 FOR UPDATE",[record.sessionId,request.requestId,request.requestRevision]);
        if (current.rowCount) {
          if (current.rows[0].payload.actionDigest!==request.actionDigest) throw new StorageConflictError("Updated approval content must use a new request revision");
          if (current.rows[0].state!=="pending" && JSON_VALUE(current.rows[0].payload)!==JSON_VALUE(request)) throw new StorageConflictError("A resolved approval revision cannot be changed");
          if (current.rows[0].state==="pending") await client.query("UPDATE interactions SET payload=$4::jsonb WHERE session_id=$1 AND request_id=$2 AND request_revision=$3",[record.sessionId,request.requestId,request.requestRevision,JSON_VALUE(request)]);
        } else {
          const interactionId=`interaction-${createHash("sha256").update(`${record.sessionId}\u0000${request.requestId}\u0000${request.requestRevision}`).digest("hex")}`;
          await client.query("INSERT INTO interactions(interaction_id,session_id,request_id,request_revision,kind,state,payload) VALUES($1,$2,$3,$4,'approval','pending',$5::jsonb)",[interactionId,record.sessionId,request.requestId,request.requestRevision,JSON_VALUE(request)]);
        }
      } else if (event.type === "input.required" && event.payload && typeof event.payload.requestId === "string" && Number.isSafeInteger(event.payload.requestRevision)) {
        const request=event.payload;
        const existing=await client.query("SELECT 1 FROM interactions WHERE session_id=$1 AND request_id=$2 AND request_revision=$3",[record.sessionId,request.requestId,request.requestRevision]);
        if(!existing.rowCount) {
          const interactionId=`interaction-${createHash("sha256").update(`${record.sessionId}\u0000${request.requestId}\u0000${request.requestRevision}`).digest("hex")}`;
          await client.query("INSERT INTO interactions(interaction_id,session_id,request_id,request_revision,kind,state,payload) VALUES($1,$2,$3,$4,'input','pending',$5::jsonb)",[interactionId,record.sessionId,request.requestId,request.requestRevision,JSON_VALUE(request)]);
        }
      } else if (event.type === "input.resolved" && event.payload && typeof event.payload.requestId === "string" && Number.isSafeInteger(event.payload.requestRevision)) {
        await client.query("UPDATE interactions SET state=$4 WHERE session_id=$1 AND request_id=$2 AND request_revision=$3 AND kind='input' AND state='pending'",[record.sessionId,event.payload.requestId,event.payload.requestRevision,String(event.payload.outcome)]);
      } else if (event.type === "approval.applied" && typeof event.payload?.decisionId === "string") {
        const decision = await client.query<{ request_id: string; request_revision: number }>("SELECT request_id,request_revision FROM decisions WHERE decision_id=$1 AND session_id=$2",[event.payload.decisionId,record.sessionId]);
        if (decision.rowCount) {
          await client.query("UPDATE interactions SET state='applied' WHERE session_id=$1 AND request_id=$2 AND request_revision=$3 AND state IN ('decision_recorded','applying')",[record.sessionId,decision.rows[0].request_id,decision.rows[0].request_revision]);
          await client.query("UPDATE grants SET state='active',payload=jsonb_set(payload,'{nativeEnforcement}',to_jsonb('confirmed_by_adapter'::text),true) WHERE session_id=$1 AND request_id=$2 AND decision_id=$3 AND state='pending'",[record.sessionId,decision.rows[0].request_id,event.payload.decisionId]);
        }
      } else if (event.type === "approval.apply_failed" && typeof event.payload?.decisionId === "string" && (event.payload.state === "apply_failed" || event.payload.state === "reconciliation_required")) {
        const decision = await client.query<{ request_id: string; request_revision: number }>("SELECT request_id,request_revision FROM decisions WHERE decision_id=$1 AND session_id=$2",[event.payload.decisionId,record.sessionId]);
        if (decision.rowCount) {
          await client.query("UPDATE interactions SET state=$4 WHERE session_id=$1 AND request_id=$2 AND request_revision=$3 AND state IN ('decision_recorded','applying')",[record.sessionId,decision.rows[0].request_id,decision.rows[0].request_revision,event.payload.state]);
          const next=event.payload.state==="apply_failed"?"expired":"unknown";
          await client.query("UPDATE grants SET state=$4,payload=jsonb_set(payload,'{nativeEnforcement}',to_jsonb($5::text),true) WHERE session_id=$1 AND request_id=$2 AND decision_id=$3 AND state='pending'",[record.sessionId,decision.rows[0].request_id,event.payload.decisionId,next,event.payload.state]);
        }
      } else if (event.type === "approval.resolved" && typeof event.payload?.requestId === "string" && Number.isSafeInteger(event.payload.requestRevision) && typeof event.payload.state === "string") {
        await client.query("UPDATE interactions SET state=$4 WHERE session_id=$1 AND request_id=$2 AND request_revision=$3 AND kind='approval' AND state IN ('pending','decision_recorded','applying')",[record.sessionId,event.payload.requestId,event.payload.requestRevision,event.payload.state]);
        if(event.payload.state!=="applied") await client.query("UPDATE grants SET state='expired',payload=jsonb_set(payload,'{nativeEnforcement}',to_jsonb('native_request_resolved_without_remote_grant'::text),true) WHERE session_id=$1 AND request_id=$2 AND state='pending'",[record.sessionId,event.payload.requestId]);
      } else if (event.type === "permission.grant.revoked" && typeof event.payload?.grantId === "string") {
        if (event.payload.outcome === "revoked") await client.query("UPDATE grants SET state='revoked' WHERE session_id=$1 AND grant_id=$2 AND state='active'",[record.sessionId,event.payload.grantId]);
        else if (event.payload.outcome === "unknown") await client.query("UPDATE grants SET state='unknown' WHERE session_id=$1 AND grant_id=$2 AND state='active'",[record.sessionId,event.payload.grantId]);
      }
      if ((event.type === "turn.completed" || event.type === "turn.failed" || event.type === "turn.cancelled") && typeof event.payload?.turnId === "string") {
        await client.query("UPDATE grants g SET state='expired',payload=jsonb_set(g.payload,'{nativeEnforcement}',to_jsonb('scoped_turn_finished'::text),true) WHERE g.session_id=$1 AND g.state='active' AND g.payload->>'choiceScope' IN ('action','turn') AND EXISTS (SELECT 1 FROM interactions i WHERE i.session_id=g.session_id AND i.request_id=g.request_id AND i.payload->>'turnId'=$2)",[record.sessionId,event.payload.turnId]);
      }
      return { ...record, sessionSeq, disposition: "created" };
    });
  }

  async putInteraction(record: InteractionRecord): Promise<RecordDisposition> {
    return this.transaction(async (client) => {
      await lockKeys(client, `interaction:${record.interactionId}`, `interaction-request:${record.sessionId}:${record.requestId}:${record.requestRevision}`);
      const rows = await client.query("SELECT session_id,request_id,request_revision,kind,state,payload FROM interactions WHERE interaction_id=$1 FOR UPDATE", [record.interactionId]);
      if (rows.rowCount) {
        const row = rows.rows[0];
        if (row.session_id === record.sessionId && row.request_id === record.requestId && row.request_revision === record.requestRevision && row.kind === record.kind && row.state === record.state && JSON_VALUE(row.payload) === JSON_VALUE(record.payload)) return "identical";
        throw new StorageConflictError(`Interaction ${record.interactionId} already exists with different data`);
      }
      const natural = await client.query("SELECT interaction_id FROM interactions WHERE session_id=$1 AND request_id=$2 AND request_revision=$3", [record.sessionId, record.requestId, record.requestRevision]);
      if (natural.rowCount) throw new StorageConflictError(`Request ${record.requestId} revision ${record.requestRevision} already has an interaction record`);
      await client.query("INSERT INTO interactions(interaction_id,session_id,request_id,request_revision,kind,state,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",
        [record.interactionId, record.sessionId, record.requestId, record.requestRevision, record.kind, record.state, JSON_VALUE(record.payload)]);
      return "created";
    });
  }

  async transitionInteraction(interactionId: string, expectedState: string, nextState: string, payload?: unknown): Promise<boolean> {
    return this.transaction(async (client) => {
      const values = payload === undefined
        ? await client.query("UPDATE interactions SET state=$3 WHERE interaction_id=$1 AND state=$2 RETURNING interaction_id", [interactionId, expectedState, nextState])
        : await client.query("UPDATE interactions SET state=$3,payload=$4::jsonb WHERE interaction_id=$1 AND state=$2 RETURNING interaction_id", [interactionId, expectedState, nextState, JSON_VALUE(payload)]);
      return values.rowCount === 1;
    });
  }

  async recordDecision(record: DecisionRecord): Promise<RecordDisposition> {
    return this.transaction(async (client) => {
      const lockKey = `decision:${record.sessionId}:${record.requestId}:${record.requestRevision}`;
      await lockKeys(client, lockKey, `decision-id:${record.decisionId}`);
      const winner = await client.query("SELECT decision_id,payload FROM decisions WHERE session_id=$1 AND request_id=$2 AND request_revision=$3", [record.sessionId, record.requestId, record.requestRevision]);
      if (winner.rowCount) {
        if (winner.rows[0].decision_id === record.decisionId && JSON_VALUE(winner.rows[0].payload) === JSON_VALUE(record.payload)) return "identical";
        throw new StorageConflictError("A different decision already won for this request revision");
      }
      const reusedId = await client.query("SELECT session_id,request_id,request_revision,payload FROM decisions WHERE decision_id=$1", [record.decisionId]);
      if (reusedId.rowCount) throw new StorageConflictError(`Decision ID ${record.decisionId} is already assigned to another decision`);
      await client.query("INSERT INTO decisions(decision_id,session_id,request_id,request_revision,payload) VALUES($1,$2,$3,$4,$5::jsonb)",
        [record.decisionId, record.sessionId, record.requestId, record.requestRevision, JSON_VALUE(record.payload)]);
      return "created";
    });
  }

  async putGrant(record: GrantRecord): Promise<RecordDisposition> {
    return this.#putSimple("grants", "grant_id", record.grantId, record.sessionId,
      { request_id: record.requestId, decision_id: record.decisionId, state: record.state }, record.payload);
  }

  async putAttachmentMetadata(record: AttachmentMetadataRecord): Promise<RecordDisposition> {
    return this.#putSimple("attachment_metadata", "attachment_id", record.attachmentId, record.sessionId,
      { state: record.state }, record.payload);
  }

  /** Expiry closes remote authority only; it is never evidence that a native app revoked a grant. */
  async expireApprovalRecords(sessionId: string, now = new Date()): Promise<void> {
    await this.transaction(async client => {
      const expired = await client.query<{request_id:string;request_revision:number}>("UPDATE interactions SET state='expired' WHERE session_id=$1 AND kind='approval' AND state='pending' AND (payload->>'expiresAt')::timestamptz <= $2 RETURNING request_id,request_revision",[sessionId,now.toISOString()]);
      for (const row of expired.rows) {
        await client.query("UPDATE grants SET state='expired' WHERE session_id=$1 AND request_id=$2 AND state='pending'",[sessionId,row.request_id]);
        await client.query("INSERT INTO audit_records(audit_id,session_id,action,payload) VALUES($1,$2,'approval.expired',$3::jsonb)",[randomUUID(),sessionId,JSON_VALUE({requestId:row.request_id,requestRevision:row.request_revision,at:now.toISOString()})]);
      }
    });
  }

  async appendAudit(record: AuditRecord): Promise<RecordDisposition> {
    return this.transaction(async (client) => {
      await lockKeys(client, `audit:${record.auditId}`);
      const existing = await client.query("SELECT session_id,actor_id,action,payload FROM audit_records WHERE audit_id=$1 FOR UPDATE", [record.auditId]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (row.session_id === (record.sessionId ?? null) && row.actor_id === (record.actorId ?? null) && row.action === record.action && JSON_VALUE(row.payload) === JSON_VALUE(record.payload)) return "identical";
        throw new StorageConflictError(`Audit ${record.auditId} conflicts with the immutable existing record`);
      }
      await client.query("INSERT INTO audit_records(audit_id,session_id,actor_id,action,payload) VALUES($1,$2,$3,$4,$5::jsonb)",
        [record.auditId, record.sessionId ?? null, record.actorId ?? null, record.action, JSON_VALUE(record.payload)]);
      return "created";
    });
  }

  /** Persist monotonic bridge receipt/application acknowledgements before returning success. */
  async recordCommandAck(record: CommandAckRecord, options: WriteOptions = {}): Promise<{ disposition: RecordDisposition; state: CommandAckState }> {
    const rank: Record<CommandAckState, number> = { received: 0, unknown: 1, applied: 2, rejected: 2, reconciliation_required: 2 };
    return this.#writeTransaction(options, async (client) => {
      await lockKeys(client, `ack:${record.deviceId}:${record.lane}:${record.laneSeq}`);
      const command = await client.query<{ session_id: string; payload: Record<string,unknown> }>("SELECT session_id,payload FROM commands WHERE device_id=$1 AND lane=$2 AND lane_seq=$3", [record.deviceId, record.lane, record.laneSeq]);
      if (!command.rowCount) throw new StorageNotFoundError("Acknowledgement references an unknown command sequence");
      if (record.payload && typeof record.payload === "object" && "sessionId" in record.payload && (record.payload as { sessionId: unknown }).sessionId !== command.rows[0].session_id)
        throw new StorageConflictError("Acknowledgement session does not match the referenced command");
      const prior = await client.query<{ state: CommandAckState; payload: unknown }>(
        "SELECT state,payload FROM command_acknowledgements WHERE device_id=$1 AND lane=$2 AND lane_seq=$3 FOR UPDATE",
        [record.deviceId, record.lane, record.laneSeq]);
      if (prior.rowCount) {
        const old = prior.rows[0];
        if (old.state === record.state && JSON_VALUE(old.payload) === JSON_VALUE(record.payload)) return { disposition: "identical", state: old.state };
        if (rank[record.state] <= rank[old.state] || (old.state === "rejected" || old.state === "reconciliation_required" || old.state === "applied"))
          throw new StorageConflictError("Command acknowledgement conflicts with or regresses its durable state");
        await client.query("UPDATE command_acknowledgements SET state=$4,payload=$5::jsonb,updated_at=now() WHERE device_id=$1 AND lane=$2 AND lane_seq=$3",
          [record.deviceId, record.lane, record.laneSeq, record.state, JSON_VALUE(record.payload)]);
        await this.#applyApprovalAck(client,command.rows[0].payload,command.rows[0].session_id,record.state);
        return { disposition: "created", state: record.state };
      }
      await client.query("INSERT INTO command_acknowledgements(device_id,lane,lane_seq,state,payload) VALUES($1,$2,$3,$4,$5::jsonb)",
        [record.deviceId, record.lane, record.laneSeq, record.state, JSON_VALUE(record.payload)]);
      await this.#applyApprovalAck(client,command.rows[0].payload,command.rows[0].session_id,record.state);
      return { disposition: "created", state: record.state };
    });
  }

  async readSnapshot(sessionId: string): Promise<StoredSnapshot> {
    return this.transaction(async (client) => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const session = await client.query("SELECT session_id,owner_user_id,state,last_event_seq FROM sessions WHERE session_id=$1", [sessionId]);
      if (!session.rowCount) throw new StorageNotFoundError(`Session ${sessionId} does not exist`);
      const bindings = await client.query("SELECT binding_id,session_id,device_id,binding_revision,lease_generation,state,payload FROM bindings WHERE session_id=$1 ORDER BY binding_revision", [sessionId]);
      const active = await client.query<{device_id:string}>("SELECT device_id FROM bindings WHERE session_id=$1 AND state='active'",[sessionId]);
      const lanes = active.rowCount ? await client.query<{lane:string;last_seq:string}>("SELECT lane,last_seq FROM lane_counters WHERE device_id=$1",[active.rows[0].device_id]) : { rows:[] as Array<{lane:string;last_seq:string}> };
      const prompt = lanes.rows.find(row=>row.lane==="prompt");
      const control = lanes.rows.find(row=>row.lane==="control");
      const events = await client.query("SELECT event_id,session_id,bridge_epoch,producer_seq,session_seq,payload FROM events WHERE session_id=$1 ORDER BY session_seq", [sessionId]);
      const interactions = await client.query("SELECT interaction_id,session_id,request_id,request_revision,kind,state,payload FROM interactions WHERE session_id=$1 ORDER BY created_at,interaction_id", [sessionId]);
      return {
        session: { sessionId: session.rows[0].session_id, ownerUserId: session.rows[0].owner_user_id, state: session.rows[0].state },
        bindings: bindings.rows.map((row) => ({ bindingId: row.binding_id, sessionId: row.session_id, deviceId: row.device_id, bindingRevision: row.binding_revision, leaseGeneration: row.lease_generation, state: row.state, payload: row.payload })),
        events: events.rows.map((row) => ({ eventId: row.event_id, sessionId: row.session_id, bridgeEpoch: row.bridge_epoch, producerSeq: asNumber(row.producer_seq), sessionSeq: asNumber(row.session_seq), payload: row.payload, disposition: "created" as const })),
        interactions: interactions.rows.map((row) => ({ interactionId: row.interaction_id, sessionId: row.session_id, requestId: row.request_id, requestRevision: row.request_revision, kind: row.kind, state: row.state, payload: row.payload })),
        watermark: { prompt:prompt ? asNumber(prompt.last_seq) : 0,control:control ? asNumber(control.last_seq) : 0,sessionSeq: asNumber(session.rows[0].last_event_seq) }
      };
    });
  }

  async readEvents(sessionId: string, afterSessionSeq: number, limit = 500): Promise<StoredEvent[]> {
    if (!Number.isSafeInteger(afterSessionSeq) || afterSessionSeq < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 5000) throw new RangeError("Replay cursor/limit is invalid");
    const result = await this.pool.query("SELECT event_id,session_id,bridge_epoch,producer_seq,session_seq,payload FROM events WHERE session_id=$1 AND session_seq>$2 ORDER BY session_seq LIMIT $3", [sessionId, afterSessionSeq, limit]);
    return result.rows.map((row) => ({ eventId: row.event_id, sessionId: row.session_id, bridgeEpoch: row.bridge_epoch, producerSeq: asNumber(row.producer_seq), sessionSeq: asNumber(row.session_seq), payload: row.payload, disposition: "created" }));
  }

  async readCommands(deviceId: string, lane: Lane, afterLaneSeq: number, limit = 500): Promise<StoredCommand[]> {
    if (!Number.isSafeInteger(afterLaneSeq) || afterLaneSeq < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 5000) throw new RangeError("Command cursor/limit is invalid");
    const result = await this.pool.query("SELECT command_id,session_id,device_id,lane,lane_seq,payload FROM commands WHERE device_id=$1 AND lane=$2 AND lane_seq>$3 ORDER BY lane_seq LIMIT $4", [deviceId, lane, afterLaneSeq, limit]);
    return result.rows.map((row) => ({ commandId: row.command_id, sessionId: row.session_id, deviceId: row.device_id, lane: row.lane, laneSeq: asNumber(row.lane_seq), payload: row.payload, disposition: "created" }));
  }

  async #putSimple(table: "grants" | "attachment_metadata", idColumn: "grant_id" | "attachment_id", id: string, sessionId: string,
    fields: Record<string, string>, payload: unknown): Promise<RecordDisposition> {
    const fieldNames = Object.keys(fields); const columns = [idColumn, "session_id", ...fieldNames, "payload"];
    const args: unknown[] = [id, sessionId, ...fieldNames.map((name) => fields[name]), JSON_VALUE(payload)];
    const placeholders = args.map((_, index) => `$${index + 1}${columns[index] === "payload" ? "::jsonb" : ""}`);
    return this.transaction(async (client) => {
      await lockKeys(client, `${table}:${idColumn}:${id}`);
      const existing = await client.query(`SELECT ${fieldNames.join(",")},payload,session_id FROM ${table} WHERE ${idColumn}=$1 FOR UPDATE`, [id]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (row.session_id === sessionId && fieldNames.every((name) => row[name] === fields[name]) && JSON_VALUE(row.payload) === JSON_VALUE(payload)) return "identical";
        throw new StorageConflictError(`${table} record ${id} already exists with different data`);
      }
      await client.query(`INSERT INTO ${table}(${columns.join(",")}) VALUES(${placeholders.join(",")})`, args);
      return "created";
    });
  }

  async #applyApprovalAck(client:PoolClient,command:Record<string,unknown>,sessionId:string,state:CommandAckState):Promise<void> {
    if(command.type!=="approval.decide" || !command.payload || typeof command.payload!=="object") return;
    const payload=command.payload as Record<string,unknown>;
    const decisionId=payload.decisionId;
    if(typeof decisionId!=="string") return;
    const decision=await client.query<{request_id:string;request_revision:number;payload:Record<string,unknown>}>("SELECT request_id,request_revision,payload FROM decisions WHERE decision_id=$1 AND session_id=$2",[decisionId,sessionId]);
    if(!decision.rowCount) return;
    const {request_id:requestId,request_revision:revision}=decision.rows[0];
    if(state==="applied") {
      const interaction=await client.query<{payload:Record<string,unknown>}>("SELECT payload FROM interactions WHERE session_id=$1 AND request_id=$2 AND request_revision=$3",[sessionId,requestId,revision]);
      const choices=interaction.rows[0]?.payload.availableDecisions;
      const selected=Array.isArray(choices)?choices.find(value=>typeof value==="object"&&value!==null&&(value as Record<string,unknown>).id===decision.rows[0].payload.choiceId) as Record<string,unknown>|undefined:undefined;
      const nextState=selected?.effect==="allow"?"applied":selected?.effect==="deny"?"denied":"superseded";
      await client.query("UPDATE interactions SET state=$4 WHERE session_id=$1 AND request_id=$2 AND request_revision=$3 AND state='decision_recorded'",[sessionId,requestId,revision,nextState]);
      if(selected?.effect==="allow") await client.query("UPDATE grants SET state='active',payload=jsonb_set(payload,'{nativeEnforcement}',to_jsonb('confirmed_by_bridge'::text),true) WHERE session_id=$1 AND request_id=$2 AND decision_id=$3 AND state='pending'",[sessionId,requestId,decisionId]);
    } else if(state==="rejected") {
      await client.query("UPDATE interactions SET state='apply_failed' WHERE session_id=$1 AND request_id=$2 AND request_revision=$3 AND state='decision_recorded'",[sessionId,requestId,revision]);
      await client.query("UPDATE grants SET state='expired',payload=jsonb_set(payload,'{nativeEnforcement}',to_jsonb('not_applied'::text),true) WHERE session_id=$1 AND request_id=$2 AND decision_id=$3 AND state='pending'",[sessionId,requestId,decisionId]);
    } else if(state==="unknown" || state==="reconciliation_required") {
      await client.query("UPDATE interactions SET state='reconciliation_required' WHERE session_id=$1 AND request_id=$2 AND request_revision=$3 AND state='decision_recorded'",[sessionId,requestId,revision]);
      await client.query("UPDATE grants SET state='unknown',payload=jsonb_set(payload,'{nativeEnforcement}',to_jsonb('reconciliation_required'::text),true) WHERE session_id=$1 AND request_id=$2 AND decision_id=$3 AND state='pending'",[sessionId,requestId,decisionId]);
    }
  }
}
