import assert from "node:assert/strict";
import test from "node:test";
import { forgetProfileCredentials } from "../extensions/vscode/dist/credentials.mjs";
import { ConnectManager, profileStorageKey } from "../extensions/vscode/dist/connect.mjs";
const profile = { id: "local", name: "local", origin: "https://localhost:15943", categories: ["prompts"] };
function fixture(expired = false) {
    const prefix = profileStorageKey(profile), operations = [];
    const values = new Map([[prefix + ".user", JSON.stringify({ userId: "u", accessToken: "access", refreshToken: "refresh", expiresAt: new Date(Date.now() + (expired ? -60000 : 60000)).toISOString() })], [prefix + ".device", JSON.stringify({ deviceId: "paired", credential: "device" })], ["other-profile.user", "keep"]]);
    const secrets = { get: async k => values.get(k), store: async (k,v) => { values.set(k,v); operations.push("store"); }, delete: async k => { values.delete(k); operations.push(k.endsWith(".device") ? "delete-device" : "delete-user"); } };
    return { values, secrets, operations, prefix };
}
test("M24 cleanup refreshes, revokes, and removes only the selected profile after authority is removed", async () => {
    const f = fixture(true);
    await forgetProfileCredentials(profile, f.secrets, async d => { assert.equal(d.deviceId, "paired"); f.operations.push("remove-inbox"); }, async (_profile,path,_body,token) => {
        if (path.endsWith("refresh")) { f.operations.push("refresh"); return { userId: "u", accessToken: "new-access", expiresAt: new Date(Date.now()+60000).toISOString() }; }
        assert.equal(path, "/api/v1/devices/paired/revoke"); assert.equal(token, "new-access"); f.operations.push("revoke"); return {};
    });
    assert.deepEqual(f.operations, ["refresh", "store", "revoke", "remove-inbox", "delete-device", "delete-user"]);
    assert.deepEqual([...f.values], [["other-profile.user", "keep"]]);
});
test("M24 failed server revocation retains credentials/inbox for a safe retry", async () => {
    const f = fixture();
    await assert.rejects(forgetProfileCredentials(profile, f.secrets, async () => assert.fail("inbox must remain"), async () => { throw new Error("offline"); }), /offline/);
    assert.equal(f.values.size, 3); assert.deepEqual(f.operations, []);
});
test("M24 missing identity cannot silently discard a live device credential", async () => {
    const f = fixture(); f.values.delete(f.prefix + ".user");
    await assert.rejects(forgetProfileCredentials(profile, f.secrets, async () => assert.fail("inbox must remain")), /Sign in again/);
    assert.ok(f.values.has(f.prefix + ".device"));
});
test("M24 cleanup fences model and graphical Connect while disconnected maintenance is active", async () => {
    const manager = new ConnectManager({}, {});
    await manager.withDisconnected(async () => {
        assert.equal((await manager.handle({})).status, "rejected");
        await assert.rejects(manager.withDisconnected(async () => {}), /already in progress/);
        assert.equal(manager.state, "disconnected");
    });
    await assert.rejects(manager.withDisconnected(async () => { throw new Error("failed cleanup"); }), /failed cleanup/);
    await manager.withDisconnected(async () => {});
});

test("M24 expired refresh session reauthenticates before revocation without discarding credentials", async () => {
    const f = fixture(true);
    await forgetProfileCredentials(profile, f.secrets, async () => f.operations.push("remove-inbox"), async (_profile,path,_body,token) => {
        if (path.endsWith("refresh")) throw new Error("expired refresh session");
        assert.equal(token, "fresh-access"); f.operations.push("revoke"); return {};
    }, async () => {
        assert.equal(f.values.size, 3); f.operations.push("reauthenticate");
        return { userId: "u", accessToken: "fresh-access", expiresAt: new Date(Date.now()+60000).toISOString() };
    });
    assert.deepEqual(f.operations, ["reauthenticate", "store", "revoke", "remove-inbox", "delete-device", "delete-user"]);
});
test("M24 cancelled reauthentication retains both credentials and the inbox", async () => {
    const f = fixture(true);
    await assert.rejects(forgetProfileCredentials(profile, f.secrets, async () => assert.fail("inbox must remain"), async () => { throw new Error("expired"); }, async () => { throw new Error("cancelled sign-in"); }), /cancelled sign-in/);
    assert.equal(f.values.size, 3); assert.deepEqual(f.operations, []);
});
