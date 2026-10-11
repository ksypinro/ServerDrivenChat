import assert from "node:assert/strict";
import test from "node:test";
import { FakeAppAdapter, fakeAdapterIsSimulation } from "../adapters/fake/dist/index.js";
import { AdapterStreamError } from "../adapters/core/dist/index.js";
import { validateProtocolMessage } from "../protocol/dist/index.js";
import { approvalRequest } from "../protocol/fixtures/v2.0/valid-messages.mjs";

const selection = { appId: "fake.app", appInstanceId: "fake-instance", conversationId: "fake-conversation" };
const nativeRequest = () => ({...structuredClone(approvalRequest),appId: "fake.app",appInstanceId: "fake-instance",bindingId: "fake-binding-0001",sessionId: "fake-session-0002",nativeConversationId: "native:fake-conversation",bindingRevision: 1,leaseGeneration: 1,nativeTurnId: `native:${approvalRequest.turnId}`});
const bindingFrom = (result) => { assert.equal(result.outcome, "accepted"); return result.value; };
const command = (binding, turnId, seq = 1, delivery = "queue") => ({
  protocolVersion: "2.0", type: "turn.submit", commandId: `command-${turnId}`, lane: "prompt", seq,
  sessionId: binding.sessionId, bindingRevision: binding.bindingRevision, leaseGeneration: binding.leaseGeneration,
  createdAt: "2026-01-01T00:00:00.000Z", turnId, promptId: `prompt-${turnId}`,
  payload: { content: [{ type: "text", text: `prompt ${turnId}` }], delivery, expectedConversationRevision: 0 }
});
async function collect(adapter, binding, count) {
  const iterator = adapter.subscribe(binding, [])[Symbol.asyncIterator]();
  const events = [];
  for (let i = 0; i < count; i += 1) events.push((await iterator.next()).value);
  return { events, iterator };
}

test("scripted fixture replays to identical simulated event sequence", async () => {
  const fixture = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("./fixtures/adapter/scripted-stream.json", import.meta.url), "utf8"));
  assert.equal(fakeAdapterIsSimulation, true);
  async function replay() {
    const adapter = new FakeAppAdapter({ script: fixture.script, now: () => "2026-01-01T00:00:00.000Z" });
    const binding = bindingFrom(await adapter.attach(selection));
    const stream = collect(adapter, binding, fixture.expectedEventTypes.length);
    await adapter.submit(binding, command(binding, "turn-1"));
    const { events } = await stream;
    assert.ok(events.every((event) => event.type === "turn.started" || !("source" in (event.payload ?? {})) || event.payload.source === "native_event"));
    assert.ok(events.filter((event) => event.type.startsWith("output.")).every((event) => event.type === "output.item.created" || event.type === "output.item.replaced"));
    return events;
  }
  const a = await replay(); const b = await replay();
  assert.deepEqual(a.map((event) => event.type), fixture.expectedEventTypes);
  assert.deepEqual(a, b);
  assert.ok(a.every((event) => event.payload.evidence === undefined || event.payload.evidence.startsWith("SIMULATED")));
});

test("suspended turn accepts control while normal prompts remain queued", async () => {
  const fixture = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("./fixtures/adapter/suspended-input-queue.json", import.meta.url), "utf8"));
  const adapter = new FakeAppAdapter({ script: fixture.script });
  const binding = bindingFrom(await adapter.attach(selection));
  const stream = collect(adapter, binding, fixture.expectedEventTypes.length);
  await adapter.submit(binding, command(binding, fixture.firstTurnId));
  const queued = await adapter.submit(binding, command(binding, fixture.queuedTurnId, 2));
  assert.equal(queued.outcome, "accepted");
  assert.match(queued.evidence, /queued behind suspended turn/);
  const before = await adapter.inspect(binding);
  assert.equal(before.value.turnState, "waiting_for_input");
  assert.equal(before.value.pendingInputs[0].requestId, "input-1");
  assert.equal((await adapter.respondInput(binding, "input-1", 1, fixture.answer)).outcome, "unknown");
  assert.equal((await adapter.respondInput(binding, "input-1", 2, fixture.answer)).outcome, "applied");
  const { events } = await stream;
  assert.deepEqual(events.map((event) => event.type), fixture.expectedEventTypes);
  assert.equal(events[5].payload.turnId, fixture.queuedTurnId);
});

test("approval controls are exact-request local simulation and deny grants nothing", async () => {
  const request = nativeRequest();
  const adapter = new FakeAppAdapter({ script: [{ type: "approval", request }] });
  const binding = bindingFrom(await adapter.attach(selection));
  await adapter.submit(binding, command(binding, request.turnId));
  assert.equal((await adapter.inspect(binding)).value.turnState, "waiting_for_approval");
  const stale = await adapter.resolveApproval(binding, request, { decisionId: "d0", requestId: request.requestId, requestRevision: 0, actionDigest: request.actionDigest, choiceId: "deny_once", grantedPermissions: [] });
  assert.equal(stale.outcome, "unknown");
  const broad = await adapter.resolveApproval(binding, request, { decisionId: "d-wide", requestId: request.requestId, requestRevision: request.requestRevision, actionDigest: request.actionDigest, choiceId: "allow_once", grantedPermissions: [{ resource: "filesystem", operation: "write", scope: { path: "/" } }] });
  assert.equal(broad.outcome, "rejected");
  const denied = await adapter.resolveApproval(binding, request, { decisionId: "d1", requestId: request.requestId, requestRevision: request.requestRevision, actionDigest: request.actionDigest, choiceId: "deny_once", grantedPermissions: [] });
  assert.equal(denied.outcome, "applied");
  assert.match(denied.evidence, /^SIMULATED/);
});

test("cancel, unsupported capabilities, and injected unknown outcomes stay explicit", async () => {
  const adapter = new FakeAppAdapter({ script: [{ type: "input", requestId: "i", requestRevision: 1, question: "wait" }],
    unsupported: ["revoke"], faults: { cancel: ["unknown"], attach: ["unknown"] } });
  assert.equal((await adapter.attach(selection)).outcome, "unknown");
  const binding = bindingFrom(await adapter.attach(selection));
  assert.equal((await adapter.probe()).operations.revoke.status, "unsupported");
  await adapter.submit(binding, command(binding, "turn-cancel"));
  assert.equal((await adapter.cancel(binding, "turn-cancel")).outcome, "unknown");
  const cancelled = await adapter.cancel(binding, "turn-cancel");
  assert.equal(cancelled.outcome, "applied");
  assert.match(cancelled.evidence, /^SIMULATED/);
});

test("stream setup failures retain their explicit outcome", async () => {
  const adapter = new FakeAppAdapter({ faults: { subscribe: ["unknown"] } });
  const binding = bindingFrom(await adapter.attach(selection));
  await assert.rejects(async () => {
    const iterator = adapter.subscribe(binding, [])[Symbol.asyncIterator]();
    await iterator.next();
  }, (error) => error instanceof AdapterStreamError && error.outcome === "unknown");
});


test("native simulator rejects caller-replaced approval authority", async () => {
  const request = nativeRequest();
  const adapter = new FakeAppAdapter({script: [{type: "approval", request}]});
  const binding = bindingFrom(await adapter.attach(selection));
  await adapter.submit(binding, command(binding, request.turnId));
  for (const alter of [r => r.actionDigest = `sha256:${"b".repeat(64)}`, r => r.availableDecisions.push({id: "invented", effect: "allow", scope: "persistent", label: "invented"}), r => r.requestedPermissions.push({resource: "filesystem", operation: "write", scope: {path: "/"}})]) {
    const changed = structuredClone(request); alter(changed);
    const decision = {decisionId: "modified", requestId: request.requestId, requestRevision: request.requestRevision, actionDigest: changed.actionDigest, choiceId: "allow_once", grantedPermissions: []};
    assert.ok(["rejected", "unknown"].includes((await adapter.resolveApproval(binding, changed, decision)).outcome));
    assert.equal((await adapter.inspect(binding)).value.turnState, "waiting_for_approval");
  }
});


test("approval scripts reject foreign bindings and emit valid native envelopes", async () => {
  const foreign=new FakeAppAdapter({script:[{type:"approval",request:structuredClone(approvalRequest)}]});
  const wrongBinding=bindingFrom(await foreign.attach(selection));
  assert.equal((await foreign.submit(wrongBinding,command(wrongBinding,approvalRequest.turnId))).outcome,"rejected");
  const request=nativeRequest();const adapter=new FakeAppAdapter({script:[{type:"approval",request}]});const binding=bindingFrom(await adapter.attach(selection));
  const events=collect(adapter,binding,2);await adapter.submit(binding,command(binding,request.turnId));
  for(const event of (await events).events)assert.equal(validateProtocolMessage(event).valid,true,event.type);
});
