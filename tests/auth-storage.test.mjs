import assert from "node:assert/strict";
import test from "node:test";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { AuthorizationService, ServerDatabase, StorageConflictError, verifyDecisionAssertion } from "../server/dist/index.js";

const databaseUrl = process.env.M08_TEST_DATABASE_URL;
const stableId = (issuer, subject) => `oidc-${createHash("sha256").update(`${issuer}\u0000${subject}`).digest("hex")}`;
const providerFor = (principal) => ({ verifyIdToken: async () => principal, verifyAccessToken: async () => ({ issuer: principal.issuer, subject: principal.subject }) });

if (!databaseUrl) {
  test("M08 PostgreSQL identity and authorization acceptance (set M08_TEST_DATABASE_URL)", { skip: "requires the disposable PostgreSQL 17 M08 test database" }, () => {});
} else {
  test("OIDC identity linking, pairing consent, role checks, credential rotation/revocation and one-time assertions", async () => {
    const database = new ServerDatabase({ poolConfig: { connectionString: databaseUrl, max: 8 } });
    await database.migrate();
    let now = Date.now();
    const auth = new AuthorizationService(database, { now: () => now, pairingTtlSeconds: 120, deviceCredentialTtlSeconds: 3600 });
    const suffix = randomUUID();
    const issuer = "https://identity.m08.test";
    const ownerSubject = `owner-${suffix}`; const operatorSubject = `operator-${suffix}`; const viewerSubject = `viewer-${suffix}`; const strangerSubject = `stranger-${suffix}`;
    const owner = await auth.completeOidcSignIn(providerFor({ kind: "user", userId: stableId(issuer, ownerSubject), issuer, subject: ownerSubject, email: `${suffix}-owner@m08.test` }), "disposable-id-token", "nonce");
    const operator = await auth.completeOidcSignIn(providerFor({ kind: "user", userId: stableId(issuer, operatorSubject), issuer, subject: operatorSubject, email: `${suffix}-operator@m08.test` }), "disposable-id-token", "nonce");
    const viewer = await auth.completeOidcSignIn(providerFor({ kind: "user", userId: stableId(issuer, viewerSubject), issuer, subject: viewerSubject, email: `${suffix}-viewer@m08.test` }), "disposable-id-token", "nonce");
    const stranger = await auth.completeOidcSignIn(providerFor({ kind: "user", userId: stableId(issuer, strangerSubject), issuer, subject: strangerSubject, email: `${suffix}-stranger@m08.test` }), "disposable-id-token", "nonce");
    assert.equal((await auth.authenticateUserAccessToken(providerFor(owner), "disposable-access-token")).userId, owner.userId);
    const sessionId = `m08-session-${suffix}`;
    try {
      await database.putSession({ sessionId, ownerUserId: owner.userId });
      await auth.setSessionRole(owner, sessionId, operator.userId, "operator");
      await auth.setSessionRole(owner, sessionId, viewer.userId, "viewer");
      assert.equal(await auth.authorizeUser(owner, sessionId, "administer"), "owner");
      await assert.rejects(auth.authorizeUser({ ...owner }, sessionId, "view"), /provider-verified/);
      assert.equal(await auth.authorizeUser(operator, sessionId, "prompt"), "operator");
      await assert.rejects(auth.authorizeUser(operator, sessionId, "approve"), /permission denied/);
      assert.equal(await auth.authorizeUser(viewer, sessionId, "view"), "viewer");
      assert.equal(await auth.revokeSessionRole(owner, sessionId, viewer.userId), true);
      await assert.rejects(auth.authorizeUser(viewer, sessionId, "prompt"), /permission denied/);
      await assert.rejects(auth.authorizeUser(viewer, sessionId, "view"), /permission denied/);
      await assert.rejects(auth.authorizeUser(stranger, sessionId, "view"), /permission denied/);
      await assert.rejects(auth.setSessionRole(operator, sessionId, stranger.userId, "viewer"), /Only the session owner/);

      const pairing = await auth.startPairing(owner, `M08 disposable device ${suffix}`);
      await assert.rejects(auth.confirmPairingOnServer(owner, `${pairing.pairingCode}X`), /wrong, expired/);
      await assert.rejects(auth.confirmPairingLocally(pairing.pairingId, pairing.localConfirmationSecret, true), /unconfirmed/);
      await auth.confirmPairingOnServer(owner, pairing.pairingCode);
      await assert.rejects(auth.confirmPairingOnServer(owner, pairing.pairingCode), /already used/);
      await assert.rejects(auth.confirmPairingLocally(pairing.pairingId, pairing.localConfirmationSecret, false), /consent/);
      await assert.rejects(auth.confirmPairingLocally(pairing.pairingId, "wrong-local-secret", true), /does not belong/);
      const issued = await auth.confirmPairingLocally(pairing.pairingId, pairing.localConfirmationSecret, true);
      assert.equal(issued.deviceId, pairing.deviceId);
      const device = await auth.authenticateDevice(issued.credential);
      assert.equal(device.deviceId, pairing.deviceId);
      const credentialRow = await database.pool.query("SELECT token_hash FROM device_credentials WHERE device_id=$1", [pairing.deviceId]);
      assert.notEqual(credentialRow.rows[0].token_hash, issued.credential, "only a hash is stored server-side");

      const binding = { bindingId: `m08-binding-${suffix}`, sessionId, deviceId: pairing.deviceId, bindingRevision: 1, leaseGeneration: 1, state: "active", payload: {} };
      await database.putBinding(binding);
      await auth.authorizeDevice(device, sessionId, "read_commands");
      const otherPairing = await auth.startPairing(owner, `unbound device ${suffix}`);
      await auth.confirmPairingOnServer(owner, otherPairing.pairingCode);
      const otherDevice = await auth.authenticateDevice((await auth.confirmPairingLocally(otherPairing.pairingId, otherPairing.localConfirmationSecret, true)).credential);
      await assert.rejects(auth.authorizeDevice(otherDevice, sessionId, "read_commands"), /not actively bound/);
      const rotated = await auth.rotateDeviceCredential(device, issued.credential);
      await assert.rejects(auth.authenticateDevice(issued.credential), /invalid, expired, or revoked/);
      const replacementDevice = await auth.authenticateDevice(rotated.credential);

      const actionDigest = `sha256:${"c".repeat(64)}`;
      const approvalExpiresAt = new Date(now + 180_000).toISOString();
      await database.putInteraction({ interactionId: `m08-interaction-${suffix}`, sessionId, requestId: `m08-request-${suffix}`, requestRevision: 1, kind: "approval", state: "pending",
        payload: { actionDigest, expiresAt: approvalExpiresAt, sessionId, bindingId: binding.bindingId, bindingRevision: 1, leaseGeneration: 1, turnId: `m08-turn-${suffix}`,
          requestedPermissions: [{ resource: "file", operation: "write", scope: { path: "/tmp/reviewed" } }], availableDecisions: [{ id: "allow_once", effect: "allow", scope: "action" }] } });
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const expiresAt = Math.floor(now / 1000) + 120;
      const assertionInput = { decisionId: `m08-decision-${suffix}`, sessionId, deviceId: pairing.deviceId, bindingId: binding.bindingId, bindingRevision: 1, leaseGeneration: 1,
        turnId: `m08-turn-${suffix}`, requestId: `m08-request-${suffix}`, requestRevision: 1, actionDigest, choiceId: "allow_once", grantedPermissions: [{ resource: "file", operation: "write", scope: { path: "/tmp/reviewed" } }],
        policyRevision: "policy-1", expiresAt };
      const assertion = await auth.createDecisionAssertion(owner, assertionInput, privateKey);
      assert.equal(verifyDecisionAssertion(assertion, publicKey, pairing.deviceId, now).reviewerId, owner.userId);
      const consumed = await auth.consumeDecisionAssertion(assertion, publicKey, replacementDevice);
      assert.equal(consumed.requestId, assertionInput.requestId);
      await assert.rejects(auth.consumeDecisionAssertion(assertion, publicKey, replacementDevice), StorageConflictError);
      const competing = await auth.createDecisionAssertion(owner, { ...assertionInput, decisionId: `m08-competing-${suffix}` }, privateKey);
      await assert.rejects(auth.consumeDecisionAssertion(competing, publicKey, replacementDevice), StorageConflictError);
      await assert.rejects(auth.createDecisionAssertion(operator, assertionInput, privateKey), /permission denied/);
      await assert.rejects(auth.createDecisionAssertion(owner, { ...assertionInput, grantedPermissions: [{ resource: "network", operation: "send" }] }, privateKey), /exceed/);

      await auth.revokeDevice(owner, pairing.deviceId);
      await assert.rejects(auth.authenticateDevice(rotated.credential), /invalid, expired, or revoked/);
      await assert.rejects(auth.authorizeDevice(replacementDevice, sessionId, "write_events"), /not actively bound/);
      const expired = await auth.startPairing(owner, `expired ${suffix}`);
      now += 121_000;
      await assert.rejects(auth.confirmPairingOnServer(owner, expired.pairingCode), /wrong, expired/);
    } finally {
      await database.pool.query("DELETE FROM bindings WHERE session_id=$1", [sessionId]);
      await database.pool.query("DELETE FROM interactions WHERE session_id=$1", [sessionId]);
      await database.pool.query("DELETE FROM sessions WHERE session_id=$1", [sessionId]);
      await database.pool.query("DELETE FROM devices WHERE user_id=$1", [owner.userId]);
      await database.pool.query("DELETE FROM oidc_identities WHERE user_id=ANY($1::text[])", [[owner.userId, operator.userId, viewer.userId, stranger.userId]]);
      await database.pool.query("DELETE FROM app_users WHERE user_id=ANY($1::text[])", [[owner.userId, operator.userId, viewer.userId, stranger.userId]]);
      await database.close();
    }
  });
}
