import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function startup(settings) {
    // No live database: malformed deployment policy must fail before creating/migrating one.
    const result = spawnSync(process.execPath, ["server/dist/main.js"], {
        env: { PATH: process.env.PATH, ...settings }, encoding: "utf8", timeout: 5000
    });
    assert.equal(result.status, 1, result.stderr);
    return result.stderr;
}

test("M24 rejects malformed or duplicate caller-tool policies before database effects", () => {
    assert.match(startup({ SDC_PUBLIC_API_TOOL_BINDINGS_JSON: '[{"bindingId":"b","evidence":"e","extra":true}]' }), /exact \{bindingId,evidence\}/);
    assert.match(startup({ SDC_PUBLIC_API_TOOL_BINDINGS_JSON: '[{"bindingId":"b","evidence":"e"},{"bindingId":"b","evidence":"e2"}]' }), /must be unique/);
    assert.match(startup({ SDC_PUBLIC_API_TOOL_BINDINGS_JSON: '[]' }), /DATABASE_URL is missing/);
});

test("M24 rejects invalid TCP ports before database effects", () => {
    for (const port of ["0", "65536", "1.5", "-1"]) {
        assert.match(startup({ SDC_SERVER_PORT: port }), /SDC_SERVER_PORT/);
    }
});
