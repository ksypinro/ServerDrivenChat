import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { chromium } from "playwright";
import { createServer } from "vite";

process.env.VITE_OIDC_ISSUER = "https://identity.m14.test";
process.env.VITE_OIDC_CLIENT_ID = "control-ui-test";
let vite;
let browser;
let origin;

before(async () => {
    vite = await createServer({ configFile: new URL("../vite.config.ts", import.meta.url).pathname, server: { host: "127.0.0.1", port: 0, strictPort: false }, logLevel: "error" });
    await vite.listen();
    const address = vite.httpServer.address();
    origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ channel: "chrome", headless: true });
});

after(async () => { await browser?.close(); await vite?.close(); });

const approval = {
    requestId: "approval-xss", requestRevision: 3, kind: "action_approval", appId: "fake.app", appInstanceId: "instance-1", bindingId: "binding-1", sessionId: "session-visible", nativeConversationId: "conversation-1", bindingRevision: 2, leaseGeneration: 4, turnId: "turn-running",
    action: { tool: "file.write", arguments: { path: "report.txt", text: "safe review data" } }, requestedPermissions: [{ resource: "workspace", operation: "write", scope: { paths: ["report.txt"] } }],
    availableDecisions: [{ id: "allow_once", effect: "allow", scope: "action" }, { id: "deny", effect: "deny", scope: "action" }], actionDigest: `sha256:${"a".repeat(64)}`, evidence: { source: "native_event", complete: true }, expiresAt: new Date(Date.now() + 120_000).toISOString()
};

async function signedInPage(role, native = false, bindingState = "active", leaseExpired = false) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let decisionState = "pending";
    const commands = [];
    const uploadedContents = [];
    await page.route("https://identity.m14.test/**", async route => {
        const url = new URL(route.request().url());
        if (url.pathname === "/authorize") {
            const callback = new URL(url.searchParams.get("redirect_uri")); callback.searchParams.set("code", "one-use-code"); callback.searchParams.set("state", url.searchParams.get("state"));
            return route.fulfill({ status: 302, headers: { location: callback.toString() } });
        }
        return route.fulfill({ status: 404 });
    });
    await page.route("**/v2/**", async route => {
        const url = new URL(route.request().url()); const method = route.request().method();
        if (url.pathname === "/v2/auth/oidc/start" && method === "POST") { const state = `state-${role}`; const callback = route.request().postDataJSON().redirectUri; return route.fulfill({ json: { state, authorizationUrl: `https://identity.m14.test/authorize?state=${state}&redirect_uri=${encodeURIComponent(callback)}` } }); }
        if (url.pathname === "/v2/auth/oidc/exchange" && method === "POST") { const exchange = route.request().postDataJSON(); assert.equal(exchange.state, `state-${role}`); assert.equal(exchange.code, "one-use-code"); return route.fulfill({ json: { accessToken: "m14-browser-token" } }); }
        if (url.pathname === "/v2/sessions" && method === "GET") return route.fulfill({ json: { sessions: [{
            sessionId: "session-visible", state: "active", role,
            binding: { bindingId: "binding-1", deviceId: "device-1", bindingRevision: 2, leaseGeneration: 4, state: bindingState, leaseExpiresAt: new Date(Date.now() + (leaseExpired ? -60_000 : 60_000)).toISOString(),
                payload: { ...(native ? { binding: { appId: "test.native", nativeConversationId: "native-task" } } : {}), appId: "fake.app", appName: "Fake App", nativeConversationId: "conversation-1", conversationLabel: "Existing chat", conversationRevision: 7,
                    capabilities: { submit: { status: "supported", reason: "fake adapter" }, cancel: { status: "unsupported", reason: "This fake profile cannot cancel a running turn" } } } }
        }] } });
        if (url.pathname.endsWith("/snapshot") && method === "GET") return route.fulfill({ json: { ...(native ? { bindings: [{ bindingId: "binding-1", payload: { binding: { appId: "test.native", nativeConversationId: "native-task" }, conversationRevision: 12, capabilities: { submit: { status: "supported", reason: "native" }, cancel: { status: "supported", reason: "delegated native" } } } }] } : {}), cursors: { sessionSeq: 8 }, interactions: [{ kind: "approval", requestId: approval.requestId, requestRevision: approval.requestRevision, state: decisionState, payload: approval }], projection: { sessionId: "session-visible", watermark: 8, items: [{ itemId: "item-xss", turnId: "turn-old", kind: "assistant_message", revision: 1, partial: false, completed: true, evidence: "observed", content: [{ type: "text", text: `Rendered safely <img src=x onerror=alert('xss')>` }] }], artifacts: [], pendingApprovals: [approval], interactionStates: { [`${approval.requestId}@${approval.requestRevision}`]: decisionState }, turnStates: native ? { "000-active": "waiting_for_input", "turn-a": "completed", "turn-b": "completed", "turn-c": "completed", "turn-d": "completed", "turn-z": "completed" } : { "turn-running": "running" }, needsRepair: false, repairAfter: null } } });
        if (url.pathname.endsWith("/events")) return route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: ": keep-alive\n\n" });
        if (url.pathname === "/v2/attachments" && method === "POST") { uploadedContents.push(route.request().postDataBuffer()); return route.fulfill({ status: 202, json: { attachmentId: "attachment-ui-1", sha256: route.request().headers()["x-content-sha256"] } }); }
        if (url.pathname.endsWith("/attachment-ui-1/commit") && method === "POST") return route.fulfill({ status: 200, json: { attachmentId: "attachment-ui-1", state: "committed" } });
        if (url.pathname.endsWith("/decisions") && method === "POST") { decisionState = "decision_recorded"; return route.fulfill({ status: 202, json: { disposition: "recorded", state: "decision_recorded", durable: true } }); }
        if (url.pathname.endsWith("/turns") && method === "POST") { commands.push(route.request().postDataJSON().command); return route.fulfill({ status: 202, json: { commandId: "command-1", lane: "prompt", laneSeq: commands.length, disposition: "created", durable: true } }); }
        if (url.pathname.includes("/controls") && method === "POST") { commands.push(route.request().postDataJSON().command); return route.fulfill({ status: 202, json: { commandId: "control-1", lane: "control", laneSeq: commands.length, disposition: "created", durable: true } }); }
        return route.fulfill({ status: 404, json: { error: { message: "not found" } } });
    });
    await page.goto(origin);
    await page.getByRole("button", { name: /sign in securely/i }).click();
    await page.getByRole("heading", { name: native ? "native-task" : "Existing chat", exact: true }).waitFor();
    return { context, page, commands, uploadedContents };
}

test("M14 owner flow queues text and keeps approval recorded separate from app application", async () => {
    const { context, page, commands, uploadedContents } = await signedInPage("owner");
    try {
        assert.equal(new URL(page.url()).search, "", "authorization code should be removed from the address bar");
        assert.equal(await page.locator("img[onerror]").count(), 0, "transcript markup must never become executable DOM");
        assert.match(await page.locator(".message-card pre").textContent(), /<img src=x onerror=/);
        await page.getByRole("textbox", { name: "Message" }).fill("Follow up on this visible turn");
        await page.getByLabel("Attach files").setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("exact committed bytes") });
        await page.getByRole("button", { name: "Queue prompt" }).click();
        await page.getByRole("status").waitFor();
        assert.equal(commands[0].type, "turn.submit");
        assert.equal(commands[0].sessionId, "session-visible");
        assert.equal(commands[0].payload.expectedConversationRevision, 7);
        assert.equal(commands[0].payload.content[1].attachmentId, "attachment-ui-1");
        assert.equal(uploadedContents[0].toString(), "exact committed bytes");
        await page.getByLabel("Decision").selectOption("allow_once");
        await page.getByRole("checkbox").check();
        await page.getByRole("button", { name: "Record decision" }).click();
        await page.getByText("Native application is a separate stage.").waitFor();
        assert.match(await page.locator(".decision-stage").textContent(), /decision recorded/i);
        await page.reload();
        await page.getByRole("button", { name: /sign in securely/i }).click();
        await page.getByRole("heading", { name: "Existing chat" }).waitFor();
        assert.match(await page.locator(".decision-stage").textContent(), /decision recorded/i, "refresh recovers the server decision state");
    } finally { await context.close(); }
});

test("M14 viewer is read-only and cannot make approvals or prompt changes", async () => {
    const { context, page } = await signedInPage("viewer");
    try {
        assert.equal(await page.getByRole("textbox", { name: "Message" }).isDisabled(), true);
        assert.equal(await page.getByRole("button", { name: "Owner review required" }).isDisabled(), true);
        assert.equal(await page.getByLabel("Decision").isDisabled(), true);
        assert.equal(await page.getByRole("button", { name: "Request remote disable" }).isDisabled(), true);
    } finally { await context.close(); }
});

// Native registration stores its exact identity under binding; snapshots carry the latest app revision.
test("M22 real binding layout enables native controls and uses the current snapshot revision", async () => {
    const f = await signedInPage("owner", true);
    try {
        await f.page.getByRole("heading", { name: "native-task", exact: true }).waitFor();
        await f.page.getByRole("textbox", { name: "Message", exact: true }).fill("Native follow-up");
        await f.page.getByRole("button", { name: /Queue prompt/ }).click();
        await f.page.getByRole("status").waitFor();
        assert.equal(f.commands[0].payload.expectedConversationRevision, 12);
        await f.page.getByRole("button", { name: "Request stop", exact: true }).click();
        assert.equal(f.commands.at(-1).type, "turn.cancel");
        assert.equal(f.commands.at(-1).turnId, "000-active", "active turn survives more than four alphabetically later terminal IDs");
    } finally { await f.context.close(); }
});


test("M23 disconnected owners receive bridge repair guidance without an ownership error", async () => {
    for (const [state, expired] of [["detached", false], ["active", true]]) {
    const f = await signedInPage("owner", false, state, expired);
    try {
        assert.equal(await f.page.locator(".session-row .connection-dot.online").count(), 0);
        assert.equal(await f.page.getByRole("button", { name: "Bridge unavailable", exact: true }).isDisabled(), true);
        await f.page.getByText("Reconnect the companion before recording a decision for this request.").waitFor();
        assert.equal(await f.page.getByRole("button", { name: "Owner review required" }).count(), 0);
        assert.equal(await f.page.getByLabel("Decision").isDisabled(), true);
        assert.equal(await f.page.getByRole("button", { name: "Queue prompt" }).isDisabled(), true);
    } finally { await f.context.close(); }
    }
});
