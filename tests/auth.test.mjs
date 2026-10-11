import assert from "node:assert/strict";
import test from "node:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { AuthorizationService, KeycloakOidcProvider, verifyDecisionAssertion } from "../server/dist/auth/index.js";

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
function signIdToken(privateKey, claims, header = { alg: "RS256", kid: "test-key", typ: "JWT" }) {
  const input = `${b64(header)}.${b64(claims)}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}

test("Keycloak OIDC uses state, nonce and S256 PKCE, and validates signature and identity claims", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", use: "sig", alg: "RS256" };
  const issuer = "https://id.example.test/realms/sdc";
  const now = Date.now();
  let currentNonce = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === `${issuer}/.well-known/openid-configuration`) return Response.json({ issuer, authorization_endpoint: `${issuer}/protocol/openid-connect/auth`, token_endpoint: `${issuer}/protocol/openid-connect/token`, jwks_uri: `${issuer}/protocol/openid-connect/certs` });
    if (url === `${issuer}/protocol/openid-connect/certs`) return Response.json({ keys: [jwk] });
    if (url === `${issuer}/protocol/openid-connect/token`) {
      const params = new URLSearchParams(init.body);
      const refreshFlow = params.get("grant_type") === "refresh_token";
      if (refreshFlow) assert.equal(params.get("refresh_token"), "refresh-secret");
      else { assert.equal(params.get("grant_type"), "authorization_code"); assert.equal(params.get("code_verifier")?.length, 43); }
      return Response.json({ id_token: signIdToken(privateKey, { iss: issuer, sub: "subject-1", aud: "sdc-native", exp: Math.floor(now / 1000) + 300, iat: Math.floor(now / 1000), nonce: currentNonce, email: "user@example.test", email_verified: true }),
        access_token: signIdToken(privateKey, { iss: issuer, sub: "subject-1", aud: "sdc-api", exp: Math.floor(now / 1000) + 300, iat: Math.floor(now / 1000) }), refresh_token: refreshFlow ? "rotated-refresh-secret" : "refresh-secret", expires_in: 300 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const provider = new KeycloakOidcProvider({ issuer, clientId: "sdc-native", apiAudience: "sdc-api", redirectUris: ["sdc://oauth/callback"] });
    await assert.rejects(provider.createAuthorizationRequest("sdc://oauth/attacker", now), /exact configured callback/);
    const request = await provider.createAuthorizationRequest("sdc://oauth/callback", now);
    const url = new URL(request.authorizationUrl);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(request.codeVerifier).digest("base64url"));
    currentNonce = request.nonce;
    const tokens = await provider.exchangeAuthorizationCode("one-time-code", "sdc://oauth/callback", request.state, request.nonce, request.codeVerifier, request.state);
    assert.equal(tokens.refreshToken, "refresh-secret");
    assert.ok(tokens.expiresAt > Date.now());
    const identity = await provider.verifyIdToken(tokens.idToken, request.nonce);
    assert.equal(identity.kind, "user");
    assert.equal(identity.subject, "subject-1");
    assert.match(identity.userId, /^oidc-[a-f0-9]{64}$/);
    assert.deepEqual(await provider.verifyAccessToken(tokens.accessToken), { issuer, subject: "subject-1" });
    const refreshed = await provider.refreshTokens(tokens.refreshToken, { issuer, subject: identity.subject });
    assert.equal(refreshed.refreshToken, "rotated-refresh-secret");
    await assert.rejects(provider.exchangeAuthorizationCode("x", "sdc://oauth/attacker", "wrong", request.nonce, request.codeVerifier, request.state), /state mismatch/);
  } finally { globalThis.fetch = originalFetch; }
});

test("OIDC rejects wrong nonce, unverified email, wrong audience, expiry, and unsafe algorithms", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", use: "sig", alg: "RS256" };
  const issuer = "https://id.example.test/realms/sdc"; const now = Date.now();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).endsWith("openid-configuration")
    ? Response.json({ issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` })
    : Response.json({ keys: [jwk] });
  try {
    const provider = new KeycloakOidcProvider({ issuer, clientId: "sdc", apiAudience: "sdc-api", redirectUris: ["https://localhost/oauth/callback"] });
    const valid = { iss: issuer, sub: "s", aud: "sdc", exp: now / 1000 + 10, iat: now / 1000, nonce: "expected", email: "e@example.test", email_verified: true };
    await assert.rejects(provider.verifyIdToken(signIdToken(privateKey, { ...valid, nonce: "wrong" }), "expected", now), /claims are invalid/);
    await assert.rejects(provider.verifyIdToken(signIdToken(privateKey, { ...valid, email_verified: false }), "expected", now), /claims are invalid/);
    await assert.rejects(provider.verifyIdToken(signIdToken(privateKey, { ...valid, aud: "other" }), "expected", now), /claims are invalid/);
    await assert.rejects(provider.verifyIdToken(signIdToken(privateKey, { ...valid, exp: now / 1000 - 1 }), "expected", now), /claims are invalid/);
    await assert.rejects(provider.verifyIdToken(signIdToken(privateKey, valid, { alg: "none", kid: "test-key" }), "expected", now), /RS256/);
    await assert.rejects(provider.verifyAccessToken(signIdToken(privateKey, { iss: issuer, sub: "s", aud: "wrong", exp: Math.floor(now / 1000) + 30, iat: Math.floor(now / 1000) }), now), /claims are invalid/);
  } finally { globalThis.fetch = originalFetch; }
});

test("signed decision assertions are identity-bound, expiring, and tamper-evident", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const claims = { typ: "sdc-decision-v1", assertionId: "a1", decisionId: "d1", sessionId: "s1", deviceId: "dev1", bindingId: "b1",
    bindingRevision: 1, leaseGeneration: 3, turnId: "t1", requestId: "r1", requestRevision: 2, actionDigest: `sha256:${"a".repeat(64)}`,
    choiceId: "allow_once", grantedPermissions: [{ resource: "file", operation: "write" }], policyRevision: "p7", reviewerId: "user1", issuedAt: 1000, expiresAt: 1100 };
  const body = b64(claims);
  const token = `sdc1.${body}.${sign(null, Buffer.from(body), privateKey).toString("base64url")}`;
  assert.equal(verifyDecisionAssertion(token, publicKey, "dev1", 1_050_000).requestRevision, 2);
  assert.throws(() => verifyDecisionAssertion(token, publicKey, "dev2", 1_050_000), /expired or bound/);
  assert.throws(() => verifyDecisionAssertion(token, publicKey, "dev1", 1_200_000), /expired or bound/);
  const [version, payload, signature] = token.split(".");
  const tampered = `${version}.${payload[0] === "A" ? "B" : "A"}${payload.slice(1)}.${signature}`;
  assert.throws(() => verifyDecisionAssertion(tampered, publicKey, "dev1", 1_050_000), /signature is invalid/);
});

test("pairing and device credential lifetimes have bounded configuration", () => {
  assert.throws(() => new AuthorizationService({}, { pairingTtlSeconds: 601 }), /Pairing expiry/);
  assert.throws(() => new AuthorizationService({}, { deviceCredentialTtlSeconds: 91 * 86400 }), /Device credential expiry/);
});

test('M24 OIDC backchannel preserves public issuer and PKCE authorization origin', async () => {
    const originalFetch = globalThis.fetch;
    const issuer = 'https://localhost:15943/identity/realms/sdc';
    try {
        globalThis.fetch = async (input, init) => {
            assert.equal(String(input), 'https://proxy:15943/identity/realms/sdc/.well-known/openid-configuration');
            assert.equal(init.headers.get('host'), 'localhost:15943');
            assert.equal(init.redirect, 'error');
            return Response.json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/keys'});
        };
        const provider = new KeycloakOidcProvider({issuer,clientId:'sdc-native',apiAudience:'sdc-api',redirectUris:['vscode://server-driven-chat.sdc-cline-bridge/auth'],backchannelOrigin:'https://proxy:15943'});
        const attempt = await provider.createAuthorizationRequest('vscode://server-driven-chat.sdc-cline-bridge/auth');
        assert.equal(new URL(attempt.authorizationUrl).origin, 'https://localhost:15943');
        assert.equal(new URL(attempt.authorizationUrl).searchParams.get('code_challenge_method'), 'S256');
        globalThis.fetch = async () => Response.json({issuer,authorization_endpoint:'https://foreign.example/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/keys'});
        const foreign = new KeycloakOidcProvider({issuer,clientId:'sdc-native',apiAudience:'sdc-api',redirectUris:['vscode://server-driven-chat.sdc-cline-bridge/auth'],backchannelOrigin:'https://proxy:15943'});
        await assert.rejects(foreign.createAuthorizationRequest('vscode://server-driven-chat.sdc-cline-bridge/auth'), /must share the public issuer origin/);
        for (const origin of ['http://proxy:15943','https://user:secret@proxy','https://proxy/path']) {
            assert.throws(() => new KeycloakOidcProvider({issuer,clientId:'sdc-native',apiAudience:'sdc-api',redirectUris:['vscode://server-driven-chat.sdc-cline-bridge/auth'],backchannelOrigin:origin}), /exact HTTPS origin/);
        }
    } finally { globalThis.fetch = originalFetch; }
});
