import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../extensions/claude-queue-evaluation/hooks/register.js", import.meta.url), "utf8");

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
        clock: { after: (delay, fn) => { assert.equal(delay, 1); timers.push(fn); } },
        command: { register: async command => commands.push(command) },
        prompt: { submit: async args => { submissions.push(args); return { drop: "native stub refusal" }; } },
    };
    return { $, handlers, timers, submissions, logs, commands, setIdentity(value) { identity = value; } };
}

const pass = async event => event;
async function arm(f) { await f.handlers.get("command.run")(f.$, { args: "" }); }
async function start(f, turnId = "native-turn") { await f.handlers.get("turn.start")(f.$, { turnId }, pass); }

test("loading and unarmed turns never offer prompts", async () => {
    const f = fixture();
    await f.handlers.get("session.start")(f.$, {}, pass);
    assert.equal(f.commands[0].name, "sdc-fence-arm");
    await start(f);
    assert.equal(f.timers.length, 0);
    assert.equal(f.submissions.length, 0);
});

test("arming schedules exactly one attributed offer outside the native event", async () => {
    const f = fixture(); await arm(f); await start(f);
    assert.equal(f.submissions.length, 0);
    assert.equal(f.timers.length, 1);
    await f.timers[0]();
    assert.equal(f.submissions.length, 1);
    assert.deepEqual(Object.keys(f.submissions[0]), ["text"]);
    assert.match(f.submissions[0].text, /^SDC-MB05-FENCE:refuse /);
    await arm(f); await start(f, "second-turn");
    assert.equal(f.timers.length, 1);
});

test("completion before the callback records inconclusive without submitting", async () => {
    const f = fixture(); await arm(f); await start(f);
    await f.handlers.get("turn.complete")(f.$, { turnId: "native-turn" }, pass);
    await f.timers[0]();
    assert.equal(f.submissions.length, 0);
    assert.ok(f.logs.some(l => l.includes("skipped-no-active-turn")));
});

test("session replacement or session end prevents the scheduled offer", async () => {
    for (const end of [false, true]) {
        const f = fixture(); await arm(f); await start(f);
        if (end) await f.handlers.get("session.end")(f.$, {}, pass);
        else f.setIdentity("other");
        await f.timers[0]();
        assert.equal(f.submissions.length, 0);
    }
});

test("other sessions and nonempty command arguments cannot arm", async () => {
    for (const other of [false, true]) {
        const f = fixture();
        if (other) f.setIdentity("other");
        await f.handlers.get("command.run")(f.$, { args: other ? "" : "extra" });
        f.setIdentity("selected"); await start(f);
        assert.equal(f.timers.length, 0);
    }
});

test("ambiguous submission never retries and redacts errors", async () => {
    const f = fixture();
    f.$.prompt.submit = async () => { throw new Error("private-error"); };
    await arm(f); await start(f); await f.timers[0](); await arm(f); await start(f);
    assert.equal(f.timers.length, 1);
    assert.ok(f.logs.some(l => l.includes("rejected-unknown")));
    assert.ok(f.logs.every(l => !l.includes("private-error") && !l.includes("native-turn")));
});

test("unrelated turn completion does not falsely invalidate the observed active turn", async () => {
    const f = fixture(); await arm(f); await start(f);
    await f.handlers.get("turn.complete")(f.$, { turnId: "unrelated" }, pass);
    await f.timers[0]();
    assert.equal(f.submissions.length, 1);
});
