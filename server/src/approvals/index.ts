import { randomUUID, sign as cryptoSign, type KeyObject } from "node:crypto";
import { canonicalJson, validateDecisionAgainstRequest, type ApprovalDecisionProposal, type ApprovalRequest, type PermissionGrant } from "@server-driven-chat/protocol";
import type { OidcPrincipal, DecisionAssertionClaims, AuthorizationService } from "../auth/index.js";
import { StorageCapacityError, StorageConflictError, StorageNotFoundError, type ServerDatabase } from "../storage/index.js";

export interface ApprovalDecisionInput extends ApprovalDecisionProposal {
    sessionId: string;
    deviceId: string;
    policyRevision: string;
    expiresAt: string;
}
export interface RecordedApproval {
    disposition: "recorded" | "identical";
    state: "decision_recorded";
    decisionId: string;
    commandId: string;
    laneSeq: number;
    requestId: string;
    requestRevision: number;
    assertion: string;
    grants: Array<{ grantId: string; grant: PermissionGrant; state: "pending" }>;
}

/** Transactional reviewer decision engine. A return value means recorded only; native application is separate. */
export class ApprovalEngine {
    constructor(readonly database: ServerDatabase, readonly authorization: AuthorizationService, readonly options: { privateKey: KeyObject | string; now?: () => number; maxPendingControls?: number }) {
        if(options.maxPendingControls!==undefined && (!Number.isSafeInteger(options.maxPendingControls)||options.maxPendingControls<1)) throw new RangeError("Approval control queue limit is invalid");
    }

    async decide(reviewer: OidcPrincipal, input: ApprovalDecisionInput): Promise<RecordedApproval> {
        const now = this.options.now?.() ?? Date.now();
        const expiresAt = Date.parse(input.expiresAt);
        if (!input.policyRevision) throw new TypeError("Decision policy revision is required");
        return this.database.transaction(async (client) => {
            if (reviewer.publicCredential) await this.database.lockPublicCredential(client,reviewer.publicCredential.tokenHash,input.sessionId,"approve");
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`approval:${input.sessionId}:${input.requestId}:${input.requestRevision}`]);
            // Match event ingestion's binding -> session -> interaction lock order.
            const binding = await client.query<{ binding_id: string; binding_revision: number; lease_generation: number }>(
                "SELECT binding_id,binding_revision,lease_generation FROM bindings WHERE session_id=$1 AND device_id=$2 AND state='active' AND lease_expires_at>clock_timestamp() FOR NO KEY UPDATE", [input.sessionId,input.deviceId]);
            if (!binding.rowCount) throw new StorageConflictError("Approval device binding is stale or inactive");
            await this.database.lockBindingFence(client,{sessionId:input.sessionId,deviceId:input.deviceId,bindingRevision:binding.rows[0].binding_revision,leaseGeneration:binding.rows[0].lease_generation});
            await client.query("SELECT session_id FROM sessions WHERE session_id=$1 FOR SHARE",[input.sessionId]);
            await client.query("SELECT user_id FROM session_memberships WHERE session_id=$1 AND user_id=$2 FOR SHARE",[input.sessionId,reviewer.userId]);
            const rows = await client.query<{ session_id: string; state: string; payload: ApprovalRequest }>(
                "SELECT session_id,state,payload FROM interactions WHERE session_id=$1 AND request_id=$2 AND request_revision=$3 AND kind='approval' FOR UPDATE", [input.sessionId,input.requestId,input.requestRevision]);
            if (!rows.rowCount) throw new StorageNotFoundError("Approval request does not exist");
            const row = rows.rows[0];
            const sessionId = row.session_id;
            await this.authorization.authorizeUser(reviewer, sessionId, "approve");
            const role = await client.query("SELECT 1 FROM sessions s LEFT JOIN session_memberships m ON m.session_id=s.session_id AND m.user_id=$2 WHERE s.session_id=$1 AND s.state='active' AND (s.owner_user_id=$2 OR m.role='operator')", [sessionId, reviewer.userId]);
            if (!role.rowCount) throw new Error("Reviewer is not authorized to approve this session");
            if (row.state !== "pending") {
                const existing = await client.query<{ decision_id: string; payload: Record<string, unknown> }>("SELECT decision_id,payload FROM decisions WHERE session_id=$1 AND request_id=$2 AND request_revision=$3",[sessionId,input.requestId,input.requestRevision]);
                if (existing.rowCount && existing.rows[0].decision_id === input.decisionId && existing.rows[0].payload.reviewerId === reviewer.userId &&
                    existing.rows[0].payload.choiceId === input.choiceId && existing.rows[0].payload.actionDigest === input.actionDigest &&
                    canonicalJson(existing.rows[0].payload.grantedPermissions) === canonicalJson(input.grantedPermissions) && existing.rows[0].payload.expiresAt === input.expiresAt && existing.rows[0].payload.deviceId === input.deviceId && existing.rows[0].payload.policyRevision === input.policyRevision) {
                    const payload = existing.rows[0].payload;
                    return { disposition: "identical", state: "decision_recorded", decisionId: input.decisionId, commandId: String(payload.commandId), laneSeq: Number(payload.laneSeq), requestId: input.requestId, requestRevision: input.requestRevision, assertion: String(payload.assertion), grants: (payload.grants as RecordedApproval["grants"]) ?? [] };
                }
                throw new StorageConflictError("Approval request is no longer pending; a different decision won");
            }
            if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 300_000) throw new TypeError("Decision expiry must be current and within five minutes");
            const request = row.payload;
            if (request.sessionId !== sessionId || request.bindingId !== binding.rows[0].binding_id || request.bindingRevision !== binding.rows[0].binding_revision || request.leaseGeneration !== binding.rows[0].lease_generation)
                throw new StorageConflictError("Approval request no longer matches its active binding");
            const validation = await validateDecisionAgainstRequest(request, input, new Date(this.options.now?.() ?? Date.now()).toISOString());
            if (!validation.valid) throw new TypeError(`Invalid approval decision: ${validation.issues.map(issue => issue.message).join("; ")}`);
            const selectedChoice=request.availableDecisions.find(choice=>choice.id===input.choiceId)!;
            if(selectedChoice.scope==="session" || selectedChoice.scope==="persistent") throw new TypeError("Session-wide and persistent grants are disabled in this milestone");
            const issuedAt = Math.floor(now / 1000);
            const assertionClaims: DecisionAssertionClaims = {
                typ: "sdc-decision-v1", assertionId: randomUUID(), decisionId: input.decisionId, sessionId, deviceId: input.deviceId,
                bindingId: request.bindingId, bindingRevision: request.bindingRevision, leaseGeneration: request.leaseGeneration,
                turnId: request.turnId, requestId: request.requestId, requestRevision: request.requestRevision, actionDigest: request.actionDigest,
                choiceId: input.choiceId, grantedPermissions: input.grantedPermissions, policyRevision: input.policyRevision, reviewerId: reviewer.userId,
                issuedAt, expiresAt: Math.floor(expiresAt / 1000)
            };
            const body = Buffer.from(canonicalJson(assertionClaims)).toString("base64url");
            const assertion = `sdc1.${body}.${cryptoSign(null, Buffer.from(body), this.options.privateKey).toString("base64url")}`;
            const grants = input.grantedPermissions.map((grant) => ({ grantId: randomUUID(), grant, state: "pending" as const }));
            const commandId = randomUUID();
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`lane:${input.deviceId}:control`]);
            const pending=await client.query<{count:string}>("SELECT count(*) FROM commands c LEFT JOIN command_acknowledgements a USING(device_id,lane,lane_seq) WHERE c.device_id=$1 AND c.lane='control' AND (a.state IS NULL OR a.state NOT IN ('applied','rejected'))",[input.deviceId]);
            if(Number(pending.rows[0].count)>=(this.options.maxPendingControls??1000)) throw new StorageCapacityError("Pending control queue capacity is full");
            const lane = await client.query<{ last_seq: string }>("INSERT INTO lane_counters(device_id,lane,last_seq) VALUES($1,'control',1) ON CONFLICT(device_id,lane) DO UPDATE SET last_seq=lane_counters.last_seq+1 RETURNING last_seq",[input.deviceId]);
            const laneSeq = Number(lane.rows[0].last_seq);
            const command = { protocolVersion: "2.0", type: "approval.decide", commandId, lane: "control", seq: laneSeq, sessionId, bindingRevision: request.bindingRevision, leaseGeneration: request.leaseGeneration, createdAt: new Date(now).toISOString(), expiresAt: input.expiresAt, payload: { decisionId: input.decisionId, requestId: input.requestId, requestRevision: input.requestRevision, actionDigest: input.actionDigest, choiceId: input.choiceId, grantedPermissions: input.grantedPermissions, expiresAt: input.expiresAt, assertion } };
            const storedPayload = { ...input, sessionId, reviewerId: reviewer.userId, recordedAt: new Date(now).toISOString(), outcome: "recorded", assertion, grants, commandId, laneSeq };
            await client.query("INSERT INTO decisions(decision_id,session_id,request_id,request_revision,payload) VALUES($1,$2,$3,$4,$5::jsonb)", [input.decisionId,sessionId,input.requestId,input.requestRevision,canonicalJson(storedPayload)]);
            await client.query("INSERT INTO commands(command_id,session_id,device_id,lane,lane_seq,payload) VALUES($1,$2,$3,'control',$4,$5::jsonb)",[commandId,sessionId,input.deviceId,laneSeq,canonicalJson(command)]);
            const changed = await client.query("UPDATE interactions SET state='decision_recorded' WHERE session_id=$1 AND request_id=$2 AND request_revision=$3 AND state='pending'",[sessionId,input.requestId,input.requestRevision]);
            if (changed.rowCount !== 1) throw new StorageConflictError("Approval request was resolved concurrently");
            for (const grant of grants) await client.query("INSERT INTO grants(grant_id,session_id,request_id,decision_id,state,payload) VALUES($1,$2,$3,$4,'pending',$5::jsonb)",[grant.grantId,sessionId,input.requestId,input.decisionId,canonicalJson({ ...grant.grant, choiceScope:selectedChoice.scope, assertionExpiresAt:input.expiresAt, nativeEnforcement: "pending" })]);
            await client.query("INSERT INTO audit_records(audit_id,session_id,actor_id,action,payload) VALUES($1,$2,$3,'approval.decision_recorded',$4::jsonb)",[randomUUID(),sessionId,reviewer.userId,canonicalJson({ decisionId: input.decisionId, requestId: input.requestId, requestRevision: input.requestRevision, actionDigest: input.actionDigest, choiceId: input.choiceId })]);
            await client.query("INSERT INTO public_command_authority(command_id,credential_id,owner_user_id,permission) VALUES($1,$2,$3,'approve')",[commandId,reviewer.publicCredential?.credentialId ?? null,reviewer.userId]);
            await this.database.lockBindingFence(client,{sessionId,deviceId:input.deviceId,bindingRevision:binding.rows[0].binding_revision,leaseGeneration:binding.rows[0].lease_generation});
            if (Date.parse(input.expiresAt)<=(this.options.now?.() ?? Date.now())) throw new StorageConflictError("Decision expired while waiting for transactional admission");
            if (reviewer.publicCredential) await this.database.lockPublicCredential(client,reviewer.publicCredential.tokenHash,input.sessionId,"approve");
            return { disposition: "recorded", state: "decision_recorded", decisionId: input.decisionId, commandId, laneSeq, requestId: input.requestId, requestRevision: input.requestRevision, assertion, grants };
        });
    }
}

export type NativeRevocation = (grantId: string) => Promise<{ outcome: "revoked" | "unsupported" | "unknown"; evidence?: string }>;

/** Only records a revoke as effective after adapter evidence confirms it. */
export async function revokeTrackedGrant(database: ServerDatabase, sessionId: string, grantId: string, revoke: NativeRevocation): Promise<{ outcome: "revoked" | "unsupported" | "unknown" }> {
    const grant = await database.pool.query<{ state: string }>("SELECT state FROM grants WHERE grant_id=$1 AND session_id=$2",[grantId,sessionId]);
    if (!grant.rowCount) throw new StorageNotFoundError("Grant does not exist in this session");
    if (grant.rows[0].state !== "active") return { outcome: grant.rows[0].state === "revoked" ? "revoked" : "unknown" };
    const result = await revoke(grantId);
    if (result.outcome === "revoked") await database.pool.query("UPDATE grants SET state='revoked' WHERE grant_id=$1 AND session_id=$2 AND state='active'",[grantId,sessionId]);
    else if (result.outcome === "unknown") await database.pool.query("UPDATE grants SET state='unknown' WHERE grant_id=$1 AND session_id=$2 AND state='active'",[grantId,sessionId]);
    else await database.appendAudit({ auditId: randomUUID(), sessionId, action: "permission.revoke_unsupported", payload: { grantId, evidence: result.evidence ?? null } });
    return { outcome: result.outcome };
}
