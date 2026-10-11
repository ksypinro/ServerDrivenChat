import type { AuthorizationService, DevicePrincipal } from "../auth/index.js";
import { ServerDatabase } from "../storage/index.js";

export type LeaseRenewal = { status: "renewed"; leaseExpiresAt: string; serverTime: string; bindingRevision: number; leaseGeneration: number } |
    { status: "expired" | "fenced" };

/** Fenced, short-lived server lease authority for one active device/session binding. */
export class DeviceLeaseService {
    readonly #ttlSeconds: number;

    constructor(readonly database: ServerDatabase, readonly authorization: AuthorizationService, options: { ttlSeconds?: number } = {}) {
        this.#ttlSeconds = options.ttlSeconds ?? 60;
        if (!Number.isSafeInteger(this.#ttlSeconds) || this.#ttlSeconds < 15 || this.#ttlSeconds > 300)
            throw new RangeError("Lease TTL must be between 15 and 300 seconds");
    }

    async renew(principal: DevicePrincipal, input: { sessionId: string; bindingRevision: number; leaseGeneration: number }): Promise<LeaseRenewal> {
        await this.authorization.authorizeDevice(principal, input.sessionId, "write_events");
        return this.database.transaction(async (client) => {
            const result = await client.query<{ device_status: string; binding_state: string; binding_revision: number; lease_generation: number; lease_valid: boolean }>(
                "SELECT d.status AS device_status,b.state AS binding_state,b.binding_revision,b.lease_generation,b.lease_expires_at>clock_timestamp() AS lease_valid FROM bindings b JOIN devices d USING(device_id) WHERE b.device_id=$1 AND b.session_id=$2 FOR UPDATE OF b,d",
                [principal.deviceId, input.sessionId]);
            if (!result.rowCount || result.rows[0].device_status !== "active" || result.rows[0].binding_state !== "active") return { status: "fenced" };
            const row = result.rows[0];
            if (row.binding_revision !== input.bindingRevision || row.lease_generation !== input.leaseGeneration) return { status: "fenced" };
            const current = await client.query("SELECT 1 FROM bindings WHERE device_id=$1 AND session_id=$2 AND lease_expires_at>clock_timestamp()", [principal.deviceId,input.sessionId]);
            if (!current.rowCount) {
                await client.query("UPDATE bindings SET state='stale' WHERE device_id=$1 AND session_id=$2 AND state='active'", [principal.deviceId, input.sessionId]);
                return { status: "expired" };
            }
            const renewed = await client.query<{ lease_expires_at: Date; server_time: Date }>(
                "UPDATE bindings SET lease_expires_at=clock_timestamp()+($4::text || ' seconds')::interval WHERE device_id=$1 AND session_id=$2 AND binding_revision=$3 RETURNING lease_expires_at,clock_timestamp() AS server_time",
                [principal.deviceId, input.sessionId, input.bindingRevision, this.#ttlSeconds]);
            return { status: "renewed", leaseExpiresAt: renewed.rows[0].lease_expires_at.toISOString(), serverTime: renewed.rows[0].server_time.toISOString(), bindingRevision: row.binding_revision, leaseGeneration: row.lease_generation };
        });
    }

    async assertCurrent(principal: DevicePrincipal, input: { sessionId: string; bindingRevision: number; leaseGeneration: number }): Promise<boolean> {
        const result = await this.database.pool.query(
            "SELECT 1 FROM bindings b JOIN devices d USING(device_id) WHERE b.device_id=$1 AND b.session_id=$2 AND b.state='active' AND d.status='active' AND b.binding_revision=$3 AND b.lease_generation=$4 AND b.lease_expires_at>now()",
            [principal.deviceId, input.sessionId, input.bindingRevision, input.leaseGeneration]);
        return Boolean(result.rowCount);
    }
}
