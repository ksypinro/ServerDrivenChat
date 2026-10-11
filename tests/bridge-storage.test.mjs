import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BridgeStore, BridgeStorageConflict } from "../bridge/dist/storage/index.js";
import { FakeAppAdapter } from "../adapters/fake/dist/index.js";

function withDatabase(run, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "m07-bridge-"));
  const path = join(directory, "bridge.sqlite");
  try { run(path, options); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("bridge inbox advances only across durable contiguous commands and rolls back injected faults", () => {
  withDatabase((path) => {
    const store = new BridgeStore({ path });
    assert.equal(store.acceptCommand({ commandId: "c2", sessionId: "s", deviceId: "d", lane: "prompt", laneSeq: 2, payload: { text: "two" } }), "created");
    assert.equal(store.getCursor("d", "prompt"), 0);
    assert.equal(store.acceptCommand({ commandId: "c1", sessionId: "s", deviceId: "d", lane: "prompt", laneSeq: 1, payload: { text: "one" } }), "created");
    assert.equal(store.getCursor("d", "prompt"), 2);
    store.close();

    const faulty = new BridgeStore({ path, fault: (point) => { if (point === "after_inbox_insert") throw new Error("crash injection"); } });
    assert.throws(() => faulty.acceptCommand({ commandId: "c3", sessionId: "s", deviceId: "d", lane: "prompt", laneSeq: 3, payload: { text: "three" } }), /crash injection/);
    assert.equal(faulty.getCursor("d", "prompt"), 2);
    faulty.close();
    const reopened = new BridgeStore({ path });
    assert.equal(reopened.acceptCommand({ commandId: "c3", sessionId: "s", deviceId: "d", lane: "prompt", laneSeq: 3, payload: { text: "three" } }), "created");
    assert.equal(reopened.getCursor("d", "prompt"), 3);
    assert.equal(reopened.acceptCommand({ commandId: "c3", sessionId: "s", deviceId: "d", lane: "prompt", laneSeq: 3, payload: { text: "three" } }), "duplicate");
    assert.throws(() => reopened.acceptCommand({ commandId: "c3", sessionId: "s", deviceId: "d", lane: "prompt", laneSeq: 3, payload: { text: "changed" } }), BridgeStorageConflict);
    reopened.close();
  });
});

test("outbox commits before transmission, survives restart, deduplicates, and clears only after acknowledgement", () => {
  withDatabase((path) => {
    let store = new BridgeStore({ path });
    const event = { eventId: "e1", sessionId: "s", bridgeEpoch: "legacy", eventSeq: 1, payload: { type: "turn.delta", text: "hello" } };
    assert.equal(store.persistOutput(event), "created");
    assert.equal(store.persistOutput(event), "duplicate");
    store.close();
    store = new BridgeStore({ path });
    assert.deepEqual(store.listUnackedOutput(), [event]);
    assert.equal(store.acknowledgeOutput("e1"), true);
    assert.equal(store.acknowledgeOutput("e1"), false);
    assert.deepEqual(store.listUnackedOutput(), []);
    store.close();
  });
});

test("native mappings and decision consumption are immutable and idempotent", () => {
  withDatabase((path) => {
    const store = new BridgeStore({ path });
    const mapping = { sessionId: "s", entityKind: "conversation", logicalId: "l1", nativeId: "n1" };
    assert.equal(store.mapNativeId(mapping), "created");
    assert.equal(store.mapNativeId(mapping), "identical");
    assert.throws(() => store.mapNativeId({ ...mapping, nativeId: "n2" }), BridgeStorageConflict);
    const decision = { decisionId: "d1", sessionId: "s", requestId: "r", requestRevision: 1, actionDigest: "sha256:abc" };
    assert.equal(store.consumeDecision(decision), "created");
    assert.equal(store.consumeDecision(decision), "duplicate");
    assert.throws(() => store.consumeDecision({ ...decision, decisionId: "d2" }), BridgeStorageConflict);
    store.close();
  });
});

test("restart converts uncertain application attempts to reconciliation without replay", () => {
  withDatabase((path) => {
    let store = new BridgeStore({ path });
    store.createAttempt({ attemptId: "a1", sessionId: "s", commandId: "c1", action: { type: "turn.submit" } });
    store.markAttemptApplying("a1");
    store.createAttempt({ attemptId: "a2", sessionId: "s", commandId: "c2", action: { type: "turn.cancel" } });
    store.close();
    store = new BridgeStore({ path });
    const recovery = store.recoverAfterRestart();
    assert.deepEqual(recovery.attempts.map(({ attemptId, state }) => ({ attemptId, state })).sort((a, b) => a.attemptId.localeCompare(b.attemptId)), [
      { attemptId: "a1", state: "reconciliation_required" },
      { attemptId: "a2", state: "pending" }
    ]);
    assert.throws(() => store.markAttemptApplying("a1"), BridgeStorageConflict);
    store.close();
  });
});

test("a fault before cursor update cannot commit inbox work without its receipt checkpoint", () => {
  withDatabase((path) => {
    const store = new BridgeStore({ path, fault: (point) => { if (point === "before_cursor_advance") throw new Error("cursor fault"); } });
    assert.throws(() => store.acceptCommand({ commandId: "c1", sessionId: "s", deviceId: "d", lane: "control", laneSeq: 1, payload: { type: "turn.cancel" } }), /cursor fault/);
    store.close();
    const reopened = new BridgeStore({ path });
    assert.equal(reopened.getCursor("d", "control"), 0);
    assert.equal(reopened.acceptCommand({ commandId: "c1", sessionId: "s", deviceId: "d", lane: "control", laneSeq: 1, payload: { type: "turn.cancel" } }), "created");
    assert.equal(reopened.getCursor("d", "control"), 1);
    reopened.close();
  });
});

test("unknown fake-adapter submission is reconciled after restart and is not automatically retried", async () => {
  const directory = mkdtempSync(join(tmpdir(), "m07-bridge-fake-"));
  const path = join(directory, "bridge.sqlite");
  try {
    const adapter = new FakeAppAdapter({ faults: { submit: ["unknown"] } });
    const attached = await adapter.attach({ appId: "fake.app", appInstanceId: "fake-instance", conversationId: "fake-conversation" });
    assert.equal(attached.outcome, "accepted");
    const binding = attached.value;
    const command = { protocolVersion: "2.0", type: "turn.submit", commandId: "c-submit", lane: "prompt", seq: 1,
      sessionId: binding.sessionId, bindingRevision: binding.bindingRevision, leaseGeneration: binding.leaseGeneration,
      createdAt: "2026-01-01T00:00:00.000Z", turnId: "turn-1", promptId: "prompt-1",
      payload: { content: [{ type: "text", text: "hello" }], delivery: "queue", expectedConversationRevision: 0 } };
    let store = new BridgeStore({ path });
    store.createAttempt({ attemptId: "attempt-submit", sessionId: binding.sessionId, commandId: command.commandId, action: command });
    store.markAttemptApplying("attempt-submit");
    assert.equal((await adapter.submit(binding, command)).outcome, "unknown");
    store.close();
    store = new BridgeStore({ path });
    assert.equal(store.recoverAfterRestart().attempts[0].state, "reconciliation_required");
    assert.throws(() => store.markAttemptApplying("attempt-submit"), BridgeStorageConflict, "the store refuses to automatically retry an uncertain side effect");
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
