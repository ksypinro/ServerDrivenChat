import { createPublicKey, verify } from "node:crypto";
import { canonicalJson } from "@server-driven-chat/protocol";
import { parseBackendQualification } from "@server-driven-chat/adapter-core";
import type { ReviewedBackendRegistration } from "./loader.js";

export interface BackendEnvelopePayload {
    format: "sdc-backend-envelope-v1";
    purpose: "evaluation" | "native";
    issuedAt: string;
    expiresAt: string;
    serverOrigin: string;
    registration: ReviewedBackendRegistration;
}

/** Detached signed catalog avoids placing a host's digest inside its own hashed bytes. */
export function verifyBackendEnvelope(serialized: string, trustedKeys: Readonly<Record<string, string>>, now = Date.now()): BackendEnvelopePayload {
    if (Buffer.byteLength(serialized) > 262144) throw new Error("Backend envelope exceeds size limit");
    const envelope: unknown = JSON.parse(serialized);
    if (!envelope || typeof envelope !== "object" || Object.keys(envelope).sort().join() !== "keyId,payload,signature" || !("keyId" in envelope) || typeof envelope.keyId !== "string" || !("signature" in envelope) || typeof envelope.signature !== "string" || !("payload" in envelope)) throw new Error("Malformed backend envelope");
    const pem = Object.hasOwn(trustedKeys, envelope.keyId) ? trustedKeys[envelope.keyId] : undefined;
    if (!pem || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) throw new Error("Untrusted envelope signing key or signature");
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== "ed25519" || !verify(null, Buffer.from(canonicalJson(envelope.payload)), key, Buffer.from(envelope.signature, "base64"))) throw new Error("Invalid backend envelope signature");
    const p = envelope.payload;
    if (!p || typeof p !== "object" || Object.keys(p).sort().join() !== "expiresAt,format,issuedAt,purpose,registration,serverOrigin" || !("format" in p) || p.format !== "sdc-backend-envelope-v1" || !("purpose" in p) || !["native", "evaluation"].includes(String(p.purpose)) || !("issuedAt" in p) || typeof p.issuedAt !== "string" || !("expiresAt" in p) || typeof p.expiresAt !== "string" || !("serverOrigin" in p) || typeof p.serverOrigin !== "string" || !("registration" in p)) throw new Error("Invalid backend envelope payload");
    const issued = Date.parse(p.issuedAt), expires = Date.parse(p.expiresAt);
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now || expires <= now || expires <= issued || expires - issued > 7 * 86400000) throw new Error("Backend envelope is expired, premature or exceeds seven days");
    const origin = new URL(p.serverOrigin);
    if (origin.origin !== p.serverOrigin || origin.protocol !== "https:" || !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) throw new Error("This evaluation host requires an exact HTTPS loopback origin");
    const r = p.registration;
    if (!r || typeof r !== "object" || Object.keys(r).sort().join() !== "extensionId,qualification" || !("extensionId" in r) || typeof r.extensionId !== "string" || !("qualification" in r)) throw new Error("Invalid envelope registration");
    const qualification = parseBackendQualification(r.qualification);
    if (qualification.evidenceLevel !== p.purpose) throw new Error("Envelope purpose and evidence disagree");
    if (!qualification.inventory.artifacts.some(a => a.role === "runtime" && a.id === "microsoft.vscode")) throw new Error("Envelope requires exact editor/runtime inventory");
    return { format: "sdc-backend-envelope-v1", purpose: p.purpose as "evaluation" | "native", issuedAt: p.issuedAt, expiresAt: p.expiresAt, serverOrigin: p.serverOrigin, registration: { extensionId: r.extensionId, qualification } };
}
