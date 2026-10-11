import assert from "node:assert/strict";
import test from "node:test";
import { apiFixture, command } from "./helpers/api-fixture.mjs";

const databaseUrl = process.env.M14_TEST_DATABASE_URL;

test("M14 visible session index is scoped to authenticated owner and members", { skip: !databaseUrl && "requires disposable PostgreSQL 17" }, async () => {
    const fixture = await apiFixture(databaseUrl);
    try {
        const ui = await fetch(`${fixture.base}/`);
        assert.equal(ui.status, 200, "the API origin should serve the built control interface");
        assert.match(ui.headers.get("content-security-policy"), /frame-ancestors 'none'/);
        assert.equal((await fetch(`${fixture.base}/unknown-app-route`)).status, 200, "client-side routes fall back to the UI entry point");
        assert.equal((await fetch(`${fixture.base}/assets/missing.js`)).status, 404, "missing assets do not fall back to HTML");
        await fixture.db.putSession({ sessionId: "ui-owner-session", ownerUserId: fixture.owner.userId });
        await fixture.db.putBinding({ bindingId: "ui-binding", sessionId: "ui-owner-session", deviceId: fixture.issued.deviceId, bindingRevision: 2, leaseGeneration: 4, state: "active", payload: { appId: "fake.app", appName: "Fake App", conversationLabel: "An existing conversation", capabilities: { submit: { status: "supported", reason: "fake adapter" } } } });
        const operator = await fixture.signIn("ui-operator");
        const viewer = await fixture.signIn("ui-viewer");
        const stranger = await fixture.signIn("ui-stranger");
        await fixture.auth.setSessionRole(fixture.owner, "ui-owner-session", operator.userId, "operator");
        await fixture.auth.setSessionRole(fixture.owner, "ui-owner-session", viewer.userId, "viewer");
        await fixture.db.putSession({ sessionId: "ui-private-session", ownerUserId: stranger.userId });

        for (const [name, expectedRole] of [["owner", "owner"], ["ui-operator", "operator"], ["ui-viewer", "viewer"]]) {
            const response = await fixture.request("/v2/sessions", undefined, name);
            assert.equal(response.status, 200);
            const body = await response.json();
            assert.equal(body.sessions.length, 1);
            assert.equal(body.sessions[0].sessionId, "ui-owner-session");
            assert.equal(body.sessions[0].role, expectedRole);
            assert.equal(body.sessions[0].binding.bindingRevision, 2);
            assert.equal(body.sessions[0].binding.payload.conversationLabel, "An existing conversation");
        }
        const operatorCommand = command("ui-owner-session", "m14-operator-turn");
        operatorCommand.bindingRevision = 2; operatorCommand.leaseGeneration = 4;
        const operatorTurn = await fixture.request("/v2/sessions/ui-owner-session/turns", { command: operatorCommand }, "ui-operator");
        assert.equal(operatorTurn.status, 202, `operators may queue ordinary prompts: ${await operatorTurn.clone().text()}`);
        const viewerCommand = command("ui-owner-session", "m14-viewer-turn");
        viewerCommand.bindingRevision = 2; viewerCommand.leaseGeneration = 4;
        const viewerTurn = await fixture.request("/v2/sessions/ui-owner-session/turns", { command: viewerCommand }, "ui-viewer");
        assert.equal(viewerTurn.status, 403, "viewer UI restrictions are also enforced by the API");
        const strangerResponse = await fixture.request("/v2/sessions", undefined, "ui-stranger");
        assert.equal(strangerResponse.status, 200);
        const strangerSessions = await strangerResponse.json();
        assert.deepEqual(strangerSessions.sessions.map(session => session.sessionId), ["ui-private-session"]);
        assert.equal((await fetch(`${fixture.base}/v2/sessions`)).status, 401);
    } finally { await fixture.close(); }
});

test("M14 server-mediated OIDC PKCE exchange registers a first-time principal and consumes state once", { skip: !databaseUrl && "requires disposable PostgreSQL 17" }, async () => {
    const issuer = "https://identity.m14.integration.test";
    const subject = "first-sign-in-subject";
    const longRefreshToken = "refresh-secret-" + "x".repeat(300);
    const userId = `oidc-${(await import("node:crypto")).createHash("sha256").update(`${issuer}\0${subject}`).digest("hex")}`;
    const provider = {
        createAuthorizationRequest: async redirectUri => ({ authorizationUrl: `https://idp.example.test/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`, state: "one-time-state", nonce: "nonce-bound-to-pkce", codeVerifier: "test-code-verifier-with-sufficient-length" }),
        exchangeAuthorizationCode: async (code, redirectUri, state, nonce, verifier, expectedState) => {
            assert.equal(code,"one-time-code"); assert.equal(redirectUri,"sdccompanion://callback"); assert.equal(state,expectedState); assert.equal(nonce,"nonce-bound-to-pkce"); assert.equal(verifier,"test-code-verifier-with-sufficient-length");
            return { idToken:"verified-id-token",accessToken:"first-user-access-token",refreshToken:longRefreshToken,expiresAt:Date.now()+60_000 };
        },
        refreshTokens: async (refreshToken, expectedIdentity) => { assert.equal(refreshToken,longRefreshToken); assert.deepEqual(expectedIdentity,{issuer,subject}); return {accessToken:"refreshed-user-access-token",refreshToken:"rotated-refresh-secret",expiresAt:Date.now()+60_000}; },
        verifyIdToken: async (idToken, nonce) => { assert.equal(idToken,"verified-id-token"); assert.equal(nonce,"nonce-bound-to-pkce"); return {kind:"user",issuer,subject,userId,email:"first@example.test"}; },
        verifyAccessToken: async token => { assert.ok(["first-user-access-token","refreshed-user-access-token"].includes(token)); return {issuer,subject}; }
    };
    const fixture=await apiFixture(databaseUrl,()=>({provider}));
    try {
        const start=await fixture.request("/v2/auth/oidc/start",{redirectUri:"sdccompanion://callback"});
        assert.equal(start.status,200); const started=await start.json(); assert.equal(started.state,"one-time-state");
        const exchanged=await fixture.request("/v2/auth/oidc/exchange",{code:"one-time-code",state:started.state});
        assert.equal(exchanged.status,200); const tokens=await exchanged.json(); assert.equal(tokens.accessToken,"first-user-access-token"); assert.equal(tokens.refreshToken,longRefreshToken); assert.equal(tokens.user.userId,userId);
        const authenticated=await fixture.request("/v2/sessions",undefined,tokens.accessToken); assert.equal(authenticated.status,200); assert.deepEqual((await authenticated.json()).sessions,[]);
        const refreshed=await fixture.request("/v2/auth/oidc/refresh",{userId:tokens.user.userId,refreshToken:tokens.refreshToken}); assert.equal(refreshed.status,200); assert.equal((await refreshed.json()).accessToken,"refreshed-user-access-token");
        assert.equal((await fixture.request("/v2/auth/oidc/refresh",{userId:"oidc-unrelated-user",refreshToken:tokens.refreshToken})).status,401);
        assert.equal((await fixture.request("/v2/auth/oidc/refresh",{userId:tokens.user.userId,refreshToken:"x".repeat(8193)})).status,400);
        const replay=await fixture.request("/v2/auth/oidc/exchange",{code:"one-time-code",state:started.state}); assert.equal(replay.status,400);
    } finally { await fixture.close(); }
});
