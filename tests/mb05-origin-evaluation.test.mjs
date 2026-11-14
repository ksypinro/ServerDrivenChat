import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../extensions/claude-origin-evaluation/hooks/register.js", import.meta.url), "utf8");

function fixture() {
    const handlers = new Map();
    const timers = [];
    const submissions = [];
    const logs = [];
    const commands = [];
    let identity = "selected";
    const context = vm.createContext({ TextEncoder, Uint8Array, Set, crypto: { subtle: {
        // Replace only identity hashing so tests need no user's raw session ID.
        digest: async (_algorithm, bytes) => Uint8Array.from(Buffer.from(
            new TextDecoder().decode(bytes) === "selected" ? "763571110b7e7f52" : "0000000000000000", "hex")),
    } } });
    vm.runInContext(source.replace("export function register", "function register"), context);
    context.register((name, matcher, callback) => handlers.set(name, callback ?? matcher));
    const $ = {
        session: { id: async () => identity },
        ui: { log: async text => logs.push(text) },
        clock: { after: (delay, fn) => { assert.equal(delay, 100); timers.push(fn); } },
        command: { register: async command => commands.push(command) },
        prompt: { submit: async args => { submissions.push(args); return { drop: "native stub refusal" }; } },
    };
    return { $, handlers, timers, submissions, logs, commands, setIdentity(value) { identity = value; } };
}

test("loading and starting the selected session only register an immediate local command", async () => {
    const f = fixture();
    await f.handlers.get("session.start")(f.$, {}, async () => ({}));
    assert.equal(f.commands[0].name, "sdc-fence-offer");
    assert.equal(f.commands[0].immediate, true);
    assert.equal(f.submissions.length, 0);
    assert.equal(f.timers.length, 0);
});

test("other sessions register nothing and cannot schedule a diagnostic", async () => {
    const f = fixture(); f.setIdentity("other");
    await f.handlers.get("session.start")(f.$, {}, async () => ({}));
    await f.handlers.get("command.run")(f.$, { args: "idle" });
    assert.equal(f.commands.length, 0);
    assert.equal(f.timers.length, 0);
});

test("only exact local labels schedule at most one attempt each", async () => {
    const f = fixture();
    for (const args of ["", "allow", "idle extra", "idle", "idle", "busy", "busy"]) {
        await f.handlers.get("command.run")(f.$, { args });
    }
    assert.equal(f.timers.length, 2);
    assert.equal(f.submissions.length, 0);
    for (const timer of f.timers) await timer();
    assert.equal(f.submissions.length, 2);
    for (const submission of f.submissions) {
        assert.deepEqual(Object.keys(submission), ["text"]);
        assert.match(submission.text, /^SDC-MB05-FENCE:refuse /);
        assert.match(submission.text, /Do not use tools, access files/);
    }
});

test("identity change before the callback prevents submission", async () => {
    const f = fixture();
    await f.handlers.get("command.run")(f.$, { args: "idle" });
    f.setIdentity("replacement");
    await f.timers[0]();
    assert.equal(f.submissions.length, 0);
});

test("ambiguous rejection never retries or reports applied", async () => {
    const f = fixture();
    f.$.prompt.submit = async () => { throw new Error("private error text"); };
    await f.handlers.get("command.run")(f.$, { args: "idle" });
    await f.timers[0]();
    await f.handlers.get("command.run")(f.$, { args: "idle" });
    assert.equal(f.timers.length, 1);
    assert.ok(f.logs.some(log => log.includes("rejected-unknown-idle")));
    assert.ok(f.logs.every(log => !log.includes("private error text")));
});

test("observations retain events and redact native turn IDs", async () => {
    const f = fixture();
    const event = { turnId: "private-turn", text: "private-text" };
    for (const name of ["turn.start", "turn.complete"]) {
        assert.equal(await f.handlers.get(name)(f.$, event, async value => value), event);
    }
    assert.ok(f.logs.every(log => !log.includes("private-")));
});
