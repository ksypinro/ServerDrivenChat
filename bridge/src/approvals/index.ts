import { createPublicKey, verify as cryptoVerify, KeyObject } from "node:crypto";
import { canonicalJson, validateDecisionAgainstRequest, type AdapterMutationContext, type AdapterOutcome, type AppAdapter, type ApprovalDecisionProposal, type ApprovalRequest, type Binding, type ProtocolCommand } from "@server-driven-chat/protocol";
import { BridgeStore } from "../storage/index.js";

interface DecisionClaims {
    typ: "sdc-decision-v1"; assertionId: string; decisionId: string; sessionId: string; deviceId: string; bindingId: string;
    bindingRevision: number; leaseGeneration: number; turnId: string; requestId: string; requestRevision: number; actionDigest: string;
    choiceId: string; grantedPermissions: unknown[]; policyRevision: string; reviewerId: string; issuedAt: number; expiresAt: number;
}
export interface ApprovalHandlerOptions {
    serverUrl: string; deviceId: string; credential: string; binding: Binding; store: BridgeStore; adapter: AppAdapter;
    publicKey: KeyObject | string; fetch?: typeof fetch; now?: () => number;
    /** Test seam for the one-time server consume call; production defaults to authenticated HTTPS. */
    consumeAssertion?: (token: string) => Promise<DecisionClaims>;
}

/** Request-bound, one-shot approval handler. Unknown native outcomes are durable reconciliation states and never retried. */
export function createApprovalDecisionHandler(options: ApprovalHandlerOptions) {
    const base = new URL(options.serverUrl);
    const fetcher = options.fetch ?? fetch;
    const now = options.now ?? Date.now;
    if ((base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost","127.0.0.1","::1"].includes(base.hostname))) || base.username || base.password || base.search || base.hash)
        throw new TypeError("Approval assertion endpoint must use HTTPS except on loopback and contain no credentials");

    return async (binding: Binding, command: Extract<ProtocolCommand,{type:"approval.decide"}>, context: AdapterMutationContext): Promise<AdapterOutcome<void>> => {
        const payload = command.payload;
        if (binding.sessionId !== options.binding.sessionId || binding.bindingId !== options.binding.bindingId || command.sessionId !== binding.sessionId ||
            command.bindingRevision !== binding.bindingRevision || command.leaseGeneration !== binding.leaseGeneration) return { outcome: "rejected", reason: "Approval command binding is stale" };
        const inspected = await options.adapter.inspect(binding);
        if (inspected.outcome !== "accepted" && inspected.outcome !== "applied") return { outcome: "unknown", reason: "Native pending approval state could not be inspected" };
        const request = inspected.value?.pendingApprovals.find((item) => item.requestId === payload.requestId && item.requestRevision === payload.requestRevision);
        if (!request || request.actionDigest !== payload.actionDigest) return { outcome: "rejected", reason: "The exact native approval is no longer pending" };
        const proposal: ApprovalDecisionProposal = { decisionId: payload.decisionId, requestId: payload.requestId, requestRevision: payload.requestRevision, actionDigest: payload.actionDigest, choiceId: payload.choiceId, grantedPermissions: payload.grantedPermissions };
        const validation = await validateDecisionAgainstRequest(request,proposal,new Date(now()).toISOString());
        if (!validation.valid || request.appId!==binding.appId || request.appInstanceId!==binding.appInstanceId || request.nativeConversationId!==binding.nativeConversationId ||
            request.bindingId !== binding.bindingId || request.bindingRevision !== binding.bindingRevision || request.leaseGeneration !== binding.leaseGeneration || request.sessionId !== binding.sessionId)
            return { outcome: "rejected", reason: "Native approval identity, expiry, digest, choice, or permission scope changed" };
        const offered=request.availableDecisions.find(choice=>choice.id===payload.choiceId);
        if(offered?.scope==="session" || offered?.scope==="persistent") return {outcome:"rejected",reason:"Session-wide and persistent grants are disabled by local bridge policy"};
        const [version, encoded, signature, ...extra] = payload.assertion.split(".");
        if (version !== "sdc1" || !encoded || !signature || extra.length) return { outcome: "rejected", reason: "Decision assertion is malformed" };
        let claims: DecisionClaims;
        try {
            const key = options.publicKey instanceof KeyObject && options.publicKey.type === "public" ? options.publicKey : createPublicKey(options.publicKey);
            if (!cryptoVerify(null,Buffer.from(encoded),key,Buffer.from(signature,"base64url"))) return { outcome: "rejected", reason: "Decision assertion signature is invalid" };
            claims = JSON.parse(Buffer.from(encoded,"base64url").toString("utf8")) as DecisionClaims;
        } catch { return { outcome: "rejected", reason: "Decision assertion signature or payload is invalid" }; }
        if (claims.typ !== "sdc-decision-v1" || claims.deviceId !== options.deviceId || claims.sessionId !== binding.sessionId || claims.bindingId !== binding.bindingId ||
            claims.bindingRevision !== binding.bindingRevision || claims.leaseGeneration !== binding.leaseGeneration || claims.requestId !== request.requestId || claims.requestRevision !== request.requestRevision ||
            claims.turnId !== request.turnId || claims.decisionId !== payload.decisionId || claims.actionDigest !== request.actionDigest || claims.choiceId !== payload.choiceId ||
            canonicalJson(claims.grantedPermissions) !== canonicalJson(payload.grantedPermissions) || claims.expiresAt * 1000 <= now() || claims.expiresAt * 1000 > Date.parse(payload.expiresAt))
            return { outcome: "rejected", reason: "Decision assertion is bound to different or expired approval content" };

        const attemptId = `approval:${payload.decisionId}`;
        const action = { requestId: request.requestId, requestRevision: request.requestRevision, actionDigest: request.actionDigest, choiceId: payload.choiceId, grants: payload.grantedPermissions };
        try {
            const prior = options.store.getAttempt(attemptId);
            const created = options.store.createAttempt({ attemptId, sessionId: binding.sessionId, commandId: command.commandId, action });
            if (created === "duplicate" || prior) {
                if (prior?.state === "applied") return { outcome: "applied", evidence: "Previously completed durable native approval attempt" };
                return { outcome: "unknown", reason: "An earlier approval attempt may have reached the app; reconciliation is required" };
            }
            options.store.markAttemptApplying(attemptId);
            const consume = options.consumeAssertion ?? (async (token: string): Promise<DecisionClaims> => {
                const response = await fetcher(new URL(`/v2/devices/${encodeURIComponent(options.deviceId)}/decision-assertions/consume`,base),{
                    method: "POST", headers: { authorization: `Bearer ${options.credential}`, "content-type": "application/json" }, body: JSON.stringify({ assertion: token })
                });
                if (!response.ok) throw new Error(`Assertion consume endpoint returned ${response.status}`);
                return await response.json() as DecisionClaims;
            });
            const consumed = await consume(payload.assertion);
            if (canonicalJson(consumed) !== canonicalJson(claims)) throw new Error("Server consumed a different decision assertion");
            context.assertAuthority();
            const result = await options.adapter.resolveApproval(binding,request,proposal,context);
            if (result.outcome === "applied" && result.evidence.trim()) { options.store.finishAttempt(attemptId,"applied"); return result; }
            if (result.outcome === "rejected" || result.outcome === "unsupported") { options.store.finishAttempt(attemptId,"rejected"); return result; }
            options.store.markAttemptReconciliationRequired(attemptId);
            return { outcome: "unknown", reason: "Native response was accepted for processing but application was not verified" };
        } catch (error) {
            const current = options.store.getAttempt(attemptId);
            if (current && (current.state === "pending" || current.state === "applying")) options.store.markAttemptReconciliationRequired(attemptId);
            return { outcome: "unknown", reason: error instanceof Error ? error.message : "Approval application outcome is unknown" };
        }
    };
}
