import { expect, test } from "claude-code/testing";

test("explicit refusal prevents the core stub", async ($, on) => {
    let effects = 0;
    on("prompt.submit", (_$, event) => { effects++; return { text: event.text }; });
    const result = await $.prompt.submit({ text: "refuse", wait: false, origin: { kind: "composer" } });
    expect(result.drop).toBe("authority expired");
    expect(effects).toBe(0);
});

test("working catch refuses after guard failure", async ($, on) => {
    let effects = 0;
    on("prompt.submit", (_$, event) => { effects++; return { text: event.text }; });
    const result = await $.prompt.submit({ text: "guard-failure", wait: false, origin: { kind: "composer" } });
    expect(result.drop).toBe("guard unavailable");
    expect(effects).toBe(0);
});

test("guard and catch failure reaches core stub: ordinary hook is not a hard fence", async ($, on) => {
    let effects = 0;
    on("prompt.submit", (_$, event) => { effects++; return { text: event.text }; });
    const result = await $.prompt.submit({ text: "both-fail", wait: false, origin: { kind: "composer" } });
    expect(result.text).toBe("both-fail");
    expect(effects).toBe(1);
});

test("submission from a prompt hook is rejected, and failed fallback passes the outer prompt", async ($, on) => {
    const effects: string[] = [];
    on("prompt.submit", (_$, event) => { effects.push(event.text); return { text: event.text }; });
    const result = await $.prompt.submit({ text: "self-submit", wait: false, origin: { kind: "composer" } });
    expect(result.text).toBe("self-submit");
    expect(effects.length).toBe(1);
    expect(effects[0]).toBe("self-submit");
});
