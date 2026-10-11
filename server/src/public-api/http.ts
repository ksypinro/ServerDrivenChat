import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { validateProtocolMessage, canonicalJson, TranscriptProjector, type ProtocolCommand, type ContentBlock } from "@server-driven-chat/protocol";
import type { ApiServerOptions } from "../http/index.js";
import type { OidcPrincipal } from "../auth/index.js";
import { PublicApiError, PublicApiService, PUBLIC_LIMITS } from "./index.js";
import { ConversationService } from "./conversations.js";
import { SERVER_API_POLICY } from "./policy.js";
import { StorageConflictError, StorageNotFoundError } from "../storage/index.js";

export const NATIVE_PUBLIC_PROFILE = Object.freeze({
    id: "cline-task-api-1.2", nativeVersion: "4.1.2203", companionBaseline: "0.5.0", providerReady: false,
    fields: { existingTaskText: "native-supported", pngJpeg: "native-supported", addressedControls: "native-supported",
        bindingAlias: "gateway-defined", durableOperation: "gateway-defined", revisionEvents: "native-supported",
        fullHistoryIsolation: "unsupported", systemDeveloperInstructions: "unsupported", callerTools: "unsupported",
        generationCaps: "unsupported", sampling: "unsupported", attributedUsage: "unsupported", tokenCounting: "unsupported",
        appendOnlyProviderStream: "unverified", finalAnswerCategory: "unverified" },
    evidence: "evidence/M23/verification.json", blockers: ["history", "instructions", "caller_tools", "generation_caps", "usage", "counting", "stable_stream", "final_category"]
});

interface Boundary {
    readJson(req: IncomingMessage, maxBytes: number): Promise<unknown>;
    sendJson(res: ServerResponse, status: number, body: unknown): void;
    authenticateUser(req: IncomingMessage): Promise<OidcPrincipal>;
    maxBodyBytes: number;
}

/** Internal HTTP contract for the FastAPI facade; all authority remains on this server. */
export function createPublicApiHandler(options: ApiServerOptions, boundary: Boundary): (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean> {
    const service = new PublicApiService(options.database, options.authorization);
    const conversations = new ConversationService(options.database,options.authorization,options.publicApiToolBindings);
    let streams = 0, waiters = 0;
    const authorize = async (user: OidcPrincipal, sessionId: string, permission: "view" | "prompt" | "approve" | "administer"): Promise<void> => { await options.authorization.authorizeUser(user,sessionId,permission); };
    const authenticate = async (req: IncomingMessage): Promise<OidcPrincipal> => {
        const token = req.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
        if (!token) throw new PublicApiError(401,"UNAUTHORIZED","SDC bearer credential is required");
        try { return token.startsWith("sdc_api_") ? await options.authorization.authenticatePublicCredential(token) : await boundary.authenticateUser(req); }
        catch { throw new PublicApiError(401,"UNAUTHORIZED","Credential is expired, revoked or invalid"); }
    };
    const json = async (req: IncomingMessage, fields: string[]): Promise<Record<string,unknown>> => strictObject(await boundary.readJson(req,boundary.maxBodyBytes),fields);
    const validateImages = async (sessionId:string | undefined, value:unknown):Promise<void> => {
        if (!value || typeof value!=="object" || Array.isArray(value)) return;
        const history=(value as {history?:unknown}).history;
        if (!Array.isArray(history)) return;
        for (const message of history) {
            if (!message || typeof message!=="object" || Array.isArray(message)) continue;
            const images=(message as {images?:unknown}).images;
            if (!Array.isArray(images)) continue;
            for (const image of images) {
                if (!image || typeof image!=="object" || Array.isArray(image)) continue;
                const ref=image as {attachmentId?:unknown;mimeType?:unknown};
                if (!options.attachments || !sessionId || typeof ref.attachmentId!=="string" || !["image/png","image/jpeg"].includes(String(ref.mimeType))) throw new PublicApiError(422,"INVALID_ATTACHMENT","Image requires a supported attachment in the selected session");
            }
        }
    };
    const binding = async (sessionId: string): Promise<{binding_id:string;device_id:string;binding_revision:number;lease_generation:number;payload:Record<string,unknown>}> => {
        const rows = await options.database.pool.query("SELECT * FROM bindings WHERE session_id=$1 AND state='active' AND lease_expires_at>clock_timestamp()",[sessionId]);
        if (!rows.rowCount) throw new StorageConflictError("Session has no active native binding");
        return rows.rows[0];
    };
    return async (req,res,url): Promise<boolean> => {
        if (!url.pathname.startsWith("/v2/public/")) return false;
        const path = url.pathname.slice("/v2/public".length);
        const user = await authenticate(req);
        const ratePrincipal = user.publicCredential ? `key:${user.publicCredential.credentialId}` : `user:${user.userId}`;
        const rateId = `${ratePrincipal}:${path.endsWith("/controls") || path.endsWith("/decisions") || path.endsWith("/revoke") ? "control" : "normal"}`;
        const rate = await options.database.pool.query<{requests:number}>(`INSERT INTO public_request_buckets(principal_id,window_start,requests) VALUES($1,clock_timestamp(),1)
            ON CONFLICT(principal_id) DO UPDATE SET requests=CASE WHEN public_request_buckets.window_start<clock_timestamp()-interval '1 minute' THEN 1 ELSE LEAST(public_request_buckets.requests+1,121) END,
            window_start=CASE WHEN public_request_buckets.window_start<clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE public_request_buckets.window_start END RETURNING requests`,[rateId]);
        if (rate.rows[0].requests>120) throw new PublicApiError(429,"RATE_LIMITED","Public principal request rate is exceeded");
        const sessionRestriction = user.publicCredential?.sessionId;
        const send = (status: number, body: unknown): void => {
            if (Buffer.byteLength(JSON.stringify(body))>PUBLIC_LIMITS.maxResponseBytes) throw new PublicApiError(413,"RESPONSE_TOO_LARGE","Public response exceeds its declared bound; reconcile the session history");
            boundary.sendJson(res,status,body);
        };
        if (req.method==="GET" && path==="/identity") {
            send(200,{userId:user.userId,kind:user.publicCredential ? "scoped_key" : "human",sessionId:sessionRestriction ?? null,scopes:user.publicCredential?.scopes ?? ["view","prompt","approve","administer"]}); return true;
        }
        if (req.method==="GET" && path==="/capabilities") { send(200,{profile:NATIVE_PUBLIC_PROFILE,serverPolicy:SERVER_API_POLICY,limits:PUBLIC_LIMITS}); return true; }
        if (path==="/generations" && req.method==="POST") {
            const body=await boundary.readJson(req,boundary.maxBodyBytes);
            const requestedSession=(body as {sessionId?:string}).sessionId ?? sessionRestriction;
            await validateImages(requestedSession,body);
            const generation=await conversations.generate(user,string(req.headers["idempotency-key"]),body);
            res.setHeader("location",`/api/v1/generations/${generation.generationId}`);
            send(generation.result ? 200 : 202,generation); return true;
        }
        if (path==="/input-counts" && req.method==="POST") {
            const body=await boundary.readJson(req,boundary.maxBodyBytes);
            const request=body as {sessionId?:string;history?:{images?:{attachmentId:string;mimeType:string}[]}[]};
            const sessionId=request.sessionId ?? sessionRestriction;
            await validateImages(sessionId,body);
            const count=await conversations.countInput(user,body);
            await authorize(await authenticate(req),sessionId!,"view");
            send(200,count); return true;
        }
        const generation=/^\/generations\/([^/]+)(\/cancel)?$/.exec(path);
        if (generation && (req.method==="GET" && !generation[2] || req.method==="POST" && generation[2])) {
            if (req.method==="POST") await json(req,[]);
            send(200,generation[2] ? await conversations.cancel(user,decodeURIComponent(generation[1])) : await conversations.generation(user,decodeURIComponent(generation[1]))); return true;
        }
        const context=/^\/conversations\/([^/]+)$/.exec(path);
        if (context && req.method==="GET") {
            const c=await conversations.conversation(user,decodeURIComponent(context[1]));
            send(200,{conversationId:c.conversation_id,contextMode:c.context_mode,history:c.history,version:c.version,latestGenerationId:c.latest_generation_id,expiresAt:c.expires_at.toISOString()}); return true;
        }
        if (path==="/credentials" && req.method==="POST") {
            const body = await json(req,["sessionId","scopes","label","expiresAt"]);
            send(201,await service.issueCredential(user,{sessionId:string(body.sessionId),scopes:body.scopes as string[],label:string(body.label),expiresAt:string(body.expiresAt)})); return true;
        }
        if (path==="/credentials" && req.method==="GET") {
            if (user.publicCredential) throw new PublicApiError(403,"FORBIDDEN","Human identity is required for credential management");
            const rows = await options.database.pool.query("SELECT credential_id AS \"credentialId\",session_id AS \"sessionId\",binding_id AS \"bindingId\",scopes,label,expires_at AS \"expiresAt\",revoked_at AS \"revokedAt\" FROM public_credentials WHERE owner_user_id=$1 ORDER BY created_at",[user.userId]);
            send(200,{credentials:rows.rows}); return true;
        }
        const revoke = /^\/credentials\/([^/]+)\/revoke$/.exec(path);
        if (revoke && req.method==="POST") { await json(req,[]); await service.revokeCredential(user,decodeURIComponent(revoke[1])); send(200,{state:"revoked"}); return true; }
        if ((path==="/sessions" || path==="/models") && req.method==="GET") {
            const rows = await options.database.pool.query<{session_id:string;state:string;binding_id:string|null;payload:unknown}>("SELECT s.session_id,s.state,b.binding_id,b.payload FROM sessions s LEFT JOIN session_memberships m ON m.session_id=s.session_id AND m.user_id=$1 LEFT JOIN bindings b ON b.session_id=s.session_id AND b.state='active' AND b.lease_expires_at>clock_timestamp() WHERE (s.owner_user_id=$1 OR m.user_id=$1) AND ($2::text IS NULL OR s.session_id=$2) ORDER BY s.created_at DESC LIMIT 1000",[user.userId,sessionRestriction ?? null]);
            if (sessionRestriction) await authorize(user,sessionRestriction,"view");
            send(200,path==="/models" ? {models:[...(sessionRestriction && rows.rows.some(row=>row.binding_id && row.state==="active") ? [{id:"sdc-default",sessionId:sessionRestriction,bindingId:rows.rows.find(row=>row.binding_id)!.binding_id,profile:SERVER_API_POLICY.id,providerReady:false}] : []),...rows.rows.filter(row=>row.binding_id && row.state==="active").map(row=>({id:`sdc.${row.binding_id}`,sessionId:row.session_id,bindingId:row.binding_id,profile:NATIVE_PUBLIC_PROFILE.id,providerReady:false}))]} : {sessions:rows.rows.map(row=>({sessionId:row.session_id,state:row.state,bindingId:row.binding_id,native:row.payload}))}); return true;
        }
        const sessionDetails=/^\/sessions\/([^/]+)(\/capabilities)?$/.exec(path);
        if (sessionDetails && req.method==="GET") {
            const sessionId=decodeURIComponent(sessionDetails[1]); await authorize(user,sessionId,"view");
            const state=await options.database.pool.query<{state:string}>("SELECT state FROM sessions WHERE session_id=$1",[sessionId]);
            const bindings=await options.database.pool.query<{binding_id:string;state:string;lease_expires_at:Date|null;payload:Record<string,unknown>}>("SELECT * FROM bindings WHERE session_id=$1 ORDER BY binding_revision DESC LIMIT 1",[sessionId]);
            const current=bindings.rows[0];
            await authorize(await authenticate(req),sessionId,"view");
            send(200,sessionDetails[2] ? {sessionId,bindingId:current?.binding_id ?? null,serverPolicy:{...SERVER_API_POLICY,callerToolsReady:current?.state==="active" && !!current.lease_expires_at && current.lease_expires_at.getTime()>Date.now() && (options.publicApiToolBindings?.some(policy=>policy.bindingId===current.binding_id && policy.evidence.trim()) ?? false) && (current.payload.capabilityReport as {effectPolicies?:{nativeToolsDenied?:{status?:string}}}|undefined)?.effectPolicies?.nativeToolsDenied?.status==="supported"},operations:current?.payload.capabilities ?? {},capabilityReport:current?.payload.capabilityReport ?? null,providerReady:false}
                : {sessionId,state:state.rows[0].state,binding:current ? {bindingId:current.binding_id,state:current.state,leaseExpiresAt:current.lease_expires_at?.toISOString(),native:current.payload} : null}); return true;
        }
        const modelDetails=/^\/models\/([^/]+)$/.exec(path);
        if (modelDetails && req.method==="GET") {
            const id=decodeURIComponent(modelDetails[1]);
            if (id==="sdc-default" && sessionRestriction) {
                const current=await binding(sessionRestriction); await authorize(user,sessionRestriction,"view");
                send(200,{id,sessionId:sessionRestriction,bindingId:current.binding_id,profile:SERVER_API_POLICY.id,providerReady:false}); return true;
            }
            if (!id.startsWith("sdc.")) throw new StorageNotFoundError("Alias does not exist");
            const rows=await options.database.pool.query<{session_id:string;binding_id:string}>("SELECT b.session_id,b.binding_id FROM bindings b JOIN sessions s USING(session_id) LEFT JOIN session_memberships m ON m.session_id=s.session_id AND m.user_id=$2 WHERE b.binding_id=$1 AND b.state='active' AND b.lease_expires_at>clock_timestamp() AND s.state='active' AND (s.owner_user_id=$2 OR m.user_id=$2)",[id.slice(4),user.userId]);
            if (!rows.rowCount) throw new StorageNotFoundError("Alias does not exist for this caller");
            await authorize(user,rows.rows[0].session_id,"view");
            send(200,{id,sessionId:rows.rows[0].session_id,bindingId:rows.rows[0].binding_id,profile:NATIVE_PUBLIC_PROFILE.id,providerReady:false}); return true;
        }
        if (path==="/attachments" && req.method==="POST") {
            if (!options.attachments) throw new PublicApiError(501,"CAPABILITY_UNSUPPORTED","Attachment storage is not configured");
            const sessionId=string(req.headers["x-session-id"]);
            await authorize(user,sessionId,"prompt");
            const length=Number(req.headers["content-length"]);
            if (!Number.isSafeInteger(length) || length<1 || length>Math.min(options.attachments.maxBytes,10*1024*1024)) throw new PublicApiError(413,"PAYLOAD_TOO_LARGE","Attachment exceeds the native staging bound");
            const mimeType=String(req.headers["content-type"] ?? "").split(";")[0].trim();
            if (!["image/png","image/jpeg"].includes(mimeType)) throw new PublicApiError(422,"CAPABILITY_UNSUPPORTED","Only PNG and JPEG uploads are supported");
            const metadata=await options.attachments.createUpload({sessionId,ownerUserId:user.userId,mimeType,filename:decodeURIComponent(string(req.headers["x-file-name"])),sizeBytes:length,sha256:string(req.headers["x-content-sha256"])});
            await options.attachments.receive(metadata.attachmentId,user.userId,req);
            await authorize(await authenticate(req),sessionId,"prompt");
            send(202,{attachmentId:metadata.attachmentId,state:"pending_commit",sha256:metadata.sha256,sizeBytes:metadata.sizeBytes}); return true;
        }
        const attachment=/^\/attachments\/([^/]+)(\/commit)?$/.exec(path);
        if (attachment && (req.method==="GET" || req.method==="POST" && attachment[2])) {
            if (!options.attachments) throw new PublicApiError(501,"CAPABILITY_UNSUPPORTED","Attachment storage is not configured");
            const id=decodeURIComponent(attachment[1]), metadata=await options.attachments.metadata(id);
            await authorize(user,metadata.sessionId,req.method==="POST" ? "prompt" : "view");
            if (req.method==="POST") {
                const body=await json(req,["sha256"]);
                const committed=await options.attachments.commit(id,user.userId,string(body.sha256));
                await authorize(await authenticate(req),metadata.sessionId,"prompt");
                send(200,{attachmentId:id,state:committed.state,sha256:committed.sha256,sizeBytes:committed.sizeBytes,retentionExpiresAt:committed.retentionExpiresAt});
            } else {
                const result=await options.attachments.readCommitted(id,user.userId);
                await authorize(await authenticate(req),metadata.sessionId,"view");
                res.writeHead(200,{"content-type":metadata.mimeType,"content-length":String(result.content.byteLength),"cache-control":"no-store","content-disposition":`attachment; filename*=UTF-8''${encodeURIComponent(metadata.filename ?? "image")}`,"x-content-type-options":"nosniff","x-attachment-sha256":metadata.sha256}); res.end(Buffer.from(result.content));
            }
            return true;
        }
        const prompt = /^\/sessions\/([^/]+)\/prompts$/.exec(path);
        if (prompt && req.method==="POST") {
            const sessionId = decodeURIComponent(prompt[1]);
            const body = await json(req,["content","delivery","model"]);
            if (body.delivery!=="queue") throw new PublicApiError(422,"CAPABILITY_UNSUPPORTED","Only delivery=queue is supported");
            if (!Array.isArray(body.content) || !body.content.length || body.content.length>32) throw new TypeError("content must contain 1–32 supported blocks");
            for (const block of body.content) {
                const value = strictObject(block,["type","text","attachmentId","mimeType"]);
                strictObject(block,value.type==="text" ? ["type","text"] : ["type","attachmentId","mimeType"]);
                if (value.type!=="text" && !(value.type==="image" && ["image/png","image/jpeg"].includes(String(value.mimeType)))) throw new PublicApiError(422,"CAPABILITY_UNSUPPORTED","Only text and committed PNG/JPEG references are supported");
                if (value.type==="image") {
                    if (!options.attachments) throw new PublicApiError(501,"CAPABILITY_UNSUPPORTED","Attachment storage is not configured");
                    const metadata = await options.attachments.metadata(string(value.attachmentId));
                    await authorize(user,sessionId,"prompt");
                    if (metadata.sessionId!==sessionId || metadata.ownerUserId!==user.userId || metadata.state!=="committed" || metadata.mimeType!==value.mimeType || Date.parse(metadata.retentionExpiresAt)<=Date.now()) throw new PublicApiError(422,"INVALID_ATTACHMENT","Image is not a current committed attachment in this session");
                }
            }
            const key = string(req.headers["idempotency-key"]);
            const prefer = req.headers.prefer?.toString();
            if (prefer && !/^wait=(0|[1-9][0-9]?)$/.test(prefer)) throw new TypeError("Prefer must be wait=0 through wait=30");
            const wait = Math.min(Number(prefer?.slice(5) ?? 0),PUBLIC_LIMITS.maxWaitSeconds);
            if (wait>0 && waiters>=PUBLIC_LIMITS.maxWaiters) throw new PublicApiError(429,"RATE_LIMITED","Prompt wait capacity is full");
            if (wait>0) waiters++;
            try {
                let operation = await service.submit(user,sessionId,key,{content:body.content as ContentBlock[],delivery:"queue",model:string(body.model)});
                const until = Date.now()+wait*1000;
                while (wait>0 && !isSettled(operation.status) && Date.now()<until && !res.destroyed) {
                    await new Promise(resolve=>setTimeout(resolve,250));
                    const current = await authenticate(req); await authorize(current,sessionId,"view");
                    operation = await service.operation(current,operation.operationId);
                }
                if (res.destroyed) return true;
                res.setHeader("location",`/api/v1/operations/${operation.operationId}`);
                if (prefer) res.setHeader("preference-applied",`wait=${wait}`);
                send(isSettled(operation.status)?200:202,operation); return true;
            } finally { if (wait>0) waiters--; }
        }
        const operation = /^\/operations\/([^/]+)$/.exec(path);
        if (operation && req.method==="GET") { send(200,await service.operation(user,decodeURIComponent(operation[1]))); return true; }
        const replay = /^\/sessions\/([^/]+)\/(snapshot|transcript|events)$/.exec(path);
        if (replay && req.method==="GET") {
            const sessionId = decodeURIComponent(replay[1]); await authorize(user,sessionId,"view");
            if (replay[2]!=="events") {
                const stored = await options.database.readSnapshot(sessionId);
                await authorize(await authenticate(req),sessionId,"view");
                const projector=new TranscriptProjector(sessionId);
                for (const event of stored.events) projector.ingest({sessionSeq:event.sessionSeq,event:event.payload as import("@server-driven-chat/protocol").ProtocolEvent});
                for (const interaction of stored.interactions) projector.seedInteraction(interaction.requestId,interaction.requestRevision,interaction.state,interaction.kind==="approval" && interaction.state==="pending" ? interaction.payload as import("@server-driven-chat/protocol").ApprovalRequest : undefined);
                send(200,replay[2]==="transcript" ? projector.snapshot() : {...stored,projection:projector.snapshot()}); return true;
            }
            const raw = String(req.headers["last-event-id"] ?? url.searchParams.get("after") ?? "0");
            if (!/^(0|[1-9][0-9]{0,15})$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new TypeError("Replay cursor is invalid");
            let cursor = Number(raw);
            const head = await options.database.pool.query<{last_event_seq:string}>("SELECT last_event_seq FROM sessions WHERE session_id=$1",[sessionId]);
            if (cursor>Number(head.rows[0].last_event_seq)) throw new PublicApiError(409,"CURSOR_AHEAD","Replay cursor is ahead of the durable watermark");
            const first=await options.database.readEvents(sessionId,cursor,1);
            if (first.length && first[0].sessionSeq!==cursor+1) throw new PublicApiError(409,"CURSOR_GAP","Retained replay is incomplete; reconcile using a session snapshot");
            if (streams>=PUBLIC_LIMITS.maxStreams) throw new PublicApiError(429,"RATE_LIMITED","Event stream capacity is full");
            streams++;
            res.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-cache, no-transform","x-accel-buffering":"no"});
            let heartbeat = Date.now();
            try {
                while (!res.destroyed && !res.writableEnded) {
                    await authorize(await authenticate(req),sessionId,"view");
                    const events = await options.database.readEvents(sessionId,cursor,100);
                    for (const event of events) {
                        if (event.sessionSeq!==cursor+1) throw new PublicApiError(409,"CURSOR_GAP","Retained replay became incomplete");
                        await authorize(await authenticate(req),sessionId,"view");
                        await write(res,`id: ${event.sessionSeq}\nevent: event\ndata: ${JSON.stringify(event)}\n\n`);
                        cursor=event.sessionSeq;
                    }
                    if (Date.now()-heartbeat>15000) { await write(res,": heartbeat\n\n"); heartbeat=Date.now(); }
                    if (!events.length) await new Promise(resolve=>setTimeout(resolve,250));
                }
            } finally { streams--; if (!res.destroyed) res.end(); }
            return true;
        }
        const controls = /^\/sessions\/([^/]+)\/controls$/.exec(path);
        if (controls && req.method==="POST") {
            const sessionId = decodeURIComponent(controls[1]);
            const body = await json(req,["type","commandId","turnId","requestId","requestRevision","answer","reason"]);
            const type = string(body.type);
            if (!["turn.cancel","input.respond","session.disable"].includes(type)) throw new PublicApiError(422,"CAPABILITY_UNSUPPORTED","Unsupported native control");
            strictObject(body,type==="input.respond" ? ["type","commandId","turnId","requestId","requestRevision","answer"] : type==="turn.cancel" ? ["type","commandId","turnId","reason"] : ["type","commandId","reason"]);
            const permission = type==="session.disable" ? "administer" : "prompt";
            await authorize(user,sessionId,permission);
            const fingerprint=createHash("sha256").update(canonicalJson(body)).digest("hex");
            const commandId=string(body.commandId);
            const stored = await options.database.transaction(async client=> {
                if (user.publicCredential) await options.database.lockPublicCredential(client,user.publicCredential.tokenHash,sessionId,permission);
                await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`command:${commandId}`]);
                const prior=await client.query<{command_id:string;lane_seq:string;session_id:string;credential_id:string|null;owner_user_id:string;request_fingerprint:string}>("SELECT c.*,a.credential_id,a.owner_user_id,a.request_fingerprint FROM commands c LEFT JOIN public_command_authority a USING(command_id) WHERE c.command_id=$1",[commandId]);
                if (prior.rowCount) {
                    const row=prior.rows[0];
                    if (row.session_id!==sessionId || row.owner_user_id!==user.userId || row.credential_id!==(user.publicCredential?.credentialId ?? null) || row.request_fingerprint!==fingerprint) throw new StorageConflictError("Control command ID was retried with changed content or caller identity");
                    return {commandId,laneSeq:Number(row.lane_seq)};
                }
                const current = await binding(sessionId);
                await options.database.lockBindingFence(client,{sessionId,deviceId:current.device_id,bindingRevision:current.binding_revision,leaseGeneration:current.lease_generation});
                const operationName=type==="turn.cancel" ? "cancel" : type==="input.respond" ? "respondInput" : "detach";
                const capability=(current.payload.capabilities as Record<string,{status?:string}> | undefined)?.[operationName];
                if (capability?.status!=="supported") throw new PublicApiError(422,"CAPABILITY_UNSUPPORTED","Native control capability is unsupported or unverified");
                let payload: Record<string,unknown>;
                if (type==="input.respond") {
                    const requestId = string(body.requestId), requestRevision = body.requestRevision;
                    const pending = await client.query<{payload:Record<string,unknown>}>("SELECT payload FROM interactions WHERE session_id=$1 AND request_id=$2 AND request_revision=$3 AND kind='input' AND state='pending'",[sessionId,requestId,requestRevision]);
                    if (!pending.rowCount || pending.rows[0].payload.turnId!==body.turnId || (pending.rows[0].payload.expiresAt && Date.parse(String(pending.rows[0].payload.expiresAt))<=Date.now())) throw new StorageConflictError("Question is expired, resolved or belongs to another turn");
                    if (typeof body.answer!=="string" || !body.answer.trim()) throw new PublicApiError(422,"CAPABILITY_UNSUPPORTED","The native question profile requires a nonempty text answer");
                    payload={requestId,requestRevision,answer:body.answer};
                } else {
                    if (type==="turn.cancel") {
                        const started=await client.query("SELECT 1 FROM events WHERE session_id=$1 AND payload->>'type'='turn.started' AND payload->'payload'->>'turnId'=$2",[sessionId,string(body.turnId)]);
                        if (!started.rowCount) throw new StorageConflictError("Cancel requires an observed native turn");
                    }
                    payload=body.reason===undefined ? {} : {reason:body.reason};
                }
                const command = {protocolVersion:"2.0",type,commandId,lane:"control",seq:1,sessionId,bindingRevision:current.binding_revision,leaseGeneration:current.lease_generation,createdAt:new Date().toISOString(),
                    ...(type==="turn.cancel" ? {turnId:string(body.turnId)} : {}),payload};
                const validated = validateProtocolMessage(command);
                if (!validated.valid) throw new TypeError("Control does not match the versioned native contract");
                const record = await options.database.recordCommand({commandId,sessionId,deviceId:current.device_id,lane:"control",payload:command}, {client,pendingLimit:1000,
                    userFence:{sessionId,userId:user.userId,permission,publicCredentialHash:user.publicCredential?.tokenHash},fence:{sessionId,deviceId:current.device_id,bindingRevision:current.binding_revision,leaseGeneration:current.lease_generation}});
                await client.query("INSERT INTO public_command_authority(command_id,credential_id,owner_user_id,permission,request_fingerprint) VALUES($1,$2,$3,$4,$5)",[commandId,user.publicCredential?.credentialId ?? null,user.userId,permission,fingerprint]);
                await options.database.lockBindingFence(client,{sessionId,deviceId:current.device_id,bindingRevision:current.binding_revision,leaseGeneration:current.lease_generation});
                if (user.publicCredential) await options.database.lockPublicCredential(client,user.publicCredential.tokenHash,sessionId,permission);
                return record;
            });
            send(202,{commandId:stored.commandId,laneSeq:stored.laneSeq,state:"recorded",nativeApplied:false}); return true;
        }
        const approvals = /^\/sessions\/([^/]+)\/approvals\/([^/]+)\/decisions$/.exec(path);
        if (approvals && req.method==="POST") {
            if (!options.approvalEngine) throw new PublicApiError(501,"CAPABILITY_UNSUPPORTED","Approval signing is not configured");
            const sessionId=decodeURIComponent(approvals[1]), requestId=decodeURIComponent(approvals[2]);
            await authorize(user,sessionId,"approve");
            const body=await json(req,["decisionId","requestRevision","actionDigest","choiceId","grantedPermissions","policyRevision","expiresAt"]);
            if (!Array.isArray(body.grantedPermissions) || body.grantedPermissions.length || !["allow_once","deny"].includes(String(body.choiceId))) throw new PublicApiError(422,"CAPABILITY_UNSUPPORTED","The native approval profile supports whole-action once/deny with no narrowed or persistent grants");
            const current=await binding(sessionId);
            if ((current.payload.capabilities as Record<string,{status?:string}> | undefined)?.resolveApproval?.status!=="supported") throw new PublicApiError(422,"CAPABILITY_UNSUPPORTED","Native approval capability is unsupported or unverified");
            send(202,await options.approvalEngine.decide(user,{sessionId,requestId,deviceId:current.device_id,decisionId:string(body.decisionId),requestRevision:Number(body.requestRevision),actionDigest:string(body.actionDigest),choiceId:string(body.choiceId),grantedPermissions:body.grantedPermissions as import("@server-driven-chat/protocol").PermissionGrant[],policyRevision:string(body.policyRevision),expiresAt:string(body.expiresAt)})); return true;
        }
        const receipt = /^\/sessions\/([^/]+)\/commands\/([^/]+)$/.exec(path);
        if (receipt && req.method==="GET") {
            const sessionId=decodeURIComponent(receipt[1]); await authorize(user,sessionId,"view");
            const rows=await options.database.pool.query("SELECT c.command_id AS \"commandId\",a.state,a.payload FROM commands c LEFT JOIN command_acknowledgements a USING(device_id,lane,lane_seq) WHERE c.session_id=$1 AND c.command_id=$2",[sessionId,decodeURIComponent(receipt[2])]);
            if (!rows.rowCount) throw new StorageNotFoundError("Command does not exist in this session");
            await authorize(await authenticate(req),sessionId,"view"); send(200,rows.rows[0]); return true;
        }
        const device = /^\/devices\/([^/]+)\/revoke$/.exec(path);
        if (device && req.method==="POST") {
            if (user.publicCredential) throw new PublicApiError(403,"FORBIDDEN","Device revocation requires human identity");
            await json(req,[]); await options.authorization.revokeDevice(user,decodeURIComponent(device[1])); send(200,{state:"revoked",nativeCancellationConfirmed:false}); return true;
        }
        throw new PublicApiError(404,"NOT_FOUND","Public route does not exist");
    };
}

function strictObject(value: unknown, fields: string[]): Record<string,unknown> {
    if (!value || typeof value!=="object" || Array.isArray(value)) throw new TypeError("JSON object required");
    const object=value as Record<string,unknown>;
    if (Object.keys(object).some(key=>!fields.includes(key))) throw new PublicApiError(422,"UNSUPPORTED_FIELD","Request contains unsupported fields");
    return object;
}
function string(value: unknown): string {
    if (typeof value!=="string" || !value.trim() || value.length>256) throw new TypeError("Required identifier/header is invalid");
    return value;
}
function isSettled(status: string): boolean { return ["completed","failed","cancelled","rejected","reconciliation_required"].includes(status); }
async function write(res: ServerResponse, data: string): Promise<void> {
    if (res.destroyed) return;
    if (Buffer.byteLength(data)>PUBLIC_LIMITS.maxBodyBytes+4096) throw new PublicApiError(413,"RESPONSE_TOO_LARGE","Event frame exceeds its declared bound");
    if (res.write(data)) return;
    await new Promise<void>(resolve=> {
        const done=():void=>{clearTimeout(timer);res.off("drain",done);res.off("close",done);resolve();};
        const timer=setTimeout(()=>{res.destroy();done();},5000);
        res.once("drain",done);res.once("close",done);
    });
}
