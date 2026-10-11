import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateProtocolMessage } from "../protocol/dist/index.js";

const record = JSON.parse(await readFile(process.argv[2] ?? "evidence/M19/live-vscode.json", "utf8"));
assert.equal(record.host, "vscode");
assert.equal(record.results.length, 2);
assert.equal(record.binding.conversationId, record.binding.nativeConversationId);
assert.equal(record.binding.appId, "cline.vscode");
assert.ok(record.isolation.every(check => check.outcome.outcome === "rejected"));
for (const event of record.trace) {
    assert.equal(validateProtocolMessage(event).valid, true, JSON.stringify(event));
    assert.equal(event.sessionId, record.binding.sessionId);
    assert.equal(event.bindingRevision, record.binding.bindingRevision);
    assert.equal(event.leaseGeneration, record.binding.leaseGeneration);
}
for (const [index, result] of record.results.entries()) {
    assert.equal(validateProtocolMessage(result.command).valid, true);
    assert.equal(result.outcome.outcome, "accepted");
    const prompt = result.command.payload.content.filter(block => block.type === "text").map(block => block.text).join("\n");
    const items = record.trace.filter(event => event.type === "output.item.created" && event.payload.turnId === result.command.turnId && event.payload.kind === "user_message");
    assert.equal(items.length, 1);
    assert.equal(items[0].payload.content[0].text, prompt);
    assert.ok(record.trace.some(event => event.type === "turn.completed" && event.payload.turnId === result.command.turnId));
    assert.ok(record.trace.some(event => ["output.item.created", "output.item.replaced"].includes(event.type) && event.payload.turnId === result.command.turnId && event.payload.kind === "assistant_message"));
    if (result.nativeEcho) assert.equal(result.nativeEcho.text, prompt);
    if (index === 0) assert.ok(result.output.includes("FIRST-OK"));
    else { assert.ok(!prompt.includes(record.marker)); assert.ok(result.output.includes(record.marker) && result.output.includes("CONTINUITY-OK")); }
}
if (record.stagingReceipt) {
    assert.equal(record.stagingReceipt.outcome, "applied");
    const reference = record.stagingReceipt.value;
    const block = record.results[0].command.payload.content.find(block => block.type === "image");
    assert.equal(block.attachmentId, reference.attachmentId);
    assert.equal(block.mimeType, reference.mimeType);
    assert.deepEqual(record.results[0].nativeEcho.imageChecksums, [reference.sha256]);
    assert.ok(record.results[0].outcome.evidence.includes(reference.sha256));
    console.log("Passed: two native bridge turns, continuity, input/image echo checksums, output/terminal events, and foreign-selection rejection.");
} else {
    assert.equal(record.imageAcceptance, "not tested");
    console.log("Passed: two native text turns, continuity, input echoes, output/terminal events, and foreign-selection rejection. Image acceptance remains unverified.");
}
