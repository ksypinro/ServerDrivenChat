import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { AdapterMutationContext, AdapterOutcome, AppAdapter, AttachmentReference, Binding } from "@server-driven-chat/protocol";
import { StorageCapacityError, StorageConflictError, StorageNotFoundError, type ServerDatabase } from "../storage/index.js";

interface UploadInput { sessionId: string; ownerUserId: string; mimeType: string; filename: string; sizeBytes: number; sha256: string }
export interface StoredAttachment extends AttachmentReference { sessionId: string; ownerUserId: string; state: "pending" | "committed" | "expired" | "deleted"; retentionExpiresAt: string; stageExpiresAt?: string }
export interface AttachmentStageReceipt { receiptId: string; attachmentId: string; sessionId: string; bindingId: string; adapterId: string; sha256: string; sizeBytes: number; mimeType: string }
export interface AttachmentServiceOptions { rootDirectory?: string; maxBytes?: number; maxRetainedBytes?: number; maxRetainedUploads?: number; retentionSeconds?: number; uploadTtlSeconds?: number; allowedMimeTypes?: string[]; now?: () => number }
const MIME_DEFAULTS = ["application/pdf","application/json","text/plain","text/markdown","image/png","image/jpeg","image/webp"];
const HASH = /^sha256:[a-f0-9]{64}$/;

/** Private filesystem-backed attachment storage with owner/session metadata in PostgreSQL. */
export class AttachmentService {
    readonly rootDirectory: string;
    readonly #maxBytes: number;
    readonly #maxRetainedBytes: number;
    readonly #maxRetainedUploads: number;
    readonly #retentionSeconds: number;
    readonly #uploadTtlSeconds: number;
    readonly #allowed: Set<string>;
    readonly #now: () => number;
    readonly #locks = new Map<string,Promise<void>>();
    constructor(readonly database: ServerDatabase, options: AttachmentServiceOptions = {}) {
        this.rootDirectory = resolve(options.rootDirectory ?? join(tmpdir(),"server-driven-chat-attachments"));
        this.#maxBytes = options.maxBytes ?? 20 * 1024 * 1024;
        this.#maxRetainedBytes = options.maxRetainedBytes ?? 256 * 1024 * 1024;
        this.#maxRetainedUploads = options.maxRetainedUploads ?? 1000;
        this.#retentionSeconds = options.retentionSeconds ?? 7 * 86400;
        this.#uploadTtlSeconds = options.uploadTtlSeconds ?? 3600;
        this.#allowed = new Set(options.allowedMimeTypes ?? MIME_DEFAULTS);
        this.#now = options.now ?? Date.now;
        if (![this.#maxBytes,this.#maxRetainedBytes,this.#maxRetainedUploads,this.#retentionSeconds,this.#uploadTtlSeconds].every(Number.isSafeInteger) || this.#maxBytes < 1 || this.#maxRetainedBytes < 1 || this.#maxRetainedUploads < 1 || this.#retentionSeconds < 60 || this.#uploadTtlSeconds < 60 || !this.#allowed.size)
            throw new RangeError("Attachment retention, size, or MIME configuration is invalid");
    }
    get maxBytes(): number { return this.#maxBytes; }

    async createUpload(input: UploadInput): Promise<StoredAttachment> {
        if (!input.sessionId || !input.ownerUserId || !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > this.#maxBytes) throw new RangeError("Attachment size is empty, invalid, or exceeds the configured limit");
        if (!this.#allowed.has(input.mimeType)) throw new TypeError("Attachment MIME type is unsupported");
        if (!HASH.test(input.sha256)) throw new TypeError("Attachment SHA-256 must be lowercase sha256 hex");
        const filename = safeFilename(input.filename);
        const attachmentId = randomUUID();
        const now = this.#now();
        const retentionExpiresAt = new Date(now + this.#retentionSeconds * 1000).toISOString();
        const stageExpiresAt = new Date(now + this.#uploadTtlSeconds * 1000).toISOString();
        await mkdir(this.rootDirectory,{recursive:true,mode:0o700});
        const metadata: StoredAttachment = { attachmentId,sessionId:input.sessionId,ownerUserId:input.ownerUserId,mimeType:input.mimeType,filename,sizeBytes:input.sizeBytes,sha256:input.sha256,state:"pending",retentionExpiresAt };
        await this.database.transaction(async client => {
            // Reserve declared bytes before creating any file; concurrent processes share this budget.
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["attachment-retained-capacity"]);
            const retained = await client.query<{count: string; bytes: string}>("SELECT count(*) AS count,COALESCE(sum((payload->>'sizeBytes')::bigint),0) AS bytes FROM attachment_metadata WHERE state IN ('pending','committed')");
            if (Number(retained.rows[0].count) >= this.#maxRetainedUploads || Number(retained.rows[0].bytes) + input.sizeBytes > this.#maxRetainedBytes) throw new StorageCapacityError("Retained attachment capacity is full; clean up expired content before retrying");
            await client.query("INSERT INTO attachment_metadata(attachment_id,session_id,state,payload) VALUES($1,$2,'pending',$3::jsonb)", [attachmentId,input.sessionId,JSON.stringify({...metadata,stageExpiresAt})]);
        });
        return metadata;
    }

    async receive(attachmentId: string, ownerUserId: string, chunks: AsyncIterable<Uint8Array>): Promise<void> {
        await this.#withLock(attachmentId,async () => {
            const metadata = await this.#metadata(attachmentId);
            if (metadata.ownerUserId !== ownerUserId || metadata.state !== "pending" || !metadata.stageExpiresAt || Date.parse(metadata.stageExpiresAt) <= this.#now()) throw new StorageNotFoundError("Pending upload not found or expired for this owner");
            const part = this.#path(attachmentId,"part");
            const file = await open(part,"wx",0o600);
            const hash = createHash("sha256"); let size = 0;
            try {
                for await (const chunk of chunks) {
                    size += chunk.byteLength;
                    if (size > this.#maxBytes || size > metadata.sizeBytes) throw new RangeError("Attachment content exceeds declared or configured size");
                    hash.update(chunk); await file.write(chunk);
                }
                await file.sync();
            } catch (error) { await file.close(); await rm(part,{force:true}); throw error; }
            await file.close();
            if (size !== metadata.sizeBytes || `sha256:${hash.digest("hex")}` !== metadata.sha256) { await rm(part,{force:true}); throw new TypeError("Attachment content does not match declared size and checksum"); }
            const bytes=await readFile(part);
            try { validateMimeBytes(metadata.mimeType,bytes); }
            catch(error) { await rm(part,{force:true}); throw error; }
        });
    }

    async commit(attachmentId: string, ownerUserId: string, sha256: string): Promise<StoredAttachment> {
        return this.#withLock(attachmentId,async () => {
            if (!HASH.test(sha256)) throw new TypeError("Commit checksum is invalid");
            const metadata = await this.#metadata(attachmentId);
            if (metadata.ownerUserId !== ownerUserId) throw new StorageNotFoundError("Attachment not found for this owner");
            if (metadata.state === "committed") {
                if (sha256 !== metadata.sha256) throw new StorageConflictError("Committed attachment checksum cannot be changed");
                await this.#verifyFile(attachmentId,metadata);
                return metadata;
            }
            if (metadata.state !== "pending" || sha256 !== metadata.sha256 || !metadata.stageExpiresAt || Date.parse(metadata.stageExpiresAt) <= this.#now()) throw new StorageConflictError("Attachment is not pending, upload expired, or commit checksum differs");
            const stagedPath = this.#path(attachmentId,"part");
            const targetPath = this.#path(attachmentId,"blob");
            let contentPath=stagedPath;
            let info = await stat(stagedPath).catch(() => undefined);
            if(!info) { contentPath=targetPath; info=await stat(targetPath).catch(()=>undefined); }
            if (!info || info.size !== metadata.sizeBytes) throw new StorageConflictError("Upload is incomplete or expired");
            const content = await readFile(contentPath);
            if (`sha256:${createHash("sha256").update(content).digest("hex")}` !== metadata.sha256) throw new StorageConflictError("Staged bytes failed checksum verification");
            if(contentPath===stagedPath) await rename(stagedPath,targetPath);
            const committedAt=new Date(this.#now());
            const payload = { ...metadata,state:"committed" as const,committedAt:committedAt.toISOString(),retentionExpiresAt:new Date(committedAt.getTime()+this.#retentionSeconds*1000).toISOString(),nativeConfirmation:"not_performed" };
            const saved=await this.database.pool.query("UPDATE attachment_metadata SET state='committed',payload=$3::jsonb WHERE attachment_id=$1 AND session_id=$2 AND state='pending' AND (payload->>'stageExpiresAt')::timestamptz>$4::timestamptz",[attachmentId,metadata.sessionId,JSON.stringify(payload),new Date(this.#now()).toISOString()]);
            if(saved.rowCount!==1) throw new StorageConflictError("Attachment state changed while committing");
            return payload;
        });
    }

    async metadata(attachmentId: string): Promise<StoredAttachment> { return this.#metadata(attachmentId); }
    async recordStagingReceipt(input: AttachmentStageReceipt): Promise<AttachmentStageReceipt> {
        return this.database.transaction(async client => {
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`attachment-stage:${input.attachmentId}:${input.bindingId}`]);
            const metadata = await client.query<{session_id:string;state:string;payload:StoredAttachment}>("SELECT session_id,state,payload FROM attachment_metadata WHERE attachment_id=$1 FOR UPDATE",[input.attachmentId]);
            if (!metadata.rowCount || metadata.rows[0].state!=="committed" || metadata.rows[0].session_id!==input.sessionId || metadata.rows[0].payload.sha256!==input.sha256 || metadata.rows[0].payload.sizeBytes!==input.sizeBytes || metadata.rows[0].payload.mimeType!==input.mimeType)
                throw new StorageConflictError("Adapter staging receipt does not reference the committed session content");
            const old = await client.query<{receipt_id:string;adapter_id:string;sha256:string;size_bytes:string;mime_type:string}>("SELECT receipt_id,adapter_id,sha256,size_bytes,mime_type FROM attachment_staging_receipts WHERE attachment_id=$1 AND binding_id=$2 AND sha256=$3",[input.attachmentId,input.bindingId,input.sha256]);
            if (old.rowCount) {
                const row=old.rows[0];
                if (row.adapter_id!==input.adapterId || Number(row.size_bytes)!==input.sizeBytes || row.mime_type!==input.mimeType) throw new StorageConflictError("Existing attachment stage receipt conflicts with adapter output");
                return { ...input,receiptId:row.receipt_id };
            }
            await client.query("INSERT INTO attachment_staging_receipts(receipt_id,attachment_id,session_id,binding_id,adapter_id,sha256,size_bytes,mime_type,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",[input.receiptId,input.attachmentId,input.sessionId,input.bindingId,input.adapterId,input.sha256,input.sizeBytes,input.mimeType,JSON.stringify({nativeConfirmation:"not_performed"})]);
            return input;
        });
    }
    async readCommitted(attachmentId: string, ownerUserId: string): Promise<{ metadata: StoredAttachment; content: Uint8Array }> {
        const metadata = await this.#metadata(attachmentId);
        if (metadata.ownerUserId !== ownerUserId || metadata.state !== "committed" || Date.parse(metadata.retentionExpiresAt) <= this.#now()) throw new StorageNotFoundError("Committed attachment not found or expired for this owner");
        await this.#verifyFile(attachmentId,metadata);
        return { metadata,content:new Uint8Array(await readFile(this.#path(attachmentId,"blob"))) };
    }

    async readForSession(attachmentId:string,sessionId:string):Promise<{metadata:StoredAttachment;content:Uint8Array}> {
        const metadata=await this.#metadata(attachmentId);
        if(metadata.sessionId!==sessionId || metadata.state!=="committed" || Date.parse(metadata.retentionExpiresAt)<=this.#now()) throw new StorageNotFoundError("Committed attachment is unavailable to this device session");
        await this.#verifyFile(attachmentId,metadata);
        return {metadata,content:new Uint8Array(await readFile(this.#path(attachmentId,"blob")))};
    }

    async cleanup(now = this.#now()): Promise<{ uploadsExpired: number; contentsDeleted: number }> {
        const pending = await this.database.pool.query<{attachment_id:string;session_id:string;payload:StoredAttachment & {stageExpiresAt:string}}>("SELECT attachment_id,session_id,payload FROM attachment_metadata WHERE state='pending' AND (payload->>'stageExpiresAt')::timestamptz <= $1",[new Date(now).toISOString()]);
        for (const row of pending.rows) {
            await this.#withLock(row.attachment_id,async()=>{
                const current=await this.#metadata(row.attachment_id);
                if(current.state!=="pending" || Date.parse(row.payload.stageExpiresAt)>now) return;
                await rm(this.#path(row.attachment_id,"part"),{force:true});
                // A crash after rename but before metadata commit leaves a pending .blob.
                await rm(this.#path(row.attachment_id,"blob"),{force:true});
                await this.database.pool.query("UPDATE attachment_metadata SET state='expired',payload=jsonb_set(payload,'{state}',to_jsonb('expired'::text),true) WHERE attachment_id=$1 AND state='pending'",[row.attachment_id]);
            });
        }
        const committed = await this.database.pool.query<{attachment_id:string}>("SELECT attachment_id FROM attachment_metadata WHERE state='committed' AND (payload->>'retentionExpiresAt')::timestamptz <= $1",[new Date(now).toISOString()]);
        for (const row of committed.rows) {
            await this.#withLock(row.attachment_id,async()=>{
                const current=await this.#metadata(row.attachment_id);
                if(current.state!=="committed" || Date.parse(current.retentionExpiresAt)>now) return;
                await rm(this.#path(row.attachment_id,"blob"),{force:true});
                await this.database.pool.query("UPDATE attachment_metadata SET state='deleted',payload=jsonb_set(payload,'{state}',to_jsonb('deleted'::text),true) WHERE attachment_id=$1 AND state='committed'",[row.attachment_id]);
            });
        }
        return { uploadsExpired:pending.rowCount ?? pending.rows.length,contentsDeleted:committed.rowCount ?? committed.rows.length };
    }

    async #metadata(attachmentId: string): Promise<StoredAttachment> {
        const row = await this.database.pool.query<{payload:StoredAttachment}>("SELECT payload FROM attachment_metadata WHERE attachment_id=$1",[attachmentId]);
        if (!row.rowCount) throw new StorageNotFoundError("Attachment does not exist");
        return row.rows[0].payload;
    }
    async #verifyFile(attachmentId:string,metadata:StoredAttachment):Promise<void> {
        const content = await readFile(this.#path(attachmentId,"blob"));
        if (content.byteLength !== metadata.sizeBytes || `sha256:${createHash("sha256").update(content).digest("hex")}` !== metadata.sha256) throw new StorageConflictError("Committed attachment content failed integrity verification");
    }
    #path(id:string,suffix:"part"|"blob"):string { if (!/^[0-9a-f-]{36}$/.test(id)) throw new TypeError("Attachment ID is invalid"); return join(this.rootDirectory,`${id}.${suffix}`); }
    async #withLock<T>(id:string,work:()=>Promise<T>):Promise<T> {
        const prior=this.#locks.get(id) ?? Promise.resolve();
        let release!:()=>void; const next=new Promise<void>(resolveLock=>{release=resolveLock;});
        const tail=prior.then(()=>next); this.#locks.set(id,tail); await prior;
        try { return await work(); } finally { release(); if (this.#locks.get(id)===tail) this.#locks.delete(id); }
    }
}

export async function stageCommittedAttachment(service: AttachmentService, adapter: AppAdapter, binding: Binding, ownerUserId: string, attachmentId: string, context?: AdapterMutationContext): Promise<{ outcome:"staged"; receiptId:string; reference:AttachmentReference } | { outcome:"unsupported"|"rejected"|"unknown"; reason:string }> {
    const capabilities = await adapter.probe();
    if (capabilities.operations.stageAttachment?.status !== "supported" || !adapter.stageAttachment) return { outcome:"unsupported",reason:capabilities.operations.stageAttachment?.reason ?? "Adapter has not verified attachment staging capability" };
    const loaded = await service.readCommitted(attachmentId,ownerUserId);
    context?.assertAuthority();
    const result = await adapter.stageAttachment(binding,loaded.metadata,loaded.content,context);
    if (result.outcome === "rejected" || result.outcome === "unsupported" || result.outcome === "unknown") return { outcome:result.outcome,reason:result.reason };
    if (result.outcome !== "applied") return { outcome:"unknown",reason:"Adapter accepted staging but did not confirm the committed content" };
    const receipt=result.value;
    if (!receipt || receipt.attachmentId!==loaded.metadata.attachmentId || receipt.mimeType!==loaded.metadata.mimeType || receipt.sizeBytes!==loaded.metadata.sizeBytes || receipt.sha256!==loaded.metadata.sha256 || !receipt.receiptId)
        return { outcome:"unknown",reason:"Adapter staging receipt does not match the committed attachment" };
    try {
        const saved=await service.recordStagingReceipt({receiptId:receipt.receiptId,attachmentId:loaded.metadata.attachmentId,sessionId:binding.sessionId,bindingId:binding.bindingId,adapterId:capabilities.adapterId,sha256:receipt.sha256,sizeBytes:receipt.sizeBytes,mimeType:receipt.mimeType});
        return { outcome:"staged",receiptId:saved.receiptId,reference:loaded.metadata };
    } catch (error) { return { outcome:"unknown",reason:error instanceof Error?error.message:"Staging receipt could not be persisted" }; }
}

function safeFilename(value:string):string {
    const name=basename(value).trim();
    if (!name || name.length>180 || /[\u0000-\u001f\u007f]/.test(name) || name==="." || name==="..") throw new TypeError("Attachment filename is invalid");
    return name;
}

function validateMimeBytes(mimeType:string,bytes:Uint8Array):void {
    const starts=(signature:number[])=>signature.every((byte,index)=>bytes[index]===byte);
    if(mimeType==="image/png" && !starts([137,80,78,71,13,10,26,10])) throw new TypeError("Attachment bytes are not a PNG image");
    if(mimeType==="image/jpeg" && !starts([255,216,255])) throw new TypeError("Attachment bytes are not a JPEG image");
    if(mimeType==="image/webp" && !(starts([82,73,70,70]) && String.fromCharCode(...bytes.slice(8,12))==="WEBP")) throw new TypeError("Attachment bytes are not a WebP image");
    if(mimeType==="application/pdf" && new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-") throw new TypeError("Attachment bytes are not a PDF document");
    if(mimeType==="application/json" || mimeType==="text/plain" || mimeType==="text/markdown") {
        let text:string;
        try { text=new TextDecoder("utf-8",{fatal:true}).decode(bytes); }
        catch { throw new TypeError("Text attachment is not valid UTF-8"); }
        if(mimeType==="application/json") { try { JSON.parse(text); } catch { throw new TypeError("Attachment bytes are not valid JSON"); } }
    }
}
