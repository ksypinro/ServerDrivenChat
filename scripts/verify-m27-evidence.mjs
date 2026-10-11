/** Validate linkage of actual public/native acceptance records; fixtures alone cannot satisfy this check. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonicalJson, computeActionDigest, validateProtocolMessage } from '../protocol/dist/index.js';
const directory = process.argv[2] ?? 'evidence/M27/restart-media-run';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const [server, gateway, controls, controlServer, restart, image, recovery, withheld, manifest, native] = await Promise.all([
    directory + '/server-live.json', 'evidence/M27/reconnect-repair-run/gateway-native.json',
    'evidence/M27/reconnect-repair-run/native-controls.json', 'evidence/M27/reconnect-repair-run/server-before-restart.json',
    directory + '/restart-media.json', directory + '/native-image.json', directory + '/native-recovery.json',
    directory + '/caller-tools-withheld.json', 'evidence/M27/artifact-manifest.json', directory + '/native-artifacts.json'
].map(read));
assert.equal(native.apiVersion, '1.2');
assert.equal(native.artifacts.nativeAddon, 'sha256:' + manifest.nativeAddonSha256);
assert.equal(native.artifacts.companion, 'sha256:' + manifest.companionBundleSha256);
const reloadCommandId = recovery.results.find(r => r.kind === 'reload-pending').operation.commandId;
assert.ok(Date.parse(native.startedAt) >= Date.parse(server.commands.find(c => c.commandId === reloadCommandId).createdAt));
for (const event of server.events) assert.equal(validateProtocolMessage(event).valid, true, 'Invalid native event ' + event.eventId);
assert.equal(gateway.status, 'passed');
assert.equal(controls.status, 'passed');
assert.equal(image.status, 'passed');
assert.equal(recovery.status, 'passed');
const command = (id, records = server) => {
    const value = records.commands.find(c => c.commandId === id); assert.ok(value, 'Missing command ' + id); return value;
};
const terminal = (turnId, records = server, type = 'turn.completed') => {
    const value = records.events.find(e => e.type === type && e.payload.turnId === turnId);
    assert.ok(value, 'Missing native terminal ' + turnId); return value;
};
for (const result of controls.results.filter(r => r.receipt)) {
    assert.equal(result.receipt.state, 'applied');
    command(result.receipt.commandId, controlServer);
    terminal(result.operation.turnId, controlServer, result.kind === 'cancel-verified' ? 'turn.cancelled' : 'turn.completed');
    if (result.request?.action) {
        const digestInput = Object.fromEntries(['appId', 'appInstanceId', 'bindingId', 'sessionId', 'nativeConversationId',
            'bindingRevision', 'leaseGeneration', 'turnId', 'nativeTurnId', 'requestId', 'nativeRequestId', 'requestRevision',
            'action', 'requestedPermissions', 'availableDecisions'].filter(key => result.request[key] !== undefined)
            .map(key => [key, result.request[key]]));
        assert.equal(await computeActionDigest(digestInput), result.request.actionDigest);
        const decision = controlServer.decisions.find(d => d.requestId === result.request.requestId);
        assert.ok(decision?.signatureVerified, 'Signed decision was not verified in its original server run');
        assert.equal(decision.commandId, result.receipt.commandId);
    }
}
const before = restart.results.find(r => r.kind === 'before-restart').generation;
const after = restart.results.find(r => r.kind === 'after-restart-original-key').generation;
assert.equal(before.generationId, after.generationId);
assert.equal(before.result.status, 'completed');
assert.equal(canonicalJson(before.result), canonicalJson(after.result));
const media = image.results.find(r => r.kind === 'native-image');
assert.equal(media.generation.result.text, image.marker + '-IMAGE-OK');
const uploaded = image.results.find(r => r.kind === 'committed-image');
assert.ok(JSON.stringify(media.receipt.payload).includes(uploaded.sha256));
terminal(command(media.receipt.commandId).turnId);
for (const label of ['local-answer', 'disconnect', 'reload']) {
    const pending = recovery.results.find(r => r.kind === label + '-pending');
    command(pending.operation.commandId);
    assert.ok(server.events.some(e => e.type === 'input.required' && e.payload.requestId === pending.request.requestId));
    const rejected = recovery.results.find(r => r.kind === label + '-stale-rejected');
    assert.ok([403, 409].includes(rejected.response.status));
    assert.equal(rejected.commandsBefore, rejected.commandsAfter);
    if (label === 'local-answer') assert.ok(server.events.some(e => e.type === 'input.resolved'
        && e.payload.requestId === pending.request.requestId && e.payload.outcome === 'resolved_elsewhere'));
    else {
        const ended = recovery.results.find(r => r.kind === label + '-binding-fenced');
        assert.equal(ended.binding.bindingId, pending.binding.bindingId);
        assert.ok(ended.binding.state !== 'active' || Date.parse(ended.binding.leaseExpiresAt) <= Date.parse(ended.observedAt));
    }
}
assert.equal(withheld.response.data.error.code, 'CALLER_TOOL_POLICY_UNQUALIFIED');
assert.equal(withheld.commandsBefore, withheld.commandsAfter);
const files = ['native-image.json', 'native-recovery.json', 'native-artifacts.json', 'caller-tools-withheld.json',
    'restart-media.json', 'server-live.json'];
const hashes = await Promise.all(files.map(async path => ({ path,
    sha256: createHash('sha256').update(await readFile(directory + '/' + path)).digest('hex') })));
const proof = { milestone: 'M27', status: 'passed', recordedAt: new Date().toISOString(), checkedNativeEvents: server.events.length,
    companionVersion: manifest.companionVersion, apiVersion: native.apiVersion, originalRetryGenerationId: before.generationId,
    imageGenerationId: media.generation.generationId, imageSha256: uploaded.sha256, files: hashes,
    scope: 'Declared server-owned REST profile and affected real native I/O/control/recovery acceptance. Caller-tool native profile withheld. Synthetic identity; development host; no named-client or production deployment qualification.' };
await writeFile(directory + '/native-validation.json', JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
