/** Developer-only public HTTPS consumer. Existing consented Cline windows execute every turn.
 * Human browser PKCE; credentials remain in memory; reports contain digests and test markers.
 * Commands: capture LABEL COUNT; roundtrip LABEL window-a window-b [window-c];
 * fence LABEL window-a; cleanup; quit. Never reads a vault or native conversation store.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { acquireExclusiveLock } from '../bridge/dist/index.js';

const base = 'https://localhost:15943';
const directory = new URL('../evidence/MI03/', import.meta.url);
const digest = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
const safeLabel = value => { assert.match(value ?? '', /^[a-z0-9-]{1,64}$/); return value; };
const keys = new Map();
const remembered = new Map();
let user;
let refresh;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = process.argv.includes('--append')
    ? JSON.parse(await readFile(new URL('api-native-2026-11-12.json', directory), 'utf8'))
    : { milestone: 'MI-03', startedAt: new Date().toISOString(), method: 'Public verified HTTPS API to the existing real Cline windows; human PKCE; no model runtime in this consumer', checks: [], failures: [], keyCleanup: [] };
delete report.endedAt;
report.runs ??= [];
report.runs.push({ startedAt: new Date().toISOString(), appended: process.argv.includes('--append') });
async function save() { await mkdir(directory, { recursive: true }); await writeFile(new URL('api-native-2026-11-12.json', directory), JSON.stringify(report, null, 2) + '\n'); }
async function request(path, body, token, idempotency) {
    const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(35000),
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(idempotency ? { 'idempotency-key': idempotency } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json();
    return { status: response.status, data };
}
async function successful(path, body, token, idempotency) {
    const result = await request(path, body, token, idempotency);
    assert.ok(result.status >= 200 && result.status < 300, `Public request HTTP ${result.status} (${result.data.error?.code ?? 'no error code'})`);
    return result.data;
}
async function owner(path, body) {
    if (Date.parse(user.expiresAt) < Date.now() + 30000) {
        refresh ??= successful('/v2/auth/oidc/refresh', { userId: user.userId, refreshToken: user.refreshToken }).then(next => { user = { ...next, refreshToken: next.refreshToken ?? user.refreshToken }; }).finally(() => { refresh = undefined; });
        await refresh;
    }
    return successful(path, body, user.accessToken);
}
async function authenticate() {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 300000);
    const lock = await acquireExclusiveLock(join(tmpdir(), 'sdc-oidc-callback-15945.lock'), { timeoutMs: 300000, signal: abort.signal });
    let listener;
    try {
        let state, resolve, reject;
        const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
        const stop = () => reject(new Error('Human sign-in deadline exceeded'));
        abort.signal.addEventListener('abort', stop, { once: true });
        listener = createServer(async (incoming, response) => {
            const url = new URL(incoming.url ?? '/', 'http://127.0.0.1:15945');
            if (incoming.method !== 'GET' || url.pathname !== '/callback' || url.searchParams.get('state') !== state || !url.searchParams.get('code')) { response.writeHead(400).end('Invalid callback'); return; }
            try {
                const tokens = await successful('/v2/auth/oidc/exchange', { state, code: url.searchParams.get('code') });
                state = undefined;
                response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }).end('MI-03 test consumer signed in. Tokens are held only in process memory. You can return to the test.');
                resolve(tokens);
            } catch { response.writeHead(400).end('Exchange failed'); reject(new Error('Human sign-in exchange failed')); }
        });
        await new Promise((resolveListen, rejectListen) => { listener.once('error', rejectListen); listener.listen(15945, '127.0.0.1', resolveListen); });
        const start = await successful('/v2/auth/oidc/start', { redirectUri: 'http://127.0.0.1:15945/callback' });
        state = start.state;
        assert.equal(new URL(start.authorizationUrl).origin, base);
        console.log(`BROWSER_AUTHORIZATION_URL ${start.authorizationUrl}`);
        user = await pending;
        abort.signal.removeEventListener('abort', stop);
        console.log('Human sign-in complete; credentials remain in memory.');
    } finally { clearTimeout(timer); listener?.closeAllConnections(); listener?.close(); lock.release(); }
}
const nativeOf = item => item.binding?.payload?.binding ?? {};
const labelOf = item => item.binding?.payload?.display?.workspaceLabel;
async function liveSessions() {
    const { sessions } = await owner('/v2/sessions');
    return sessions.filter(item => item.binding?.state === 'active' && Date.parse(item.binding.leaseExpiresAt ?? '') > Date.now());
}
function sanitized(item) {
    const native = nativeOf(item);
    return { session: digest(item.sessionId), binding: digest(item.binding.bindingId), device: digest(item.binding.deviceId), host: digest(native.appInstanceId), workspace: digest(native.workspaceId), task: digest(native.nativeConversationId), scoped: Boolean(native.nativeScopeId), labels: item.binding.payload?.display ?? null };
}
async function capture(label, count) {
    const live = await liveSessions();
    const scoped = live.filter(item => /^window-[abc]$/.test(labelOf(item) ?? ''));
    assert.equal(scoped.length, count, 'Unexpected number of live MI-03 test bindings');
    const nativeKeys = live.filter(item => nativeOf(item).nativeScopeId).map(item => { const n = nativeOf(item); return `${n.appId}\0${n.nativeScopeId}\0${n.nativeConversationId}`; });
    assert.equal(new Set(nativeKeys).size, nativeKeys.length, 'Duplicate scoped native conversation');
    assert.ok(scoped.every(item => nativeOf(item).nativeScopeId), 'Test binding has no native scope');
    if (scoped.length > 1) assert.equal(new Set(scoped.map(item => item.binding.deviceId)).size, 1, 'Test windows did not reuse one paired device');
    const record = { milestone: 'MI-03', label, checkedAt: new Date().toISOString(), expectedLiveTestBindings: count, serverFeatures: (await successful('/v2/health')).features, liveBindings: scoped.map(sanitized), duplicateLiveTasks: 0, note: 'Only disposable-window bindings recorded. Identifiers are truncated SHA-256 digests; no credentials or unrelated transcript saved.' };
    await writeFile(new URL(`sessions-${safeLabel(label)}.json`, directory), JSON.stringify(record, null, 2) + '\n');
    report.checks.push({ kind: 'capture', ...record });
    console.log(JSON.stringify({ label, liveTestBindings: count, duplicateLiveTasks: 0, bindings: record.liveBindings }));
    await save();
    return scoped;
}
async function keyFor(item) {
    const id = item.binding.bindingId;
    if (!keys.has(id)) {
        const issued = await owner('/api/v1/credentials', { sessionId: item.sessionId, scopes: ['view', 'prompt'], label: `MI03 native test ${digest(id)}`, expiresAt: new Date(Date.now() + 30 * 60000).toISOString() });
        // Retain for cleanup before any subsequent assertion can fail.
        keys.set(id, { ...issued, item });
        assert.ok(issued.credential && issued.credentialId, 'Credential issuance omitted required fields');
    }
    return keys.get(id);
}
async function roundtrip(label, names) {
    assert.ok(names.length >= 1 && names.length <= 3);
    assert.equal(new Set(names).size, names.length);
    names.forEach(name => assert.match(name, /^window-[abc]$/));
    const live = await liveSessions();
    const targets = names.map(name => { const matching = live.filter(item => labelOf(item) === name); assert.equal(matching.length, 1, `Expected one live ${name}`); return matching[0]; });
    assert.equal(new Set(targets.map(item => item.binding.deviceId)).size, 1, 'Test windows must share one device');
    const credentials = await Promise.all(targets.map(keyFor));
    const markers = names.map(name => `MI03-${safeLabel(label).toUpperCase()}-${name.toUpperCase()}-${randomUUID().slice(0, 8)}`);
    const checks = [];
    for (let index = 0; index < targets.length; index++) {
        const item = targets[index], other = targets.length > 1 ? targets[(index + 1) % targets.length] : undefined, token = credentials[index].credential;
        let denied;
        if (other) {
            denied = await request(`/api/v1/sessions/${other.sessionId}/snapshot`, undefined, token);
            assert.equal(denied.status, 403, 'Per-session key could access another session');
        }
        const models = await successful('/api/v1/models', undefined, token);
        assert.ok(JSON.stringify(models).includes(`sdc.${item.binding.bindingId}`), 'Own binding alias missing');
        if (other) assert.ok(!JSON.stringify(models).includes(`sdc.${other.binding.bindingId}`), 'Other binding alias leaked');
        checks.push({ window: names[index], binding: digest(item.binding.bindingId), crossSessionReadStatus: denied?.status ?? null, ownAliasVisible: true, otherAliasVisible: other ? false : null });
        remembered.set(names[index], credentials[index]);
    }
    const turns = await Promise.all(targets.map(async (item, index) => {
        const began = performance.now(), idempotency = randomUUID(), token = credentials[index].credential;
        const body = { model: `sdc.${item.binding.bindingId}`, content: [{ type: 'text', text: `This is only a text transport test. Your only task is to reply with ${markers[index]}. No tools are permitted or needed. Do not inspect the workspace.` }], delivery: 'queue' };
        const operation = await successful(`/api/v1/sessions/${item.sessionId}/prompts`, body, token, idempotency);
        const admissionMs = performance.now() - began;
        const retry = await successful(`/api/v1/sessions/${item.sessionId}/prompts`, body, token, idempotency);
        assert.equal(retry.operationId, operation.operationId, 'Same-key retry changed operation identity');
        console.log(JSON.stringify({ admitted: names[index], marker: markers[index], admissionMs }));
        let terminal;
        const deadline = Date.now() + 180000;
        while (Date.now() < deadline) {
            terminal = await successful(`/api/v1/operations/${operation.operationId}`, undefined, token);
            if (['completed', 'failed', 'rejected', 'cancelled', 'reconciliation_required'].includes(terminal.status)) break;
            await pause(500);
        }
        assert.equal(terminal.status, 'completed', `Native text operation in ${names[index]} did not complete`);
        assert.ok(JSON.stringify(terminal.result.answer).includes(markers[index]), 'Native answer missing its marker');
        assert.ok((terminal.result.toolActivity ?? []).every(item => item.nativeCategory !== 'tool'), 'Unexpected native workspace tool activity');
        return { window: names[index], marker: markers[index], operation: digest(operation.operationId), admissionMs, modelInclusiveCompletionMs: performance.now() - began, status: terminal.status, commandState: terminal.commandState, sameKeyRetryIdentical: true };
    }));
    const visibility = [];
    for (let index = 0; index < targets.length; index++) {
        const snapshot = await successful(`/api/v1/sessions/${targets[index].sessionId}/snapshot`, undefined, credentials[index].credential);
        const text = JSON.stringify(snapshot);
        assert.ok(text.includes(markers[index]), 'Own marker absent from session snapshot');
        for (let other = 0; other < targets.length; other++) if (other !== index) assert.ok(!text.includes(markers[other]), 'Another session marker appeared in snapshot');
        visibility.push({ window: names[index], ownMarkerPresent: true, foreignMarkersAbsent: true });
    }
    const result = { kind: 'concurrent-public-api-roundtrip', label, checkedAt: new Date().toISOString(), checks, turns, visibility, latencyScope: 'HTTPS gateway admission and model-inclusive completion; not a control-latency p95 qualification' };
    report.checks.push(result); await save(); console.log(JSON.stringify(result));
}
async function fence(label, name) {
    const prior = remembered.get(name); assert.ok(prior, 'No previous tested binding for this window');
    assert.ok(!(await liveSessions()).some(item => item.binding.bindingId === prior.item.binding.bindingId), 'Old binding is still live; refusing to submit a stale-binding probe');
    const rejected = await request(`/api/v1/sessions/${prior.item.sessionId}/prompts`, { model: 'sdc-default', content: [{ type: 'text', text: `MI03-${safeLabel(label)}-MUST-NOT-EXECUTE` }], delivery: 'queue' }, prior.credential, randomUUID());
    assert.equal(rejected.status, 403, 'Old binding admitted a new prompt');
    const result = { kind: 'old-binding-fenced', label, window: name, oldBinding: digest(prior.item.binding.bindingId), status: rejected.status };
    report.checks.push(result); await save(); console.log(JSON.stringify(result));
}
async function cleanup() {
    for (const [id, issued] of keys) {
        if (issued.cleaned) continue;
        await owner(`/api/v1/credentials/${issued.credentialId}/revoke`, {});
        const denied = await request('/api/v1/identity', undefined, issued.credential);
        assert.equal(denied.status, 401);
        issued.cleaned = true;
        report.keyCleanup.push({ binding: digest(id), credential: digest(issued.credentialId), revoked: true, rejectedStatus: 401 });
    }
    await save(); console.log('All test-created keys revoked and rejected with HTTP 401.');
}
await mkdir(directory, { recursive: true });
await authenticate();
const input = createInterface({ input: process.stdin, terminal: false });
console.log('READY: capture LABEL COUNT; roundtrip LABEL window-a window-b [window-c]; fence LABEL window-a; cleanup; quit');
try {
    for await (const line of input) {
        const [command, label, ...args] = line.trim().split(/\s+/);
        if (!command) continue;
        try {
            if (command === 'capture') { assert.match(args[0] ?? '', /^[0-3]$/); await capture(safeLabel(label), Number(args[0])); }
            else if (command === 'roundtrip') await roundtrip(safeLabel(label), args);
            else if (command === 'fence') await fence(safeLabel(label), args[0]);
            else if (command === 'cleanup') await cleanup();
            else if (command === 'quit') break;
            else throw new Error('Unknown test command');
        } catch (error) {
            // Error messages are locally authored or assertion text; never dump responses or bearer tokens.
            const failure = { command, label, at: new Date().toISOString(), reason: error.message };
            report.failures.push(failure); await save(); console.error(JSON.stringify(failure));
        }
        console.log('READY');
    }
} finally {
    input.close(); await cleanup(); report.endedAt = new Date().toISOString(); await save();
}
