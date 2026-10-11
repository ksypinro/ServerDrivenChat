import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { createApiServer, AuthorizationService, DeviceLeaseService, ServerDatabase } from "../server/dist/index.js";

const databaseUrl = process.env.M10_TEST_DATABASE_URL;
const stableId = (issuer, subject) => `oidc-${createHash("sha256").update(`${issuer}\u0000${subject}`).digest("hex")}`;

if (!databaseUrl) {
  test("M10 lease fencing acceptance (set M10_TEST_DATABASE_URL)", { skip: "requires the disposable PostgreSQL 17 M10 test database" }, () => {});
} else {
  test("lease renewal expires and fences stale device generations", async () => {
    const database = new ServerDatabase({ poolConfig: { connectionString: databaseUrl, max: 8 } });
    await database.migrate();
    const suffix = randomUUID();
    const issuer = "https://identity.m10.test";
    const subject = `owner-${suffix}`;
    const provider = {
      verifyIdToken: async () => ({ kind: "user", userId: stableId(issuer, subject), issuer, subject, email: `${suffix}@m10.test` }),
      verifyAccessToken: async () => ({ issuer, subject })
    };
    const auth = new AuthorizationService(database);
    const owner = await auth.completeOidcSignIn(provider, "synthetic-id-token", "nonce");
    const sessionId = `m10-session-${suffix}`;
    const pairing = await auth.startPairing(owner, `M10 lease ${suffix}`);
    const server = createApiServer({ database, authorization: auth, provider, leaseTtlSeconds: 15 });
    let deviceId;
    try {
      await database.putSession({ sessionId, ownerUserId: owner.userId });
      await auth.confirmPairingOnServer(owner, pairing.pairingCode);
      const credential = await auth.confirmPairingLocally(pairing.pairingId, pairing.localConfirmationSecret, true);
      deviceId = credential.deviceId;
      await database.putBinding({ bindingId: `m10-binding-${suffix}`, sessionId, deviceId, bindingRevision: 1, leaseGeneration: 1, state: "active", payload: {} });
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const base = `http://127.0.0.1:${server.address().port}`;
      const headers = { authorization: `Bearer ${credential.credential}`, "content-type": "application/json" };
      const renew = (bindingRevision = 1, leaseGeneration = 1) => fetch(`${base}/v2/devices/${deviceId}/lease/renew`, { method: "POST", headers, body: JSON.stringify({ sessionId, bindingRevision, leaseGeneration }) });
      const first = await renew();
      assert.equal(first.status, 200);
      const firstLease = await first.json();
      assert.equal(firstLease.bindingRevision, 1);
      assert.equal(firstLease.leaseGeneration, 1);
      assert.ok(Date.parse(firstLease.leaseExpiresAt) - Date.parse(firstLease.serverTime) <= 15_000);

      await database.pool.query("UPDATE bindings SET lease_generation=2 WHERE session_id=$1", [sessionId]);
      const staleOwner = await renew();
      assert.equal(staleOwner.status, 409);
      assert.equal((await staleOwner.json()).error.code, "BINDING_CHANGED");
      const leases = new DeviceLeaseService(database, auth, { ttlSeconds: 15 });
      assert.equal(await leases.assertCurrent(await auth.authenticateDevice(credential.credential), { sessionId, bindingRevision: 1, leaseGeneration: 1 }), false);

      await database.pool.query("UPDATE bindings SET lease_expires_at=now()-interval '1 second' WHERE session_id=$1", [sessionId]);
      const expiredOwner = await renew(1, 2);
      assert.equal(expiredOwner.status, 409);
      assert.equal((await expiredOwner.json()).error.code, "LEASE_EXPIRED");
      const row = await database.pool.query("SELECT state FROM bindings WHERE session_id=$1", [sessionId]);
      assert.equal(row.rows[0].state, "stale", "expiration is durably fenced; renewal cannot revive this binding");
      await assert.rejects(auth.authorizeDevice(await auth.authenticateDevice(credential.credential), sessionId, "read_commands"), /not actively bound/);
    } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise((resolve) => server.close(resolve));
      if (deviceId) {
        await database.pool.query("DELETE FROM bindings WHERE session_id=$1", [sessionId]);
        await database.pool.query("DELETE FROM sessions WHERE session_id=$1", [sessionId]);
        await database.pool.query("DELETE FROM pairing_requests WHERE device_id=$1", [deviceId]);
        await database.pool.query("DELETE FROM device_credentials WHERE device_id=$1", [deviceId]);
        await database.pool.query("DELETE FROM devices WHERE device_id=$1", [deviceId]);
      }
      await database.pool.query("DELETE FROM oidc_identities WHERE user_id=$1", [owner.userId]).catch(() => {});
      await database.pool.query("DELETE FROM app_users WHERE user_id=$1", [owner.userId]).catch(() => {});
      await database.close();
    }
  });
}
