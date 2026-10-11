import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import test from "node:test";
import { ClineAppAdapter, createClineTaskBridge } from "../adapters/cline/dist/index.js";
import { validateProtocolMessage } from "../protocol/dist/index.js";

// Native controller fixtures test the patch boundary only; they do not prove live Cline support.
function fixture() {
    let workspace = "workspace-A", workspaceListener;
    const sent = [];
    const task = taskFixture("task-A");
    let session = { sessionId: "task-A", isRunning: false, sdkHost: {} };
    const controller = { task, sessions: {
        getActiveSession: () => session, setRunning: value => { session.isRunning = value; },
        fireAndForgetSend: (host, sessionId, text, images) => { sent.push({ host, sessionId, text, images }); }
    }, turnStateTracker: { currentPhase: "completed", set(phase) { this.currentPhase = phase; } },
    messages: { appendAndEmit: messages => { for (const message of messages) controller.task.messageStateHandler.add(message); } },
    messageTranslatorState: { clearTurnOutcome() {} }, resolveContextMentions: async text => text,
    resetMessageTranslatorAndFence() {}, postStateToWebview: async () => {}, dispose: async () => {} };
    const api = createClineTaskBridge(controller, { installationId: "installation", hostId: "host", windowId: "window", workspaceId: () => workspace,
        onWorkspaceChanged: callback => { workspaceListener = callback; return { dispose() { workspaceListener = undefined; } }; }, remote: false });
    const select = () => api.bind({ ...api.context(), taskId: controller.task.taskId });
    const change = (id = "task-B") => { controller.task = taskFixture(id); session = { sessionId: id, isRunning: false, sdkHost: {} }; };
    const complete = () => { controller.task.messageStateHandler.add({ ts: Date.now() + 5, type: "say", say: "text", text: "native reply", partial: false }); session.isRunning = false; controller.turnStateTracker.set("completed"); };
    return { api, controller, sent, select, change, complete, workspace: value => { workspace = value; workspaceListener?.(); } };
}
function taskFixture(taskId) {
    const handler = new EventEmitter(); handler.messages = [{ ts: 1, type: "say", say: "task", text: "original task", secret: "must not export", providerConfig: { apiKey: "must not export" } }];
    handler.getClineMessages = () => structuredClone(handler.messages);
    handler.add = message => { const index = handler.messages.findIndex(candidate => candidate.ts === message.ts); if (index < 0) handler.messages.push(message); else handler.messages[index] = message; handler.emit("clineMessagesChanged"); };
    return { taskId, messageStateHandler: handler };
}
const permit = () => ({ signal: new AbortController().signal, assertAuthority() {} });
const command = (id = "command-A", revision = 1) => ({ commandId: id, text: "harmless prompt", attachmentIds: [], expectedConversationRevision: revision });
const pause = () => new Promise(resolve => setTimeout(resolve, 65));

test("M19 native patch binds exact context and exports only allowlisted transcript fields", t => {
    const f = fixture(); t.after(() => f.api.dispose());
    assert.throws(() => f.api.bind({ ...f.api.context(), taskId: "another-task" }), /BINDING_CHANGED/);
    const bound = f.select();
    assert.equal(bound.snapshot.messages[0].text, "original task");
    assert.doesNotMatch(JSON.stringify(bound.snapshot), /apiKey|providerConfig|must not export/);
    assert.throws(() => f.select(), /already bound/);
    f.change(); assert.throws(() => f.api.snapshot(bound.token), /BINDING_CHANGED/);
});

test("M19 asynchronous preparation task-switch race does not send to either task", async t => {
    const f = fixture(); t.after(() => f.api.dispose()); const { token } = f.select();
    let release; f.controller.resolveContextMentions = () => new Promise(resolve => { release = resolve; });
    const pending = f.api.submit(token, command(), permit()); f.change(); release("harmless prompt");
    await assert.rejects(pending, /BINDING_CHANGED/); assert.equal(f.sent.length, 0);
});

test("M19 expired authority and cancellation fence the native effect after preparation", async t => {
    const f = fixture(); t.after(() => f.api.dispose()); const { token } = f.select();
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(f.api.submit(token, command(), { signal: cancelled.signal, assertAuthority() { assert.fail(); } }), /cancelled/);
    await assert.rejects(f.api.submit(token, command("expired"), { signal: permit().signal, assertAuthority() { throw new Error("lease expired"); } }), /lease expired/);
    assert.equal(f.sent.length, 0); assert.equal(f.controller.task.messageStateHandler.messages.length, 1);
});

test("M19 duplicate native submissions are idempotent and conflicting IDs fail", async t => {
    const f = fixture(); t.after(() => f.api.dispose()); const { token } = f.select();
    const [first, duplicate] = await Promise.all([f.api.submit(token, command(), permit()), f.api.submit(token, command(), permit())]);
    assert.deepEqual(first, duplicate); assert.equal(f.sent.length, 1); assert.equal(f.sent[0].sessionId, "task-A");
    await assert.rejects(f.api.submit(token, { ...command(), text: "changed" }, permit()), /CONFLICT/);
    await assert.rejects(f.api.submit(token, command("while-busy", 2), permit()), /busy/);
});

test("M19 authority callbacks cannot cancel or redirect the native effect", async t => {
    for (const boundary of [1, 2]) {
        const f = fixture(); t.after(() => f.api.dispose()); const { token } = f.select();
        let checks = 0;
        await assert.rejects(f.api.submit(token, command(), { signal: permit().signal, assertAuthority() { if (++checks === boundary) f.change(); } }), boundary === 1 ? /BINDING_CHANGED/ : /EXECUTION_UNKNOWN/);
        assert.equal(f.sent.length, 0);
    }
    const f = fixture(); t.after(() => f.api.dispose()); const { token } = f.select(); const abort = new AbortController();
    await assert.rejects(f.api.submit(token, command(), { signal: abort.signal, assertAuthority() { abort.abort(); } }), /permit/);
    assert.equal(f.sent.length, 0); assert.equal(f.controller.task.messageStateHandler.messages.length, 1);
});

test("M19 same task ID with a replacement session object fails during preparation", async t => {
    const f = fixture(); t.after(() => f.api.dispose()); const { token } = f.select();
    let release; f.controller.resolveContextMentions = () => new Promise(resolve => { release = resolve; });
    const pending = f.api.submit(token, command(), permit());
    f.controller.sessions.getActiveSession = () => ({ sessionId: "task-A", isRunning: false, sdkHost: {} }); release("harmless prompt");
    await assert.rejects(pending, /session/); assert.equal(f.sent.length, 0);
});

test("M19 workspace changes, task A-B-A, and controller disposal invalidate old native tokens", async t => {
    for (const action of [f => { f.workspace("B"); f.workspace("workspace-A"); }, f => { const old = f.controller.task; f.change(); f.controller.task = old; }, f => f.controller.dispose()]) {
        const f = fixture(); t.after(() => f.api.dispose()); const { token } = f.select(); const events = [];
        f.api.subscribe(token, 0, event => events.push(event)); await action(f);
        assert.throws(() => f.api.snapshot(token), /BINDING_CHANGED/); assert.equal(events.filter(event => event.type === "invalidated").length, 1);
    }
});

test("M19 images are byte-verified, binding-scoped, and confirmed in the native echo", async t => {
    const f = fixture(); t.after(() => f.api.dispose()); const { token } = f.select();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeklEQVR4nO3PUQkAIBTAwBfNqEYziiH8OITBAtxm7fN1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWPHYBxnMBpXoCA1sAAAAASUVORK5CYII=", "base64");
    const reference = { attachmentId: "image", mimeType: "image/png", sizeBytes: png.length, sha256: `sha256:${createHash("sha256").update(png).digest("hex")}` };
    assert.throws(() => f.api.stageImage(token, { ...reference, mimeType: "text/plain" }, png, permit()), /Unsupported/);
    assert.throws(() => f.api.stageImage(token, { ...reference, sizeBytes: png.length + 1 }, png, permit()), /mismatch/);
    const receipt = f.api.stageImage(token, reference, png, permit()); assert.equal(receipt.sha256, reference.sha256);
    const accepted = await f.api.submit(token, { ...command(), attachmentIds: ["image"] }, permit());
    assert.deepEqual(accepted.imageChecksums, [reference.sha256]);
    const echo = f.api.snapshot(token).messages.find(message => message.id === accepted.messageId);
    assert.deepEqual(echo.imageChecksums, [reference.sha256]); assert.equal(f.sent[0].images.length, 1);
});

test("M19 image staging rechecks native binding after authority callbacks", t => {
    const f = fixture(); t.after(() => f.api.dispose()); const { token } = f.select();
    const bytes = Uint8Array.from([137,80,78,71,13,10,26,10]);
    const reference = { attachmentId: "guard-race", mimeType: "image/png", sizeBytes: bytes.length, sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
    assert.throws(() => f.api.stageImage(token, reference, bytes, { signal: permit().signal, assertAuthority() { f.change(); } }), /BINDING_CHANGED/);
    assert.equal(f.sent.length, 0);
});

test("M19 waiting native control cannot be projected as an empty pending-request list", async t => {
    const f = fixture(); t.after(() => f.api.dispose()); const adapter = new ClineAppAdapter(f.api);
    const { value: binding } = await adapter.attach(adapter.selection());
    for (const phase of ["awaiting_approval", "awaiting_input"]) {
        f.controller.turnStateTracker.set(phase);
        const result = await adapter.inspect(binding);
        assert.equal(result.outcome, "unknown"); assert.match(result.reason, /M20/);
    }
});

test("M19 two addressed fixture turns normalize output and native terminal events through AppAdapter", async t => {
    const f = fixture(); t.after(() => f.api.dispose()); const adapter = new ClineAppAdapter(f.api);
    const attached = await adapter.attach(adapter.selection()); assert.equal(attached.outcome, "accepted"); const binding = attached.value;
    const abort = new AbortController(); const trace = [];
    const reading = (async () => { for await (const event of adapter.subscribe(binding, [], { signal: abort.signal })) { assert.equal(validateProtocolMessage(event).valid, true, JSON.stringify(event)); trace.push(event); } })();
    for (const index of [1, 2]) {
        const input = { protocolVersion: "2.0", type: "turn.submit", commandId: `remote-${index}`, lane: "prompt", seq: index, sessionId: binding.sessionId, bindingRevision: 1, leaseGeneration: 1,
            turnId: `turn-${index}`, promptId: `prompt-${index}`, createdAt: new Date().toISOString(), payload: { content: [{ type: "text", text: "harmless prompt" }], delivery: "immediate", expectedConversationRevision: adapter.nativeSnapshot(binding).conversationRevision } };
        assert.equal((await adapter.submit(binding, input, permit())).outcome, "accepted");
        f.complete(); await pause();
    }
    abort.abort(); await reading;
    assert.equal(f.sent.length, 2); assert.ok(f.sent.every(send => send.sessionId === "task-A"));
    assert.equal(trace.filter(event => event.type === "turn.completed").length, 2);
    assert.equal(trace.filter(event => event.type === "output.item.created" && event.payload.kind === "user_message").length, 3);
    assert.ok(trace.some(event => event.type === "output.item.created" && event.payload.content[0].text === "native reply"));
    assert.equal(trace.find(event => event.type === "output.item.created" && event.payload.content[0].text === "native reply").payload.nativeCategory,"text");
    assert.equal((await adapter.resolveApproval(binding, {}, {})).outcome, "unsupported");
});

test("M19 partial output replacements preserve item identity and increase revisions", async t => {
    const f = fixture(); t.after(() => f.api.dispose()); const bound = f.select(); const events = [];
    f.api.subscribe(bound.token, 0, event => events.push(event));
    for (const [text, partial] of [["hel", true], ["hello", true], ["hello", false]]) f.controller.task.messageStateHandler.add({ ts: 7, type: "say", say: "text", text, partial });
    assert.deepEqual(events.filter(event => event.type === "message").map(event => [event.message.id, event.message.text, event.message.partial]), [["7", "hel", true], ["7", "hello", true], ["7", "hello", false]]);
});

test("M19 local prompt takeover emits reconciliation and prevents further remote input", async t => {
    const f = fixture(); t.after(() => f.api.dispose()); const adapter = new ClineAppAdapter(f.api); const { value: binding } = await adapter.attach(adapter.selection());
    f.controller.task.messageStateHandler.add({ ts: 9, type: "say", say: "user_feedback", text: "local prompt", partial: false });
    assert.equal((await adapter.inspect(binding)).outcome, "unknown"); assert.throws(() => adapter.nativeSnapshot(binding), /changed/);
    assert.equal(f.sent.length, 0);
});

test("M19 other host identities and stock API cannot be used by the adapter", async t => {
    const f = fixture(); t.after(() => f.api.dispose()); const adapter = new ClineAppAdapter(f.api);
    assert.equal((await adapter.attach({ ...adapter.selection(), appInstanceId: "other-window" })).outcome, "rejected");
    assert.throws(() => new ClineAppAdapter({ sendMessage() {} }), /Unsupported/);
    const { value: binding } = await adapter.attach(adapter.selection());
    const foreign = { ...binding, sessionId: "another-session" };
    await assert.rejects(adapter.subscribe(foreign, []).next(), /mismatch/);
    assert.equal((await adapter.detach(foreign)).outcome, "rejected");
    assert.equal(adapter.nativeSnapshot(binding).context.taskId, "task-A");
});
