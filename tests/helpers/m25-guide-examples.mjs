// M25 documentation verification consumer for an already graphically consented local native binding.
// Credentials stay in memory; this is an API client, never a model executor.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
const run = promisify(execFile);

const [stateDirectory, sessionId] = process.argv.slice(2);
assert.ok(stateDirectory && sessionId, 'Specify private local state and exact already consented disposable session');
const base = 'https://localhost:15943';
const login = JSON.parse(await readFile(`${stateDirectory}/login.json`, 'utf8'));
async function json(path, body, token) {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error' });
    assert.ok(response.ok, `${path}: HTTP ${response.status}`);
    return response.json();
}
const start = await json('/v2/auth/oidc/start', { redirectUri: base + '/' });
const authUrl = new URL(start.authorizationUrl);
assert.equal(authUrl.origin, base);
const page = await fetch(authUrl, { redirect: 'manual' });
const form = /<form\b[^>]*id="kc-form-login"[^>]*action="([^"]+)"/.exec(await page.text());
assert.ok(form, 'Expected the real local Keycloak login form');
const action = new URL(form[1].replaceAll('&amp;', '&'));
assert.equal(action.origin, base);
const signedIn = await fetch(action, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: page.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') },
    body: new URLSearchParams(login) });
assert.equal(signedIn.status, 302, 'Real test-identity sign-in');
const callback = new URL(signedIn.headers.get('location'));
assert.equal(callback.origin + callback.pathname, base + '/');
assert.equal(callback.searchParams.get('state'), start.state);
const tokens = await json('/v2/auth/oidc/exchange', { state: start.state, code: callback.searchParams.get('code') });
const snapshot = await json(`/api/v1/sessions/${sessionId}/snapshot`, undefined, tokens.accessToken);
assert.ok(JSON.stringify(snapshot).includes('1791641555978_71d6l'), 'Refuse another native task');
assert.ok(snapshot.bindings.some(binding => binding.state === 'active'), 'Require active native binding');
const keys = [];
const checks = [];
const directory = await mkdtemp(join(tmpdir(), 'sdc-m25-private-'));
async function issue(label) {
    const key = await json('/api/v1/credentials', { sessionId, label,
        scopes: ['view', 'prompt'], expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() }, tokens.accessToken);
    keys.push(key);
    return key;
}
async function sample(file, mode, key, requestKey, operationId) {
    const path = join(directory, 'scoped-key.txt');
    await writeFile(path, key.credential, { mode: 0o600 });
    const { stdout } = await run(process.execPath, [file, mode], { timeout: 130_000, maxBuffer: 1024 * 1024,
        env: { ...process.env, SDC_ORIGIN: base, SDC_KEY_FILE: path, SDC_SESSION: sessionId,
            SDC_REQUEST_KEY: requestKey, SDC_OPERATION: operationId ?? '' } });
    return JSON.parse(stdout);
}
let failed = false;
try {
    const key = await issue('M25 documentation examples: disposable native text');
    const snap = await sample('docs/guide/examples/rest-text.mjs', 'snapshot', key, 'unused');
    checks.push({ name: 'documented snapshot sample', ...snap });
    for (const mode of ['chat', 'responses', 'anthropic']) {
        const requestKey = randomUUID();
        const result = await sample('docs/guide/examples/sdk-text.mjs', mode, key, requestKey);
        const replay = await sample('docs/guide/examples/sdk-text.mjs', mode, key, requestKey);
        assert.equal(replay.responseId, result.responseId, 'Same original key must replay original result');
        checks.push({ name: `documented ${mode} sample and same-key replay`, ...result, sameResponseId: true });
    }
    const requestKey = randomUUID();
    let operation = await sample('docs/guide/examples/rest-text.mjs', 'prompt', key, requestKey);
    if (operation.status !== 'completed') {
        operation = await sample('docs/guide/examples/rest-text.mjs', 'operation', key, requestKey, operation.operationId);
    }
    assert.equal(operation.status, 'completed');
    assert.equal(operation.answer.trim(), 'M25-REST');
    const replay = await sample('docs/guide/examples/rest-text.mjs', 'prompt', key, requestKey);
    assert.equal(replay.operationId, operation.operationId);
    const retrieved = await sample('docs/guide/examples/rest-text.mjs', 'operation', key, requestKey, operation.operationId);
    assert.equal(retrieved.operationId, operation.operationId);
    checks.push({ name: 'documented first-party prompt/retrieval/same-key replay', ...operation, sameOperationId: true });
    const response = await fetch(`${base}/openai/v1/chat/completions`, { method: 'POST', redirect: 'error',
        headers: { authorization: `Bearer ${key.credential}`, 'content-type': 'application/json',
            'Idempotency-Key': randomUUID(), 'X-SDC-Context-Mode': 'shared-task' },
        body: JSON.stringify({ model: 'sdc-default', messages: [{ role: 'user', content: 'Do not dispatch this unsupported request.' }], temperature: 0 }) });
    assert.equal(response.status, 422);
    checks.push({ name: 'unsupported sampling refused', status: response.status });
    const cursor = snapshot.watermark.sessionSeq;
    const stream = await fetch(`${base}/api/v1/sessions/${sessionId}/events?after=${cursor}`, {
        headers: { authorization: `Bearer ${key.credential}` }, signal: AbortSignal.timeout(10_000), redirect: 'error' });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get('content-type'), /text\/event-stream/);
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let frames = '';
    for (let i = 0; i < 10 && !/id: [0-9]+[\s\S]*?data:/.test(frames); i++) {
        const item = await reader.read();
        if (item.done) break;
        frames += decoder.decode(item.value, { stream: true });
    }
    await reader.cancel();
    const id = /id: ([0-9]+)/.exec(frames);
    assert.ok(id && Number(id[1]) > cursor);
    checks.push({ name: 'documented snapshot-to-SSE replay', snapshotCursor: cursor, firstReplayId: Number(id[1]), status: 200 });
    const rotated = await issue('M25 documentation equivalent scoped rotation');
    const crossPrincipal = await fetch(`${base}/api/v1/operations/${operation.operationId}`, { headers: { authorization: `Bearer ${rotated.credential}` }, redirect: 'error' });
    assert.equal(crossPrincipal.status, 404);
    await json(`/api/v1/credentials/${key.credentialId}/revoke`, {}, tokens.accessToken);
    const oldStatus = (await fetch(`${base}/api/v1/identity`, { headers: { authorization: `Bearer ${key.credential}` }, redirect: 'error' })).status;
    assert.equal(oldStatus, 401);
    const newSnapshot = await sample('docs/guide/examples/rest-text.mjs', 'snapshot', rotated, 'unused');
    assert.equal(newSnapshot.sessionId, sessionId);
    checks.push({ name: 'equivalent key rotation/revocation and original operation ownership', oldKeyStatus: oldStatus, newKeyView: 'passed', newKeyOldOperationStatus: crossPrincipal.status });
} catch (error) {
    failed = true;
    // Neither SDK headers nor the test-identity password enter evidence.
    checks.push({ name: 'failed', status: error.status ?? null, code: error.code ?? null,
        message: error.code === 'ERR_ASSERTION' ? error.message : 'Documentation sample/probe failed; inspect sanitized child output locally.' });
    if (error.stdout) checks.push({ name: 'sample output', output: error.stdout });
    if (error.stderr) checks.push({ name: 'sample error', output: error.stderr });
} finally {
    for (const key of keys) {
        await json(`/api/v1/credentials/${key.credentialId}/revoke`, {}, tokens.accessToken);
        assert.equal((await fetch(`${base}/api/v1/identity`, { headers: { authorization: `Bearer ${key.credential}` }, redirect: 'error' })).status, 401);
    }
    await rm(directory, { recursive: true });
}
console.log(JSON.stringify({ recordedAt: new Date().toISOString(), target: base, sessionId,
    nativeTask: '1791641555978_71d6l', status: failed ? 'failed' : 'passed', checks,
    credentials: 'short-lived view/prompt only; all temporary keys revoked/rejected; private temporary file removed',
    nativeConsent: 'existing exact device/task; prompts/questions/cancel unchanged; approvals disabled',
    usage: 'server estimate; not native tokens/billing' }, null, 2));
if (failed) process.exitCode = 1;
