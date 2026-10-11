import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ServerDatabase, StorageConflictError } from "../server/dist/storage/index.js";

const databaseUrl = process.env.M06_TEST_DATABASE_URL;

if (!databaseUrl) {
  test("PostgreSQL storage acceptance (set M06_TEST_DATABASE_URL)", { skip: "requires the real PostgreSQL 17 M06 test database" }, () => {});
} else {
  test("PostgreSQL migrations, atomic deduplication, rollback, conditional updates, replay, snapshots, and pool restart", async () => {
    const store = new ServerDatabase({ poolConfig: { connectionString: databaseUrl, max: 12 } });
    const id = randomUUID();
    const records = { user: `m06-user-${id}`, device: `m06-device-${id}`, session: `m06-session-${id}`, binding: `m06-binding-${id}` };
    try {
      await Promise.all([store.migrate(), store.migrate()]);
      assert.equal(await store.putUser({ userId: records.user, email: `${id}@m06.test` }), "created");
      assert.equal(await store.putUser({ userId: records.user, email: `${id}@m06.test` }), "identical");
      await store.putDevice({ deviceId: records.device, userId: records.user, status: "active", payload: { name: "test device" } });
      await store.putSession({ sessionId: records.session, ownerUserId: records.user });
      await store.putBinding({ bindingId: records.binding, sessionId: records.session, deviceId: records.device, bindingRevision: 1, leaseGeneration: 1, state: "active", payload: { nativeConversationId: "opaque:native-1" } });

      const command = { commandId: `m06-command-${id}`, sessionId: records.session, deviceId: records.device, lane: "prompt", payload: { command: "turn.submit", stable: true } };
      const duplicates = await Promise.all(Array.from({ length: 12 }, () => store.recordCommand(command)));
      assert.equal(new Set(duplicates.map((record) => record.laneSeq)).size, 1, "concurrent identical writes share one allocated lane sequence");
      assert.equal(duplicates.filter((record) => record.disposition === "created").length, 1);
      assert.equal(duplicates[0].laneSeq, 1);
      await assert.rejects(store.recordCommand({ ...command, payload: { command: "changed" } }), StorageConflictError);
      const control = await store.recordCommand({ ...command, commandId: `m06-control-${id}`, lane: "control" });
      const prompt2 = await store.recordCommand({ ...command, commandId: `m06-prompt2-${id}` });
      assert.equal(control.laneSeq, 1, "control lane sequences independently from prompt lane");
      assert.equal(prompt2.laneSeq, 2);
      assert.deepEqual((await store.readCommands(records.device, "prompt", 0)).map((item) => item.laneSeq), [1, 2]);

      const event = { eventId: `m06-event-${id}`, sessionId: records.session, bridgeEpoch: "epoch-a", producerSeq: 1, payload: { type: "turn.started" } };
      const eventCopies = await Promise.all(Array.from({ length: 8 }, () => store.recordEvent(event)));
      assert.equal(new Set(eventCopies.map((record) => record.sessionSeq)).size, 1);
      assert.equal(eventCopies.filter((record) => record.disposition === "created").length, 1);
      await assert.rejects(store.recordEvent({ ...event, payload: { type: "turn.failed" } }), StorageConflictError);
      const event2 = await store.recordEvent({ ...event, eventId: `m06-event2-${id}`, producerSeq: 2, payload: { type: "turn.completed" } });
      assert.equal(event2.sessionSeq, 2);
      for (let seq = 3; seq <= 12; seq += 1) {
        const [snapshotDuringIngest, appended] = await Promise.all([
          store.readSnapshot(records.session),
          store.recordEvent({ ...event, eventId: `m06-event-${id}-${seq}`, producerSeq: seq, payload: { seq } })
        ]);
        assert.equal(snapshotDuringIngest.watermark.sessionSeq, snapshotDuringIngest.events.length, "repeatable snapshot and watermark describe the same database cut");
        assert.ok(appended.sessionSeq > 2);
      }

      const pending = { interactionId: `m06-interaction-${id}`, sessionId: records.session, requestId: `request-${id}`, requestRevision: 1, kind: "approval", state: "pending", payload: { digest: "request-bound" } };
      assert.equal(await store.putInteraction(pending), "created");
      const transitioned = await Promise.all([
        store.transitionInteraction(pending.interactionId, "pending", "decision_recorded", { decision: "deny" }),
        store.transitionInteraction(pending.interactionId, "pending", "decision_recorded", { decision: "deny" })
      ]);
      assert.equal(transitioned.filter(Boolean).length, 1, "conditional state transition has one winner");

      const decision = { decisionId: `m06-decision-${id}`, sessionId: records.session, requestId: pending.requestId, requestRevision: 1, payload: { choiceId: "deny_once" } };
      const winners = await Promise.allSettled([
        store.recordDecision(decision),
        store.recordDecision({ ...decision, decisionId: `${decision.decisionId}-conflict`, payload: { choiceId: "allow_once" } })
      ]);
      assert.equal(winners.filter((result) => result.status === "fulfilled").length, 1, "one decision wins atomically");
      assert.equal(winners.filter((result) => result.status === "rejected" && result.reason instanceof StorageConflictError).length, 1);
      const winningDecision = await store.pool.query("SELECT decision_id FROM decisions WHERE session_id=$1 AND request_id=$2 AND request_revision=1", [records.session, pending.requestId]);
      assert.equal(winningDecision.rowCount, 1);

      await store.putGrant({ grantId: `m06-grant-${id}`, sessionId: records.session, requestId: pending.requestId, decisionId: winningDecision.rows[0].decision_id, state: "active", payload: { testMetadata: true } });
      await store.putAttachmentMetadata({ attachmentId: `m06-attachment-${id}`, sessionId: records.session, state: "committed", payload: { mimeType: "text/plain", sha256: "a".repeat(64) } });
      await store.appendAudit({ auditId: `m06-audit-${id}`, sessionId: records.session, actorId: records.user, action: "test.persisted", payload: { run: id } });

      const beforeRollback = await store.pool.query("SELECT count(*)::int AS count FROM app_users WHERE user_id=$1", [`rollback-${id}`]);
      await assert.rejects(store.transaction(async (client) => {
        await client.query("INSERT INTO app_users(user_id,email) VALUES($1,$2)", [`rollback-${id}`, `rollback-${id}@m06.test`]);
        await client.query("INSERT INTO sessions(session_id,owner_user_id) VALUES($1,$2)", [`rollback-session-${id}`, `rollback-${id}`]);
        throw new Error("intentional transaction rollback probe");
      }), /intentional transaction rollback probe/);
      const afterRollback = await store.pool.query("SELECT count(*)::int AS count FROM app_users WHERE user_id=$1", [`rollback-${id}`]);
      const afterSessionRollback = await store.pool.query("SELECT count(*)::int AS count FROM sessions WHERE session_id=$1", [`rollback-session-${id}`]);
      assert.equal(beforeRollback.rows[0].count, 0);
      assert.equal(afterRollback.rows[0].count, 0, "failed multi-write transaction left no partial record");
      assert.equal(afterSessionRollback.rows[0].count, 0, "dependent session insert rolled back with its user");

      const snapshot = await store.readSnapshot(records.session);
      const replay = await store.readEvents(records.session, 0);
      assert.equal(snapshot.watermark.sessionSeq, 12);
      assert.equal(snapshot.events.length, 12);
      assert.equal(replay.length, snapshot.watermark.sessionSeq);
      assert.deepEqual(replay.map((item) => item.sessionSeq), Array.from({ length: 12 }, (_, index) => index + 1));
      assert.equal(snapshot.interactions[0].state, "decision_recorded");
      assert.equal(snapshot.bindings[0].payload.nativeConversationId, "opaque:native-1");

      await store.close();
      if (process.env.M06_TEST_DOCKER_RESTART === "1") {
        const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
        execFileSync("docker", ["compose", "restart", "postgres-m06"], { cwd: root, stdio: "pipe" });
      }
      const restarted = new ServerDatabase({ poolConfig: { connectionString: databaseUrl, max: 4 } });
      try {
        for (let attempt = 0; ; attempt += 1) {
          try { await restarted.pool.query("SELECT 1"); break; }
          catch (error) { if (attempt >= 29) throw error; await new Promise((resolve) => setTimeout(resolve, 1000)); }
        }
        await restarted.migrate();
        const afterRestart = await restarted.readSnapshot(records.session);
        assert.equal(afterRestart.watermark.sessionSeq, 12, "accepted event data survives reopening storage after restart");
        assert.equal((await restarted.readCommands(records.device, "prompt", 0)).length, 2);
        assert.equal((await restarted.recordCommand(command)).disposition, "identical");
      } finally { await restarted.close(); }
    } finally { await store.close(); }
  });
}
