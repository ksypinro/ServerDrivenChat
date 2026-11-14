import { expect, test } from "claude-code/testing";

test("observation redacts identifiers and never copies prompt text", async ($, on) => {
    const logs: string[] = [];
    let delivered = 0;
    on("session.id", () => ({ value: "private-native-session" }));
    on("ui.log", (_$, event) => { logs.push(JSON.stringify(event)); return { value: undefined }; });
    on("prompt.submit", (_$, event) => { delivered++; return { text: event.text, origin: event.origin }; });
    const result = await $.prompt.submit({ text: "private-prompt-marker", wait: false, origin: { kind: "composer" }, turnId: "private-turn-marker" });
    expect(result.text).toBe("private-prompt-marker");
    expect(delivered).toBe(1);
    expect(logs.length).toBe(1);
    expect(logs[0].includes("private-prompt-marker")).toBe(false);
    expect(logs[0].includes("private-native-session")).toBe(false);
    expect(logs[0].includes("private-turn-marker")).toBe(false);
    expect(logs[0].includes("session=unavailable")).toBe(false);
    expect(logs[0].includes("event=prompt.submit")).toBe(true);
});

test("a failed observation does not duplicate or block local input", async ($, on) => {
    let delivered = 0;
    on("session.id", () => ({ value: "test-session" }));
    on("ui.log", () => ({ deny: "injected logger failure" }));
    on("prompt.submit", (_$, event) => { delivered++; return { text: event.text, origin: event.origin }; });
    const result = await $.prompt.submit({ text: "local input", wait: false, origin: { kind: "composer" } });
    expect(result.text).toBe("local input");
    expect(delivered).toBe(1);
});
