import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import { ClineAppAdapter, createClineTaskBridge } from "../adapters/cline/dist/index.js";

// Execute the exact upstream Cline 4.1.23 interaction coordinator with UI dependencies stubbed.
// 4.1.23 registers the approval resolver before posting state and denies that approval if the
// post fails. These are fixture checks of the native add-on, not live native acceptance.
const source = readFileSync(new URL("./fixtures/cline-4.1.23/sdk-interaction-coordinator.ts", import.meta.url), "utf8");
const stripped = source.replace(/^import .*$/gm, "").replace("export class SdkInteractionCoordinator", "class SdkInteractionCoordinator");
const compiled = ts.transpileModule(stripped, { compilerOptions: { target: ts.ScriptTarget.ES2022, useDefineForClassFields: true } }).outputText.replace("export {};", "");
const Coordinator = new Function("Logger", "MessageIdMinter", "buildToolApprovalAskMessage", "buildToolApprovalDenialReason", `${compiled};return SdkInteractionCoordinator`)(
    { log() {}, warn() {} }, class { mint() { return { ts: Date.now() }; } },
    (tool, input, timestamp) => ({ ts: timestamp, type: "ask", ask: "tool", text: JSON.stringify({ tool, input }), partial: false }),
    (tool, text) => `Denied ${tool}; operation did NOT happen. ${text ?? ""}`);
const DISPLAY_FAILED = "The tool approval request could not be displayed, so the tool was not executed.";

function fixture() {
    let tsValue = 100;
    const handler = new EventEmitter(); handler.messages = [{ ts: 1, type: "say", say: "task", text: "existing native task" }];
    handler.getClineMessages = () => handler.messages;
    const session = { sessionId: "task-A", isRunning: false, sdkHost: { abort: async () => {} } };
    const denied = [], posts = [];
    const controller = { task: { taskId: "task-A", messageStateHandler: handler },
        sessions: { getActiveSession: () => session, setRunning: value => { session.isRunning = value; }, fireAndForgetSend() {}, startNewSession: async input => input },
        turnStateTracker: { currentPhase: "completed", anchorTs: undefined, set(phase, anchorTs) { this.currentPhase = phase; this.anchorTs = anchorTs; }, get() { return { phase: this.currentPhase, anchorTs: this.anchorTs }; } },
        messages: { appendAndEmit: messages => { handler.messages.push(...messages); handler.emit("clineMessagesChanged"); } },
        messageTranslatorState: { clearTurnOutcome() {} }, resolveContextMentions: async text => text, resetMessageTranslatorAndFence() {}, dispose: async () => {},
        // Each approval display can be held open and then succeed or fail.
        postStateToWebview: () => { const post = {}; post.done = new Promise((resolve, reject) => { post.succeed = resolve; post.fail = reject; }); posts.push(post); return post.done; },
        taskControl: { options: { raiseCancelFence() {} } },
        stateManager: { getGlobalSettingsKey: () => ({ enabled: false, actions: {} }) }
    };
    controller.interactions = new Coordinator({ messages: controller.messages, getSessionId: () => session.sessionId, postStateToWebview: () => controller.postStateToWebview(),
        getCwd: () => "/isolated-workspace", setTurnPhase: (...args) => controller.turnStateTracker.set(...args), getMinter: () => ({ nextId: () => ++tsValue }),
        recordDeniedToolApproval: (id, tool, reason) => denied.push({ id, reason }) });
    const api = createClineTaskBridge(controller, { installationId: "installation", hostId: "host", windowId: "window", workspaceId: () => "workspace",
        onWorkspaceChanged: () => ({ dispose() {} }), remote: false, controls: true, connect: false, callerToolFence: false });
    return { controller, api, adapter: new ClineAppAdapter(api), denied, posts };
}
const permit = () => ({ signal: new AbortController().signal, assertAuthority() {} });
const flush = () => new Promise(resolve => setTimeout(resolve, 5));
const settled = (promise, ms = 200) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve("still pending"), ms))]);
async function setup(t) {
    const f = fixture(); t.after(() => f.api.dispose());
    const { value: binding } = await f.adapter.attach(f.adapter.selection()); f.binding = binding;
    const command = { protocolVersion: "2.0", type: "turn.submit", commandId: "command", lane: "prompt", seq: 1, sessionId: binding.sessionId, bindingRevision: 1, leaseGeneration: 1,
        turnId: "remote-turn", promptId: "prompt", createdAt: new Date().toISOString(), payload: { content: [{ type: "text", text: "isolated native action" }], delivery: "immediate", expectedConversationRevision: 1 } };
    assert.equal((await f.adapter.submit(binding, command, permit())).outcome, "accepted");
    for (const post of f.posts.splice(0)) post.succeed();
    return f;
}
const request = id => ({ agentId: "agent", conversationId: "task-A", iteration: 1, toolCallId: id, toolName: "write_file", input: { path: "probe.txt" }, policy: { enabled: true, autoApprove: false } });
const pendingIds = async f => (await f.adapter.inspect(f.binding)).value.pendingApprovals.map(item => item.nativeRequestId);

test("Cline 4.1.23 fixture source provenance is fixed", () => {
    const record = JSON.parse(readFileSync(new URL("./fixtures/cline-4.1.23/provenance.json", import.meta.url)));
    assert.equal(record.commit, "afaf4f2457ae467f2e0c8f4c9407967373e34569");
    assert.equal(createHash("sha256").update(source).digest("hex"), record.sha256);
});

test("Cline 4.1.23 approval whose display fails is denied, as the stock app would", async t => {
    const f = await setup(t);
    const result = f.controller.interactions.handleRequestToolApproval(request("tool-A"));
    await flush();
    assert.deepEqual(await pendingIds(f), ["tool-A"]);
    f.posts.at(-1).fail(new Error("webview unavailable"));
    assert.deepEqual(await settled(result), { approved: false, reason: DISPLAY_FAILED });
    assert.deepEqual(f.denied, [{ id: "tool-A", reason: DISPLAY_FAILED }]);
    assert.equal(f.controller.turnStateTracker.currentPhase, "streaming");
    assert.deepEqual(await pendingIds(f), []);
});

test("Cline 4.1.23 late display failure never denies a later approval", async t => {
    const f = await setup(t);
    const first = f.controller.interactions.handleRequestToolApproval(request("tool-A"));
    await flush();
    const firstPost = f.posts.at(-1);
    assert.equal(f.controller.interactions.resolvePendingToolApproval(undefined, "yesButtonClicked"), true);
    assert.deepEqual(await first, { approved: true });
    const second = f.controller.interactions.handleRequestToolApproval(request("tool-B"));
    await flush();
    f.posts.at(-1).succeed();
    firstPost.fail(new Error("late webview failure"));
    await flush();
    assert.deepEqual(await pendingIds(f), ["tool-B"]);
    assert.deepEqual(f.denied, []);
    assert.equal(await settled(second, 20), "still pending");
    f.controller.interactions.resolvePendingToolApproval(undefined, "noButtonClicked");
    assert.equal((await second).approved, false);
});

test("Cline 4.1.23 remote approval decisions still settle the captured native resolver", async t => {
    const f = await setup(t);
    const result = f.controller.interactions.handleRequestToolApproval(request("tool-A"));
    await flush(); f.posts.at(-1).succeed();
    const [approval] = (await f.adapter.inspect(f.binding)).value.pendingApprovals;
    const decision = { decisionId: "decision", requestId: approval.requestId, requestRevision: approval.requestRevision, actionDigest: approval.actionDigest, choiceId: "allow_once", grantedPermissions: [] };
    assert.equal((await f.adapter.resolveApproval(f.binding, approval, decision, permit())).outcome, "applied");
    assert.deepEqual(await result, { approved: true });
    assert.deepEqual(await pendingIds(f), []);
});

test("Cline 4.1.23 cancellation clears a pending approval through the native deny path", async t => {
    const f = await setup(t);
    const result = f.controller.interactions.handleRequestToolApproval(request("tool-A"));
    await flush(); f.posts.at(-1).succeed();
    // Same order as the add-on's addressed cancel: leave the approval phase, then clear the native slot.
    f.controller.turnStateTracker.set("resumable");
    f.controller.interactions.clearPending("Task cancelled");
    assert.deepEqual(await result, { approved: false, reason: "Task cancelled" });
    assert.deepEqual(f.denied, [{ id: "tool-A", reason: "Task cancelled" }]);
    assert.deepEqual(await pendingIds(f), []);
});
