// Developer test runner only. These injected failures must never be installed.
export function register(on) {
    on("prompt.submit", async ($, event) => {
        if (event.text === "refuse") return { drop: "authority expired" };
        if (event.text === "self-submit") {
            await $.prompt.submit({ text: "nested" });
            return { drop: "outer prompt refused" };
        }
        throw new Error("injected authority guard failure");
    }).catch(async ($, event) => {
        if (event.text === "guard-failure") return { drop: "guard unavailable" };
        throw new Error("injected refusal handler failure");
    });
}
