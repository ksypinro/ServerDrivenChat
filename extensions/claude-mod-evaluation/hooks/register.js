const encoder = new TextEncoder();

async function digest(value) {
    const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

async function safeSessionId($) {
    try {
        const value = await $.session.id();
        return typeof value === "string" && value.length > 0 ? await digest(value) : "unavailable";
    } catch {
        return "unavailable";
    }
}

async function record($, name, event) {
    const session = await safeSessionId($);
    const turn = typeof event?.turnId === "string" ? await digest(event.turnId) : "none";
    const reason = typeof event?.reason === "string" ? event.reason.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) : "none";
    const keys = event && typeof event === "object" ? Object.keys(event).sort().join(",").slice(0, 160) : "none";
    await $.ui.log(`[SDC Claude probe] event=${name} session=${session} turn=${turn} reason=${reason} fields=${keys}`);
}

/**
 * Read-only feasibility probe. It never changes an event, submits a prompt,
 * reads prompt text, or calls file, process, network, model, or tool APIs.
 */
export function register(on) {
    on("session.start", async ($, event, next) => {
        await record($, "session.start", event);
        return next(event);
    }).catch(async ($, event, next) => next(event));
    on("session.end", async ($, event, next) => {
        await record($, "session.end", event);
        return next(event);
    }).catch(async ($, event, next) => next(event));
    on("prompt.submit", async ($, event, next) => {
        await record($, "prompt.submit", event);
        return next(event);
    }).catch(async ($, event, next) => next(event));
    on("turn.start", async ($, event, next) => {
        await record($, "turn.start", event);
        return next(event);
    }).catch(async ($, event, next) => next(event));
    on("turn.complete", async ($, event, next) => {
        await record($, "turn.complete", event);
        return next(event);
    }).catch(async ($, event, next) => next(event));
}
