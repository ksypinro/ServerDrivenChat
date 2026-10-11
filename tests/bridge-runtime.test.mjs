import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BridgeRuntime, BridgeStore, parseSse } from "../bridge/dist/index.js";
import { FakeAppAdapter } from "../adapters/fake/dist/index.js";

test("M10 runtime keeps control dispatch alive during a suspended prompt and retries durable output", async () => {
  const directory = mkdtempSync(join(tmpdir(), "m10-runtime-"));
  const store = new BridgeStore({ path: join(directory, "bridge.sqlite") });
  const adapter = new FakeAppAdapter({ script: [{ type: "input", requestId: "input-r1", requestRevision: 1, question: "Continue?" }] });
  const attached = await adapter.attach({ appId: "fake.app", appInstanceId: "fake-instance", conversationId: "fake-conversation" });
  assert.equal(attached.outcome, "accepted");
  const binding = attached.value;
  const deviceId = randomUUID();
  const commands = new Map();
  const streams = new Map();
  const ackStates = new Map();
  const receivedEvents = [];
  const approvalCalls = [];
  let failFirstEvent = true;
  let runtime;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.headers.authorization !== "Bearer disposable-device-token") { res.writeHead(401).end(); return; }
    if (req.method === "POST" && url.pathname.endsWith("/lease/renew")) {
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + 60_000).toISOString();
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: "renewed", leaseExpiresAt, serverTime: now.toISOString(), bindingRevision: binding.bindingRevision, leaseGeneration: binding.leaseGeneration }));
      return;
    }
    if (req.method === "POST" && url.pathname.endsWith("/dispatch")) {
      const now = new Date();
      res.writeHead(200,{"content-type":"text/event-stream"});
      res.write(`event: dispatch.permit\ndata: ${JSON.stringify({sessionId: binding.sessionId,serverTime: now.toISOString(),leaseExpiresAt: new Date(now.getTime()+60000).toISOString(),bindingRevision: binding.bindingRevision,leaseGeneration: binding.leaseGeneration})}\n\n`);
      return;
    }
    if (req.method === "GET" && url.pathname.endsWith("/commands")) {
      const lane = url.searchParams.get("lane");
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" });
      res.write("retry: 3000\n\n");
      streams.set(lane, res);
      const queued = commands.get(lane);
      if (queued) sendCommand(res, queued);
      res.on("close", () => { if (streams.get(lane) === res) streams.delete(lane); });
      return;
    }
    if (req.method === "POST" && url.pathname.endsWith("/acks")) {
      const body = await jsonBody(req);
      const key = `${body.lane}:${body.laneSeq}`;
      const list = ackStates.get(key) ?? [];
      list.push(body.state); ackStates.set(key, list);
      res.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ durable: true }));
      return;
    }
    if (req.method === "POST" && url.pathname.endsWith("/events")) {
      const body = await jsonBody(req);
      receivedEvents.push(body.event);
      if (failFirstEvent) { failFirstEvent = false; res.writeHead(503, { "content-type": "application/json" }).end("{}"); return; }
      res.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ durable: true }));
      return;
    }
    res.writeHead(404).end();
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    runtime = new BridgeRuntime({ serverUrl: `http://127.0.0.1:${server.address().port}`, deviceId, credential: "disposable-device-token", binding, store, adapter,
      reconnectBaseMs: 10, reconnectCapMs: 40, leaseRenewIntervalMs: 500, random: () => 0,
      approvalHandler: async (_binding, command) => { approvalCalls.push(command); return { outcome: "applied", evidence: "simulated M11 handler seam" }; } });
    await runtime.start();
    assert.equal(runtime.state, "online");
    await waitFor(() => streams.has("prompt") && streams.has("control"));
    const prompt = makeCommand(binding, deviceId, "prompt", 1, "turn.submit", { type: "turn.submit", payload: { content: [{ type: "text", text: "Ask me" }], delivery: "queue", expectedConversationRevision: 0 }, turnId: "turn-1", promptId: "prompt-1" });
    commands.set("prompt", prompt);
    sendCommand(streams.get("prompt"), prompt);
    await waitFor(() => receivedEvents.some((event) => event.type === "input.required"));
    assert.deepEqual(ackStates.get("prompt:1"), ["received", "applied"]);
    assert.equal(store.getDispatchState(prompt.commandId), "applied");

    const approval = makeCommand(binding, deviceId, "control", 1, "approval.decide", { type: "approval.decide", payload: { decisionId: "decision-1", requestId: "approval-r1", requestRevision: 1, actionDigest: `sha256:${"a".repeat(64)}`, choiceId: "approve_once", grantedPermissions: [], expiresAt: new Date(Date.now() + 60_000).toISOString(), assertion: "synthetic-assertion" } });
    commands.set("control", approval);
    const controlStream = streams.get("control");
    assert.ok(controlStream, "control subscription is independent and remains open while the turn is waiting");
    sendCommand(controlStream, approval);
    await waitFor(() => (ackStates.get("control:1") ?? []).includes("applied"));
    assert.equal(approvalCalls[0].commandId, approval.commandId, "approval command reaches injected M11 handler while prompt execution is suspended");
    assert.equal((await adapter.inspect(binding)).value.turnState, "waiting_for_input");

    const control = makeCommand(binding, deviceId, "control", 2, "input.respond", { type: "input.respond", payload: { requestId: "input-r1", requestRevision: 1, answer: "yes" } });
    commands.set("control", control);
    sendCommand(controlStream, control);
    await waitFor(() => (ackStates.get("control:2") ?? []).includes("applied") && receivedEvents.some((event) => event.type === "turn.completed"));
    assert.deepEqual(ackStates.get("control:1"), ["received", "applied"]);
    assert.deepEqual(ackStates.get("control:2"), ["received", "applied"]);
    assert.ok(receivedEvents.some((event) => event.type === "input.resolved"));
    await waitFor(() => store.countUnackedOutput() === 0);
    assert.ok(receivedEvents.length >= 4, "output event was retained and retried after the first HTTP 503");
    assert.equal(receivedEvents[0].eventId, receivedEvents[1].eventId, "outbox retry uses the same immutable event ID");

    runtime.disable();
    assert.equal(runtime.state, "disabled");
    await runtime.stop();
    assert.equal(runtime.state, "disabled");
  } finally {
    await runtime?.stop();
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("M10 interrupted applying dispatch is reconciled and never requeued", () => {
  const directory = mkdtempSync(join(tmpdir(), "m10-recovery-"));
  const path = join(directory, "bridge.sqlite");
  try {
    let store = new BridgeStore({ path });
    const command = { commandId: "restart-c1", sessionId: "restart-s1", deviceId: "restart-d1", lane: "prompt", laneSeq: 1, payload: { commandId: "restart-c1" } };
    store.acceptCommand(command);
    assert.equal(store.beginDispatch(command.commandId, "dispatch:restart-c1", command.payload), "started");
    store.close();
    store = new BridgeStore({ path });
    const recovered = store.recoverAfterRestart();
    assert.equal(recovered.attempts[0].state, "reconciliation_required");
    assert.equal(store.getDispatchState(command.commandId), "reconciliation_required");
    assert.deepEqual(store.listQueuedCommands(command.deviceId, "prompt"), []);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("M10 local disable is available offline and makes no network request", async () => {
  const directory = mkdtempSync(join(tmpdir(), "m10-offline-disable-"));
  const store = new BridgeStore({ path: join(directory, "bridge.sqlite") });
  const adapter = new FakeAppAdapter();
  const attached = await adapter.attach({ appId: "fake.app", appInstanceId: "fake-instance", conversationId: "fake-conversation" });
  assert.equal(attached.outcome, "accepted");
  let fetchCalls = 0;
  const runtime = new BridgeRuntime({ serverUrl: "https://server.invalid", deviceId: randomUUID(), credential: "disposable-device-token", binding: attached.value, store, adapter,
    fetch: async () => { fetchCalls += 1; throw new Error("network must not be used by local disable"); } });
  try {
    runtime.disable();
    assert.equal(runtime.state, "disabled");
    assert.equal(fetchCalls, 0);
    await runtime.stop();
    assert.equal(runtime.state, "disabled");
  } finally {
    await runtime.stop();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("M10 scheduler only dispatches commands through the contiguous durable lane cursor", () => {
  const directory = mkdtempSync(join(tmpdir(), "m10-lane-gap-"));
  try {
    const store = new BridgeStore({ path: join(directory, "bridge.sqlite") });
    store.acceptCommand({ commandId: "gap-c2", sessionId: "gap-s1", deviceId: "gap-d1", lane: "control", laneSeq: 2, payload: { seq: 2 } });
    assert.deepEqual(store.listQueuedCommands("gap-d1", "control"), []);
    store.acceptCommand({ commandId: "gap-c1", sessionId: "gap-s1", deviceId: "gap-d1", lane: "control", laneSeq: 1, payload: { seq: 1 } });
    assert.deepEqual(store.listQueuedCommands("gap-d1", "control").map((command) => command.laneSeq), [1, 2]);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("M10 incremental SSE parsing keeps fragmented UTF-8 and ignores heartbeats", async () => {
  const bytes = new TextEncoder().encode(": keepalive\r\nid: 9\r\nevent: command\r\ndata: {\"text\":\"বাংলা café\"}\r\n\r\n");
  const stream = new ReadableStream({ start(controller) {
    const split = bytes.findIndex((byte, index) => index > 0 && (byte & 0xc0) === 0x80);
    controller.enqueue(bytes.slice(0, split + 1)); controller.enqueue(bytes.slice(split + 1, split + 3)); controller.enqueue(bytes.slice(split + 3)); controller.close();
  } });
  const frames = [];
  for await (const frame of parseSse(stream)) frames.push(frame);
  assert.deepEqual(frames, [{ id: "9", event: "command", data: "{\"text\":\"বাংলা café\"}" }]);
});

function makeCommand(binding, deviceId, lane, seq, type, extra) {
  const commandId = `${lane}-command-${seq}`;
  return { commandId, sessionId: binding.sessionId, deviceId, lane, laneSeq: seq,
    payload: { protocolVersion: "2.0", type, commandId, lane, seq, sessionId: binding.sessionId, bindingRevision: binding.bindingRevision,
      leaseGeneration: binding.leaseGeneration, createdAt: new Date().toISOString(), ...extra } };
}
function sendCommand(response, record) {
  if (response && !response.destroyed) response.write(`id: ${record.laneSeq}\nevent: command\ndata: ${JSON.stringify(record)}\n\n`);
}
async function jsonBody(request) {
  let text = "";
  for await (const chunk of request) text += chunk;
  return JSON.parse(text);
}
async function waitFor(predicate, timeoutMs = 5000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 10)); }
  assert.fail("Timed out waiting for the bridge runtime state");
}
