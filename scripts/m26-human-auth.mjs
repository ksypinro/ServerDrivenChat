/** Human browser PKCE sign-in for developer acceptance; never reads a password or vault. */
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = 'https://localhost:15943';
export async function callOwner(path, body, token) {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(35000), redirect: 'error' });
    assert.ok(response.ok, `${path}: HTTP ${response.status}`);
    return response.json();
}
let resolve;
let reject;
const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
let state;
const listener = createServer(async (request, response) => {
    const callback = new URL(request.url, 'http://127.0.0.1:15945');
    if (request.method !== 'GET' || callback.pathname !== '/callback' || callback.searchParams.get('state') !== state) { response.writeHead(400).end('Invalid callback'); return; }
    try {
        const tokens = await callOwner('/v2/auth/oidc/exchange', { state, code: callback.searchParams.get('code') });
        response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end('M26 developer API consumer signed in. No password or bearer was saved.');
        resolve(tokens);
    } catch (error) { response.writeHead(400).end('Exchange failed'); reject(error); }
});
await new Promise((yes, no) => { listener.once('error', no); listener.listen(15945, '127.0.0.1', yes); });
const start = await callOwner('/v2/auth/oidc/start', { redirectUri: 'http://127.0.0.1:15945/callback' });
state = start.state;
assert.equal(new URL(start.authorizationUrl).origin, base);
writeFileSync('/tmp/sdc-m26-browser-url.txt', start.authorizationUrl, { mode: 0o600 });
console.log('M26 browser authorization URL ready; owner bearer remains in memory only.');
const timer = setTimeout(() => reject(Error('Human sign-in timeout')), 300000);
let userTokens = await pending.finally(() => { clearTimeout(timer); listener.close(); });
export let ownerToken = userTokens.accessToken;
const refreshTimer = setInterval(async () => {
    try {
        const refreshed = await callOwner('/v2/auth/oidc/refresh', { userId: userTokens.userId, refreshToken: userTokens.refreshToken });
        userTokens = { ...refreshed, refreshToken: refreshed.refreshToken ?? userTokens.refreshToken };
        ownerToken = userTokens.accessToken;
        console.log('Owner access token refreshed in memory with unchanged authority.');
    } catch { console.error('Owner access token refresh failed; do not infer credential cleanup.'); process.exitCode = 1; }
}, 120000);
refreshTimer.unref();
console.log('Human browser PKCE exchange succeeded.');
