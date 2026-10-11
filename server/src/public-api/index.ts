import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { canonicalJson, TranscriptProjector, validateProtocolMessage, type ContentBlock, type ProtocolCommand, type ProtocolEvent } from "@server-driven-chat/protocol";
import type { AuthorizationService, OidcPrincipal } from "../auth/index.js";
import { StorageCapacityError, StorageConflictError, StorageNotFoundError, type ServerDatabase } from "../storage/index.js";

export class PublicApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export interface PublicPrompt { content: ContentBlock[]; delivery: "queue"; model: string; nativeToolPolicy?: "deny" }
export type OperationState = "queued" | "dispatching" | "running" | "waiting_for_approval" | "waiting_for_input" | "completed" | "failed" | "cancelled" | "rejected" | "reconciliation_required";
export interface PublicOperation {
    operationId: string; commandId: string; promptId: string; turnId: string; sessionId: string;
    bindingId: string; bindingRevision: number; leaseGeneration: number; status: OperationState;
    commandState: string; expiresAt: string; watermark: number; terminalEvidence?: unknown;
    result: { items: unknown[]; partialItems: unknown[]; toolActivity: unknown[]; answer: string | null; selection: string };
}
interface OperationRow {
    operation_id: string; command_id: string; prompt_id: string; turn_id: string; session_id: string;
    principal_id: string; owner_user_id: string; binding_id: string; binding_revision: number; lease_generation: number;
    admitted_watermark: string; expires_at: Date; request_fingerprint: string;
}
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
export const principalId = (user: OidcPrincipal): string => user.publicCredential ? `key:${user.publicCredential.credentialId}` : `user:${user.userId}`;
export const PUBLIC_LIMITS = Object.freeze({ retentionSeconds: 604800, maxOperationsPerSession: 10000, maxCredentialsPerOwner: 100, maxWaitSeconds: 30, maxWaiters: 64, maxStreams: 64, maxDispatchPermitMs: 10000, maxRequestsPerPrincipalPerMinute: 120, maxBodyBytes: 1048576, maxAttachmentBytes: 10485760, maxResponseBytes: 36 * 1024 * 1024 });

/** Server-owned public admission and result projection. Contains no app or provider executor. */
export class PublicApiService {
    constructor(readonly database: ServerDatabase, readonly authorization: AuthorizationService) {}

    async issueCredential(user: OidcPrincipal, input: {sessionId: string; scopes: string[]; label: string; expiresAt: string}): Promise<{credentialId: string; credential: string; expiresAt: string}> {
        if (user.publicCredential) throw new PublicApiError(403,"FORBIDDEN","Caller keys cannot delegate credentials");
        await this.authorization.authorizeUser(user,input.sessionId,"administer");
        if (!input.label?.trim() || input.label.length>120 || !Array.isArray(input.scopes) || !input.scopes.length || input.scopes.length>4 || !input.scopes.includes("view") || new Set(input.scopes).size!==input.scopes.length || input.scopes.some(scope=>!["view","prompt","approve","administer"].includes(scope))) throw new TypeError("Credential label/scopes are invalid");
        const expires = Date.parse(input.expiresAt);
        if (!Number.isFinite(expires) || expires<=Date.now() || expires>Date.now()+30*86400_000) throw new TypeError("Credential expiry must be within 30 days");
        const credential = `sdc_api_${randomBytes(32).toString("base64url")}`;
        const credentialId = randomUUID();
        await this.database.transaction(async client=> {
            await client.query("SELECT user_id FROM app_users WHERE user_id=$1 FOR UPDATE",[user.userId]);
            // Follow the binding/device → session order used by ingestion and dispatch.
            await client.query("SELECT b.binding_id FROM bindings b JOIN devices d USING(device_id) WHERE b.session_id=$1 AND b.state='active' FOR SHARE OF b,d",[input.sessionId]);
            const owner = await client.query("SELECT 1 FROM sessions WHERE session_id=$1 AND owner_user_id=$2 AND state='active' FOR SHARE",[input.sessionId,user.userId]);
            if (!owner.rowCount) throw new PublicApiError(403,"FORBIDDEN","Only an active session owner can issue credentials");
            const binding = await client.query<{binding_id:string}>("SELECT b.binding_id FROM bindings b JOIN devices d USING(device_id) WHERE b.session_id=$1 AND b.state='active' AND b.lease_expires_at>clock_timestamp() AND d.status='active'",[input.sessionId]);
            if (!binding.rowCount) throw new StorageConflictError("Explicit native binding consent is required before issuing a caller key");
            if (expires<=Date.now()) throw new TypeError("Credential expired while waiting for authority locks");
            const count = await client.query<{count: string}>("SELECT count(*) FROM public_credentials WHERE owner_user_id=$1",[user.userId]);
            if (Number(count.rows[0].count)>=PUBLIC_LIMITS.maxCredentialsPerOwner) throw new StorageCapacityError("Retained public credential capacity is full");
            await client.query("INSERT INTO public_credentials(credential_id,owner_user_id,session_id,binding_id,token_hash,scopes,label,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[credentialId,user.userId,input.sessionId,binding.rows[0].binding_id,hash(credential),input.scopes,input.label,input.expiresAt]);
            await client.query("INSERT INTO audit_records(audit_id,session_id,actor_id,action,payload) VALUES($1,$2,$3,'public.credential_issued',$4::jsonb)",[randomUUID(),input.sessionId,user.userId,canonicalJson({credentialId,scopes:input.scopes,expiresAt:input.expiresAt})]);
        });
        return {credentialId,credential,expiresAt:new Date(expires).toISOString()};
    }

    async revokeCredential(user: OidcPrincipal, credentialId: string): Promise<void> {
        if (user.publicCredential) throw new PublicApiError(403,"FORBIDDEN","Use graphical owner identity to revoke caller credentials");
        await this.database.transaction(async client=> {
            const rows = await client.query<{session_id:string}>("UPDATE public_credentials SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE credential_id=$1 AND owner_user_id=$2 RETURNING session_id",[credentialId,user.userId]);
            if (!rows.rowCount) throw new StorageNotFoundError("Credential does not exist for this owner");
            await client.query("INSERT INTO audit_records(audit_id,session_id,actor_id,action,payload) VALUES($1,$2,$3,'public.credential_revoked',$4::jsonb)",[randomUUID(),rows.rows[0].session_id,user.userId,canonicalJson({credentialId})]);
        });
    }

    async submit(user: OidcPrincipal, sessionId: string, idempotencyKey: string, request: PublicPrompt): Promise<PublicOperation> {
        return this.admit(user, sessionId, idempotencyKey, request);
    }

    /** Trusted server composition joins the original admission transaction, never a second executor. */
    protected async admit(user: OidcPrincipal, sessionId: string, idempotencyKey: string, request: PublicPrompt, composition?: {
        fingerprint: string;
        prepare(client: PoolClient): Promise<PublicPrompt>;
        commit(client: PoolClient, operationId: string): Promise<void>;
    }): Promise<PublicOperation> {
        if (!/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) throw new TypeError("Idempotency-Key must be 1–128 safe characters");
        await this.authorization.authorizeUser(user,sessionId,"prompt");
        if (Object.keys(request).some(field=>!["content","delivery","model","nativeToolPolicy"].includes(field)) || request.nativeToolPolicy!==undefined && request.nativeToolPolicy!=="deny" || request.delivery!=="queue" || !Array.isArray(request.content) || !request.content.length || request.content.length>32) throw new PublicApiError(422,"UNSUPPORTED_FIELD","Prompt contains unsupported fields or delivery");
        for (const block of request.content) {
            const allowed=block.type==="text" ? ["type","text"] : ["type","attachmentId","mimeType"];
            if (Object.keys(block).some(field=>!allowed.includes(field)) || block.type!=="text" && !(block.type==="image" && ["image/png","image/jpeg"].includes(block.mimeType))) throw new PublicApiError(422,"CAPABILITY_UNSUPPORTED","Only native text and PNG/JPEG content are supported");
        }
        const fingerprint = composition?.fingerprint ?? hash(canonicalJson(request));
        const operationId = await this.database.transaction(async client=> {
            if (user.publicCredential) await this.database.lockPublicCredential(client,user.publicCredential.tokenHash,sessionId,"prompt");
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`public-key:${principalId(user)}:${sessionId}:${idempotencyKey}`]);
            const prior = await client.query<OperationRow>("SELECT * FROM public_operations WHERE principal_id=$1 AND session_id=$2 AND idempotency_key=$3",[principalId(user),sessionId,idempotencyKey]);
            if (prior.rowCount) {
                if (prior.rows[0].request_fingerprint!==fingerprint) throw new StorageConflictError("Idempotency key was retried with changed content");
                if (prior.rows[0].expires_at.getTime()<=Date.now()) throw new PublicApiError(410,"OPERATION_EXPIRED","Retry key is retained as an expired tombstone; reconcile original work");
                return prior.rows[0].operation_id;
            }
            if (composition) request = await composition.prepare(client);
            const bindings = await client.query<{binding_id:string;device_id:string;binding_revision:number;lease_generation:number;payload:Record<string,unknown>}>("SELECT * FROM bindings WHERE session_id=$1 AND state='active'",[sessionId]);
            if (!bindings.rowCount) throw new StorageConflictError("Session has no active native binding");
            const binding = bindings.rows[0];
            if (request.model!==`sdc.${binding.binding_id}` && request.model!=="sdc-default") throw new StorageConflictError("Alias does not address the current consented native binding");
            const capability = (binding.payload.capabilities as Record<string,{status?:string}> | undefined)?.submit;
            if (capability?.status!=="supported") throw new PublicApiError(422,"CAPABILITY_UNSUPPORTED","Native prompt capability has not been verified for this binding");
            await this.database.lockBindingFence(client,{deviceId:binding.device_id,sessionId,bindingRevision:binding.binding_revision,leaseGeneration:binding.lease_generation});
            const revision = binding.payload.conversationRevision;
            if (!Number.isSafeInteger(revision) || Number(revision)<0) throw new StorageConflictError("Native conversation revision is unverified; reconnect the graphical binding");
            let imageBytes=0;
            for (const block of request.content) {
                if (block.type!=="image") continue;
                const attachment=await client.query<{payload:Record<string,unknown>}>("SELECT payload FROM attachment_metadata WHERE attachment_id=$1 AND session_id=$2 AND state='committed'",[block.attachmentId,sessionId]);
                const metadata=attachment.rows[0]?.payload;
                if (!metadata || metadata.ownerUserId!==user.userId || metadata.mimeType!==block.mimeType || Date.parse(String(metadata.retentionExpiresAt))<=Date.now()) throw new PublicApiError(422,"INVALID_ATTACHMENT","Image is not current committed content in this session");
                imageBytes+=Number(metadata.sizeBytes);
            }
            if (!Number.isFinite(imageBytes) || imageBytes>PUBLIC_LIMITS.maxAttachmentBytes) throw new PublicApiError(413,"PAYLOAD_TOO_LARGE","Prompt images exceed the native staging bound");
            const op = randomUUID(), commandId = randomUUID(), promptId = randomUUID(), turnId = randomUUID();
            const command = {protocolVersion:"2.0",type:"turn.submit",commandId,lane:"prompt",seq:1,sessionId,bindingRevision:binding.binding_revision,leaseGeneration:binding.lease_generation,createdAt:new Date().toISOString(),turnId,promptId,
                payload:{content:request.content,delivery:request.delivery,expectedConversationRevision:revision,...(request.nativeToolPolicy ? {nativeToolPolicy:request.nativeToolPolicy} : {})}};
            const valid = validateProtocolMessage(command);
            if (!valid.valid) throw new TypeError("Prompt does not match the supported text/image contract");
            const count = await client.query<{count:string}>("SELECT count(*) FROM public_operations WHERE session_id=$1",[sessionId]);
            if (Number(count.rows[0].count)>=PUBLIC_LIMITS.maxOperationsPerSession) throw new StorageCapacityError("Retained operation capacity is full; reconcile before archival");
            // Database-wide session serialization includes all GUI and low-level prompts.
            await this.database.recordCommand({commandId,sessionId,deviceId:binding.device_id,lane:"prompt",payload:command}, {client,singleOutstanding:true,pendingLimit:100,
                userFence:{sessionId,userId:user.userId,permission:"prompt",publicCredentialHash:user.publicCredential?.tokenHash},fence:{deviceId:binding.device_id,sessionId,bindingRevision:binding.binding_revision,leaseGeneration:binding.lease_generation}});
            const watermark = await client.query<{last_event_seq:string}>("SELECT last_event_seq FROM sessions WHERE session_id=$1",[sessionId]);
            await client.query("INSERT INTO public_operations(operation_id,principal_id,owner_user_id,session_id,idempotency_key,request_fingerprint,command_id,prompt_id,turn_id,binding_id,binding_revision,lease_generation,admitted_watermark,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,clock_timestamp()+interval '7 days')",
                [op,principalId(user),user.userId,sessionId,idempotencyKey,fingerprint,commandId,promptId,turnId,binding.binding_id,binding.binding_revision,binding.lease_generation,watermark.rows[0].last_event_seq]);
            await this.recordAuthority(client,user,commandId,"prompt");
            await client.query("INSERT INTO audit_records(audit_id,session_id,actor_id,action,payload) VALUES($1,$2,$3,'public.prompt_admitted',$4::jsonb)",[randomUUID(),sessionId,user.userId,canonicalJson({operationId:op,commandId})]);
            await this.database.lockBindingFence(client,{deviceId:binding.device_id,sessionId,bindingRevision:binding.binding_revision,leaseGeneration:binding.lease_generation});
            if (user.publicCredential) await this.database.lockPublicCredential(client,user.publicCredential.tokenHash,sessionId,"prompt");
            if (composition) await composition.commit(client,op);
            return op;
        });
        return this.operation(user,operationId);
    }

    async recordAuthority(client: PoolClient, user: OidcPrincipal, commandId: string, permission: string): Promise<void> {
        await client.query("INSERT INTO public_command_authority(command_id,credential_id,owner_user_id,permission) VALUES($1,$2,$3,$4)",[commandId,user.publicCredential?.credentialId ?? null,user.userId,permission]);
    }

    async operation(user: OidcPrincipal, operationId: string): Promise<PublicOperation> {
        const rows = await this.database.pool.query<OperationRow>("SELECT * FROM public_operations WHERE operation_id=$1 AND principal_id=$2",[operationId,principalId(user)]);
        if (!rows.rowCount) throw new StorageNotFoundError("Operation does not exist for this caller");
        const row = rows.rows[0];
        await this.authorization.authorizeUser(user,row.session_id,"view");
        if (row.expires_at.getTime()<=Date.now()) throw new PublicApiError(410,"OPERATION_EXPIRED","Operation result retention expired; reconcile using the session transcript");
        const projection = await this.database.transaction(async client=> {
            await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
            const records = await client.query<{session_seq:string;payload:ProtocolEvent}>("SELECT session_seq,payload FROM events WHERE session_id=$1 ORDER BY session_seq",[row.session_id]);
            const ack = await client.query<{state:string;payload:unknown}>("SELECT a.state,a.payload FROM command_acknowledgements a JOIN commands c USING(device_id,lane,lane_seq) WHERE c.command_id=$1",[row.command_id]);
            const skip = await client.query("SELECT 1 FROM command_skips WHERE command_id=$1",[row.command_id]);
            const binding = await client.query("SELECT 1 FROM bindings WHERE binding_id=$1 AND state='active' AND binding_revision=$2 AND lease_generation=$3 AND lease_expires_at>clock_timestamp()",[row.binding_id,row.binding_revision,row.lease_generation]);
            return {records:records.rows,ack:ack.rows[0],skipped:Boolean(skip.rowCount),bound:Boolean(binding.rowCount)};
        });
        const projector = new TranscriptProjector(row.session_id);
        let terminalEvidence: unknown;
        let rejected = false, uncertain = false;
        for (const record of projection.records) {
            const event = record.payload;
            projector.ingest({sessionSeq:Number(record.session_seq),event});
            if ("turnId" in event.payload && event.payload.turnId===row.turn_id && ["turn.completed","turn.failed","turn.cancelled"].includes(event.type)) terminalEvidence=event;
            if (event.type==="command.rejected" && event.payload.commandId===row.command_id) { rejected=true; terminalEvidence=event; }
            if (event.type==="session.reconciliation_required" && event.payload.affectedIds.some(id=>[row.command_id,row.turn_id,row.binding_id].includes(id))) uncertain=true;
            // A terminal watermark is the durable result boundary, never later task history.
            if (terminalEvidence) break;
        }
        const snapshot = projector.snapshot();
        const observed = snapshot.turnStates[row.turn_id];
        let status: OperationState = "queued";
        if (observed==="completed" && snapshot.completion[row.turn_id]==="verified") status="completed";
        else if (observed==="failed" || observed==="cancelled") status=observed;
        else if (rejected || projection.ack?.state==="rejected" || projection.skipped && !projection.ack && !observed) status="rejected";
        else if (uncertain || projection.skipped || snapshot.needsRepair || observed==="completion_unverified" || ["unknown","reconciliation_required"].includes(projection.ack?.state ?? "") || !projection.bound) status="reconciliation_required";
        else if (["running","waiting_for_approval","waiting_for_input"].includes(observed)) status=observed as OperationState;
        else if (projection.ack) status="dispatching";
        if (status==="completed" && snapshot.needsRepair) status="reconciliation_required";
        const items = snapshot.items.filter(item=>item.turnId===row.turn_id);
        const completed = items.filter(item=>item.kind==="assistant_message" && item.completed && !item.partial);
        // This convenience answer is the last observed completed assistant item, not a native final-category claim.
        const answer = status==="completed" ? completed.at(-1)?.content.filter(block=>block.type==="text").map(block=>block.text).join("") ?? null : null;
        await this.authorization.authorizeUser(user,row.session_id,"view");
        return {operationId:row.operation_id,commandId:row.command_id,promptId:row.prompt_id,turnId:row.turn_id,sessionId:row.session_id,bindingId:row.binding_id,bindingRevision:row.binding_revision,leaseGeneration:row.lease_generation,
            status,commandState:projection.ack?.state ?? (projection.skipped ? "skipped" : "pending"),expiresAt:row.expires_at.toISOString(),watermark:snapshot.watermark,
            ...(terminalEvidence ? {terminalEvidence} : {}),result:{items:completed,partialItems:items.filter(item=>item.kind==="assistant_message" && (!item.completed || item.partial)),toolActivity:items.filter(item=>item.kind==="tool_activity"),answer,selection:"last_completed_assistant_item_after_verified_turn_completion"}};
    }
}
