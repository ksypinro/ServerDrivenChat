import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import { ClineAppAdapter, createClineTaskBridge } from "../adapters/cline/dist/index.js";
import { computeActionDigest, validateProtocolMessage } from "../protocol/dist/index.js";

// Execute the exact pinned upstream coordinator, with message translation/UI dependencies
// stubbed. These tests prove concurrency contracts; live evidence is a separate gate.
const source = readFileSync(new URL("./fixtures/cline-4.1.22/sdk-interaction-coordinator.ts", import.meta.url), "utf8");
const stripped = source.replace(/^import .*$/gm, "").replace("export class SdkInteractionCoordinator", "class SdkInteractionCoordinator");
const compiled = ts.transpileModule(stripped, { compilerOptions: { target: ts.ScriptTarget.ES2022, useDefineForClassFields: true } }).outputText.replace("export {};", "");
const Coordinator = new Function("Logger", "MessageIdMinter", "buildToolApprovalAskMessage", "buildToolApprovalDenialReason", `${compiled};return SdkInteractionCoordinator`)(
    { log() {}, warn() {} }, class { mint() { return { ts: Date.now() }; } },
    (tool, input, timestamp) => ({ ts: timestamp, type: "ask", ask: "tool", text: JSON.stringify({ tool, input }), partial: false }),
    (tool, text) => `Denied ${tool}; operation did NOT happen. ${text ?? ""}`);
function fixture({ toolFence = false } = {}) {
    let tsValue = 100;
    const makeTask = id => {
        const handler = new EventEmitter(); handler.messages = [{ ts: 1, type: "say", say: "task", text: "existing native task" }];
        handler.getClineMessages = () => handler.messages;
        return { taskId: id, messageStateHandler: handler };
    };
    const sent = [], aborted = [], effects = [], denied = [], approved = [];
    let session = { sessionId: "task-A", isRunning: false, sdkHost: { abort: async id => { aborted.push(id); } } };
    const controller = { task: makeTask("task-A"), sessions: { getActiveSession: () => session, setRunning: value => { session.isRunning = value; }, fireAndForgetSend: (...args) => sent.push(args), startNewSession: async input => input },
        turnStateTracker: { currentPhase: "completed", anchorTs: undefined, set(phase, anchorTs) { this.currentPhase = phase; this.anchorTs = anchorTs; }, get() { return { phase: this.currentPhase, anchorTs: this.anchorTs }; } },
        messages: { appendAndEmit: messages => { controller.task.messageStateHandler.messages.push(...messages); controller.task.messageStateHandler.emit("clineMessagesChanged"); } },
        messageTranslatorState: { clearTurnOutcome() {} }, resolveContextMentions: async text => text, resetMessageTranslatorAndFence() {}, postStateToWebview: async () => {}, dispose: async () => {},
        taskControl: { options: { raiseCancelFence: () => effects.push("cancel-fence") } },
        stateManager: { getGlobalSettingsKey: key => { assert.equal(key, "autoApprovalSettings"); return { enabled: true, actions: { readFiles: true, editFiles: false }, privateCredential: "not-exported" }; } }
    };
    controller.interactions = new Coordinator({ messages: controller.messages, getSessionId: () => session.sessionId, postStateToWebview: () => controller.postStateToWebview(),
        getCwd: () => "/isolated-workspace", setTurnPhase: (...args) => controller.turnStateTracker.set(...args), getMinter: () => ({ nextId: () => ++tsValue }),
        recordApprovedToolMessage: id => approved.push(id), recordDeniedToolApproval: id => denied.push(id), shouldAutoApproveTool: request => request.toolName === "read_file" });
    const api = createClineTaskBridge(controller, { installationId: "installation", hostId: "host", windowId: "window", workspaceId: () => "workspace", onWorkspaceChanged: () => ({ dispose() {} }), remote: false, controls: true, connect: toolFence, callerToolFence: toolFence });
    const adapter = new ClineAppAdapter(api);
    const change = id => { controller.task = makeTask(id); session = { sessionId: id, isRunning: false, sdkHost: { abort: async id => aborted.push(id) } }; };
    return { controller, api, adapter, sent, aborted, effects, approved, denied, change, session: () => session };
}
const permit = (callback = () => {}) => ({ signal: new AbortController().signal, assertAuthority: callback });
const flush = () => new Promise(resolve => setTimeout(resolve, 5));
async function setup(t, options = {}) {
    const f = fixture(options); t.after(() => f.api.dispose()); const { value: binding } = await f.adapter.attach(f.adapter.selection()); f.binding = binding;
    const abort = new AbortController(); f.trace = [];
    const reading = (async () => { for await (const event of f.adapter.subscribe(binding, [], { signal: abort.signal })) { assert.equal(validateProtocolMessage(event).valid, true, JSON.stringify(event)); f.trace.push(event); } })().catch(error => { if (!/binding invalidated/.test(error.message)) throw error; });
    t.after(async () => { abort.abort(); await reading.catch(error => { if (!/binding invalidated/.test(error.message)) throw error; }); });
    const command = { protocolVersion: "2.0", type: "turn.submit", commandId: "command", lane: "prompt", seq: 1, sessionId: binding.sessionId, bindingRevision: 1, leaseGeneration: 1,
        turnId: "remote-turn", promptId: "prompt", createdAt: new Date().toISOString(), payload: { content: [{ type: "text", text: "isolated native action" }], delivery: "immediate", expectedConversationRevision: 1,
            ...(options.toolFence ? { nativeToolPolicy: "deny" } : {}) } };
    assert.equal((await f.adapter.submit(binding, command, permit())).outcome, "accepted"); return f;
}
async function ask(f, id = "tool-A", input = { path: "probe.txt", content: "harmless content" }) {
    const request = { agentId: "agent", conversationId: "task-A", iteration: 1, toolCallId: id, toolName: "write_file", input, policy: { enabled: true, autoApprove: false } };
    const result = f.controller.interactions.handleRequestToolApproval(request);
    await flush(); const pending = await f.adapter.inspect(f.binding);
    assert.equal(pending.outcome, "accepted"); assert.equal(pending.value.pendingApprovals.length, 1);
    return { request, result, approval: pending.value.pendingApprovals[0] };
}
const decision = (request, choiceId = "allow_once", decisionId = "decision") => ({ decisionId, requestId: request.requestId, requestRevision: request.requestRevision, actionDigest: request.actionDigest, choiceId, grantedPermissions: [] });

test("M20 pinned native source provenance is fixed", () => {
    const record = JSON.parse(readFileSync(new URL("./fixtures/cline-4.1.22/provenance.json", import.meta.url)));
    assert.equal(record.commit, "f58bc118bdeef1bd2813cd08e00d98bdcda96475");
    assert.equal(createHash("sha256").update(source).digest("hex"), record.sha256);
});
test("M30 caller-function turn denies even auto-approved native tools and questions before the app executor", async t => {
    const f = await setup(t, { toolFence: true });
    assert.equal(f.api.apiVersion, "1.3");
    assert.equal((await f.adapter.probe()).effectPolicies.nativeToolsDenied.status, "supported");
    const deniedTool = await f.controller.interactions.handleRequestToolApproval({ toolCallId: "auto", toolName: "read_file", input: {}, policy: { autoApprove: true } });
    assert.equal(deniedTool.approved, false);
    assert.match(deniedTool.reason, /Caller-function proposal/);
    await assert.rejects(f.controller.interactions.handleAskQuestion("Unsafe native question?", ["yes"], {}), /forbids native questions/);
    assert.equal((await f.adapter.inspect(f.binding)).value.pendingApprovals.length, 0);
    assert.deepEqual(f.approved, []);
    f.controller.sessions.setRunning(false); f.controller.turnStateTracker.set("completed");
    f.controller.messages.appendAndEmit([{ ts: Date.now() + 1000, type: "say", say: "user_feedback", text: "local takeover" }], {});
    const local = await f.controller.interactions.handleRequestToolApproval({ toolCallId: "local", toolName: "read_file", input: {}, policy: { autoApprove: true } });
    assert.equal(local.approved, true, "the old remote turn's denial must not leak into a later local turn");
});
test("M30 older native API refuses tool-denial commands before dispatch", async t => {
    const f = await setup(t);
    const command = { protocolVersion: "2.0", type: "turn.submit", commandId: "old-pin-deny", lane: "prompt", seq: 2,
        sessionId: f.binding.sessionId, bindingRevision: 1, leaseGeneration: 1, turnId: "old-pin-turn", promptId: "old-pin-prompt",
        createdAt: new Date().toISOString(), payload: { content: [{ type: "text", text: "no native tools" }], delivery: "immediate", expectedConversationRevision: 2, nativeToolPolicy: "deny" } };
    assert.equal(validateProtocolMessage(command).valid, true);
    assert.equal((await f.adapter.submit(f.binding, command, permit())).outcome, "unsupported");
    assert.equal(f.sent.length, 1);
});
test("M20 allow and deny settle the addressed real coordinator promise with exact arguments/preview/digest", async t => {
    for (const choice of ["allow_once", "deny"]) {
        const f = await setup(t), a = await ask(f); const { actionDigest, kind, evidence, expiresAt, ...input } = a.approval;
        assert.equal(actionDigest, await computeActionDigest(input)); assert.deepEqual(a.approval.action.arguments.input, a.request.input);
        assert.match(a.approval.action.arguments.nativePreview, /harmless content/);
        assert.equal((await f.adapter.resolveApproval(f.binding, a.approval, decision(a.approval, choice), permit())).outcome, "applied");
        assert.equal((await a.result).approved, choice === "allow_once"); await flush();
        assert.equal(f.trace.filter(e => e.type === "approval.resolved").at(-1).payload.state, choice === "deny" ? "denied" : "applied");
        const receipt = f.trace.filter(e => e.type === "approval.applied").at(-1);
        assert.equal(receipt.payload.requestId, a.approval.requestId);
        assert.ok(receipt.payload.decisionId && receipt.payload.evidence);
        assert.equal((await f.adapter.inspect(f.binding)).value.pendingApprovals.length, 0);
        assert.deepEqual(choice === "deny" ? f.denied : f.approved, ["tool-A"]);
    }
});
test("M20 local decision then stale remote allow cannot authorize the next native ask", async t => {
    const f = await setup(t), a = await ask(f); f.controller.interactions.resolvePendingToolApproval(undefined, "noButtonClicked");
    assert.equal((await a.result).approved, false); const b = await ask(f, "tool-B");
    assert.equal((await f.adapter.resolveApproval(f.binding, a.approval, decision(a.approval), permit())).outcome, "rejected");
    assert.equal((await f.adapter.inspect(f.binding)).value.pendingApprovals[0].requestId, b.approval.requestId); assert.deepEqual(f.approved, []);
    await flush(); assert.equal(f.trace.find(e => e.type === "approval.resolved").payload.state, "resolved_elsewhere");
    assert.equal(f.trace.some(e => e.type === "approval.applied"), false, "local resolution cannot confirm a remote decision");
    f.controller.interactions.resolvePendingToolApproval(undefined, "noButtonClicked"); await b.result;
});
test("M20 authority callback local resolution and request replacement fences remote effect", async t => {
    const f = await setup(t), a = await ask(f); let next;
    const outcome = await f.adapter.resolveApproval(f.binding, a.approval, decision(a.approval), permit(() => {
        f.controller.interactions.resolvePendingToolApproval(undefined, "noButtonClicked");
        next = a.result.then(() => f.controller.interactions.handleRequestToolApproval({ ...a.request, toolCallId: "tool-B" }));
    }));
    assert.equal(outcome.outcome, "rejected"); await flush(); assert.equal(f.approved.length, 0);
    const pending = await f.adapter.inspect(f.binding); assert.equal(pending.value.pendingApprovals[0].nativeRequestId, "tool-B");
    f.controller.interactions.resolvePendingToolApproval(undefined, "noButtonClicked"); await next;
});
test("M20 remote decision wins once; duplicate receipt cannot apply to the next ask", async t => {
    const f = await setup(t), a = await ask(f), d = decision(a.approval);
    assert.equal((await f.adapter.resolveApproval(f.binding, a.approval, d, permit())).outcome, "applied"); await a.result;
    assert.equal(f.controller.interactions.resolvePendingToolApproval(undefined, "noButtonClicked"), false);
    const b = await ask(f, "tool-B");
    assert.equal((await f.adapter.resolveApproval(f.binding, a.approval, d, permit())).outcome, "applied"); assert.deepEqual(f.approved, ["tool-A"]);
    assert.equal((await f.adapter.resolveApproval(f.binding, a.approval, { ...d, choiceId: "deny" }, permit())).outcome, "rejected");
    assert.equal((await f.adapter.inspect(f.binding)).value.pendingApprovals[0].nativeRequestId, "tool-B");
    f.controller.interactions.resolvePendingToolApproval(undefined, "noButtonClicked"); await b.result;
});
test("M20 mutated native action, altered review, wrong revision, cancelled/expired authority fail closed", async t => {
    for (const variant of ["arguments", "preview", "revision", "review", "aborted", "authority", "task", "session"]) {
        const f = await setup(t), a = await ask(f); let review = a.approval, d = decision(review), authority = permit();
        if (variant === "arguments") a.request.input.content = "different action";
        if (variant === "preview") f.controller.task.messageStateHandler.messages.find(m => String(m.ts) === review.evidence.snapshotId).text = "different preview";
        if (variant === "revision") d.requestRevision++;
        if (variant === "review") review = { ...review, action: { ...review.action, tool: "different tool" } };
        if (variant === "aborted") { const abort = new AbortController(); abort.abort(); authority = { signal: abort.signal, assertAuthority() { assert.fail(); } }; }
        if (variant === "authority") authority = permit(() => { throw new Error("lease expired"); });
        if (variant === "task") authority = permit(() => f.change("task-B"));
        if (variant === "session") authority = permit(() => { f.controller.sessions.getActiveSession = () => ({ ...f.session() }); });
        assert.equal((await f.adapter.resolveApproval(f.binding, review, d, authority)).outcome, "rejected", variant); assert.equal(f.approved.length, 0);
        f.controller.interactions.clearPending("test cleanup"); await a.result;
    }
});
test("M20 native controls expose whole-action once choices; narrowing, persistence, revocation are unsupported", async t => {
    const f = await setup(t), a = await ask(f);
    for (const d of [{ ...decision(a.approval), choiceId: "allow_session" }, { ...decision(a.approval), grantedPermissions: [{ resource: "probe.txt", operation: "write", scope: {} }] }]) {
        assert.equal((await f.adapter.resolveApproval(f.binding, a.approval, d, permit())).outcome, "unsupported");
    }
    assert.equal((await f.adapter.revoke(f.binding, "arbitrary-grant", permit())).outcome, "unsupported");
    assert.deepEqual(f.adapter.nativeSnapshot(f.binding).autoApproval, { enabled: true, readFiles: true, editFiles: false });
    assert.doesNotMatch(JSON.stringify(f.adapter.nativeSnapshot(f.binding)), /not-exported/);
    f.controller.interactions.clearPending("cleanup"); await a.result;
});
test("M20 question and native answer retain the active turn, including local feedback", async t => {
    for (const local of [false, true]) {
        const f = await setup(t); const answer = f.controller.interactions.handleAskQuestion("Which label?", ["blue", "green"], {}); await flush();
        const inspection = await f.adapter.inspect(f.binding); assert.equal(inspection.value.turnState, "waiting_for_input"); assert.equal(inspection.value.pendingApprovals.length, 0);
        const pending = inspection.value.pendingInputs[0];
        assert.equal((await f.adapter.respondInput(f.binding, pending.requestId, pending.requestRevision + 1, "blue", permit())).outcome, "rejected");
        if (local) f.controller.interactions.resolvePendingAskQuestion("blue");
        else assert.equal((await f.adapter.respondInput(f.binding, pending.requestId, pending.requestRevision, "blue", permit())).outcome, "applied");
        assert.equal(await answer, "blue"); await flush();
        assert.equal((await f.adapter.inspect(f.binding)).outcome, "accepted");
        assert.equal(f.trace.filter(e => e.type === "turn.started").length, 1);
        assert.equal(f.trace.filter(e => e.type === "turn.completed").length, 0);
        assert.equal(f.trace.find(e => e.type === "input.resolved").payload.outcome, local ? "resolved_elsewhere" : "answered");
        assert.equal(f.trace.find(e => e.type === "output.item.created" && e.payload.content[0]?.text === "blue").payload.turnId, "remote-turn");
    }
});
test("M20 cancel fences captured native session, resolves pending question and observes abort acknowledgement", async t => {
    const f = await setup(t); const answer = f.controller.interactions.handleAskQuestion("Waiting?", ["yes"], {}); await flush();
    assert.equal((await f.adapter.cancel(f.binding, "other-turn", permit())).outcome, "rejected");
    assert.equal((await f.adapter.cancel(f.binding, "remote-turn", permit())).outcome, "applied"); assert.equal(await answer, ""); await flush();
    assert.deepEqual(f.aborted, ["task-A"]); assert.deepEqual(f.effects, ["cancel-fence"]);
    assert.equal(f.session().isRunning, false); assert.ok(f.controller.task.messageStateHandler.messages.some(m => m.ask === "resume_task"));
    assert.ok(f.trace.some(e => e.type === "turn.cancelled" && e.payload.turnId === "remote-turn"));
    assert.equal((await f.adapter.inspect(f.binding)).value.turnState, "cancelled");
});
test("M20 task switch during asynchronous abort never stops or appends cancellation into the new task", async t => {
    const f = await setup(t); let release;
    f.session().sdkHost.abort = id => { f.aborted.push(id); return new Promise(resolve => { release = resolve; }); };
    const result = f.adapter.cancel(f.binding, "remote-turn", permit()); f.change("task-B"); f.session().isRunning = true; release();
    assert.equal((await result).outcome, "unknown"); assert.equal(f.session().isRunning, true);
    assert.equal(f.controller.task.messageStateHandler.messages.length, 1); assert.deepEqual(f.aborted, ["task-A"]);
});
test("M20 native auto-approved tools remain native, and incomplete action evidence cannot be remotely approved", async t => {
    const f = await setup(t);
    assert.equal((await f.controller.interactions.handleRequestToolApproval({ toolCallId: "read", toolName: "read_file", input: {}, policy: {} })).approved, true);
    assert.equal((await f.adapter.inspect(f.binding)).value.pendingApprovals.length, 0);
    const a = await ask(f, "invalid", { content: Number.NaN }); assert.equal(a.approval.evidence.complete, false);
    assert.equal((await f.adapter.resolveApproval(f.binding, a.approval, decision(a.approval), permit())).outcome, "rejected");
    f.controller.interactions.clearPending("cleanup"); await a.result;
});
test("M20 pending native resolver is rechecked after async post-state preparation", async t => {
    const f = await setup(t); let release;
    f.controller.postStateToWebview = () => new Promise(resolve => { release = resolve; });
    const pending = f.controller.interactions.handleRequestToolApproval({ toolCallId: "slow", toolName: "write_file", input: { content: "safe" }, policy: {} }); await flush();
    assert.equal((await f.adapter.inspect(f.binding)).outcome, "unknown"); f.change("task-B"); release(); await flush();
    assert.equal(f.api.currentTask().taskId, "task-B"); assert.equal(f.approved.length, 0);
    f.controller.interactions.clearPending("cleanup"); await pending;
});
test("M20 native request expiry and simultaneous local/remote resolution leave the next ask untouched", async t => {
    const f = await setup(t), a = await ask(f);
    const future = Date.parse(a.approval.expiresAt) + 1;
    const clock = t.mock.method(Date, "now", () => future);
    assert.equal((await f.adapter.resolveApproval(f.binding, a.approval, decision(a.approval), permit())).outcome, "rejected"); assert.deepEqual(f.approved, []);
    clock.mock.restore();
    // A native local callback arriving in the same synchronous settlement must not
    // consume a replacement. Cline creates the next request only after this promise.
    let localResult;
    const native = f.api.bind; // A second bind is prohibited; subscribe via the existing adapter.
    assert.throws(() => native({ ...f.api.context(), taskId: "task-A" }), /already bound/);
    const originalApproved = f.controller.interactions.options.recordApprovedToolMessage;
    f.controller.interactions.options.recordApprovedToolMessage = id => { originalApproved(id); localResult = f.controller.interactions.resolvePendingToolApproval(undefined, "yesButtonClicked"); };
    assert.equal((await f.adapter.resolveApproval(f.binding, a.approval, decision(a.approval), permit())).outcome, "applied"); await a.result;
    assert.equal(localResult, false);
    const b = await ask(f, "tool-B");
    assert.equal((await f.adapter.resolveApproval(f.binding, a.approval, decision(a.approval), permit())).outcome, "applied");
    assert.equal((await f.adapter.inspect(f.binding)).value.pendingApprovals[0].requestId, b.approval.requestId); assert.deepEqual(f.approved, ["tool-A"]);
    f.controller.interactions.clearPending("cleanup"); await b.result;
});
test("M20 cancel authority race and abort failure cannot emit a successful cancellation", async t => {
    for (const variant of ["binding-race", "abort-failure"]) {
        const f = await setup(t);
        if (variant === "abort-failure") f.session().sdkHost.abort = async () => { throw new Error("native transport failed"); };
        const result = await f.adapter.cancel(f.binding, "remote-turn", permit(() => { if (variant === "binding-race") f.change("task-B"); }));
        assert.equal(result.outcome, variant === "binding-race" ? "rejected" : "unknown"); await flush();
        assert.equal(f.trace.some(event => event.type === "turn.cancelled"), false);
        assert.equal(f.controller.task.messageStateHandler.messages.some(message => message.ask === "resume_task"), false);
    }
});

test("M22 native question answer reports its revision without starting a second turn", async t => {
    const f = await setup(t);
    const before = f.adapter.nativeSnapshot(f.binding).conversationRevision;
    const answer = f.controller.interactions.handleAskQuestion("Choose a label", ["blue", "green"], {}); await flush();
    const pending = (await f.adapter.inspect(f.binding)).value.pendingInputs[0];
    assert.equal((await f.adapter.respondInput(f.binding, pending.requestId, pending.requestRevision, "blue", permit())).outcome, "applied");
    assert.equal(await answer, "blue"); await flush();
    const revision = f.adapter.nativeSnapshot(f.binding).conversationRevision;
    assert.equal(revision, before + 1);
    assert.equal(f.trace.filter(e => e.type === "turn.started").length, 1);
    assert.ok(f.trace.some(e => e.type === "turn.state" && e.payload.conversationRevision === revision && e.payload.turnId === "remote-turn"));
    const question = f.trace.find(e => e.type === "input.required");
    assert.equal(question.payload.turnId, "remote-turn"); assert.match(question.payload.nativeTurnId, /^task-A:/);
});
