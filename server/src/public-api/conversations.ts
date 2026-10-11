import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { canonicalJson, validateProtocolMessage } from "@server-driven-chat/protocol";
import type { AuthorizationService, OidcPrincipal } from "../auth/index.js";
import { StorageNotFoundError, type ServerDatabase } from "../storage/index.js";
import { PublicApiError, PublicApiService, principalId, type PublicOperation } from "./index.js";
import { composeRequest, estimateText, parseCallerReply, truncateText, validateGenerationRequest, type CallerCall, type GenerationRequest, type HistoryMessage, SERVER_API_POLICY } from "./policy.js";

interface ConversationRow {
    conversation_id: string; principal_id: string; session_id: string; binding_id: string;
    context_mode: string; history: HistoryMessage[]; version: number; native_revision: number;
    latest_generation_id: string | null; expires_at: Date;
}
interface GenerationRow {
    generation_id: string; conversation_id: string; parent_id: string | null; request: GenerationRequest;
    cancellation_requested: boolean; input_usage: number; result: GenerationResult | null; deadline_at: Date; created_at: Date;
    principal_id: string; session_id: string; binding_id: string;
}
export interface GenerationResult {
    status: "completed" | "incomplete" | "failed" | "cancelled";
    text: string; calls: CallerCall[];
    outcome: "stop" | "caller_tools" | "output_quota" | "deadline" | "backend_error" | "cancelled";
    error?: { code: string; message: string };
    usage: { source: "estimated"; estimator: string; inputUnits: number; outputUnits: number; observedOutputUnits: number; scope: string; hiddenNativeContext: "unknown" };
}
export interface PublicGeneration {
    generationId: string; conversationId: string; parentId: string | null; model: string; createdAt: string;
    background: boolean; status: string; backendStatus: string; operationId: string;
    result: GenerationResult | null; expiresAt: string;
    parameters: Pick<GenerationRequest, "instructions" | "contextMode" | "tools" | "toolChoice" | "parallelTools" | "budget">;
}
export interface QualifiedToolBinding { bindingId: string; evidence: string }
const settled=(status:string):boolean=>["completed","failed","cancelled","rejected","reconciliation_required"].includes(status);
function contextError(message:string):never { throw new PublicApiError(409,"CONTEXT_CONFLICT",message); }

/** Durable server-owned conversation policy over the existing application executor. */
export class ConversationService extends PublicApiService {
    constructor(database: ServerDatabase, authorization: AuthorizationService, readonly toolBindings: readonly QualifiedToolBinding[] = []) { super(database,authorization); }

    /** Read-only estimate over the same server composition policy used at admission. */
    async countInput(user: OidcPrincipal, value: unknown): Promise<{inputUnits:number;withinInputBudget:boolean;source:"estimated";estimator:string;scope:string;hiddenNativeContext:"unknown";imageAllowanceUnits:number;admissionChecked:false}> {
        const request=validateGenerationRequest(value);
        const sessionId=request.sessionId ?? user.publicCredential?.sessionId;
        if (!sessionId) throw new PublicApiError(422,"SESSION_REQUIRED","Human credentials require an explicit sessionId; caller keys route internally");
        if (user.publicCredential && user.publicCredential.sessionId!==sessionId) throw new PublicApiError(403,"FORBIDDEN","Credential is scoped to another session");
        await this.authorization.authorizeUser(user,sessionId,"view");
        await this.database.transaction(async client=>{
            await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
            for (const image of composeRequest(request).images) await this.validateCommittedImage(client,user,sessionId,image.attachmentId,image.mimeType,false);
        });
        const composed=composeRequest(request);
        await this.authorization.authorizeUser(user,sessionId,"view");
        return {inputUnits:composed.inputUnits,withinInputBudget:composed.inputUnits<=request.budget.inputUnits,source:"estimated",estimator:SERVER_API_POLICY.estimator,scope:"composed-input-plus-image-allowance",hiddenNativeContext:"unknown",imageAllowanceUnits:composed.images.length*SERVER_API_POLICY.imageUnits,admissionChecked:false};
    }

    async generate(user: OidcPrincipal, key: string, value: unknown): Promise<PublicGeneration> {
        const request=validateGenerationRequest(value);
        const sessionId=request.sessionId ?? user.publicCredential?.sessionId;
        if (!sessionId) throw new PublicApiError(422,"SESSION_REQUIRED","Human credentials require an explicit sessionId; caller keys route internally");
        if (request.conversationId && request.parentId) throw new PublicApiError(422,"INVALID_REQUEST","Select conversationId or parentId");
        // Settle the latest known result before checking canonical history. No new command is admitted here.
        let selected=request.conversationId;
        if (request.parentId) {
            const parent=await this.generation(user,request.parentId);
            if (!parent.result || parent.result.status!=="completed") contextError("Parent response has not completed successfully");
            selected=parent.conversationId;
        } else if (selected) {
            const c=await this.conversation(user,selected);
            if (c.latest_generation_id) await this.generation(user,c.latest_generation_id);
        }
        // Full-history consumers need no backend/context identifier. Infer only an owned,
        // append-only continuation of the one exclusive route; independent histories still conflict.
        if (!selected && request.contextMode==="exclusive") {
            const owned=await this.database.pool.query<ConversationRow>("SELECT c.* FROM public_conversations c JOIN bindings b USING(binding_id) WHERE c.session_id=$1 AND c.principal_id=$2 AND c.context_mode='exclusive' AND b.state='active'",[sessionId,principalId(user)]);
            const current=owned.rows[0];
            if (current?.latest_generation_id) await this.generation(user,current.latest_generation_id);
            if (current) {
                const canonical=await this.conversation(user,current.conversation_id);
                if (canonical.history.length && request.history.length>canonical.history.length && canonicalJson(request.history.slice(0,canonical.history.length))===canonicalJson(canonical.history)) selected=canonical.conversation_id;
            }
        }
        const composed=composeRequest(request);
        if (composed.inputUnits>request.budget.inputUnits) throw new PublicApiError(422,"INPUT_BUDGET_EXCEEDED","Server-visible composition exceeds the estimated input allowance");
        const fingerprint=createHash("sha256").update(canonicalJson(request)).digest("hex");
        let conversationId=selected ?? randomUUID();
        let history: HistoryMessage[]=request.history;
        const callerToolContext=(messages:HistoryMessage[]):boolean=>request.tools.length>0 || messages.some(message=>message.role==="tool" || !!message.calls?.length);
        const op=await this.admit(user,sessionId,key,{model:request.model,delivery:"queue",content:[{type:"text",text:composed.text},...composed.images],...(callerToolContext(request.history) ? {nativeToolPolicy:"deny" as const} : {})}, {
            fingerprint,
            prepare: async client=>{
                // Same shared lane lock as every ingress. Serializes context creation and low-level prompts.
                const bindings=await client.query<{binding_id:string;device_id:string;binding_revision:number;lease_generation:number;payload:Record<string,unknown>}>("SELECT * FROM bindings WHERE session_id=$1 AND state='active'",[sessionId]);
                const binding=bindings.rows[0];
                if (!binding) contextError("No consented backend route is active");
                for (const image of composed.images) await this.validateCommittedImage(client,user,sessionId,image.attachmentId,image.mimeType,true);
                await this.database.lockBindingFence(client,{sessionId,deviceId:binding.device_id,bindingRevision:binding.binding_revision,leaseGeneration:binding.lease_generation});
                await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`public-admission:${sessionId}`]);
                const current=await client.query<ConversationRow>("SELECT * FROM public_conversations WHERE conversation_id=$1 FOR UPDATE",[conversationId]);
                if (!current.rowCount) {
                    if (selected) throw new StorageNotFoundError("Conversation does not exist for this caller");
                    const retained=await client.query("SELECT context_mode FROM public_conversations WHERE binding_id=$1",[binding.binding_id]);
                    if (request.contextMode==="exclusive" && retained.rowCount || retained.rows.some(row=>row.context_mode==="exclusive")) contextError("This stateful route already has an independent API history; continue it or consent a fresh binding");
                    if (request.history.some(m=>m.role==="tool" || m.calls?.length)) contextError("New contexts cannot import unverified caller-tool identities");
                    await client.query("INSERT INTO public_conversations(conversation_id,principal_id,session_id,binding_id,context_mode,native_revision) VALUES($1,$2,$3,$4,$5,$6)",[conversationId,principalId(user),sessionId,binding.binding_id,request.contextMode,binding.payload.conversationRevision]);
                } else {
                    const c=current.rows[0];
                    if (c.principal_id!==principalId(user) || c.session_id!==sessionId) throw new StorageNotFoundError("Conversation does not exist for this caller");
                    if (c.expires_at.getTime()<=Date.now()) throw new PublicApiError(410,"CONVERSATION_EXPIRED","Context retention expired; consent a fresh route");
                    if (c.binding_id!==binding.binding_id || c.context_mode!==request.contextMode) contextError("Context mode or backend binding changed");
                    if (c.context_mode==="exclusive" && c.native_revision!==binding.payload.conversationRevision) contextError("Native history changed outside the canonical API context");
                    if (c.latest_generation_id) {
                        const last=await client.query<GenerationRow>("SELECT result FROM public_generations WHERE generation_id=$1",[c.latest_generation_id]);
                        if (!last.rows[0].result) contextError("Previous response is still pending; retrieve it first");
                        if (last.rows[0].result.status!=="completed") contextError("Previous response requires reconciliation before continuation");
                    }
                    if (request.parentId && c.latest_generation_id!==request.parentId) contextError("Branching an older response requires a separately consented fresh route");
                    // Parent continuations submit only new input; Chat/first-party continuations submit full history.
                    history=request.parentId ? [...c.history,...request.history] : request.history;
                    if (history.length<=c.history.length || canonicalJson(history.slice(0,c.history.length))!==canonicalJson(c.history)) contextError("History rewind/edit or missing new input is unsupported on this stateful backend");
                    const additions=history.slice(c.history.length);
                    if (additions.some(m=>m.role==="assistant")) contextError("Caller cannot append invented assistant responses");
                    const pending=await client.query<{call_id:string;result:unknown}>("SELECT call_id,result FROM public_caller_tools WHERE conversation_id=$1 AND result IS NULL FOR UPDATE",[conversationId]);
                    const supplied=new Set<string>();
                    for (const msg of additions) {
                        if (msg.role!=="tool") continue;
                        if (supplied.has(msg.callId!)) contextError("Duplicate tool result in the same continuation");
                        supplied.add(msg.callId!);
                        const calls=await client.query<{result:unknown}>("SELECT result FROM public_caller_tools WHERE call_id=$1 AND conversation_id=$2 FOR UPDATE",[msg.callId,conversationId]);
                        if (!calls.rowCount) contextError("Unknown or foreign caller-tool result");
                        const ledgerResult=msg.resultStatus==="error" ? {content:msg.content,status:"error"} : msg.content;
                        const previous=calls.rows[0].result;
                        if (previous!==null) {
                            const normalized=typeof previous==="string" ? previous : previous;
                            if (canonicalJson(normalized)!==canonicalJson(ledgerResult)) contextError("Caller-tool result conflicts with its immutable ledger");
                        }
                        await client.query("UPDATE public_caller_tools SET result=$2::jsonb WHERE call_id=$1 AND result IS NULL",[msg.callId,canonicalJson(ledgerResult)]);
                    }
                    if (pending.rows.some(call=>!supplied.has(call.call_id))) contextError("Every pending caller call requires an addressed result before continuation");
                }
                const full=composeRequest({...request,history});
                if (full.inputUnits>request.budget.inputUnits) throw new PublicApiError(422,"INPUT_BUDGET_EXCEEDED","Parent context exceeds estimated input allowance");
                if (callerToolContext(history) && (!this.toolBindings.some(policy=>policy.bindingId===binding.binding_id && policy.evidence.trim()) || (binding.payload.capabilityReport as {effectPolicies?:{nativeToolsDenied?:{status?:string}}}|undefined)?.effectPolicies?.nativeToolsDenied?.status!=="supported")) throw new PublicApiError(422,"CALLER_TOOL_POLICY_UNQUALIFIED","Caller tools require a binding with reviewed native tool-denial and effect evidence");
                return {model:request.model,delivery:"queue",content:[{type:"text",text:full.text},...full.images],...(callerToolContext(history) ? {nativeToolPolicy:"deny" as const} : {})};
            },
            commit: async (client,operationId)=>{
                const full=composeRequest({...request,history});
                await client.query("INSERT INTO public_generations(generation_id,conversation_id,parent_id,request,input_usage,deadline_at) VALUES($1,$2,$3,$4::jsonb,$5,clock_timestamp()+make_interval(secs=>$6))",[operationId,conversationId,request.parentId ?? null,canonicalJson({...request,history}),full.inputUnits,request.budget.deadlineSeconds]);
                await client.query("UPDATE public_conversations SET latest_generation_id=$2 WHERE conversation_id=$1",[conversationId,operationId]);
            }
        });
        // Idempotent replay may select the original conversation instead of a newly allocated ID.
        conversationId=(await this.row(user,op.operationId)).conversation_id;
        return this.generation(user,op.operationId);
    }

    private async validateCommittedImage(client:PoolClient,user:OidcPrincipal,sessionId:string,attachmentId:string,mimeType:string,lock:boolean):Promise<void> {
        const row=await client.query<{state:string;payload:{ownerUserId:string;mimeType:string;retentionExpiresAt:string}}>(`SELECT state,payload FROM attachment_metadata WHERE attachment_id=$1 AND session_id=$2${lock ? " FOR SHARE" : ""}`,[attachmentId,sessionId]);
        const metadata=row.rows[0]?.payload;
        const expiresAt=metadata ? Date.parse(metadata.retentionExpiresAt) : NaN;
        if (!row.rowCount || row.rows[0].state!=="committed" || metadata?.ownerUserId!==user.userId || metadata.mimeType!==mimeType || !Number.isFinite(expiresAt) || expiresAt<=Date.now()) throw new PublicApiError(422,"INVALID_ATTACHMENT","Image is not a current committed attachment in this session");
    }

    async conversation(user:OidcPrincipal,id:string):Promise<ConversationRow> {
        const rows=await this.database.pool.query<ConversationRow>("SELECT * FROM public_conversations WHERE conversation_id=$1 AND principal_id=$2",[id,principalId(user)]);
        if (!rows.rowCount) throw new StorageNotFoundError("Conversation does not exist for this caller");
        await this.authorization.authorizeUser(user,rows.rows[0].session_id,"view");
        if (rows.rows[0].expires_at.getTime()<=Date.now()) throw new PublicApiError(410,"CONVERSATION_EXPIRED","Conversation retention expired");
        return rows.rows[0];
    }
    private async row(user:OidcPrincipal,id:string):Promise<GenerationRow> {
        const rows=await this.database.pool.query<GenerationRow>("SELECT g.*,c.principal_id,c.session_id,c.binding_id FROM public_generations g JOIN public_conversations c USING(conversation_id) WHERE generation_id=$1 AND principal_id=$2",[id,principalId(user)]);
        if (!rows.rowCount) throw new StorageNotFoundError("Response does not exist for this caller");
        await this.authorization.authorizeUser(user,rows.rows[0].session_id,"view");
        return rows.rows[0];
    }
    async generation(user:OidcPrincipal,id:string):Promise<PublicGeneration> {
        let row=await this.row(user,id);
        const op=await this.operation(user,id);
        if (!row.result) {
            const text=op.result.answer;
            const observed=[...op.result.items,...op.result.partialItems].flatMap(item=>{
                const value=item as {content?:{type:string;text?:string}[]};
                return (value.content ?? []).filter(c=>c.type==="text").map(c=>c.text ?? "");
            }).join("");
            let result:GenerationResult | null=null;
            const usage=(delivered:string)=>({source:"estimated" as const,estimator:SERVER_API_POLICY.estimator,inputUnits:row.input_usage,outputUnits:estimateText(delivered),observedOutputUnits:estimateText(observed),scope:"composed-input-plus-image-allowance; observed-assistant-text; delivered-text-and-caller-arguments",hiddenNativeContext:"unknown" as const});
            // Public quota/deadline may settle before native work. The common lane remains held by native evidence.
            if (estimateText(observed)>row.request.budget.outputUnits || !settled(op.status) && row.deadline_at.getTime()<=Date.now()) {
                const quota=estimateText(observed)>row.request.budget.outputUnits;
                const delivered=row.request.tools.length ? "" : quota ? truncateText(observed,row.request.budget.outputUnits) : "";
                result={status:"incomplete",text:delivered,calls:[],outcome:quota ? "output_quota" : "deadline",usage:usage(delivered)};
            } else if (op.status==="completed") {
                // A caller-function reply must never be published after observed native tool
                // activity in the same turn, even if an operator configured this binding.
                // This is a final fail-closed check, not proof that native effects were prevented.
                const nativeTools=op.result.toolActivity.filter(item=>(item as {nativeCategory?:unknown}).nativeCategory==="tool");
                if ((row.request.tools.length || row.request.history.some(message=>message.role==="tool" || !!message.calls?.length)) && nativeTools.length) result={status:"failed",text:"",calls:[],outcome:"backend_error",error:{code:"NATIVE_TOOL_ACTIVITY",message:"Native tool activity occurred during a caller-tool conversation; no caller result was published"},usage:usage("")};
                else if (text===null) result={status:"failed",text:"",calls:[],outcome:"backend_error",error:{code:"BACKEND_CONTRACT_ERROR",message:"Verified completion has no completed assistant output"},usage:usage("")};
                else try {
                    const parsed=parseCallerReply(text,row.request,index=>`call_${id.replaceAll("-","")}_${index}`);
                    const published=parsed.text+parsed.calls.map(c=>canonicalJson(c.arguments)).join("");
                    if (estimateText(published)>row.request.budget.outputUnits) result={status:"incomplete",text:parsed.calls.length ? "" : truncateText(parsed.text,row.request.budget.outputUnits),calls:[],outcome:"output_quota",usage:usage(parsed.calls.length ? "" : truncateText(parsed.text,row.request.budget.outputUnits))};
                    else result={status:"completed",...parsed,outcome:parsed.calls.length ? "caller_tools" : "stop",usage:usage(published)};
                } catch (error) {
                    if (!(error instanceof PublicApiError)) throw error;
                    result={status:"failed",text:"",calls:[],outcome:"backend_error",error:{code:error.code,message:error.message},usage:usage("")};
                }
            } else if (settled(op.status)) result={status:op.status==="cancelled" ? "cancelled" : "failed",text:"",calls:[],outcome:op.status==="cancelled" ? "cancelled" : "backend_error",error:{code:op.status.toUpperCase(),message:"Backend did not complete a verified public response"},usage:usage("")};
            if (result) await this.database.transaction(async client=>{
                // Native ingestion uses binding → session order; do not lock context before binding.
                await this.lockResultAuthority(client,user,row.session_id);
                const locked=await client.query<{result:GenerationResult|null}>("SELECT result FROM public_generations WHERE generation_id=$1 FOR UPDATE",[id]);
                if (locked.rows[0].result) return;
                await client.query("UPDATE public_generations SET result=$2::jsonb WHERE generation_id=$1",[id,canonicalJson(result)]);
                if (result.status==="completed") {
                    const history=[...row.request.history,{role:"assistant" as const,content:result.text,...(result.calls.length ? {calls:result.calls} : {})}];
                    const revision=await client.query<{revision:number}>("SELECT (payload->'payload'->>'conversationRevision')::integer AS revision FROM events WHERE session_id=$1 AND session_seq<=$2 AND payload->'payload'->>'turnId'=$3 AND payload->'payload' ? 'conversationRevision' ORDER BY session_seq DESC LIMIT 1",[row.session_id,op.watermark,op.turnId]);
                    if (!revision.rowCount) contextError("Completed backend response has no observed context revision");
                    const update=await client.query<{version:number}>("UPDATE public_conversations SET history=$2::jsonb,version=version+1,native_revision=$3 WHERE conversation_id=$1 AND latest_generation_id=$4 RETURNING version",[row.conversation_id,canonicalJson(history),revision.rows[0].revision,id]);
                    if (!update.rowCount) contextError("Response lineage changed during commitment");
                    await client.query("INSERT INTO public_history_versions(conversation_id,version,generation_id,history) VALUES($1,$2,$3,$4::jsonb)",[row.conversation_id,update.rows[0].version,id,canonicalJson(history)]);
                    for (const call of result.calls) await client.query("INSERT INTO public_caller_tools(call_id,generation_id,conversation_id,name,arguments) VALUES($1,$2,$3,$4,$5::jsonb)",[call.callId,id,row.conversation_id,call.name,canonicalJson(call.arguments)]);
                }
                await this.lockResultAuthority(client,user,row.session_id);
            });
            row=await this.row(user,id);
        }
        if ((row.result?.status==="incomplete" || row.cancellation_requested) && !settled(op.status)) await this.requestCancel(user,row,op);
        await this.authorization.authorizeUser(user,row.session_id,"view");
        const {instructions,contextMode,tools,toolChoice,parallelTools,budget}=row.request;
        return {generationId:id,conversationId:row.conversation_id,parentId:row.parent_id,model:row.request.model,createdAt:row.created_at.toISOString(),background:row.request.background,status:row.result?.status ?? op.status,backendStatus:op.status,operationId:id,result:row.result,expiresAt:op.expiresAt,parameters:{instructions,contextMode,tools,toolChoice,parallelTools,budget}};
    }
    async cancel(user:OidcPrincipal,id:string):Promise<PublicGeneration> {
        const row=await this.row(user,id);
        if (!row.request.background) throw new PublicApiError(409,"BACKGROUND_REQUIRED","Only background responses can use response cancellation");
        await this.authorization.authorizeUser(user,row.session_id,"prompt");
        await this.database.transaction(async client=>{
            if (user.publicCredential) await this.database.lockPublicCredential(client,user.publicCredential.tokenHash,row.session_id,"prompt");
            await client.query("SELECT session_id FROM sessions WHERE session_id=$1 FOR SHARE",[row.session_id]);
            await client.query("SELECT user_id FROM session_memberships WHERE session_id=$1 AND user_id=$2 FOR SHARE",[row.session_id,user.userId]);
            const authorized=await client.query("SELECT 1 FROM sessions s LEFT JOIN session_memberships m ON m.session_id=s.session_id AND m.user_id=$2 WHERE s.session_id=$1 AND (s.owner_user_id=$2 OR m.role='operator')",[row.session_id,user.userId]);
            if (!authorized.rowCount) throw new Error("Session permission denied during cancellation admission");
            await client.query("UPDATE public_generations SET cancellation_requested=true WHERE generation_id=$1",[id]);
        });
        const op=await this.operation(user,id);
        if (!settled(op.status)) await this.requestCancel(user,row,op);
        return this.generation(user,id);
    }
    private async requestCancel(user:OidcPrincipal,row:GenerationRow,op:PublicOperation):Promise<void> {
        await this.authorization.authorizeUser(user,row.session_id,"prompt");
        // An unstarted native turn cannot be addressed by the existing cancel contract.
        if (["queued","dispatching","reconciliation_required"].includes(op.status)) return;
        await this.database.transaction(async client=>{
            if (user.publicCredential) await this.database.lockPublicCredential(client,user.publicCredential.tokenHash,row.session_id,"prompt");
            const b=await client.query<{device_id:string;binding_revision:number;lease_generation:number;payload:Record<string,unknown>}>("SELECT * FROM bindings WHERE binding_id=$1 AND state='active'",[row.binding_id]);
            const binding=b.rows[0];
            if (!binding || binding.binding_revision!==op.bindingRevision || binding.lease_generation!==op.leaseGeneration) return;
            const capability=(binding.payload.capabilities as Record<string,{status?:string}>|undefined)?.cancel;
            if (capability?.status!=="supported") return;
            await this.database.lockBindingFence(client,{sessionId:row.session_id,deviceId:binding.device_id,bindingRevision:binding.binding_revision,leaseGeneration:binding.lease_generation});
            const prior=await client.query<{cancellation_command_id:string|null}>("SELECT cancellation_command_id FROM public_generations WHERE generation_id=$1 FOR UPDATE",[row.generation_id]);
            if (prior.rows[0].cancellation_command_id) return;
            const commandId=randomUUID();
            const command={protocolVersion:"2.0",type:"turn.cancel",commandId,lane:"control",seq:1,sessionId:row.session_id,bindingRevision:binding.binding_revision,leaseGeneration:binding.lease_generation,createdAt:new Date().toISOString(),turnId:op.turnId,payload:{reason:"Server public response cancellation or delivered-output budget"}};
            if (!validateProtocolMessage(command).valid) throw Error("Internal cancellation contract invalid");
            await this.database.recordCommand({commandId,sessionId:row.session_id,deviceId:binding.device_id,lane:"control",payload:command},{client,pendingLimit:1000,userFence:{sessionId:row.session_id,userId:user.userId,permission:"prompt",publicCredentialHash:user.publicCredential?.tokenHash},fence:{sessionId:row.session_id,deviceId:binding.device_id,bindingRevision:binding.binding_revision,leaseGeneration:binding.lease_generation}});
            await this.recordAuthority(client,user,commandId,"prompt");
            await client.query("UPDATE public_generations SET cancellation_command_id=$2 WHERE generation_id=$1",[row.generation_id,commandId]);
        });
    }
    private async lockResultAuthority(client:PoolClient,user:OidcPrincipal,sessionId:string):Promise<void> {
        // Result commitment needs live view authority, including an offline original binding.
        if (user.publicCredential) {
            const key=user.publicCredential;
            await client.query("SELECT credential_id FROM public_credentials WHERE credential_id=$1 FOR SHARE",[key.credentialId]);
            const valid=await client.query("SELECT 1 FROM public_credentials c JOIN bindings b USING(binding_id) WHERE c.credential_id=$1 AND c.token_hash=$2 AND c.session_id=$3 AND 'view'=ANY(c.scopes) AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM bindings newer WHERE newer.session_id=b.session_id AND newer.binding_revision>b.binding_revision)",[key.credentialId,key.tokenHash,sessionId]);
            if (!valid.rowCount) throw new Error("Public result credential authority withdrawn");
        }
        await client.query("SELECT session_id FROM sessions WHERE session_id=$1 FOR SHARE",[sessionId]);
        await client.query("SELECT user_id FROM session_memberships WHERE session_id=$1 AND user_id=$2 FOR SHARE",[sessionId,user.userId]);
        const valid=await client.query("SELECT 1 FROM sessions s LEFT JOIN session_memberships m ON m.session_id=s.session_id AND m.user_id=$2 WHERE s.session_id=$1 AND (s.owner_user_id=$2 OR m.role IN ('operator','viewer'))",[sessionId,user.userId]);
        if (!valid.rowCount) throw new Error("Public result user authority withdrawn");
    }
    /** Polling survives gateway loss/restart; reauthenticate each credential on every pass. */
    async reconcile():Promise<void> {
        const rows=await this.database.pool.query<{generation_id:string;owner_user_id:string;credential_id:string|null;session_id:string;scopes:string[]}>(`SELECT g.generation_id,o.owner_user_id,a.credential_id,o.session_id,k.scopes FROM public_generations g JOIN public_operations o ON o.operation_id=g.generation_id JOIN public_command_authority a USING(command_id) LEFT JOIN public_credentials k USING(credential_id)
        JOIN sessions s ON s.session_id=o.session_id LEFT JOIN session_memberships m ON m.session_id=s.session_id AND m.user_id=o.owner_user_id
        WHERE (s.owner_user_id=o.owner_user_id OR m.role IN ('operator','viewer'))
        AND (a.credential_id IS NULL OR NOT EXISTS(SELECT 1 FROM bindings newer JOIN bindings original ON original.binding_id=k.binding_id WHERE newer.session_id=original.session_id AND newer.binding_revision>original.binding_revision)) AND o.expires_at>clock_timestamp() AND (a.credential_id IS NULL OR (k.revoked_at IS NULL AND k.expires_at>clock_timestamp()))
        AND (g.result IS NULL OR ((g.result->>'status'='incomplete' OR g.cancellation_requested) AND NOT EXISTS(SELECT 1 FROM events e WHERE e.session_id=o.session_id AND e.payload->>'type' IN ('turn.completed','turn.failed','turn.cancelled','command.rejected') AND (e.payload->'payload'->>'turnId'=o.turn_id OR e.payload->'payload'->>'commandId'=o.command_id)))) ORDER BY g.created_at LIMIT 64`);
        for (const row of rows.rows) {
            try {
                const user=await this.authorization.authenticateStoredPublicOperation(row.generation_id);
                await this.generation(user,row.generation_id);
            } catch (error) {
                if (error instanceof PublicApiError || error instanceof StorageNotFoundError || error instanceof Error && /[Aa]uthor|[Cc]redential|[Pp]ermission|[Bb]inding|lease|scope/.test(error.message)) continue;
                throw error;
            }
        }
    }
}
