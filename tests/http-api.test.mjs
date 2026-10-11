import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { createApiServer, AuthorizationService, ServerDatabase } from "../server/dist/index.js";

const databaseUrl = process.env.M09_TEST_DATABASE_URL;
const stableId = (issuer, subject) => `oidc-${createHash("sha256").update(`${issuer}\u0000${subject}`).digest("hex")}`;
const utc = () => new Date().toISOString();

if (!databaseUrl) {
  test("M09 HTTP/SSE PostgreSQL acceptance (set M09_TEST_DATABASE_URL)", { skip: "requires the disposable PostgreSQL 17 M09 test database" }, () => {});
} else {
  test("authenticated durable commands, independent SSE lanes, event replay, and durable acknowledgements", async (t) => {
    const db = new ServerDatabase({ poolConfig: { connectionString: databaseUrl, max: 12 } });
    await db.migrate();
    const suffix = randomUUID();
    const issuer = "https://identity.m09.test";
    const subject = `owner-${suffix}`;
    const tokens = new Map([ ["user-token", { issuer, subject }] ]);
    const provider = {
      verifyIdToken: async () => ({ kind: "user", userId: stableId(issuer, subject), issuer, subject, email: `${suffix}@m09.test` }),
      verifyAccessToken: async (token) => {
        const identity = tokens.get(token);
        if (!identity) throw new Error("invalid token");
        return identity;
      }
    };
    const auth = new AuthorizationService(db);
    const owner = await auth.completeOidcSignIn(provider, "synthetic-id-token", "nonce");
    const sessionId = `m09-session-${suffix}`;
    let server;
    let base;
    let credential;
    let deviceId;
    try {
      await db.putSession({ sessionId, ownerUserId: owner.userId });
      const pairing = await auth.startPairing(owner, `M09 bridge ${suffix}`);
      await auth.confirmPairingOnServer(owner, pairing.pairingCode);
      const issued = await auth.confirmPairingLocally(pairing.pairingId, pairing.localConfirmationSecret, true);
      credential = issued.credential;
      deviceId = issued.deviceId;
      await db.putBinding({ bindingId: `m09-binding-${suffix}`, sessionId, deviceId, bindingRevision: 1, leaseGeneration: 1, state: "active", payload: {} });
      server = createApiServer({ database: db, authorization: auth, provider, heartbeatMs: 100, pollMs: 25, maxBodyBytes: 2048, maxSseConnections: 1 });
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      base = `http://127.0.0.1:${server.address().port}`;
      const userHeaders = { authorization: "Bearer user-token", "content-type": "application/json" };
      const deviceHeaders = { authorization: `Bearer ${credential}`, "content-type": "application/json" };
      const command = (type, lane, id, extra = {}) => ({
        protocolVersion: "2.0", type, commandId: id, lane, seq: 1, sessionId, bindingRevision: 1, leaseGeneration: 1, createdAt: utc(),
        ...(type === "turn.submit" ? { turnId: `turn-${id}`, promptId: `prompt-${id}` } : type === "turn.cancel" ? { turnId: extra.turnId } : {}),
        payload: type === "turn.submit" ? { content: [{ type: "text", text: "héllo বাংলা" }], delivery: "queue", expectedConversationRevision: 0 } : { reason: "test" }
      });

      const badAuth = await fetch(`${base}/v2/sessions/${sessionId}/turns`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      assert.equal(badAuth.status, 401);
      const badJson = await fetch(`${base}/v2/sessions/${sessionId}/turns`, { method: "POST", headers: userHeaders, body: "{" });
      assert.equal(badJson.status, 400);
      const tooLarge = await fetch(`${base}/v2/sessions/${sessionId}/turns`, { method: "POST", headers: userHeaders, body: JSON.stringify({ pad: "x".repeat(3000) }) });
      assert.equal(tooLarge.status, 413);

      const promptIds = [];
      let firstCommand;
      for (let index = 0; index < 30; index += 1) {
        const id = `m09-prompt-${suffix}-${index}`;
        promptIds.push(id);
        const payload = command("turn.submit", "prompt", id);
        if (index === 0) firstCommand = payload;
        const response = await fetch(`${base}/v2/sessions/${sessionId}/turns`, { method: "POST", headers: userHeaders, body: JSON.stringify({ command: payload }) });
        assert.equal(response.status, 202);
        const receipt = await response.json();
        assert.equal(receipt.durable, true);
        assert.equal(receipt.laneSeq, index + 1);
      }
      const durable = await db.pool.query("SELECT count(*)::int AS n FROM commands WHERE session_id=$1 AND lane='prompt'", [sessionId]);
      assert.equal(durable.rows[0].n, promptIds.length, "202 follows command commit");
      const duplicate = await fetch(`${base}/v2/sessions/${sessionId}/turns`, { method: "POST", headers: userHeaders, body: JSON.stringify({ command: firstCommand }) });
      assert.equal((await duplicate.json()).disposition, "identical");
      const conflict = structuredClone(firstCommand);
      conflict.payload.content[0].text = "changed payload";
      const conflictingRetry = await fetch(`${base}/v2/sessions/${sessionId}/turns`, { method: "POST", headers: userHeaders, body: JSON.stringify({ command: conflict }) });
      assert.equal(conflictingRetry.status, 409);

      const controlId = `m09-control-${suffix}`;
      const controlResponse = await fetch(`${base}/v2/sessions/${sessionId}/turns/turn-control/controls`, { method: "POST", headers: userHeaders, body: JSON.stringify({ command: command("turn.cancel", "control", controlId, { turnId: "turn-control" }) }) });
      assert.equal(controlResponse.status, 202);
      const ahead = await fetch(`${base}/v2/devices/${deviceId}/commands?lane=control&after=99`, { headers: deviceHeaders });
      assert.equal(ahead.status, 409);
      const malformedCursor = await fetch(`${base}/v2/devices/${deviceId}/commands?lane=control&after=00`, { headers: deviceHeaders });
      assert.equal(malformedCursor.status, 400);
      const controlStream = await fetch(`${base}/v2/devices/${deviceId}/commands?lane=control&after=0`, { headers: deviceHeaders });
      assert.equal(controlStream.headers.get("content-type"), "text/event-stream; charset=utf-8");
      const controlEvent = await readDataFrame(controlStream);
      assert.equal(controlEvent.event, "command");
      assert.equal(controlEvent.id, "1");
      assert.equal(controlEvent.value.commandId, controlId, "control lane is available without consuming prompt backlog");
      const overCapacity = await fetch(`${base}/v2/sessions/${sessionId}/events?after=0`, { headers: { authorization: "Bearer user-token" } });
      assert.equal(overCapacity.status, 429);
      await controlEvent.cancel();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const oldCursorReplay = await fetch(`${base}/v2/devices/${deviceId}/commands?lane=prompt`, { headers: { ...deviceHeaders, "last-event-id": "0" } });
      assert.equal(oldCursorReplay.status, 200);
      const firstPrompt = await readDataFrame(oldCursorReplay);
      assert.equal(firstPrompt.id, "1", "retained stale cursor replays from the requested position");
      await firstPrompt.cancel();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const heartbeatStream = await fetch(`${base}/v2/devices/${deviceId}/commands?lane=prompt&after=30`, { headers: deviceHeaders });
      assert.equal(heartbeatStream.status, 200);
      const heartbeatReader = heartbeatStream.body.getReader();
      const heartbeatText = await readUntil(heartbeatReader, ": heartbeat ");
      assert.match(heartbeatText, /: heartbeat /, "idle streams receive heartbeat comments");
      await heartbeatReader.cancel();

      const ack = (state) => ({ sessionId, lane: "control", laneSeq: 1, bindingRevision: 1, leaseGeneration: 1, state, details: { evidence: "bridge receipt" } });
      const received = await fetch(`${base}/v2/devices/${deviceId}/acks`, { method: "POST", headers: deviceHeaders, body: JSON.stringify(ack("received")) });
      assert.equal(received.status, 202);
      const applied = await fetch(`${base}/v2/devices/${deviceId}/acks`, { method: "POST", headers: deviceHeaders, body: JSON.stringify(ack("applied")) });
      assert.equal(applied.status, 202);
      const ackRow = await db.pool.query("SELECT state FROM command_acknowledgements WHERE device_id=$1 AND lane='control' AND lane_seq=1", [deviceId]);
      assert.equal(ackRow.rows[0].state, "applied");
      const regressed = await fetch(`${base}/v2/devices/${deviceId}/acks`, { method: "POST", headers: deviceHeaders, body: JSON.stringify(ack("received")) });
      assert.equal(regressed.status, 409);

      const eventId = `m09-event-${suffix}`;
      const event = { protocolVersion: "2.0", type: "turn.state", eventId, sessionId, bindingRevision: 1, leaseGeneration: 1, bridgeEpoch: `epoch-${suffix}`, producerSeq: 1, createdAt: utc(), payload: { turnId: "turn-control", state: "running", reason: "বাংলা output" } };
      const postEvent = () => fetch(`${base}/v2/devices/${deviceId}/events`, { method: "POST", headers: deviceHeaders, body: JSON.stringify({ event }) });
      const firstEvent = await postEvent();
      assert.equal(firstEvent.status, 202);
      assert.equal((await firstEvent.json()).sessionSeq, 1);
      const replayedEvent = await postEvent();
      assert.equal((await replayedEvent.json()).disposition, "identical");
      const snapshot = await fetch(`${base}/v2/sessions/${sessionId}/snapshot`, { headers: { authorization: "Bearer user-token" } });
      assert.equal(snapshot.status, 200);
      assert.equal((await snapshot.json()).watermark.sessionSeq, 1);
      const eventStream = await fetch(`${base}/v2/sessions/${sessionId}/events?after=0`, { headers: { authorization: "Bearer user-token" } });
      const replay = await readDataFrame(eventStream);
      assert.equal(replay.id, "1");
      assert.equal(replay.value.eventId, eventId);
      assert.equal(replay.value.payload.payload.reason, "বাংলা output");
      await replay.cancel();
      const revokeUrl = `${base}/v2/public/devices/${deviceId}/revoke`;
      assert.equal((await fetch(revokeUrl, { method: "POST", headers: deviceHeaders, body: "{}" })).status, 401, "device credentials cannot administer device revocation");
      tokens.set("other-user", { issuer, subject: `other-${suffix}` });
      await auth.completeOidcSignIn({ ...provider, verifyIdToken: async () => ({ kind: "user", userId: stableId(issuer, `other-${suffix}`), issuer, subject: `other-${suffix}`, email: `other-${suffix}@m09.test` }) }, "synthetic-other-id-token", "nonce");
      assert.equal((await fetch(revokeUrl, { method: "POST", headers: { authorization: "Bearer other-user", "content-type": "application/json" }, body: "{}" })).status, 404, "foreign users cannot revoke this device");
      assert.equal((await fetch(revokeUrl, { method: "POST", headers: userHeaders, body: "{}" })).status, 200);
      assert.equal((await fetch(revokeUrl, { method: "POST", headers: userHeaders, body: "{}" })).status, 200, "revocation is retryable");
      await assert.rejects(auth.authenticateDevice(credential), /invalid, expired, or revoked/);
      assert.equal((await db.pool.query("SELECT state FROM bindings WHERE device_id=$1", [deviceId])).rows[0].state, "revoked");
    } finally {
      if (server?.listening) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
      if (deviceId) {
        await db.pool.query("DELETE FROM command_acknowledgements WHERE device_id=$1", [deviceId]);
        await db.pool.query("DELETE FROM commands WHERE device_id=$1", [deviceId]);
        await db.pool.query("DELETE FROM lane_counters WHERE device_id=$1", [deviceId]);
        await db.pool.query("DELETE FROM events WHERE session_id=$1", [sessionId]);
        await db.pool.query("DELETE FROM bindings WHERE session_id=$1", [sessionId]);
        await db.pool.query("DELETE FROM sessions WHERE session_id=$1", [sessionId]);
        await db.pool.query("DELETE FROM pairing_requests WHERE device_id=$1", [deviceId]);
        await db.pool.query("DELETE FROM device_credentials WHERE device_id=$1", [deviceId]);
        await db.pool.query("DELETE FROM devices WHERE device_id=$1", [deviceId]);
      }
      await db.pool.query("DELETE FROM oidc_identities WHERE user_id=$1", [owner.userId]).catch(() => {});
      await db.pool.query("DELETE FROM app_users WHERE user_id=$1", [owner.userId]).catch(() => {});
      const otherId = stableId(issuer, `other-${suffix}`);
      await db.pool.query("DELETE FROM oidc_identities WHERE user_id=$1", [otherId]);
      await db.pool.query("DELETE FROM app_users WHERE user_id=$1", [otherId]);
      await db.close();
    }
  });
}

async function readDataFrame(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) throw new Error("SSE stream ended before its first data frame");
    pending += decoder.decode(value, { stream: true });
    let frameEnd = pending.indexOf("\n\n");
    while (frameEnd >= 0) {
      const frame = pending.slice(0, frameEnd);
      pending = pending.slice(frameEnd + 2);
      const lines = frame.split("\n");
      const data = lines.find((line) => line.startsWith("data: "));
      if (!data) { frameEnd = pending.indexOf("\n\n"); continue; }
      return { id: lines.find((line) => line.startsWith("id: "))?.slice(4), event: lines.find((line) => line.startsWith("event: "))?.slice(7), value: JSON.parse(data.slice(6)), cancel: () => reader.cancel() };
    }
  }
}

async function readUntil(reader, marker) {
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes(marker)) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

test("bridge SSE decoder preserves UTF-8 and frame boundaries across arbitrary chunks", () => {
  const bytes = new TextEncoder().encode("id: 8\nevent: event\ndata: {\"text\":\"héllo বাংলা\"}\n\n");
  const decoder = new TextDecoder();
  let text = "";
  const split = bytes.findIndex((byte, index) => index > 0 && (byte & 0xc0) === 0x80);
  for (const chunk of [bytes.slice(0, split + 1), bytes.slice(split + 1, split + 4), bytes.slice(split + 4)]) text += decoder.decode(chunk, { stream: true });
  text += decoder.decode();
  const frame = text.split("\n\n")[0];
  assert.match(frame, /id: 8/);
  assert.deepEqual(JSON.parse(frame.match(/^data: (.+)$/m)[1]), { text: "héllo বাংলা" });
});
