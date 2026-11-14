/** MI-03 developer evidence: human browser sign-in, then a sanitized check of live bindings on the local deployment.
 * Never reads a password, vault or credential file, and never saves a bearer token.
 * Usage: NODE_EXTRA_CA_CERTS=<state>/tls/ca.pem node scripts/mi03-sessions-check.mjs <label> */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireExclusiveLock } from '../bridge/dist/index.js';

const base = process.env.SDC_MI03_ORIGIN ?? 'https://localhost:15943';
const label = (process.argv[2] ?? 'check').replace(/[^a-z0-9-]/gi, '-');
const digest = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
async function call(path, body, token) {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(35000),
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.ok(response.ok, `${path}: HTTP ${response.status}`);
    return response.json();
}
// The callback port is shared with every SDC window's sign-in, so take the same cross-window lock.
const lock = await acquireExclusiveLock(join(tmpdir(), 'sdc-oidc-callback-15945.lock'), { timeoutMs: 330_000, onWait: () => console.error('Waiting for a sign-in in a VS Code window to finish…') });
let token;
try {
    let state, settle;
    const exchanged = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    const listener = createServer(async (request, response) => {
        const callback = new URL(request.url, 'http://127.0.0.1:15945');
        if (request.method !== 'GET' || callback.pathname !== '/callback' || callback.searchParams.get('state') !== state) { response.writeHead(400).end('Invalid callback'); return; }
        try {
            const tokens = await call('/v2/auth/oidc/exchange', { state, code: callback.searchParams.get('code') });
            response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end('MI-03 evidence check signed in. Nothing was saved; you can close this tab.');
            settle.resolve(tokens.accessToken);
        } catch (error) { response.writeHead(400).end('Exchange failed'); settle.reject(error); }
    });
    await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(15945, '127.0.0.1', resolve); });
    try {
        const start = await call('/v2/auth/oidc/start', { redirectUri: 'http://127.0.0.1:15945/callback' });
        state = start.state;
        assert.equal(new URL(start.authorizationUrl).origin, base);
        console.error(`Open this URL in a browser and sign in yourself:\n${start.authorizationUrl}`);
        token = await exchanged;
    } finally { listener.close(); }
} finally { lock.release(); }

const health = await call('/v2/health');
const { sessions } = await call('/v2/sessions', undefined, token);
const now = Date.now();
const live = sessions.filter(item => item.binding?.state === 'active' && Date.parse(item.binding.leaseExpiresAt ?? '') > now);
const keys = new Map();
for (const item of live) {
    const native = item.binding.payload?.binding ?? {};
    if (!native.nativeScopeId) continue;
    const key = `${native.appId}\u0000${native.nativeScopeId}\u0000${native.nativeConversationId}`;
    keys.set(key, (keys.get(key) ?? 0) + 1);
}
const record = {
    milestone: 'MI-03', label, checkedAt: new Date().toISOString(), serverFeatures: health.features ?? [],
    liveBindings: live.map(item => {
        const native = item.binding.payload?.binding ?? {};
        return { session: digest(item.sessionId), binding: digest(item.binding.bindingId), device: digest(item.binding.deviceId), host: digest(native.appInstanceId),
            workspace: digest(native.workspaceId), task: digest(native.nativeConversationId), scoped: Boolean(native.nativeScopeId), labels: item.binding.payload?.display ?? null };
    }),
    duplicateLiveTasks: [...keys.values()].filter(count => count > 1).length,
    note: 'Identifiers are truncated SHA-256 digests; no bearer, credential or transcript content is recorded.'
};
assert.equal(record.duplicateLiveTasks, 0, 'a scoped Cline task has more than one live binding');
mkdirSync(new URL('../evidence/MI03/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../evidence/MI03/sessions-${label}.json`, import.meta.url), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
