/** Public API proof of local disable with an unexpired, still-authenticated key. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import { ownerToken, callOwner } from './m26-human-auth.mjs';

const origin = 'https://localhost:15943';
const selected = JSON.parse(await readFile('evidence/M26/server-live.json', 'utf8')).bindings[0];
const issued = await callOwner('/api/v1/credentials', {
    sessionId: selected.sessionId, scopes: ['view', 'prompt'],
    label: 'M26 final local-disable proof',
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
}, ownerToken);
const report = { status: 'running', bindingId: selected.bindingId, sessionId: selected.sessionId, results: [] };
const input = createInterface({ input: process.stdin, output: process.stdout });
const save = () => writeFile('evidence/M26/final-local-disable.json', JSON.stringify(report, null, 2) + '\n');
function promptCount() {
    assert.match(selected.sessionId, /^[a-f0-9-]{36}$/);
    return Number(execFileSync('docker', ['exec', 'sdc-local-postgres-1', 'psql', '-U', 'sdc_app', '-d', 'sdc', '-Atc',
        `SELECT count(*) FROM commands WHERE session_id='${selected.sessionId}' AND lane='prompt'`], { encoding: 'utf8' }).trim());
}
async function request(path, body) {
    const response = await fetch(origin + '/api/v1' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${issued.credential}`, 'content-type': 'application/json',
            ...(body ? { 'idempotency-key': randomUUID() } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(35_000)
    });
    return { status: response.status, body: await response.json() };
}
try {
    const before = await request(`/sessions/${selected.sessionId}/snapshot`);
    assert.equal(before.status, 200);
    const countBefore = promptCount();
    report.results.push({ kind: 'active-binding-before-local-disable', watermark: before.body.watermark,
        durablePromptCommands: countBefore });
    await save();
    console.log('READY: use graphical Cline Bridge: Disconnect; then type check');
    for await (const line of input) {
        assert.equal(line, 'check');
        const identity = await request('/identity');
        assert.equal(identity.status, 200, 'Key must still authenticate; expiry is not disable proof');
        const refusal = await request(`/sessions/${selected.sessionId}/prompts`, {
            model: 'sdc-default', delivery: 'queue',
            content: [{ type: 'text', text: 'M26 FINAL DISABLED MUST NOT EXECUTE' }]
        });
        assert.equal(refusal.status, 403);
        const countAfter = promptCount();
        assert.equal(countAfter, countBefore);
        report.results.push({ kind: 'local-disable-live-key-fence', identityStatus: identity.status,
            promptStatus: refusal.status, durablePromptCommandsBefore: countBefore,
            durablePromptCommandsAfter: countAfter });
        report.status = 'passed';
        break;
    }
} catch (error) {
    report.status = 'failed'; report.error = error.message; process.exitCode = 1;
} finally {
    await callOwner(`/api/v1/credentials/${issued.credentialId}/revoke`, {}, ownerToken);
    const response = await request('/identity');
    assert.equal(response.status, 401);
    report.results.push({ kind: 'temporary-key-revoked', status: response.status });
    const list = await callOwner('/api/v1/credentials', undefined, ownerToken);
    report.remainingUnrevokedM26Keys = list.credentials.filter(item => item.label.startsWith('M26') && !item.revokedAt).length;
    assert.equal(report.remainingUnrevokedM26Keys, 0);
    report.endedAt = new Date().toISOString(); await save(); input.close();
}
console.log('Final local disable:', report.status);
