// Developer acceptance consumer for an already graphically consented local native binding.
// Credentials stay in memory; this is an API client, never a model executor.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const [stateDirectory, sessionId] = process.argv.slice(2);
assert.ok(stateDirectory && sessionId, 'Specify private local state and the exact accepted session');
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
const key = await json('/api/v1/credentials', { sessionId, label: 'M24 bounded native SDK acceptance',
    scopes: ['view', 'prompt'], expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() }, tokens.accessToken);
const checks = [];
let failed = false;
try {
    const openai = new OpenAI({ apiKey: key.credential, baseURL: `${base}/openai/v1`, maxRetries: 0, timeout: 120_000,
        defaultHeaders: { 'X-SDC-Context-Mode': 'shared-task' } });
    const chat = await openai.chat.completions.create({ model: 'sdc-default', messages: [{ role: 'user',
        content: 'Do not use tools or read/change files. Reply exactly M24-OPENAI-CHAT.' }] },
        { headers: { 'Idempotency-Key': randomUUID() } });
    assert.equal(chat.choices[0].message.content.trim(), 'M24-OPENAI-CHAT');
    checks.push({ profile: 'OpenAI Chat', responseId: chat.id, text: chat.choices[0].message.content, usage: chat.usage });
    const response = await openai.responses.create({ model: 'sdc-default',
        input: 'Do not use tools or read/change files. Reply exactly M24-OPENAI-RESPONSES.' },
        { headers: { 'Idempotency-Key': randomUUID() } });
    assert.equal(response.output_text.trim(), 'M24-OPENAI-RESPONSES');
    checks.push({ profile: 'OpenAI Responses', responseId: response.id, text: response.output_text, usage: response.usage });
    const anthropic = new Anthropic({ apiKey: key.credential, baseURL: `${base}/anthropic`, maxRetries: 0, timeout: 120_000,
        defaultHeaders: { 'X-SDC-Context-Mode': 'shared-task' } });
    const message = await anthropic.messages.create({ model: 'sdc-default', max_tokens: 128, messages: [{ role: 'user',
        content: 'Do not use tools or read/change files. Reply exactly M24-ANTHROPIC.' }] },
        { headers: { 'Idempotency-Key': randomUUID() } });
    const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('');
    assert.equal(text.trim(), 'M24-ANTHROPIC');
    checks.push({ profile: 'Anthropic Messages', responseId: message.id, text, usage: message.usage });
} catch (error) {
    failed = true;
    checks.push({ profile: 'failed', status: error.status ?? null, code: error.code ?? null,
        message: error.message });
} finally {
    await json(`/api/v1/credentials/${key.credentialId}/revoke`, {}, tokens.accessToken);
    assert.equal((await fetch(`${base}/api/v1/identity`, { headers: { authorization: `Bearer ${key.credential}` } })).status, 401);
}
console.log(JSON.stringify({ target: base, sessionId, checks, usageSource: 'server estimate; not native generation or billing',
    credentialCleanup: 'temporary scoped key revoked and rejected', nativeExecutor: 'existing graphically consented Cline task' }, null, 2));
if (failed) process.exitCode = 1;
