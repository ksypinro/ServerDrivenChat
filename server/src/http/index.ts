import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProtocolMessage, type Binding, type ProtocolCommand, type ProtocolEvent } from "@server-driven-chat/protocol";
import { TranscriptProjector } from "@server-driven-chat/protocol";
import type { AuthenticationProvider, AuthorizationService, DevicePrincipal, OidcPrincipal } from "../auth/index.js";
import type { ApprovalEngine } from "../approvals/index.js";
import { createPublicKey, type KeyObject } from "node:crypto";
import type { AttachmentService } from "../attachments/index.js";
import { DeviceLeaseService } from "../leases/index.js";
import { StorageCapacityError, StorageConflictError, StorageNotFoundError, type BindingFence, type Lane, type ServerDatabase } from "../storage/index.js";

import { createPublicApiHandler } from "../public-api/http.js";
import { ConversationService } from "../public-api/conversations.js";
import { PublicApiError, PUBLIC_LIMITS } from "../public-api/index.js";

const MAX_BODY_BYTES = 1_048_576;
const MAX_SSE_CONNECTIONS = 128;
const HEARTBEAT_MS = 15_000;
const POLL_MS = 350;
const CURSOR = /^(0|[1-9][0-9]{0,15})$/;
const CONTROL_UI_ROOT = resolve(fileURLToPath(new URL("../../../control-ui/dist/", import.meta.url)));
const STATIC_TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };

export interface ApiServerOptions {
    database: ServerDatabase;
    authorization: AuthorizationService;
    provider: AuthenticationProvider;
    heartbeatMs?: number;
    pollMs?: number;
    maxSseConnections?: number;
    maxBodyBytes?: number;
    leaseTtlSeconds?: number;
    maxPendingPrompts?: number;
    maxPendingControls?: number;
    approvalEngine?: ApprovalEngine;
    decisionPublicKey?: KeyObject | string;
    attachments?: AttachmentService;
    /** Only exact bindings with reviewed native permission/effect evidence may publish caller calls. */
    publicApiToolBindings?: readonly import("../public-api/conversations.js").QualifiedToolBinding[];
    onPublicReconciliationError?: (error: unknown) => void;
    onAttachmentCleanupError?: (error: unknown) => void;
}

type ApiError = { error: { code: string; message: string; requestId: string; retryable: boolean } };

/** Creates the versioned, authenticated HTTP/SSE transport API. Bind to loopback locally or a private interface behind the deployment TLS proxy. */
export function createApiServer(options: ApiServerOptions): Server {
    const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
    const pollMs = options.pollMs ?? POLL_MS;
    const maxSseConnections = options.maxSseConnections ?? MAX_SSE_CONNECTIONS;
    const maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;
    const leases = new DeviceLeaseService(options.database, options.authorization, { ttlSeconds: options.leaseTtlSeconds });
    const promptLimit = options.maxPendingPrompts ?? 100;
    const controlLimit = options.maxPendingControls ?? 1000;
    let activeStreams = 0;
    const oidcAttempts = new Map<string,{redirectUri:string;nonce:string;codeVerifier:string;expiresAt:number}>();
    if (![heartbeatMs, pollMs, maxSseConnections, maxBodyBytes, promptLimit, controlLimit].every(Number.isSafeInteger) || heartbeatMs < 100 || pollMs < 25 || maxSseConnections < 1 || maxBodyBytes < 1024 || promptLimit < 1 || controlLimit < 1)
        throw new RangeError("API limits must be safe positive integers");

    const publicHandler = createPublicApiHandler(options,{readJson,sendJson,authenticateUser,maxBodyBytes});
    const server = createServer((request, response) => {
        const requestedId = request.headers["x-request-id"]?.toString();
        const requestId = requestedId && /^[A-Za-z0-9._:-]{1,128}$/.test(requestedId) ? requestedId : randomUUID();
        response.setHeader("x-request-id", requestId);
        response.setHeader("x-content-type-options", "nosniff");
        void route(request, response, requestId).catch((error: unknown) => {
            if (response.headersSent) { response.destroy(); return; }
            const mapped = mapError(error);
            sendJson(response, mapped.status, { error: { code: mapped.code, message: mapped.message, requestId, retryable: mapped.retryable } });
        });
    });
    if(options.attachments) {
        const cleanup=():void=>{ void options.attachments!.cleanup().catch(error=>options.onAttachmentCleanupError?.(error)); };
        cleanup();
        const timer=setInterval(cleanup,60_000);
        timer.unref();
        server.once("close",()=>clearInterval(timer));
    }
    const conversations = new ConversationService(options.database,options.authorization,options.publicApiToolBindings);
    let reconciling = false;
    const reconcileTimer = setInterval(() => {
        if (reconciling) return;
        reconciling = true;
        void conversations.reconcile().catch(error => options.onPublicReconciliationError?.(error)).finally(() => { reconciling = false; });
    }, 500);
    reconcileTimer.unref();
    server.once("close", () => clearInterval(reconcileTimer));
    return server;

    async function route(req: IncomingMessage, res: ServerResponse, requestId: string): Promise<void> {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (await publicHandler(req,res,url)) return;
        if (!url.pathname.startsWith("/v2/")) {
            if (req.method !== "GET") throw new HttpError(404, "NOT_FOUND", "Route not found");
            await serveControlUi(url.pathname, res); return;
        }
        if (req.method === "GET" && url.pathname === "/v2/health") {
            sendJson(res, 200, { version: 2, requestId }); return;
        }
        if(req.method==="POST" && url.pathname==="/v2/auth/oidc/start") {
            const body=asObject(await readJson(req,maxBodyBytes));
            const redirectUri=nonempty(body.redirectUri,"redirectUri");
            const now=Date.now();
            for(const [state,attempt] of oidcAttempts) if(attempt.expiresAt<=now) oidcAttempts.delete(state);
            if(oidcAttempts.size>=256) throw new HttpError(429,"RATE_LIMITED","Too many active sign-in attempts",true);
            const attempt=await options.provider.createAuthorizationRequest(redirectUri,now);
            if(oidcAttempts.has(attempt.state)) throw new HttpError(409,"CONFLICT","Sign-in state collision; retry the request");
            oidcAttempts.set(attempt.state,{redirectUri,nonce:attempt.nonce,codeVerifier:attempt.codeVerifier,expiresAt:now+300_000});
            sendJson(res,200,{authorizationUrl:attempt.authorizationUrl,state:attempt.state,expiresAt:new Date(now+300_000).toISOString()}); return;
        }
        if(req.method==="POST" && url.pathname==="/v2/auth/oidc/exchange") {
            const body=asObject(await readJson(req,maxBodyBytes));
            const state=nonempty(body.state,"state"); const code=nonempty(body.code,"code");
            const attempt=oidcAttempts.get(state);
            oidcAttempts.delete(state);
            if(!attempt || attempt.expiresAt<=Date.now()) throw new HttpError(400,"INVALID_OIDC_STATE","Sign-in state is unknown, expired, or already consumed");
            const tokens=await options.provider.exchangeAuthorizationCode(code,attempt.redirectUri,state,attempt.nonce,attempt.codeVerifier,state);
            if(!tokens.idToken) throw new HttpError(502,"OIDC_TOKEN_INVALID","Identity provider exchange omitted the required ID token");
            const user=await options.authorization.completeOidcSignIn(options.provider,tokens.idToken,attempt.nonce);
            sendJson(res,200,{accessToken:tokens.accessToken,...(tokens.refreshToken?{refreshToken:tokens.refreshToken}:{}),expiresAt:new Date(tokens.expiresAt).toISOString(),userId:user.userId,email:user.email,user:{userId:user.userId,email:user.email}}); return;
        }
        if(req.method==="POST" && url.pathname==="/v2/auth/oidc/refresh") {
            const body=asObject(await readJson(req,maxBodyBytes)); const userId=nonempty(body.userId,"userId"); const refreshToken=nonempty(body.refreshToken,"refreshToken",8192);
            const identity=await options.database.pool.query<{issuer:string;subject:string;email:string}>("SELECT i.issuer,i.subject,u.email FROM oidc_identities i JOIN app_users u USING(user_id) WHERE i.user_id=$1",[userId]);
            if(!identity.rowCount) throw new HttpError(401,"UNAUTHORIZED","Refresh identity is not registered");
            const tokens=await options.provider.refreshTokens(refreshToken,{issuer:identity.rows[0].issuer,subject:identity.rows[0].subject});
            const verified=await options.provider.verifyAccessToken(tokens.accessToken);
            if(verified.issuer!==identity.rows[0].issuer || verified.subject!==identity.rows[0].subject) throw new HttpError(401,"UNAUTHORIZED","Refreshed token identity does not match the stored principal");
            sendJson(res,200,{accessToken:tokens.accessToken,...(tokens.refreshToken?{refreshToken:tokens.refreshToken}:{}),expiresAt:new Date(tokens.expiresAt).toISOString(),userId,email:identity.rows[0].email}); return;
        }
        if(req.method==="POST" && url.pathname==="/v2/pairings") {
            const user=await authenticateUser(req); const body=asObject(await readJson(req,maxBodyBytes));
            const {localConfirmationSecret:_localSecret,...publicPairing}=await options.authorization.startPairing(user,nonempty(body.label,"label"),nonempty(body.localConfirmationSecret,"localConfirmationSecret"));
            sendJson(res,201,publicPairing); return;
        }
        const pairingServerMatch=/^\/v2\/pairings\/([^/]+)\/confirm$/.exec(url.pathname);
        if(req.method==="POST" && pairingServerMatch) {
            const user=await authenticateUser(req); const body=asObject(await readJson(req,maxBodyBytes));
            const result=await options.authorization.confirmPairingOnServer(user,nonempty(body.pairingCode,"pairingCode"));
            if(result.pairingId!==decodeURIComponent(pairingServerMatch[1])) throw new HttpError(403,"FORBIDDEN","Pairing code does not match this request");
            sendJson(res,200,result); return;
        }
        const pairingLocalMatch=/^\/v2\/pairings\/([^/]+)\/local-confirm$/.exec(url.pathname);
        if(req.method==="POST" && pairingLocalMatch) {
            const body=asObject(await readJson(req,maxBodyBytes));
            sendJson(res,200,await options.authorization.confirmPairingLocally(decodeURIComponent(pairingLocalMatch[1]),nonempty(body.localConfirmationSecret,"localConfirmationSecret"),body.explicitConsent===true)); return;
        }
        if (req.method === "GET" && url.pathname === "/v2/sessions") {
            const user = await authenticateUser(req);
            const result = await options.database.pool.query<{ session_id: string; state: string; role: "owner" | "operator" | "viewer"; binding_id: string | null; device_id: string | null; binding_revision: number | null; lease_generation: number | null; binding_state: string | null; lease_expires_at: Date | null; binding_payload: unknown }>(
                "SELECT s.session_id,s.state,CASE WHEN s.owner_user_id=$1 THEN 'owner' ELSE m.role END AS role,b.binding_id,b.device_id,b.binding_revision,b.lease_generation,b.state AS binding_state,b.lease_expires_at,b.payload AS binding_payload FROM sessions s LEFT JOIN session_memberships m ON m.session_id=s.session_id AND m.user_id=$1 LEFT JOIN LATERAL (SELECT binding_id,device_id,binding_revision,lease_generation,state,lease_expires_at,payload FROM bindings WHERE session_id=s.session_id ORDER BY CASE state WHEN 'active' THEN 0 ELSE 1 END,created_at DESC LIMIT 1) b ON true WHERE s.owner_user_id=$1 OR m.user_id=$1 ORDER BY s.created_at DESC",
                [user.userId]);
            sendJson(res,200,{sessions:result.rows.map(row=>({sessionId:row.session_id,state:row.state,role:row.role,binding:row.binding_id?{bindingId:row.binding_id,deviceId:row.device_id,bindingRevision:row.binding_revision,leaseGeneration:row.lease_generation,state:row.binding_state,leaseExpiresAt:row.lease_expires_at?.toISOString(),payload:row.binding_payload}:null}))}); return;
        }
        if (req.method === "POST" && url.pathname === "/v2/attachments") {
            if (!options.attachments) throw new HttpError(501,"CAPABILITY_UNSUPPORTED","Attachment storage is not configured");
            const user = await authenticateUser(req);
            const sessionId = nonempty(req.headers["x-session-id"],"x-session-id");
            await options.authorization.authorizeUser(user,sessionId,"prompt");
            const length = Number(req.headers["content-length"]);
            if (!Number.isSafeInteger(length) || length < 1 || length > options.attachments.maxBytes) throw new HttpError(413,"PAYLOAD_TOO_LARGE","Attachment length is missing, invalid, or exceeds the configured attachment limit");
            let filename=nonempty(req.headers["x-file-name"],"x-file-name");
            try { filename=decodeURIComponent(filename); } catch { /* Plain unescaped percent signs remain valid filename characters. */ }
            const metadata = await options.attachments.createUpload({ sessionId,ownerUserId:user.userId,mimeType:nonempty(req.headers["content-type"],"content-type").split(";")[0].trim(),
                filename,sizeBytes:length,sha256:nonempty(req.headers["x-content-sha256"],"x-content-sha256") });
            await options.attachments.receive(metadata.attachmentId,user.userId,req);
            sendJson(res,202,{attachmentId:metadata.attachmentId,state:"pending_commit",sha256:metadata.sha256,sizeBytes:metadata.sizeBytes}); return;
        }
        const attachmentCommitMatch = /^\/v2\/attachments\/([^/]+)\/commit$/.exec(url.pathname);
        if (req.method === "POST" && attachmentCommitMatch) {
            if (!options.attachments) throw new HttpError(501,"CAPABILITY_UNSUPPORTED","Attachment storage is not configured");
            const user = await authenticateUser(req);
            const attachmentId = decodeURIComponent(attachmentCommitMatch[1]);
            const metadata = await options.attachments.metadata(attachmentId);
            await options.authorization.authorizeUser(user,metadata.sessionId,"prompt");
            const body = asObject(await readJson(req,maxBodyBytes));
            const committed = await options.attachments.commit(attachmentId,user.userId,nonempty(body.sha256,"sha256"));
            sendJson(res,200,{attachmentId:committed.attachmentId,state:committed.state,sha256:committed.sha256,sizeBytes:committed.sizeBytes,retentionExpiresAt:committed.retentionExpiresAt}); return;
        }
        const attachmentMatch = /^\/v2\/attachments\/([^/]+)$/.exec(url.pathname);
        if (req.method === "GET" && attachmentMatch) {
            if (!options.attachments) throw new HttpError(501,"CAPABILITY_UNSUPPORTED","Attachment storage is not configured");
            let device:DevicePrincipal|undefined;
            let user:OidcPrincipal|undefined;
            try { device=await options.authorization.authenticateDevice(bearer(req)); }
            catch { user=await authenticateUser(req); }
            const attachmentId = decodeURIComponent(attachmentMatch[1]);
            const metadata = await options.attachments.metadata(attachmentId);
            let result: {metadata:import("../attachments/index.js").StoredAttachment;content:Uint8Array};
            if(device) {
                await options.authorization.authorizeDevice(device,metadata.sessionId,"write_events");
                result=await options.attachments.readForSession(attachmentId,metadata.sessionId);
            } else {
                if(!user) throw new HttpError(401,"UNAUTHORIZED","A valid user access token is required");
                await options.authorization.authorizeUser(user,metadata.sessionId,"view");
                result=await options.attachments.readCommitted(attachmentId,user.userId);
            }
            const dispositionName = encodeURIComponent(result.metadata.filename ?? "attachment");
            res.writeHead(200,{"content-type":result.metadata.mimeType,"content-length":String(result.content.byteLength),"content-disposition":`attachment; filename*=UTF-8''${dispositionName}`,"cache-control":"private, no-store","x-content-type-options":"nosniff","x-attachment-sha256":result.metadata.sha256,"x-attachment-filename":dispositionName});
            res.end(Buffer.from(result.content)); return;
        }
        const receiptMatch=/^\/v2\/devices\/([^/]+)\/attachments\/([^/]+)\/staging-receipts$/.exec(url.pathname);
        if(req.method==="POST" && receiptMatch) {
            if(!options.attachments) throw new HttpError(501,"CAPABILITY_UNSUPPORTED","Attachment storage is not configured");
            const device=await authenticateDevice(req);
            if(device.deviceId!==decodeURIComponent(receiptMatch[1])) throw new HttpError(403,"FORBIDDEN","Credential does not match device");
            const body=asObject(await readJson(req,maxBodyBytes));
            const sessionId=nonempty(body.sessionId,"sessionId");
            await options.authorization.authorizeDevice(device,sessionId,"write_events");
            const binding=await options.database.pool.query("SELECT 1 FROM bindings WHERE binding_id=$1 AND session_id=$2 AND device_id=$3 AND state='active' AND lease_expires_at>now()",[nonempty(body.bindingId,"bindingId"),sessionId,device.deviceId]);
            if(!binding.rowCount) throw new HttpError(409,"BINDING_CHANGED","Staging receipt binding is inactive");
            const receipt=await options.attachments.recordStagingReceipt({receiptId:nonempty(body.receiptId,"receiptId"),attachmentId:decodeURIComponent(receiptMatch[2]),sessionId,bindingId:String(body.bindingId),adapterId:nonempty(body.adapterId,"adapterId"),sha256:nonempty(body.sha256,"sha256"),sizeBytes:positiveInteger(body.sizeBytes,"sizeBytes"),mimeType:nonempty(body.mimeType,"mimeType")});
            sendJson(res,202,{...receipt,durable:true}); return;
        }
        const registerMatch = /^\/v2\/devices\/([^/]+)\/bindings$/.exec(url.pathname);
        const detachMatch = /^\/v2\/devices\/([^/]+)\/bindings\/([^/]+)\/detach$/.exec(url.pathname);
        if (req.method === "POST" && (registerMatch || detachMatch)) {
            const device = await authenticateDevice(req);
            if (device.deviceId !== decodeURIComponent((registerMatch ?? detachMatch)![1])) throw new HttpError(403, "FORBIDDEN", "Credential does not match device");
            const credential = bearer(req);
            if (detachMatch) {
                await options.authorization.detachBinding(device, credential, decodeURIComponent(detachMatch[2]));
                sendJson(res, 200, { status: "disconnected" }); return;
            }
            const body = asObject(await readJson(req, maxBodyBytes));
            const binding = asObject(body.binding) as unknown as Binding;
            await options.authorization.registerBinding(device, credential, binding, Number(body.conversationRevision), body.capabilities as import("@server-driven-chat/protocol").CapabilitiesDocument | undefined);
            const publicKey = options.decisionPublicKey ? (typeof options.decisionPublicKey === "string" ? createPublicKey(options.decisionPublicKey) : options.decisionPublicKey).export({ type: "spki", format: "pem" }).toString() : undefined;
            sendJson(res, 201, { binding, ...(publicKey ? { decisionPublicKey: publicKey } : {}) }); return;
        }
        const leaseMatch = /^\/v2\/devices\/([^/]+)\/lease\/renew$/.exec(url.pathname);
        if (req.method === "POST" && leaseMatch) {
            const device = await authenticateDevice(req);
            const deviceId = decodeURIComponent(leaseMatch[1]);
            if (device.deviceId !== deviceId) throw new HttpError(403, "FORBIDDEN", "Credential does not match this device");
            const body = asObject(await readJson(req, maxBodyBytes));
            const sessionId = nonempty(body.sessionId, "sessionId");
            const bindingRevision = positiveInteger(body.bindingRevision, "bindingRevision");
            const leaseGeneration = positiveInteger(body.leaseGeneration, "leaseGeneration");
            const result = await leases.renew(device, { sessionId, bindingRevision, leaseGeneration });
            if (result.status === "expired") throw new HttpError(409, "LEASE_EXPIRED", "Binding lease expired; a new binding generation is required");
            if (result.status === "fenced") throw new HttpError(409, "BINDING_CHANGED", "Binding revision or lease generation is stale");
            sendJson(res, 200, result); return;
        }
        const assertionMatch = /^\/v2\/devices\/([^/]+)\/decision-assertions\/consume$/.exec(url.pathname);
        if (req.method === "POST" && assertionMatch) {
            if (!options.decisionPublicKey) throw new HttpError(501,"CAPABILITY_UNSUPPORTED","Decision assertion verification is not configured");
            const device = await authenticateDevice(req);
            if (device.deviceId !== decodeURIComponent(assertionMatch[1])) throw new HttpError(403,"FORBIDDEN","Credential does not match device");
            const body = asObject(await readJson(req,maxBodyBytes));
            const token = nonempty(body.assertion,"assertion",8192);
            sendJson(res,200,await options.authorization.consumeDecisionAssertion(token,options.decisionPublicKey,device)); return;
        }
        const dispatchMatch = /^\/v2\/devices\/([^/]+)\/dispatch$/.exec(url.pathname);
        if (req.method === "POST" && dispatchMatch) {
            const device = await authenticateDevice(req);
            if (device.deviceId !== decodeURIComponent(dispatchMatch[1])) throw new HttpError(403,"FORBIDDEN","Credential does not match device");
            const body = asObject(await readJson(req,maxBodyBytes));
            const input = {sessionId: nonempty(body.sessionId,"sessionId"), bindingRevision: positiveInteger(body.bindingRevision,"bindingRevision"), leaseGeneration: positiveInteger(body.leaseGeneration,"leaseGeneration")};
            await options.authorization.authorizeDevice(device,input.sessionId,"write_events");
            if (activeStreams >= maxSseConnections) throw new HttpError(429,"RATE_LIMITED","Dispatch connection capacity is full",true);
            activeStreams++;
            try {
                await options.database.transaction(async client => {
                    const publicSession = await client.query("SELECT 1 FROM public_session_admission WHERE session_id=$1",[input.sessionId]);
                    if (publicSession.rowCount && !body.commandId) throw new HttpError(409,"COMPANION_UPDATE_REQUIRED","This public session requires a companion with command-specific dispatch fencing");
                    const credentialExpiry = body.commandId ? await lockCommandAuthority(client,nonempty(body.commandId,"commandId"),input.sessionId,device.deviceId,false) : undefined;
                    const permit = await options.database.lockBindingFence(client,deviceFence(req,device,input));
                    if (body.commandId) await lockCommandAuthority(client,nonempty(body.commandId,"commandId"),input.sessionId,device.deviceId);
                    if (credentialExpiry && Date.parse(credentialExpiry)<Date.parse(permit.leaseExpiresAt)) permit.leaseExpiresAt=credentialExpiry;
                    permit.leaseExpiresAt=new Date(Math.min(Date.parse(permit.leaseExpiresAt),Date.parse(permit.serverTime)+PUBLIC_LIMITS.maxDispatchPermitMs)).toISOString();
                    beginSse(res);
                    await writeSse(res,"permit","dispatch.permit",{...permit,...input});
                    // Bounded admission window. Native adapters must invoke the local authority guard
                    // at mutation, and must never queue a mutation beyond this permit's deadline.
                    await new Promise<void>(resolve => {
                        const finish = (): void => {clearTimeout(timer);res.off("close",finish);resolve();};
                        const timer = setTimeout(finish,Math.max(1,Date.parse(permit.leaseExpiresAt)-Date.now()));
                        res.once("close",finish);
                        if (res.destroyed) finish();
                    });
                    if (!res.destroyed) res.end();
                });
            } finally {activeStreams--;}
            return;
        }
        const commandMatch = /^\/v2\/devices\/([^/]+)\/commands$/.exec(url.pathname);
        if (req.method === "GET" && commandMatch) {
            const deviceId = decodeURIComponent(commandMatch[1]);
            const lane = url.searchParams.get("lane");
            if (lane !== "prompt" && lane !== "control") throw new HttpError(400, "INVALID_LANE", "lane must be prompt or control");
            const device = await authenticateDevice(req);
            if (device.deviceId !== deviceId) throw new HttpError(403, "FORBIDDEN", "Credential does not match this device");
            if (activeStreams >= maxSseConnections) throw new HttpError(429, "RATE_LIMITED", "SSE connection capacity is full", true);
            activeStreams++;
            try { await streamCommands(req, res, device, lane, cursorFrom(req, url)); }
            finally { activeStreams--; }
            return;
        }
        const eventStreamMatch = /^\/v2\/sessions\/([^/]+)\/events$/.exec(url.pathname);
        if (req.method === "GET" && eventStreamMatch) {
            const sessionId = decodeURIComponent(eventStreamMatch[1]);
            const user = await authenticateUser(req);
            await options.authorization.authorizeUser(user, sessionId, "view");
            if (activeStreams >= maxSseConnections) throw new HttpError(429, "RATE_LIMITED", "SSE connection capacity is full", true);
            activeStreams++;
            try { await streamEvents(req, res, sessionId, cursorFrom(req, url)); }
            finally { activeStreams--; }
            return;
        }
        const snapshotMatch = /^\/v2\/sessions\/([^/]+)\/snapshot$/.exec(url.pathname);
        if (req.method === "GET" && snapshotMatch) {
            const sessionId = decodeURIComponent(snapshotMatch[1]);
            const user = await authenticateUser(req);
            await options.authorization.authorizeUser(user, sessionId, "view");
            await options.database.expireApprovalRecords(sessionId);
            const stored = await options.database.readSnapshot(sessionId);
            const projector = new TranscriptProjector(sessionId);
            for (const item of stored.events) projector.ingest({ sessionSeq: item.sessionSeq, event: item.payload as ProtocolEvent });
            for (const interaction of stored.interactions) {
                if (interaction.kind === "approval") projector.seedInteraction(interaction.requestId,interaction.requestRevision,interaction.state,interaction.state === "pending" ? interaction.payload as import("@server-driven-chat/protocol").ApprovalRequest : undefined);
                else projector.seedInteraction(interaction.requestId,interaction.requestRevision,interaction.state);
            }
            const projection = projector.snapshot();
            // The raw event/interactions fields remain for existing clients; projection carries the stable transcript view.
            sendJson(res, 200, { ...stored, projection, cursors: stored.watermark }); return;
        }
        const approvalMatch = /^\/v2\/sessions\/([^/]+)\/approvals\/([^/]+)\/decisions$/.exec(url.pathname);
        if (req.method === "POST" && approvalMatch) {
            if (!options.approvalEngine) throw new HttpError(501,"CAPABILITY_UNSUPPORTED","Approval decision signing is not configured");
            const sessionId = decodeURIComponent(approvalMatch[1]);
            const requestId = decodeURIComponent(approvalMatch[2]);
            const user = await authenticateUser(req);
            await options.authorization.authorizeUser(user,sessionId,"approve");
            const requestOwner = await options.database.pool.query("SELECT 1 FROM interactions WHERE session_id=$1 AND request_id=$2 AND kind='approval'",[sessionId,requestId]);
            if (!requestOwner.rowCount) throw new HttpError(404,"NOT_FOUND","Approval request was not found in this session");
            const body = asObject(await readJson(req,maxBodyBytes));
            if (nonempty(body.requestId,"requestId") !== requestId) throw new HttpError(400,"INVALID_MESSAGE","Approval request ID does not match route");
            const active = await options.database.pool.query<{device_id:string}>("SELECT device_id FROM bindings WHERE session_id=$1 AND state='active' AND lease_expires_at>now()",[sessionId]);
            if (!active.rowCount) throw new HttpError(409,"BINDING_CHANGED","Session has no active approval device");
            if (!Array.isArray(body.grantedPermissions)) throw new HttpError(400,"INVALID_MESSAGE","grantedPermissions must be an array");
            const result = await options.approvalEngine.decide(user, {
                sessionId,deviceId: active.rows[0].device_id, decisionId: nonempty(body.decisionId,"decisionId"), requestId,
                requestRevision: positiveInteger(body.requestRevision,"requestRevision"), actionDigest: nonempty(body.actionDigest,"actionDigest"),
                choiceId: nonempty(body.choiceId,"choiceId"), grantedPermissions: body.grantedPermissions as import("@server-driven-chat/protocol").PermissionGrant[],
                policyRevision: nonempty(body.policyRevision,"policyRevision"), expiresAt: nonempty(body.expiresAt,"expiresAt")
            });
            const {assertion: _assertion,...publicResult}=result;
            sendJson(res,202,{...publicResult,durable:true}); return;
        }
        const turnMatch = /^\/v2\/sessions\/([^/]+)\/turns$/.exec(url.pathname);
        const controlMatch = /^\/v2\/sessions\/([^/]+)\/turns\/([^/]+)\/controls$/.exec(url.pathname);
        if (req.method === "POST" && (turnMatch || controlMatch)) {
            const sessionId = decodeURIComponent((turnMatch ?? controlMatch)![1]);
            const user = await authenticateUser(req);
            const body = await readJson(req, maxBodyBytes);
            const command = getCommand(body);
            if (command.sessionId !== sessionId) throw new HttpError(400, "INVALID_MESSAGE", "Command session does not match the route");
            await options.authorization.authorizeUser(user, sessionId, command.type === "approval.decide" ? "approve" : command.type === "session.disable" || command.type === "permission.revoke" ? "administer" : "prompt");
            const binding = await activeBinding(sessionId);
            const boundValidation = validateProtocolMessage(command, { sessionId, bindingRevision: binding.bindingRevision, leaseGeneration: binding.leaseGeneration });
            if (!boundValidation.valid) throw new HttpError(409, "BINDING_CHANGED", "Command binding revision or lease generation is stale");
            const isControl = Boolean(controlMatch);
            if (isControl !== (command.lane === "control")) throw new HttpError(400, "INVALID_MESSAGE", "Prompt and control commands must use their corresponding endpoint");
            if (!isControl && command.type !== "turn.submit") throw new HttpError(400, "INVALID_MESSAGE", "Turn endpoint accepts turn.submit commands only");
            if (controlMatch && "turnId" in command && command.turnId !== decodeURIComponent(controlMatch[2])) throw new HttpError(400, "INVALID_MESSAGE", "Control turnId does not match the route");
            if (command.type === "turn.submit" && "promptId" in command && !command.promptId) throw new HttpError(400, "INVALID_MESSAGE", "promptId is required");
            const stored = await options.database.recordCommand({ commandId: command.commandId, sessionId, deviceId: binding.deviceId, lane: command.lane, payload: command }, { userFence: {sessionId,userId: user.userId,permission: command.type === "approval.decide" ? "approve" : command.type === "session.disable" || command.type === "permission.revoke" ? "administer" : "prompt"}, fence: {deviceId: binding.deviceId, sessionId, bindingRevision: command.bindingRevision, leaseGeneration: command.leaseGeneration}, pendingLimit: command.lane === "prompt" ? promptLimit : controlLimit });
            sendJson(res, 202, { commandId: stored.commandId, lane: stored.lane, laneSeq: stored.laneSeq, disposition: stored.disposition, durable: true }); return;
        }
        const eventMatch = /^\/v2\/devices\/([^/]+)\/events$/.exec(url.pathname);
        if (req.method === "POST" && eventMatch) {
            const device = await authenticateDevice(req);
            const deviceId = decodeURIComponent(eventMatch[1]);
            if (device.deviceId !== deviceId) throw new HttpError(403, "FORBIDDEN", "Credential does not match this device");
            const body = await readJson(req, maxBodyBytes);
            const event = getEvent(body);
            await options.authorization.authorizeDevice(device, event.sessionId, "write_events");
            const stored = await options.database.recordEvent({ eventId: event.eventId, sessionId: event.sessionId, bridgeEpoch: event.bridgeEpoch, producerSeq: event.producerSeq, payload: event }, {fence: deviceFence(req, device, event)});
            sendJson(res, 202, { eventId: stored.eventId, sessionSeq: stored.sessionSeq, disposition: stored.disposition, durable: true }); return;
        }
        const ackMatch = /^\/v2\/devices\/([^/]+)\/acks$/.exec(url.pathname);
        if (req.method === "POST" && ackMatch) {
            const device = await authenticateDevice(req);
            const deviceId = decodeURIComponent(ackMatch[1]);
            if (device.deviceId !== deviceId) throw new HttpError(403, "FORBIDDEN", "Credential does not match this device");
            const body = await readJson(req, maxBodyBytes);
            const input = asObject(body);
            const sessionId = nonempty(input.sessionId, "sessionId");
            const lane = input.lane;
            if (lane !== "prompt" && lane !== "control") throw new HttpError(400, "INVALID_ACK", "lane must be prompt or control");
            const laneSeq = positiveInteger(input.laneSeq, "laneSeq");
            const bindingRevision = positiveInteger(input.bindingRevision, "bindingRevision");
            const leaseGeneration = positiveInteger(input.leaseGeneration, "leaseGeneration");
            const state = input.state;
            if (!(["received", "applied", "rejected", "unknown", "reconciliation_required"] as unknown[]).includes(state)) throw new HttpError(400, "INVALID_ACK", "state is not a supported acknowledgement state");
            await options.authorization.authorizeDevice(device, sessionId, "write_events");
            const ack = await options.database.recordCommandAck({ deviceId, lane, laneSeq, state: state as "received" | "applied" | "rejected" | "unknown" | "reconciliation_required", payload: { sessionId, details: input.details ?? null } }, {fence: deviceFence(req, device, {sessionId,bindingRevision,leaseGeneration})});
            sendJson(res, 202, { lane, laneSeq, state: ack.state, disposition: ack.disposition, durable: true }); return;
        }
        throw new HttpError(404, "NOT_FOUND", "Route not found");
    }

    async function lockCommandAuthority(client: import("pg").PoolClient, commandId: string, sessionId: string, deviceId: string, lockSession = true): Promise<string | undefined> {
        let expiry: string | undefined;
        const command = await client.query("SELECT 1 FROM commands WHERE command_id=$1 AND session_id=$2 AND device_id=$3",[commandId,sessionId,deviceId]);
        if (!command.rowCount) throw new HttpError(403,"FORBIDDEN","Dispatch command is not addressed to this binding");
        const origin = await client.query<{credential_id:string|null;owner_user_id:string;permission:string}>("SELECT * FROM public_command_authority WHERE command_id=$1",[commandId]);
        if (!origin.rowCount) return; // Preserved historical/GUI command contract.
        const actor = origin.rows[0];
        if (actor.credential_id) {
            await client.query("SELECT credential_id FROM public_credentials WHERE credential_id=$1 FOR SHARE",[actor.credential_id]);
            const current = await client.query<{expires_at:Date}>("SELECT c.expires_at FROM public_credentials c JOIN bindings b USING(binding_id) WHERE c.credential_id=$1 AND c.owner_user_id=$2 AND c.session_id=$3 AND $4=ANY(c.scopes) AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() AND b.state='active' AND b.lease_expires_at>clock_timestamp()",[actor.credential_id,actor.owner_user_id,sessionId,actor.permission]);
            if (!current.rowCount) throw new HttpError(403,"FORBIDDEN","Public command authority was withdrawn");
            expiry=current.rows[0].expires_at.toISOString();
        }
        if (lockSession) {
            await client.query("SELECT session_id FROM sessions WHERE session_id=$1 FOR SHARE",[sessionId]);
            await client.query("SELECT user_id FROM session_memberships WHERE session_id=$1 AND user_id=$2 FOR SHARE",[sessionId,actor.owner_user_id]);
        }
        const authority = await client.query("SELECT 1 FROM sessions s LEFT JOIN session_memberships m ON m.session_id=s.session_id AND m.user_id=$2 WHERE s.session_id=$1 AND s.state='active' AND (s.owner_user_id=$2 OR ($3='prompt' AND m.role='operator'))",[sessionId,actor.owner_user_id,actor.permission]);
        if (!authority.rowCount) throw new HttpError(403,"FORBIDDEN","Public command authority was withdrawn");
        return expiry;
    }
    function deviceFence(req: IncomingMessage, device: DevicePrincipal, input: {sessionId: string;bindingRevision: number;leaseGeneration: number}): BindingFence {
        return {...input,deviceId: device.deviceId,credentialHash: createHash("sha256").update(bearer(req)).digest("hex")};
    }
    async function authenticateUser(req: IncomingMessage): Promise<OidcPrincipal> {
        const token = bearer(req);
        try { return await options.authorization.authenticateUserAccessToken(options.provider, token); }
        catch { throw new HttpError(401, "UNAUTHORIZED", "A valid user access token is required"); }
    }
    async function authenticateDevice(req: IncomingMessage): Promise<DevicePrincipal> {
        const token = bearer(req);
        try { return await options.authorization.authenticateDevice(token); }
        catch { throw new HttpError(401, "UNAUTHORIZED", "A valid active device credential is required"); }
    }
    async function activeBinding(sessionId: string): Promise<{ deviceId: string; bindingRevision: number; leaseGeneration: number }> {
        const result = await options.database.pool.query<{ device_id: string; binding_revision: number; lease_generation: number }>("SELECT device_id,binding_revision,lease_generation FROM bindings WHERE session_id=$1 AND state='active'", [sessionId]);
        if (!result.rowCount) throw new HttpError(409, "BINDING_CHANGED", "Session has no active device binding");
        return { deviceId: result.rows[0].device_id, bindingRevision: result.rows[0].binding_revision, leaseGeneration: result.rows[0].lease_generation };
    }
    function cursorFrom(req: IncomingMessage, url: URL): number {
        const header = req.headers["last-event-id"];
        const raw = header ? String(header) : (url.searchParams.get("after") ?? "0");
        if (!CURSOR.test(raw)) throw new HttpError(400, "INVALID_CURSOR", "Replay cursor must be a nonnegative decimal sequence");
        const value = Number(raw);
        if (!Number.isSafeInteger(value)) throw new HttpError(400, "INVALID_CURSOR", "Replay cursor exceeds the supported integer range");
        return value;
    }
    async function streamCommands(req: IncomingMessage, res: ServerResponse, device: DevicePrincipal, lane: Lane, initialCursor: number): Promise<void> {
        const head = await options.database.pool.query<{ last_seq: string }>("SELECT COALESCE((SELECT last_seq FROM lane_counters WHERE device_id=$1 AND lane=$2),0) AS last_seq", [device.deviceId, lane]);
        if (initialCursor > Number(head.rows[0].last_seq)) throw new HttpError(409, "CURSOR_AHEAD", "Replay cursor is ahead of the durable lane watermark");
        beginSse(res);
        let cursor = initialCursor;
        await pump(req, res, async () => {
            const currentDevice = await authenticateDevice(req);
            const records = await options.database.readCommands(device.deviceId, lane, cursor, 100);
            for (const record of records) {
                await authenticateDevice(req);
                const skips = await options.database.pool.query("SELECT 1 FROM command_skips WHERE device_id=$1 AND lane=$2 AND lane_seq=$3", [device.deviceId,lane,record.laneSeq]);
                const payload = record.payload as ProtocolCommand;
                let obsolete = Boolean(skips.rowCount);
                if (!obsolete) {
                    const bound = await options.database.pool.query("SELECT 1 FROM bindings WHERE device_id=$1 AND session_id=$2 AND state='active' AND binding_revision=$3 AND lease_generation=$4 AND lease_expires_at>clock_timestamp()", [device.deviceId,record.sessionId,payload.bindingRevision,payload.leaseGeneration]);
                    obsolete = !bound.rowCount;
                }
                if (!obsolete) {
                    try { await options.database.transaction(client=>lockCommandAuthority(client,record.commandId,record.sessionId,record.deviceId)); }
                    catch (error) { if (error instanceof HttpError && error.status===403) obsolete=true; else throw error; }
                }
                if (obsolete) {
                    await options.database.skipCommand(record);
                    if (!await writeSse(res, String(record.laneSeq), "command.skipped", {deviceId: device.deviceId,lane,laneSeq: record.laneSeq,commandId: record.commandId,reason: "obsolete_binding"})) return false;
                } else {
                    await options.authorization.authorizeDevice(currentDevice, record.sessionId, "read_commands");
                    if (!await writeSse(res, String(record.laneSeq), "command", {...record,payload: {...payload,seq: record.laneSeq}})) return false;
                }
                cursor = record.laneSeq;
            }
            return records.length > 0;
        }, heartbeatMs, pollMs);
    }
    async function streamEvents(req: IncomingMessage, res: ServerResponse, sessionId: string, initialCursor: number): Promise<void> {
        const snapshot = await options.database.readSnapshot(sessionId);
        if (initialCursor > snapshot.watermark.sessionSeq) throw new HttpError(409, "CURSOR_AHEAD", "Replay cursor is ahead of the durable event watermark");
        beginSse(res);
        let cursor = initialCursor;
        await pump(req, res, async () => {
            await options.authorization.authorizeUser(await authenticateUser(req), sessionId, "view");
            const records = await options.database.readEvents(sessionId, cursor, 100);
            for (const event of records) {
                await options.authorization.authorizeUser(await authenticateUser(req), sessionId, "view");
                if (!await writeSse(res, `${event.sessionSeq}`, "event", event)) return false;
                cursor = event.sessionSeq;
            }
            return records.length > 0;
        }, heartbeatMs, pollMs);
    }
}

class HttpError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly retryable = false) { super(message); }
}
function mapError(error: unknown): { status: number; code: string; message: string; retryable: boolean } {
    if (error instanceof HttpError) return error;
    if (error instanceof PublicApiError) return {...error,message:error.message,retryable:false};
    if (error instanceof StorageCapacityError) return {status: 429,code: "QUEUE_FULL",message: error.message,retryable: true};
    if (error instanceof StorageConflictError) return { status: 409, code: "CONFLICT", message: error.message, retryable: false };
    if (error instanceof StorageNotFoundError) return { status: 404, code: "NOT_FOUND", message: error.message, retryable: false };
    if (error instanceof RangeError) return { status: 400, code: "INVALID_REQUEST", message: error.message, retryable: false };
    if (error instanceof TypeError) return { status: 400, code: "INVALID_MESSAGE", message: error.message, retryable: false };
    const message = error instanceof Error ? error.message : "Request failed";
    if (/permission denied|not actively bound|authenticated .*principal/i.test(message)) return { status: 403, code: "FORBIDDEN", message: "The authenticated principal is not authorized for this resource", retryable: false };
    if (/does not exist|not found/i.test(message)) return { status: 404, code: "NOT_FOUND", message: "Resource not found", retryable: false };
    if (/too large/i.test(message)) return { status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds the configured limit", retryable: false };
    return { status: 500, code: "INTERNAL", message: "Internal server error", retryable: true };
}

async function serveControlUi(pathname: string, response: ServerResponse): Promise<void> {
    let decoded: string;
    try { decoded = decodeURIComponent(pathname); }
    catch { throw new HttpError(400,"INVALID_REQUEST","Invalid UI asset path"); }
    if (decoded.includes("\\") || decoded.includes("\0")) throw new HttpError(400,"INVALID_REQUEST","Invalid UI asset path");
    const candidate = resolve(CONTROL_UI_ROOT, `.${decoded}`);
    if (candidate !== CONTROL_UI_ROOT && !candidate.startsWith(`${CONTROL_UI_ROOT}${sep}`)) throw new HttpError(404,"NOT_FOUND","UI asset not found");
    let file = candidate;
    try {
        const body = await readFile(file);
        sendUiFile(response,file,body); return;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code !== "EISDIR") throw error;
    }
    if (extname(decoded)) throw new HttpError(404,"NOT_FOUND","UI asset not found");
    file = resolve(CONTROL_UI_ROOT,"index.html");
    try { sendUiFile(response,file,await readFile(file)); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HttpError(503,"UI_NOT_BUILT","Control interface assets have not been built");
        throw error;
    }
}

function sendUiFile(response: ServerResponse,file: string,body: Buffer): void {
    response.writeHead(200,{
        "content-type":STATIC_TYPES[extname(file)] ?? "application/octet-stream",
        "cache-control":file.endsWith("index.html")?"no-cache":"public, max-age=31536000, immutable",
        "content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' https:; form-action 'self' https:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
        "referrer-policy":"no-referrer",
        "x-frame-options":"DENY"
    });
    response.end(body);
}

function bearer(req: IncomingMessage): string {
    const value = req.headers.authorization;
    if (!value || !/^Bearer [^\s]+$/.test(value)) throw new HttpError(401, "UNAUTHORIZED", "Authorization bearer token is required");
    return value.slice(7);
}
function sendJson(res: ServerResponse, status: number, value: unknown): void {
    const text = JSON.stringify(value);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text), "cache-control": "no-store" });
    res.end(text);
}
async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
    if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > maxBytes) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds the configured limit");
        chunks.push(bytes);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new HttpError(400, "INVALID_JSON", "Request body is not valid JSON"); }
}
function asObject(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "INVALID_MESSAGE", "JSON object required");
    return value as Record<string, unknown>;
}
function nonempty(value: unknown, name: string, maxLength = 256): string {
    if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new HttpError(400, "INVALID_MESSAGE", `${name} is invalid`);
    return value;
}
function positiveInteger(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || Number(value) < 1) throw new HttpError(400, "INVALID_MESSAGE", `${name} must be a positive safe integer`);
    return Number(value);
}
function getCommand(value: unknown): ProtocolCommand {
    const command = asObject(asObject(value).command);
            const validation = validateProtocolMessage(command);
    if (!validation.valid || !("lane" in validation.value)) throw new HttpError(400, "INVALID_MESSAGE", "Command does not match the versioned protocol schema");
    return validation.value as ProtocolCommand;
}
function getEvent(value: unknown): ProtocolEvent {
    const event = asObject(asObject(value).event);
    const validation = validateProtocolMessage(event);
    if (!validation.valid || !("producerSeq" in validation.value)) throw new HttpError(400, "INVALID_MESSAGE", "Event does not match the versioned protocol schema");
    return validation.value as ProtocolEvent;
}
function beginSse(res: ServerResponse): void {
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
    res.write("retry: 3000\n\n");
}
async function writeSse(res: ServerResponse, id: string, event: string, value: unknown): Promise<boolean> {
    if (res.destroyed || res.writableEnded) return false;
    const data = `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
    if (res.write(data)) return true;
    return waitForDrain(res);
}
function waitForDrain(res: ServerResponse): Promise<boolean> {
    if (res.destroyed || res.writableEnded) return Promise.resolve(false);
    return new Promise((resolve) => {
        const onDrain = (): void => { cleanup(); resolve(true); };
        const onClose = (): void => { cleanup(); resolve(false); };
        const cleanup = (): void => { res.off("drain", onDrain); res.off("close", onClose); };
        res.once("drain", onDrain); res.once("close", onClose);
    });
}
async function pump(req: IncomingMessage, res: ServerResponse, poll: () => Promise<boolean>, heartbeatMs: number, pollMs: number): Promise<void> {
    let stopped = false;
    const stop = (): void => { stopped = true; };
    req.once("aborted", stop);
    res.once("close", stop);
    let lastBeat = Date.now();
    try {
        while (!stopped && !res.destroyed) {
            const sent = await poll();
            if (stopped || res.destroyed) break;
            const now = Date.now();
            if (!sent && now - lastBeat >= heartbeatMs) {
                if (!res.write(`: heartbeat ${new Date(now).toISOString()}\n\n`)) {
                    if (!await waitForDrain(res)) break;
                }
                lastBeat = now;
            }
            if (!sent) await new Promise((resolve) => setTimeout(resolve, pollMs));
        }
    } finally {
        req.off("aborted", stop); res.off("close", stop);
        if (!res.writableEnded && !res.destroyed) res.end();
    }
}
