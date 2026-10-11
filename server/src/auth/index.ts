import { createHash, createPublicKey, KeyObject, randomBytes, randomUUID, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import { canonicalJson, validateCapabilities, type CapabilitiesDocument, type Binding } from "@server-driven-chat/protocol";
import { ServerDatabase, StorageConflictError, StorageNotFoundError } from "../storage/index.js";

export const authModule = "server-auth" as const;
export type SessionRole = "owner" | "operator" | "viewer";
export type SessionPermission = "view" | "prompt" | "approve" | "administer";
export interface OidcPrincipal { kind: "user"; userId: string; issuer: string; subject: string; email: string; publicCredential?: { credentialId: string; tokenHash: string; sessionId: string; bindingId: string; scopes: readonly string[] } }
export interface OidcAccessIdentity { issuer: string; subject: string }
export interface OidcTokenSet { idToken?: string; accessToken: string; refreshToken?: string; expiresAt: number }
export interface DevicePrincipal { kind: "device"; deviceId: string; userId: string }
export type AuthPrincipal = OidcPrincipal | DevicePrincipal;
const authenticatedUsers = new WeakSet<object>();
const authenticatedDevices = new WeakSet<object>();
function requireAuthenticatedUser(principal: OidcPrincipal): void {
    if (principal.kind !== "user" || !authenticatedUsers.has(principal)) throw new Error("A provider-verified user principal is required");
}
function requireAuthenticatedDevice(principal: DevicePrincipal): void {
    if (principal.kind !== "device" || !authenticatedDevices.has(principal)) throw new Error("An authenticated device principal is required");
}
export type OidcAuthorizationRequest = { authorizationUrl: string; state: string; nonce: string; codeVerifier: string };
export interface AuthenticationProvider {
    createAuthorizationRequest(redirectUri: string, now?: number): Promise<OidcAuthorizationRequest>;
    exchangeAuthorizationCode(code: string, redirectUri: string, state: string, nonce: string, codeVerifier: string, expectedState: string): Promise<OidcTokenSet>;
    refreshTokens(refreshToken: string, expectedIdentity: OidcAccessIdentity): Promise<OidcTokenSet>;
    verifyIdToken(idToken: string, expectedNonce?: string, now?: number): Promise<OidcPrincipal>;
    verifyAccessToken(accessToken: string, now?: number): Promise<OidcAccessIdentity>;
}

type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string };
type OidcJwk = JsonWebKey & { kid?: string; use?: string; alg?: string; kty?: string };
type JwtClaims = { iss?: string; sub?: string; aud?: string | string[]; exp?: number; iat?: number; nonce?: string; email?: string; email_verified?: boolean; azp?: string };

/** OIDC authorization-code + PKCE client for a public native companion and Keycloak-compatible issuer. */
export class KeycloakOidcProvider implements AuthenticationProvider {
    readonly #issuer: string;
    readonly #backchannelOrigin?: string;
    readonly #clientId: string;
    readonly #apiAudience: string;
    readonly #redirectUris: Set<string>;
    #discovery?: { value: Discovery; expiresAt: number };
    #keys?: { value: OidcJwk[]; expiresAt: number };

    constructor(options: { issuer: string; clientId: string; apiAudience: string; redirectUris: string[]; backchannelOrigin?: string }) {
        if (!options.redirectUris.length) throw new TypeError("At least one exact OIDC redirect URI must be configured");
        const issuer = new URL(options.issuer);
        if ((issuer.protocol !== "https:" && issuer.hostname !== "localhost" && issuer.hostname !== "127.0.0.1") || issuer.username || issuer.password || issuer.search || issuer.hash)
            throw new TypeError("OIDC issuer must use HTTPS (except loopback development) and cannot include userinfo, query, or fragment");
        if (!options.clientId || !options.apiAudience) throw new TypeError("OIDC client ID and API audience are required");
        this.#issuer = issuer.toString();
        if (options.backchannelOrigin) {
            const internal = new URL(options.backchannelOrigin);
            if (internal.protocol !== "https:" || internal.username || internal.password || internal.pathname !== "/" || internal.search || internal.hash)
                throw new TypeError("OIDC backchannel must be an exact HTTPS origin");
            this.#backchannelOrigin = internal.origin;
        }
        this.#clientId = options.clientId;
        this.#apiAudience = options.apiAudience;
        this.#redirectUris = new Set(options.redirectUris.map((uri) => new URL(uri).toString()));
    }

    async #fetch(input: string, init?: RequestInit): Promise<Response> {
        const target = new URL(input);
        if (this.#backchannelOrigin) {
            if (target.origin !== new URL(this.#issuer).origin) throw new Error("OIDC backchannel endpoint must share the public issuer origin");
            const internal = new URL(this.#backchannelOrigin);
            target.protocol = internal.protocol;
            target.host = internal.host;
        }
        const headers = new Headers(init?.headers);
        if (this.#backchannelOrigin) headers.set("host", new URL(this.#issuer).host);
        return fetch(target, { ...init, headers, redirect: "error" });
    }

    async createAuthorizationRequest(redirectUri: string, now = Date.now()): Promise<OidcAuthorizationRequest> {
        const redirect = this.#assertRedirectUri(redirectUri);
        const discovery = await this.#getDiscovery(now);
        const state = randomBytes(32).toString("base64url");
        const nonce = randomBytes(32).toString("base64url");
        const codeVerifier = randomBytes(32).toString("base64url");
        const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
        const url = new URL(discovery.authorization_endpoint);
        url.searchParams.set("client_id", this.#clientId);
        url.searchParams.set("redirect_uri", redirect.toString());
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "openid profile email");
        url.searchParams.set("state", state);
        url.searchParams.set("nonce", nonce);
        url.searchParams.set("code_challenge", challenge);
        url.searchParams.set("code_challenge_method", "S256");
        return { authorizationUrl: url.toString(), state, nonce, codeVerifier };
    }

    async exchangeAuthorizationCode(code: string, redirectUri: string, state: string, nonce: string, codeVerifier: string, expectedState: string): Promise<OidcTokenSet> {
        if (!state || state !== expectedState) throw new Error("OIDC state mismatch");
        this.#assertRedirectUri(redirectUri);
        if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) throw new TypeError("Invalid PKCE verifier");
        const discovery = await this.#getDiscovery(Date.now());
        const tokenResponse = await this.#fetch(discovery.token_endpoint, { method: "POST", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ grant_type: "authorization_code", client_id: this.#clientId, code, redirect_uri: redirectUri, code_verifier: codeVerifier }) });
        if (!tokenResponse.ok) throw new Error(`OIDC code exchange failed with HTTP ${tokenResponse.status}`);
        const body = await tokenResponse.json() as { id_token?: unknown; access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
        if (typeof body.id_token !== "string" || typeof body.access_token !== "string" || !isValidTokenLifetime(body.expires_in)) throw new Error("OIDC token response omitted a required ID/access token or has an invalid expiry");
        const userIdentity = await this.verifyIdToken(body.id_token, nonce);
        const accessIdentity = await this.verifyAccessToken(body.access_token);
        if (userIdentity.issuer !== accessIdentity.issuer || userIdentity.subject !== accessIdentity.subject) throw new Error("OIDC code exchange returned tokens for different identities");
        return { idToken: body.id_token, accessToken: body.access_token, ...(typeof body.refresh_token === "string" ? { refreshToken: body.refresh_token } : {}), expiresAt: Date.now() + body.expires_in * 1000 };
    }

    async refreshTokens(refreshToken: string, expectedIdentity: OidcAccessIdentity): Promise<OidcTokenSet> {
        if (!refreshToken) throw new TypeError("A Keychain-stored refresh token is required");
        const discovery = await this.#getDiscovery(Date.now());
        const response = await this.#fetch(discovery.token_endpoint, { method: "POST", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ grant_type: "refresh_token", client_id: this.#clientId, refresh_token: refreshToken }) });
        if (!response.ok) throw new Error(`OIDC refresh failed with HTTP ${response.status}`);
        const body = await response.json() as { id_token?: unknown; access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
        if (typeof body.access_token !== "string" || !isValidTokenLifetime(body.expires_in)) throw new Error("OIDC refresh response omitted a required access token or has an invalid expiry");
        const accessIdentity = await this.verifyAccessToken(body.access_token);
        if (accessIdentity.issuer !== expectedIdentity.issuer || accessIdentity.subject !== expectedIdentity.subject)
            throw new Error("OIDC refresh returned credentials for a different identity");
        let idToken: string | undefined;
        if (typeof body.id_token === "string") {
            const idPrincipal = await this.verifyIdToken(body.id_token);
            if (idPrincipal.issuer !== expectedIdentity.issuer || idPrincipal.subject !== expectedIdentity.subject) throw new Error("OIDC refresh returned an ID token for a different identity");
            idToken = body.id_token;
        }
        return { ...(idToken ? { idToken } : {}), accessToken: body.access_token, refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : refreshToken, expiresAt: Date.now() + body.expires_in * 1000 };
    }

    async verifyIdToken(idToken: string, expectedNonce?: string, now = Date.now()): Promise<OidcPrincipal> {
        const claims = await this.#verifySignedClaims(idToken, now);
        const seconds = Math.floor(now / 1000);
        const invalidClaims = [
            claims.iss !== this.#issuer && "issuer", !this.#audienceMatches(claims, this.#clientId) && "audience",
            (!Number.isSafeInteger(claims.exp) || claims.exp! <= seconds) && "expiry",
            (!Number.isSafeInteger(claims.iat) || claims.iat! > seconds + 60 || claims.iat! < seconds - 86400) && "issued-at",
            (expectedNonce !== undefined && claims.nonce !== expectedNonce) && "nonce", (typeof claims.sub !== "string" || !claims.sub) && "subject",
            (typeof claims.email !== "string" || claims.email_verified !== true) && "verified-email"
        ].filter(Boolean);
        if (invalidClaims.length) throw new Error(`OIDC ID token claims are invalid: ${invalidClaims.join(", ")}`);
        const issuer = claims.iss as string; const subject = claims.sub as string; const email = claims.email as string;
        return { kind: "user", userId: await stableUserId(issuer, subject), issuer, subject, email };
    }

    async verifyAccessToken(accessToken: string, now = Date.now()): Promise<OidcAccessIdentity> {
        const claims = await this.#verifySignedClaims(accessToken, now);
        const seconds = Math.floor(now / 1000);
        if (claims.iss !== this.#issuer || !this.#audienceMatches(claims, this.#apiAudience) || !Number.isSafeInteger(claims.exp) || claims.exp! <= seconds ||
            !Number.isSafeInteger(claims.iat) || claims.iat! > seconds + 60 || claims.iat! < seconds - 86400 || typeof claims.sub !== "string" || !claims.sub)
            throw new Error("OIDC access token claims are invalid or expired");
        return { issuer: claims.iss, subject: claims.sub };
    }

    async #verifySignedClaims(token: string, now: number): Promise<JwtClaims> {
        const parts = token.split(".");
        if (parts.length !== 3) throw new Error("Malformed OIDC ID token");
        const header = this.#decodeJson(parts[0]) as { alg?: string; kid?: string; typ?: string };
        const claims = this.#decodeJson(parts[1]) as JwtClaims;
        if (header.alg !== "RS256" || !header.kid) throw new Error("OIDC ID token must use a known RS256 signing key");
        const discovery = await this.#getDiscovery(now);
        const keys = await this.#getKeys(discovery.jwks_uri, now);
        const matches = keys.filter((key) => key.kid === header.kid && key.kty === "RSA" && (key.use === undefined || key.use === "sig") && (key.alg === undefined || key.alg === "RS256"));
        if (matches.length !== 1 || Buffer.from(String(matches[0].n ?? ""), "base64url").length < 256) throw new Error("OIDC signing key is missing, weak, or ambiguous");
        const publicKey = createPublicKey({ key: matches[0], format: "jwk" });
        const valid = cryptoVerify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], "base64url"));
        if (!valid) throw new Error("Invalid OIDC ID token signature");
        return claims;
    }

    async #getDiscovery(now: number): Promise<Discovery> {
        if (this.#discovery && this.#discovery.expiresAt > now) return this.#discovery.value;
        const response = await this.#fetch(`${this.#issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`OIDC discovery failed with HTTP ${response.status}`);
        const data = await response.json() as Discovery;
        if (data.issuer !== this.#issuer) throw new Error("OIDC discovery issuer did not match configured issuer");
        for (const endpoint of [data.authorization_endpoint, data.token_endpoint, data.jwks_uri]) {
            const url = new URL(endpoint);
            if (this.#backchannelOrigin && url.origin !== new URL(this.#issuer).origin) throw new Error("OIDC backchannel metadata must share the public issuer origin");
            if ((url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") || url.username || url.password || url.hash) throw new Error("OIDC metadata contains an unsafe endpoint");
        }
        this.#discovery = { value: data, expiresAt: now + 300_000 };
        return data;
    }

    async #getKeys(uri: string, now: number): Promise<OidcJwk[]> {
        if (this.#keys && this.#keys.expiresAt > now) return this.#keys.value;
        const response = await this.#fetch(uri, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`OIDC JWKS request failed with HTTP ${response.status}`);
        const data = await response.json() as { keys?: OidcJwk[] };
        if (!Array.isArray(data.keys)) throw new Error("OIDC JWKS response is malformed");
        this.#keys = { value: data.keys, expiresAt: now + 300_000 };
        return data.keys;
    }

    #audienceMatches(claims: JwtClaims, audience: string): boolean {
        const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        return audiences.includes(audience) && (audiences.length <= 1 || claims.azp === this.#clientId);
    }

    #assertRedirectUri(value: string): URL {
        const redirect = new URL(value);
        if (redirect.hash || !this.#redirectUris.has(redirect.toString())) throw new TypeError("OIDC redirect URI is not an exact configured callback");
        return redirect;
    }

    #decodeJson(value: string): unknown {
        try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
        catch { throw new Error("Malformed JWT JSON"); }
    }
}

async function stableUserId(issuer: string, subject: string): Promise<string> {
    return `oidc-${createHash("sha256").update(`${issuer}\u0000${subject}`).digest("hex")}`;
}

export interface PairingStart { pairingId: string; deviceId: string; pairingCode: string; localConfirmationSecret: string; expiresAt: string }
export interface DeviceCredential { deviceId: string; credential: string; expiresAt: string }
export interface DecisionAssertionClaims {
    typ: "sdc-decision-v1"; assertionId: string; decisionId: string; sessionId: string; deviceId: string; bindingId: string;
    bindingRevision: number; leaseGeneration: number; turnId: string; requestId: string; requestRevision: number; actionDigest: string;
    choiceId: string; grantedPermissions: unknown[]; policyRevision: string; reviewerId: string; issuedAt: number; expiresAt: number;
}

const hashSecret = (value: string): string => createHash("sha256").update(value).digest("hex");
const isValidTokenLifetime = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 86_400;
const base32 = (bytes: Buffer): string => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let bits = 0; let value = 0; let result = "";
    for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
    if (bits) result += alphabet[(value << (5 - bits)) & 31];
    return result;
};

/** Server-side identity, pairing, device credential, and session authorization primitives. */
export class AuthorizationService {
    constructor(readonly database: ServerDatabase, readonly options: { deviceCredentialTtlSeconds?: number; pairingTtlSeconds?: number; now?: () => number } = {}) {
        const pairingTtl = options.pairingTtlSeconds ?? 300;
        const credentialTtl = options.deviceCredentialTtlSeconds ?? 30 * 86400;
        if (!Number.isSafeInteger(pairingTtl) || pairingTtl < 30 || pairingTtl > 600) throw new RangeError("Pairing expiry must be between 30 and 600 seconds");
        if (!Number.isSafeInteger(credentialTtl) || credentialTtl < 60 || credentialTtl > 90 * 86400) throw new RangeError("Device credential expiry must be between 60 seconds and 90 days");
    }
    #now(): number { return this.options.now?.() ?? Date.now(); }

    async completeOidcSignIn(provider: AuthenticationProvider, idToken: string, expectedNonce: string): Promise<OidcPrincipal> {
        const principal = await provider.verifyIdToken(idToken, expectedNonce, this.#now());
        const expectedId = await stableUserId(principal.issuer, principal.subject);
        if (principal.userId !== expectedId) throw new Error("OIDC identity was not produced by the configured authentication provider");
        await this.database.transaction(async (client) => {
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`oidc:${principal.issuer}:${principal.subject}`]);
            const existing = await client.query<{ user_id: string }>("SELECT user_id FROM oidc_identities WHERE issuer=$1 AND subject=$2 FOR UPDATE", [principal.issuer, principal.subject]);
            if (existing.rowCount) {
                if (existing.rows[0].user_id !== principal.userId) throw new StorageConflictError("OIDC subject is linked to another user");
                await client.query("UPDATE app_users SET email=$2 WHERE user_id=$1 AND email<>$2", [principal.userId, principal.email]);
                return;
            }
            await client.query("INSERT INTO app_users(user_id,email) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING", [principal.userId, principal.email]);
            const byEmail = await client.query<{ user_id: string }>("SELECT user_id FROM app_users WHERE email=$1", [principal.email]);
            if (!byEmail.rowCount || byEmail.rows[0].user_id !== principal.userId) throw new StorageConflictError("Verified email is already linked to a different identity");
            await client.query("INSERT INTO oidc_identities(issuer,subject,user_id) VALUES($1,$2,$3)", [principal.issuer, principal.subject, principal.userId]);
        });
        Object.freeze(principal);
        authenticatedUsers.add(principal);
        return principal;
    }

    async authenticateUserAccessToken(provider: AuthenticationProvider, accessToken: string): Promise<OidcPrincipal> {
        const identity = await provider.verifyAccessToken(accessToken, this.#now());
        const result = await this.database.pool.query<{ user_id: string; email: string }>("SELECT i.user_id,u.email FROM oidc_identities i JOIN app_users u USING(user_id) WHERE i.issuer=$1 AND i.subject=$2", [identity.issuer, identity.subject]);
        if (!result.rowCount) throw new Error("OIDC access token identity has not completed sign-in on this server");
        const principal = { kind: "user" as const, userId: result.rows[0].user_id, issuer: identity.issuer, subject: identity.subject, email: result.rows[0].email };
        Object.freeze(principal);
        authenticatedUsers.add(principal);
        return principal;
    }

    /** Authenticate an SDC caller key only at the public boundary; never a bridge credential. */
    async authenticatePublicCredential(token: string): Promise<OidcPrincipal> {
        if (!/^sdc_api_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Invalid public credential");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const rows = await this.database.pool.query<{credential_id: string; owner_user_id: string; session_id: string; binding_id: string; scopes: string[]; email: string}>(
            "SELECT c.*,u.email FROM public_credentials c JOIN app_users u ON u.user_id=c.owner_user_id WHERE c.token_hash=$1 AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp()", [tokenHash]);
        if (!rows.rowCount) throw new Error("Public credential expired or revoked");
        const row = rows.rows[0];
        const principal: OidcPrincipal = {kind: "user",userId: row.owner_user_id,issuer: "sdc:public",subject: row.credential_id,email: row.email,
            publicCredential: Object.freeze({credentialId: row.credential_id,tokenHash,sessionId: row.session_id,bindingId: row.binding_id,scopes: Object.freeze([...row.scopes])})};
        Object.freeze(principal); authenticatedUsers.add(principal); return principal;
    }

    /** Recover only the authority of an already admitted public operation, rechecking live roles/key fences.
     * This is for server reconciliation; it cannot mint arbitrary user or device authority.
     */
    async authenticateStoredPublicOperation(operationId: string): Promise<OidcPrincipal> {
        const rows = await this.database.pool.query<{owner_user_id:string;session_id:string;credential_id:string|null;token_hash:string;binding_id:string;scopes:string[];email:string}>(
            `SELECT o.owner_user_id,o.session_id,a.credential_id,k.token_hash,k.binding_id,k.scopes,u.email
             FROM public_operations o JOIN public_command_authority a USING(command_id)
             JOIN app_users u ON u.user_id=o.owner_user_id LEFT JOIN public_credentials k USING(credential_id)
             WHERE o.operation_id=$1 AND o.expires_at>clock_timestamp() AND a.owner_user_id=o.owner_user_id
             AND a.permission='prompt' AND (a.credential_id IS NULL OR (k.revoked_at IS NULL AND k.expires_at>clock_timestamp()))`, [operationId]);
        if (!rows.rowCount) throw new Error("Retained public operation authority expired or was revoked");
        const row=rows.rows[0];
        const principal: OidcPrincipal={kind:"user",userId:row.owner_user_id,issuer:"sdc:durable-operation",subject:operationId,email:row.email,
            ...(row.credential_id ? {publicCredential:Object.freeze({credentialId:row.credential_id,tokenHash:row.token_hash,sessionId:row.session_id,bindingId:row.binding_id,scopes:Object.freeze([...row.scopes])})} : {})};
        Object.freeze(principal); authenticatedUsers.add(principal);
        await this.authorizeUser(principal,row.session_id,"view");
        return principal;
    }

    async startPairing(principal: OidcPrincipal, label: string, localSecret?: string): Promise<PairingStart> {
        requireAuthenticatedUser(principal);
        if (principal.publicCredential) throw new Error("A human identity is required for pairing/device management");
        if (!label.trim() || label.length > 120) throw new TypeError("Device label must be 1–120 characters");
        const pairingId = randomUUID(); const deviceId = randomUUID();
        const pairingCode = base32(randomBytes(8)); const localConfirmationSecret = localSecret ?? randomBytes(32).toString("base64url");
        if (!/^[A-Za-z0-9_-]{43,128}$/.test(localConfirmationSecret)) throw new TypeError("Local pairing secret must be a 32-byte base64url value");
        const expiresAt = new Date(this.#now() + (this.options.pairingTtlSeconds ?? 300) * 1000).toISOString();
        await this.database.transaction(async (client) => {
            await client.query("INSERT INTO devices(device_id,user_id,status,payload) VALUES($1,$2,'pending',$3::jsonb)", [deviceId, principal.userId, canonicalJson({ label: label.trim(), kind: "companion" })]);
            await client.query("INSERT INTO pairing_requests(pairing_id,device_id,user_id,pairing_code_hash,local_challenge_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)", [pairingId, deviceId, principal.userId, hashSecret(pairingCode), hashSecret(localConfirmationSecret), expiresAt]);
        });
        return { pairingId, deviceId, pairingCode, localConfirmationSecret, expiresAt };
    }

    async confirmPairingOnServer(principal: OidcPrincipal, pairingCode: string): Promise<{ pairingId: string; expiresAt: string }> {
        requireAuthenticatedUser(principal);
        if (principal.publicCredential) throw new Error("A human identity is required for pairing/device management");
        return this.database.transaction(async (client) => {
            const row = await client.query<{ pairing_id: string; user_id: string; expires_at: Date; consumed_at: Date | null; server_confirmed_at: Date | null }>("SELECT pairing_id,user_id,expires_at,consumed_at,server_confirmed_at FROM pairing_requests WHERE pairing_code_hash=$1 FOR UPDATE", [hashSecret(pairingCode)]);
            if (!row.rowCount || row.rows[0].user_id !== principal.userId || row.rows[0].consumed_at || row.rows[0].server_confirmed_at || row.rows[0].expires_at.getTime() <= this.#now()) throw new Error("Pairing code is wrong, expired, or already used");
            await client.query("UPDATE pairing_requests SET server_confirmed_at=COALESCE(server_confirmed_at,now()) WHERE pairing_id=$1", [row.rows[0].pairing_id]);
            return { pairingId: row.rows[0].pairing_id, expiresAt: row.rows[0].expires_at.toISOString() };
        });
    }

    /** Call only from the local native consent action; server confirmation alone cannot activate a device. */
    async confirmPairingLocally(pairingId: string, localConfirmationSecret: string, explicitConsent: boolean): Promise<DeviceCredential> {
        if (explicitConsent !== true) throw new Error("Local user consent is required to pair a device");
        const credential = `sdc_dev_${randomBytes(32).toString("base64url")}`;
        const credentialId = randomUUID();
        const expiresAt = new Date(this.#now() + (this.options.deviceCredentialTtlSeconds ?? 30 * 86400) * 1000).toISOString();
        await this.database.transaction(async (client) => {
            const selected = await client.query<{ device_id: string; user_id: string; expires_at: Date; server_confirmed_at: Date | null; consumed_at: Date | null; local_challenge_hash: string }>("SELECT device_id,user_id,expires_at,server_confirmed_at,consumed_at,local_challenge_hash FROM pairing_requests WHERE pairing_id=$1 FOR UPDATE", [pairingId]);
            const row = selected.rows[0];
            if (!row || row.local_challenge_hash !== hashSecret(localConfirmationSecret) || !row.server_confirmed_at || row.consumed_at || row.expires_at.getTime() <= this.#now()) throw new Error("Pairing is unconfirmed, expired, already used, or does not belong to this device");
            await client.query("UPDATE pairing_requests SET local_confirmed_at=now(),consumed_at=now() WHERE pairing_id=$1", [pairingId]);
            await client.query("UPDATE devices SET status='active' WHERE device_id=$1 AND status='pending'", [row.device_id]);
            await client.query("INSERT INTO device_credentials(credential_id,device_id,token_hash,expires_at) VALUES($1,$2,$3,$4)", [credentialId, row.device_id, hashSecret(credential), expiresAt]);
        });
        const result = await this.database.pool.query<{ device_id: string }>("SELECT device_id FROM pairing_requests WHERE pairing_id=$1", [pairingId]);
        if (!result.rowCount) throw new StorageNotFoundError("Paired device disappeared after activation");
        return { deviceId: result.rows[0].device_id, credential, expiresAt };
    }

    async authenticateDevice(credential: string): Promise<DevicePrincipal> {
        const result = await this.database.pool.query<{ device_id: string; user_id: string }>("SELECT d.device_id,d.user_id FROM device_credentials c JOIN devices d USING(device_id) WHERE c.token_hash=$1 AND c.revoked_at IS NULL AND c.expires_at>now() AND d.status='active'", [hashSecret(credential)]);
        if (!result.rowCount) throw new Error("Device credential is invalid, expired, or revoked");
        const principal = { kind: "device" as const, deviceId: result.rows[0].device_id, userId: result.rows[0].user_id };
        Object.freeze(principal);
        authenticatedDevices.add(principal);
        return principal;
    }

    /** Device-owned registration; credentials and ownership are checked again inside the write transaction. */
    async registerBinding(principal: DevicePrincipal, credential: string, binding: Binding, conversationRevision: number, capabilities?: CapabilitiesDocument): Promise<void> {
        requireAuthenticatedDevice(principal);
        const fields = ["appId", "appInstanceId", "bindingId", "sessionId", "nativeConversationId", "conversationId", "capabilitiesRevision"] as const;
        if (!binding || typeof binding !== "object" || fields.some(key => typeof binding[key] !== "string" || !binding[key].length || binding[key].length > 2048) ||
            binding.conversationId !== binding.nativeConversationId || binding.bindingRevision !== 1 || binding.leaseGeneration !== 1 || !Number.isSafeInteger(conversationRevision) || conversationRevision < 0 ||
            Object.keys(binding).some(key => ![...fields, "workspaceId", "accountId", "bindingRevision", "leaseGeneration"].includes(key as typeof fields[number]))) throw new TypeError("Invalid initial binding");
        for (const key of ["workspaceId", "accountId"] as const) if (binding[key] !== undefined && (typeof binding[key] !== "string" || !binding[key]!.length || binding[key]!.length > 2048)) throw new TypeError("Invalid binding identity");
        if (capabilities !== undefined && (!validateCapabilities(capabilities).valid || capabilities.appId !== binding.appId)) throw new TypeError("Invalid binding capabilities");
        await this.database.transaction(async client => {
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`connect:${binding.sessionId}`]);
            const device = await client.query("SELECT d.device_id FROM devices d JOIN device_credentials c USING(device_id) WHERE d.device_id=$1 AND d.user_id=$2 AND d.status='active' AND c.token_hash=$3 AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() FOR UPDATE OF d,c", [principal.deviceId, principal.userId, hashSecret(credential)]);
            if (!device.rowCount) throw new Error("Device credential changed before binding registration");
            const session = await client.query("SELECT owner_user_id,state FROM sessions WHERE session_id=$1 FOR UPDATE", [binding.sessionId]);
            if (session.rowCount && (session.rows[0].owner_user_id !== principal.userId || session.rows[0].state !== "active")) throw new Error("Session ownership or state does not permit registration");
            if (!session.rowCount) await client.query("INSERT INTO sessions(session_id,owner_user_id) VALUES($1,$2)", [binding.sessionId, principal.userId]);
            const existing = await client.query("SELECT binding_id,device_id,state,payload FROM bindings WHERE session_id=$1 FOR UPDATE", [binding.sessionId]);
            if (existing.rowCount) {
                if (existing.rowCount !== 1 || existing.rows[0].binding_id !== binding.bindingId || existing.rows[0].device_id !== principal.deviceId || existing.rows[0].state !== "active" || canonicalJson(existing.rows[0].payload.binding) !== canonicalJson(binding)) throw new StorageConflictError("Connect binding conflicts with existing session");
                return;
            }
            await client.query("INSERT INTO bindings(binding_id,session_id,device_id,binding_revision,lease_generation,state,payload,lease_expires_at) VALUES($1,$2,$3,1,1,'active',$4::jsonb,clock_timestamp()+interval '60 seconds')", [binding.bindingId, binding.sessionId, principal.deviceId, canonicalJson({ binding, conversationRevision, ...(capabilities ? { capabilities: capabilities.operations, capabilityReport: capabilities } : {}) })]);
        });
    }

    async detachBinding(principal: DevicePrincipal, credential: string, bindingId: string): Promise<void> {
        requireAuthenticatedDevice(principal);
        await this.database.transaction(async client => {
            const device = await client.query("SELECT d.device_id FROM devices d JOIN device_credentials c USING(device_id) WHERE d.device_id=$1 AND d.status='active' AND c.token_hash=$2 AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() FOR UPDATE OF d,c", [principal.deviceId, hashSecret(credential)]);
            if (!device.rowCount) throw new Error("Device credential changed before binding disconnection");
            await client.query("UPDATE bindings SET state='detached',lease_expires_at=NULL WHERE binding_id=$1 AND device_id=$2 AND state='active'", [bindingId, principal.deviceId]);
        });
    }

    async rotateDeviceCredential(principal: DevicePrincipal, currentCredential: string): Promise<DeviceCredential> {
        requireAuthenticatedDevice(principal);
        const replacement = `sdc_dev_${randomBytes(32).toString("base64url")}`; const replacementId = randomUUID();
        const expiresAt = new Date(this.#now() + (this.options.deviceCredentialTtlSeconds ?? 30 * 86400) * 1000).toISOString();
        await this.database.transaction(async (client) => {
            const current = await client.query<{ credential_id: string }>("SELECT c.credential_id FROM device_credentials c JOIN devices d USING(device_id) WHERE c.device_id=$1 AND c.token_hash=$2 AND c.revoked_at IS NULL AND c.expires_at>now() AND d.status='active' FOR UPDATE OF c", [principal.deviceId, hashSecret(currentCredential)]);
            if (!current.rowCount) throw new Error("Current device credential is invalid or revoked");
            await client.query("UPDATE device_credentials SET revoked_at=now() WHERE credential_id=$1", [current.rows[0].credential_id]);
            await client.query("INSERT INTO device_credentials(credential_id,device_id,token_hash,expires_at) VALUES($1,$2,$3,$4)", [replacementId, principal.deviceId, hashSecret(replacement), expiresAt]);
            await client.query("UPDATE device_credentials SET replaced_by_credential_id=$2 WHERE credential_id=$1", [current.rows[0].credential_id, replacementId]);
        });
        return { deviceId: principal.deviceId, credential: replacement, expiresAt };
    }

    async revokeDevice(principal: OidcPrincipal, deviceId: string): Promise<void> {
        requireAuthenticatedUser(principal);
        if (principal.publicCredential) throw new Error("A human identity is required for pairing/device management");
        await this.database.transaction(async (client) => {
            const device = await client.query("UPDATE devices SET status='revoked' WHERE device_id=$1 AND user_id=$2 RETURNING device_id", [deviceId, principal.userId]);
            if (!device.rowCount) throw new StorageNotFoundError("Device not found or not owned by this user");
            await client.query("UPDATE device_credentials SET revoked_at=COALESCE(revoked_at,now()) WHERE device_id=$1", [deviceId]);
            await client.query("UPDATE bindings SET state='revoked' WHERE device_id=$1 AND state='active'", [deviceId]);
        });
    }

    async setSessionRole(actor: OidcPrincipal, sessionId: string, targetUserId: string, role: "operator" | "viewer"): Promise<void> {
        requireAuthenticatedUser(actor);
        if (actor.publicCredential) throw new Error("A human identity is required for membership management");
        const result = await this.database.pool.query("INSERT INTO session_memberships(session_id,user_id,role,granted_by_user_id) SELECT $1,$2,$3,$4 FROM sessions WHERE session_id=$1 AND owner_user_id=$4 ON CONFLICT(session_id,user_id) DO UPDATE SET role=EXCLUDED.role,granted_by_user_id=EXCLUDED.granted_by_user_id", [sessionId, targetUserId, role, actor.userId]);
        if (!result.rowCount) throw new Error("Only the session owner can assign a role to an existing session");
    }

    async revokeSessionRole(actor: OidcPrincipal, sessionId: string, targetUserId: string): Promise<boolean> {
        requireAuthenticatedUser(actor);
        if (actor.publicCredential) throw new Error("A human identity is required for membership management");
        const result = await this.database.pool.query("DELETE FROM session_memberships m USING sessions s WHERE m.session_id=s.session_id AND m.session_id=$1 AND m.user_id=$2 AND s.owner_user_id=$3 RETURNING m.user_id", [sessionId, targetUserId, actor.userId]);
        if (result.rowCount) return true;
        const owner = await this.database.pool.query("SELECT 1 FROM sessions WHERE session_id=$1 AND owner_user_id=$2", [sessionId, actor.userId]);
        if (!owner.rowCount) throw new Error("Only the session owner can revoke a role");
        return false;
    }

    async authorizeUser(principal: OidcPrincipal, sessionId: string, permission: SessionPermission): Promise<SessionRole> {
        requireAuthenticatedUser(principal);
        if (principal.publicCredential) {
            const key = principal.publicCredential;
            if (key.sessionId !== sessionId || !key.scopes.includes(permission)) throw new Error("Session permission denied: public credential scope");
            const active = await this.database.pool.query("SELECT 1 FROM public_credentials c JOIN bindings b USING(binding_id) WHERE c.credential_id=$1 AND c.token_hash=$2 AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() AND (($3='view' AND NOT EXISTS (SELECT 1 FROM bindings newer WHERE newer.session_id=b.session_id AND newer.binding_revision>b.binding_revision)) OR ($3<>'view' AND b.state='active' AND b.lease_expires_at>clock_timestamp()))", [key.credentialId,key.tokenHash,permission]);
            if (!active.rowCount) throw new Error("Session permission denied: public credential revoked or expired");
        }
        const result = await this.database.pool.query<{ owner_user_id: string; role: "operator" | "viewer" | null }>("SELECT s.owner_user_id,m.role FROM sessions s LEFT JOIN session_memberships m ON m.session_id=s.session_id AND m.user_id=$2 WHERE s.session_id=$1", [sessionId, principal.userId]);
        if (!result.rowCount) throw new StorageNotFoundError("Session does not exist");
        const role: SessionRole | null = result.rows[0].owner_user_id === principal.userId ? "owner" : result.rows[0].role;
        const allowed = role === "owner" || (role === "operator" && (permission === "view" || permission === "prompt")) || (role === "viewer" && permission === "view");
        if (!allowed || !role) throw new Error(`Session permission denied: ${permission}`);
        return role;
    }

    async authorizeDevice(principal: DevicePrincipal, sessionId: string, operation: "read_commands" | "write_events"): Promise<void> {
        requireAuthenticatedDevice(principal);
        const result = await this.database.pool.query("SELECT 1 FROM devices d JOIN bindings b USING(device_id) WHERE d.device_id=$1 AND d.status='active' AND b.session_id=$2 AND b.state='active' AND ($3<>'read_commands' OR b.lease_expires_at>now())", [principal.deviceId, sessionId, operation]);
        if (!result.rowCount) throw new Error("Device is not actively bound to this session");
    }

    async createDecisionAssertion(principal: OidcPrincipal, input: Omit<DecisionAssertionClaims, "typ" | "assertionId" | "reviewerId" | "issuedAt">, privateKey: KeyObject | string): Promise<string> {
        requireAuthenticatedUser(principal);
        await this.authorizeUser(principal, input.sessionId, "approve");
        const now = Math.floor(this.#now() / 1000);
        if (input.expiresAt <= now || input.expiresAt > now + 300) throw new TypeError("Decision assertion expiry must be within five minutes");
        const binding = await this.database.pool.query("SELECT 1 FROM bindings WHERE binding_id=$1 AND session_id=$2 AND device_id=$3 AND binding_revision=$4 AND lease_generation=$5 AND state='active'", [input.bindingId, input.sessionId, input.deviceId, input.bindingRevision, input.leaseGeneration]);
        if (!binding.rowCount) throw new Error("Decision assertion binding is stale or inactive");
        const interaction = await this.database.pool.query<{ state: string; payload: Record<string, unknown> }>("SELECT state,payload FROM interactions WHERE session_id=$1 AND request_id=$2 AND request_revision=$3 AND kind='approval'", [input.sessionId, input.requestId, input.requestRevision]);
        if (!interaction.rowCount || interaction.rows[0].state !== "pending" || interaction.rows[0].payload.actionDigest !== input.actionDigest) throw new Error("Decision does not match an exact pending approval request");
        const request = interaction.rows[0].payload;
        if (request.sessionId !== input.sessionId || request.bindingId !== input.bindingId || request.bindingRevision !== input.bindingRevision ||
            request.leaseGeneration !== input.leaseGeneration || request.turnId !== input.turnId) throw new Error("Decision binding, lease, or turn does not match the stored approval request");
        const choices = request.availableDecisions;
        const choice = Array.isArray(choices) ? choices.find((item) => typeof item === "object" && item !== null && (item as Record<string, unknown>).id === input.choiceId) as Record<string, unknown> | undefined : undefined;
        if (!choice) throw new Error("Decision choice was not offered for this pending request");
        if (choice.effect !== "allow" && input.grantedPermissions.length) throw new TypeError("Deny/cancel decisions cannot carry permission grants");
        const requestedPermissions = request.requestedPermissions;
        if (!Array.isArray(requestedPermissions) || input.grantedPermissions.some((grant) => !requestedPermissions.some((offered: unknown) => canonicalJson(offered) === canonicalJson(grant)))) throw new Error("Granted permissions exceed the exact permissions requested by the app");
        const requestExpiry = typeof request.expiresAt === "string" ? Date.parse(request.expiresAt) : Number.NaN;
        if (!Number.isFinite(requestExpiry) || input.expiresAt * 1000 > requestExpiry) throw new Error("Decision assertion cannot outlive the pending approval request");
        if (!/^sha256:[a-f0-9]{64}$/.test(input.actionDigest) || !input.policyRevision) throw new TypeError("Decision assertion identity or digest is malformed");
        const claims: DecisionAssertionClaims = { ...input, typ: "sdc-decision-v1", assertionId: randomUUID(), reviewerId: principal.userId, issuedAt: now };
        const body = Buffer.from(canonicalJson(claims)).toString("base64url");
        return `sdc1.${body}.${cryptoSign(null, Buffer.from(body), privateKey).toString("base64url")}`;
    }

    async consumeDecisionAssertion(token: string, publicKey: KeyObject | string, device: DevicePrincipal): Promise<DecisionAssertionClaims> {
        requireAuthenticatedDevice(device);
        const claims = verifyDecisionAssertion(token, publicKey, device.deviceId, this.#now());
        await this.database.transaction(async (client) => {
            const active = await client.query("SELECT 1 FROM devices WHERE device_id=$1 AND user_id=$2 AND status='active'", [device.deviceId, device.userId]);
            if (!active.rowCount) throw new Error("Decision assertion recipient device is revoked or unavailable");
            const binding = await client.query("SELECT 1 FROM bindings WHERE binding_id=$1 AND session_id=$2 AND device_id=$3 AND binding_revision=$4 AND lease_generation=$5 AND state='active' AND lease_expires_at>now()", [claims.bindingId, claims.sessionId, device.deviceId, claims.bindingRevision, claims.leaseGeneration]);
            if (!binding.rowCount) throw new Error("Decision assertion binding is no longer active");
            const interaction = await client.query<{ state: string; payload: Record<string, unknown> }>("SELECT state,payload FROM interactions WHERE session_id=$1 AND request_id=$2 AND request_revision=$3 AND kind='approval'", [claims.sessionId, claims.requestId, claims.requestRevision]);
            const recorded = await client.query("SELECT 1 FROM decisions WHERE decision_id=$1 AND session_id=$2 AND request_id=$3 AND request_revision=$4", [claims.decisionId, claims.sessionId, claims.requestId, claims.requestRevision]);
            if (!interaction.rowCount || !["pending", "decision_recorded"].includes(interaction.rows[0].state) || interaction.rows[0].payload.actionDigest !== claims.actionDigest || interaction.rows[0].payload.turnId !== claims.turnId ||
                (interaction.rows[0].state === "decision_recorded" && !recorded.rowCount))
                throw new Error("Decision assertion approval is no longer pending or no longer matches");
            try { await client.query("INSERT INTO consumed_decision_assertions(assertion_id,device_id,decision_id,request_id,request_revision,expires_at) VALUES($1,$2,$3,$4,$5,to_timestamp($6))", [claims.assertionId, device.deviceId, claims.decisionId, claims.requestId, claims.requestRevision, claims.expiresAt]); }
            catch (error) { if ((error as { code?: string }).code === "23505") throw new StorageConflictError("Decision assertion has already been consumed or superseded"); throw error; }
        });
        return claims;
    }
}

export function verifyDecisionAssertion(token: string, publicKey: KeyObject | string, expectedDeviceId: string, now = Date.now()): DecisionAssertionClaims {
    const parts = token.split(".");
    const verificationKey = publicKey instanceof KeyObject && publicKey.type === "public" ? publicKey : createPublicKey(publicKey);
    if (parts.length !== 3 || parts[0] !== "sdc1" || !cryptoVerify(null, Buffer.from(parts[1]), verificationKey, Buffer.from(parts[2], "base64url"))) throw new Error("Decision assertion signature is invalid");
    let claims: DecisionAssertionClaims;
    try { claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as DecisionAssertionClaims; }
    catch { throw new Error("Decision assertion payload is malformed"); }
    const nowSeconds = Math.floor(now / 1000);
    if (claims.typ !== "sdc-decision-v1" || claims.deviceId !== expectedDeviceId || claims.issuedAt > nowSeconds + 30 || claims.expiresAt <= nowSeconds ||
        claims.expiresAt - claims.issuedAt > 300 || !claims.assertionId || !claims.decisionId || !claims.sessionId || !claims.bindingId || !claims.turnId || !claims.requestId || !claims.actionDigest || !claims.policyRevision || !claims.reviewerId ||
        !Number.isSafeInteger(claims.requestRevision) || claims.requestRevision < 1 || !Array.isArray(claims.grantedPermissions)) throw new Error("Decision assertion is expired or bound to another identity");
    return claims;
}
