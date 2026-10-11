import assert from "node:assert/strict";
import test from "node:test";
import { apiFixture } from "./helpers/api-fixture.mjs";

const databaseUrl = process.env.M15_TEST_DATABASE_URL;

test("M15 pairing requires server confirmation then local consent and returns an authenticatable device credential", { skip: !databaseUrl && "requires disposable PostgreSQL 17" }, async () => {
    const fixture = await apiFixture(databaseUrl);
    try {
        const localSecret = (await import("node:crypto")).randomBytes(32).toString("base64url");
        const start = await fixture.request("/v2/pairings", {
            label: "M15 test companion",
            localConfirmationSecret: localSecret
        }, "owner");
        assert.equal(start.status, 201, await start.clone().text());
        const pairing = await start.json();
        assert.ok(pairing.pairingId);
        assert.ok(pairing.pairingCode);
        assert.equal("localConfirmationSecret" in pairing, false, "the server must never return the device-local secret");

        const premature = await fixture.request(`/v2/pairings/${pairing.pairingId}/local-confirm`, {
            localConfirmationSecret: localSecret,
            explicitConsent: true
        }, "owner");
        assert.notEqual(premature.status, 200, "local consent cannot replace server confirmation");

        const confirmed = await fixture.request(`/v2/pairings/${pairing.pairingId}/confirm`, { pairingCode: pairing.pairingCode }, "owner");
        assert.equal(confirmed.status, 200, await confirmed.clone().text());
        const issuedResponse = await fixture.request(`/v2/pairings/${pairing.pairingId}/local-confirm`, {
            localConfirmationSecret: localSecret,
            explicitConsent: true
        }, "owner");
        assert.equal(issuedResponse.status, 200, await issuedResponse.clone().text());
        const issued = await issuedResponse.json();
        assert.equal(issued.deviceId, pairing.deviceId);
        assert.match(issued.credential, /^sdc_dev_/);
        assert.equal((await fixture.auth.authenticateDevice(issued.credential)).deviceId, pairing.deviceId);

        const replay = await fixture.request(`/v2/pairings/${pairing.pairingId}/local-confirm`, {
            localConfirmationSecret: localSecret,
            explicitConsent: true
        }, "owner");
        assert.notEqual(replay.status, 200, "a local pairing challenge can be consumed once");
    } finally { await fixture.close(); }
});
