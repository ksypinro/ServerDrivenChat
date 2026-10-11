import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ApprovalEngine, AttachmentService, AuthorizationService, KeycloakOidcProvider, ServerDatabase, createApiServer } from "./index.js";

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Required deployment setting ${name} is missing`);
    return value;
}

function positiveInteger(name: string, fallback: number): number {
    const value = process.env[name];
    if (value === undefined || value === "") return fallback;
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`${name} must be a positive integer`);
    return Number(value);
}

function qualifiedToolBindings(): Array<{ bindingId: string; evidence: string }> {
    const raw = process.env.SDC_PUBLIC_API_TOOL_BINDINGS_JSON;
    if (!raw?.trim()) return [];
    const parsed: unknown = JSON.parse(raw);
    const isPolicy = (entry: unknown): entry is { bindingId: string; evidence: string } => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
        if (Object.keys(entry).sort().join(",") !== "bindingId,evidence") return false;
        const policy = entry as Record<string, unknown>;
        return typeof policy.bindingId === "string" && !!policy.bindingId.trim() &&
            typeof policy.evidence === "string" && !!policy.evidence.trim();
    };
    if (!Array.isArray(parsed) || !(parsed as unknown[]).every(isPolicy)) {
        throw new Error("SDC_PUBLIC_API_TOOL_BINDINGS_JSON must be an array of exact {bindingId,evidence} policies");
    }
    const policies = parsed as Array<{ bindingId: string; evidence: string }>;
    if (new Set(policies.map(({ bindingId }) => bindingId)).size !== policies.length) throw new Error("SDC public tool binding IDs must be unique");
    return policies;
}

async function main(): Promise<void> {
    const port = positiveInteger("SDC_SERVER_PORT", 3000);
    if (port > 65535) throw new Error("SDC_SERVER_PORT must be between 1 and 65535");
    const host = process.env.SDC_SERVER_HOST?.trim() || "127.0.0.1";
    const publicApiToolBindings = qualifiedToolBindings();
    const database = new ServerDatabase({ poolConfig: { connectionString: required("DATABASE_URL"), max: positiveInteger("SDC_DATABASE_POOL_SIZE", 20), connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000 } });
    let listener: ReturnType<typeof createApiServer> | undefined;
    let stopping = false;
    try {
        const authorization = new AuthorizationService(database);
        const provider = new KeycloakOidcProvider({
            issuer: required("SDC_OIDC_ISSUER"),
            ...(process.env.SDC_OIDC_BACKCHANNEL_ORIGIN ? { backchannelOrigin: process.env.SDC_OIDC_BACKCHANNEL_ORIGIN } : {}),
            clientId: required("SDC_OIDC_CLIENT_ID"),
            apiAudience: required("SDC_OIDC_API_AUDIENCE"),
            redirectUris: required("SDC_OIDC_REDIRECT_URIS").split(";").map((value) => value.trim()).filter(Boolean)
        });
        const decisionKeyPath = resolve(required("SDC_DECISION_PRIVATE_KEY_PATH"));
        const decisionPrivateKey = createPrivateKey(await readFile(decisionKeyPath));
        if (decisionPrivateKey.asymmetricKeyType !== "ed25519") throw new Error("SDC decision signing key must be Ed25519");
        const approvalEngine = new ApprovalEngine(database, authorization, { privateKey: decisionPrivateKey });
        const attachments = new AttachmentService(database, { rootDirectory: resolve(required("SDC_ATTACHMENT_DIR")) });

        await database.migrate();
        listener = createApiServer({ database, authorization, provider, approvalEngine, decisionPublicKey: createPublicKey(decisionPrivateKey), attachments,
            publicApiToolBindings });
        await new Promise<void>((resolveListen, rejectListen) => {
            listener!.once("error", rejectListen);
            listener!.listen(port, host, resolveListen);
        });
        process.stdout.write(`sdc-server listening on ${host}:${port}; migrations current; caller tools disabled unless an explicit binding policy is added\n`);

        const stop = (): void => {
            if (stopping) return;
            stopping = true;
            const forceClose = setTimeout(() => listener?.closeAllConnections(), 25_000);
            forceClose.unref();
            listener?.close(() => {
                clearTimeout(forceClose);
                void database.close().then(() => { process.exitCode = 0; }).catch(() => { process.exitCode = 1; });
            });
            listener?.closeIdleConnections();
        };
        process.once("SIGTERM", stop);
        process.once("SIGINT", stop);
    } catch (error) {
        listener?.closeAllConnections();
        listener?.close();
        await database.close().catch(() => undefined);
        throw error;
    }
}

void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown startup error";
    process.stderr.write(`sdc-server startup failed: ${message}\n`);
    process.exitCode = 1;
});
