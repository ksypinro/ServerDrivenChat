import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { apiFixture, command, delay, event } from './helpers/api-fixture.mjs';

const url = process.env.MI01_TEST_DATABASE_URL;
const skip = !url && 'requires disposable PostgreSQL';

const nativeBinding = (overrides = {}) => ({
    appId: 'test.native', appInstanceId: `installation/host-${randomUUID()}/window`, workspaceId: 'workspace:repo-x',
    conversationId: 'native-task', nativeConversationId: 'native-task', nativeScopeId: 'cline-data:mi01',
    bindingId: randomUUID(), sessionId: randomUUID(), bindingRevision: 1, leaseGeneration: 1, capabilitiesRevision: 'api1.3', ...overrides
});
const task = id => ({ conversationId: id, nativeConversationId: id });
const register = (f, binding, extra = {}, device = f.issued) => f.request(`/v2/devices/${device.deviceId}/bindings`,
    { binding, conversationRevision: 0, ...extra }, device.credential);
const errorOf = async response => (await response.json()).error;
const bindingState = async (f, bindingId) => (await f.db.pool.query('SELECT state FROM bindings WHERE binding_id=$1', [bindingId])).rows[0]?.state;
async function pairDevice(f, user, label) {
    const pairing = await f.auth.startPairing(user, label);
    await f.auth.confirmPairingOnServer(user, pairing.pairingCode);
    return f.auth.confirmPairingLocally(pairing.pairingId, pairing.localConfirmationSecret, true);
}
/** Holds one binding's dispatch admission channel open until closed. */
async function openPermit(f, sessionId) {
    const abort = new AbortController();
    const response = await fetch(`${f.base}/v2/devices/${f.issued.deviceId}/dispatch`, { method: 'POST', signal: abort.signal,
        headers: { authorization: `Bearer ${f.issued.credential}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, bindingRevision: 1, leaseGeneration: 1 }) });
    assert.equal(response.status, 200);
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let text = '';
    while (!text.includes('event: dispatch.permit')) {
        const { value, done } = await reader.read();
        if (done) throw new Error('Dispatch stream ended before its permit');
        text += decoder.decode(value, { stream: true });
    }
    return { close: async () => { abort.abort(); await reader.cancel().catch(() => {}); } };
}

test('MI-01 a live native conversation refuses a second binding, labels the holder only for its owner and allows explicit takeover', { skip }, async () => {
    const f = await apiFixture(url);
    try {
        const first = nativeBinding();
        let response = await register(f, first, { display: { conversationLabel: 'Fix login', workspaceLabel: 'repo-x', windowLabel: 'Window 1' } });
        assert.equal(response.status, 201, await response.clone().text());
        response = await register(f, nativeBinding());
        assert.equal(response.status, 409);
        let error = await errorOf(response);
        assert.equal(error.code, 'CONVERSATION_BOUND_ELSEWHERE');
        assert.match(error.message, /repo-x/);
        assert.match(error.message, /Window 1/);
        // Another task in the same scope, and the same task ID in another scope, are different native conversations.
        for (const other of [nativeBinding(task('other-task')), nativeBinding({ nativeScopeId: 'cline-data:other' })]) {
            response = await register(f, other);
            assert.equal(response.status, 201, await response.clone().text());
            assert.equal((await f.request(`/v2/devices/${f.issued.deviceId}/bindings/${other.bindingId}/detach`, {})).status, 200);
        }
        const stranger = await f.signIn('stranger');
        const strangerDevice = await pairDevice(f, stranger, 'MI-01 other account');
        for (const takeover of [false, true]) {
            response = await register(f, nativeBinding(), { takeover }, strangerDevice);
            assert.equal(response.status, 409);
            error = await errorOf(response);
            assert.equal(error.code, 'CONVERSATION_BOUND_ELSEWHERE');
            assert.doesNotMatch(error.message, /repo-x|Window 1|Fix login/);
        }
        assert.equal(await bindingState(f, first.bindingId), 'active');
        // The same owner may move the conversation to another installation, but only by explicit takeover.
        const secondDevice = await pairDevice(f, f.owner, 'MI-01 second installation');
        const moved = nativeBinding();
        response = await register(f, moved, { takeover: true }, secondDevice);
        assert.equal(response.status, 201, await response.clone().text());
        assert.equal((await response.json()).replacedBindingId, first.bindingId);
        assert.equal(await bindingState(f, first.bindingId), 'detached');
        assert.equal(await bindingState(f, moved.bindingId), 'active');
        // As after a local detach, the replaced binding is no longer actively bound, so renewal is refused.
        assert.equal((await f.request(`/v2/devices/${f.issued.deviceId}/lease/renew`, { sessionId: first.sessionId, bindingRevision: 1, leaseGeneration: 1 })).status, 403);
        assert.equal((await f.request(`/v2/sessions/${first.sessionId}/turns`, { command: command(first.sessionId, 'after-takeover') }, 'owner')).status, 409);
        const audit = await f.db.pool.query("SELECT session_id,payload FROM audit_records WHERE action='binding.native_takeover'");
        assert.equal(audit.rowCount, 1);
        assert.equal(audit.rows[0].session_id, first.sessionId);
        assert.equal(audit.rows[0].payload.toBindingId, moved.bindingId);
        // Without a native scope the registration stays unconstrained, as for earlier companions.
        for (let index = 0; index < 2; index++) {
            const { nativeScopeId: _scope, ...legacy } = nativeBinding();
            assert.equal((await register(f, legacy)).status, 201);
        }
    } finally { await f.close(); }
});

test('MI-01 takeover waits for the holder\'s admitted dispatch permit before fencing it', { skip }, async () => {
    const f = await apiFixture(url);
    let permit;
    try {
        const holder = nativeBinding();
        assert.equal((await register(f, holder)).status, 201);
        permit = await openPermit(f, holder.sessionId);
        const secondDevice = await pairDevice(f, f.owner, 'MI-01 takeover device');
        let settled = false;
        const takeover = register(f, nativeBinding(), { takeover: true }, secondDevice).then(response => { settled = true; return response; });
        await delay(300);
        assert.equal(settled, false, 'takeover must wait for the admitted dispatch on the holder');
        await permit.close();
        permit = undefined;
        const response = await takeover;
        assert.equal(response.status, 201, await response.clone().text());
        assert.equal((await response.json()).replacedBindingId, holder.bindingId);
        assert.equal(await bindingState(f, holder.bindingId), 'detached');
    } finally { await permit?.close(); await f.close(); }
});

test('MI-01 an expired holder is fenced as stale and concurrent registrations admit exactly one binding', { skip }, async () => {
    const f = await apiFixture(url);
    try {
        const expired = nativeBinding();
        assert.equal((await register(f, expired)).status, 201);
        await f.db.pool.query("UPDATE bindings SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE binding_id=$1", [expired.bindingId]);
        const response = await register(f, nativeBinding());
        assert.equal(response.status, 201, await response.clone().text());
        assert.equal((await response.json()).replacedBindingId, undefined);
        assert.equal(await bindingState(f, expired.bindingId), 'stale');
        const results = await Promise.all(Array.from({ length: 6 }, () => register(f, nativeBinding(task('race-task')))));
        assert.deepEqual(results.map(result => result.status).sort(), [201, 409, 409, 409, 409, 409]);
        for (const result of results.filter(item => item.status === 409)) assert.equal((await errorOf(result)).code, 'CONVERSATION_BOUND_ELSEWHERE');
        const active = await f.db.pool.query("SELECT count(*)::int AS count FROM bindings WHERE state='active' AND payload->'binding'->>'nativeConversationId'='race-task'");
        assert.equal(active.rows[0].count, 1);
    } finally { await f.close(); }
});

test('MI-01 registration returns device-lane watermarks that precede every command of the new session', { skip }, async () => {
    const f = await apiFixture(url);
    try {
        await f.bind('existing');
        const record = (id, lane = 'prompt') => f.db.recordCommand({ commandId: id, sessionId: 'existing', deviceId: f.issued.deviceId, lane, payload: command('existing', id, lane) });
        for (const id of ['existing-1', 'existing-2', 'existing-3']) await record(id);
        await record('existing-control', 'control');
        const binding = nativeBinding();
        let response = await register(f, binding);
        assert.equal(response.status, 201, await response.clone().text());
        assert.deepEqual((await response.json()).laneWatermarks, { prompt: 3, control: 1 });
        response = await f.request(`/v2/sessions/${binding.sessionId}/turns`, { command: command(binding.sessionId, 'new-session-prompt') }, 'owner');
        assert.equal(response.status, 202, await response.clone().text());
        assert.equal((await response.json()).laneSeq, 4);
        await record('existing-4');
        response = await register(f, binding);
        assert.equal(response.status, 201);
        assert.deepEqual((await response.json()).laneWatermarks, { prompt: 3, control: 1 }, 'an idempotent registration repeats its original watermarks');
    } finally { await f.close(); }
});

test('MI-01 bindings on one device do not wait behind another binding\'s dispatch permit, while revocation still does', { skip }, async () => {
    const f = await apiFixture(url);
    let permit;
    try {
        await f.bind('alpha');
        await f.bind('beta');
        permit = await openPermit(f, 'alpha');
        const device = suffix => `/v2/devices/${f.issued.deviceId}/${suffix}`;
        const timed = async work => { const started = performance.now(); const response = await work(); return { status: response.status, ms: performance.now() - started }; };
        const checks = [
            await timed(() => f.request(device('events'), { event: event('beta', 'beta-output') })),
            await timed(() => f.request(device('lease/renew'), { sessionId: 'beta', bindingRevision: 1, leaseGeneration: 1 })),
            await timed(() => f.request('/v2/sessions/beta/turns', { command: command('beta', 'beta-prompt') }, 'owner'))
        ];
        assert.deepEqual(checks.map(check => check.status), [202, 200, 202]);
        for (const check of checks) assert.ok(check.ms < 2000, `beta waited ${Math.round(check.ms)} ms behind alpha's dispatch permit`);
        let revoked = false;
        const revocation = f.auth.revokeDevice(f.owner, f.issued.deviceId).then(() => { revoked = true; });
        await delay(300);
        assert.equal(revoked, false, 'device revocation must wait for the admitted dispatch permit');
        await permit.close();
        permit = undefined;
        await revocation;
        assert.equal((await f.request(device('events'), { event: event('beta', 'after-revocation', 2) })).status, 401);
    } finally { await permit?.close(); await f.close(); }
});

test('MI-01 pending capacity ignores detached sessions and caps each session separately', { skip }, async () => {
    const f = await apiFixture(url, { maxPendingPrompts: 3, maxPendingPromptsPerSession: 2 });
    try {
        await f.bind('alpha');
        await f.bind('beta');
        const submit = async (sessionId, id) => {
            const response = await f.request(`/v2/sessions/${sessionId}/turns`, { command: command(sessionId, id) }, 'owner');
            return { status: response.status, body: await response.json() };
        };
        assert.equal((await submit('alpha', 'a1')).status, 202);
        assert.equal((await submit('alpha', 'a2')).status, 202);
        let refused = await submit('alpha', 'a3');
        assert.equal(refused.status, 429);
        assert.match(refused.body.error.message, /session queue/);
        assert.equal((await submit('beta', 'b1')).status, 202);
        refused = await submit('beta', 'b2');
        assert.equal(refused.status, 429);
        assert.match(refused.body.error.message, /command lane/);
        await f.db.pool.query("UPDATE bindings SET state='detached',lease_expires_at=NULL WHERE session_id='alpha'");
        assert.equal((await submit('beta', 'b2')).status, 202, 'detached work no longer consumes device capacity');
    } finally { await f.close(); }
});

test('MI-01 registration validates native scope, takeover and bounded display labels', { skip }, async () => {
    const f = await apiFixture(url);
    try {
        for (const nativeScopeId of ['', 'x'.repeat(201), 'scope\u0001id', 7]) assert.equal((await register(f, nativeBinding({ nativeScopeId }))).status, 400, String(nativeScopeId));
        assert.equal((await register(f, nativeBinding(), { takeover: 'yes' })).status, 400);
        for (const display of [{}, [], 'label', { unknown: 'x' }, { workspaceLabel: '' }, { workspaceLabel: 'x'.repeat(121) }, { windowLabel: 'a\nb' }, { conversationLabel: 'spoof‮' }, { workspaceLabel: 3 }])
            assert.equal((await register(f, nativeBinding(task(`display-${randomUUID()}`)), { display })).status, 400, JSON.stringify(display));
        const display = { conversationLabel: 'Fix login', workspaceLabel: 'repo-x', windowLabel: 'Window 2' };
        const binding = nativeBinding();
        assert.equal((await register(f, binding, { display: { ...display, workspaceLabel: '  repo-x  ' } })).status, 201);
        const listed = (await (await f.request('/v2/sessions', undefined, 'owner')).json()).sessions.find(item => item.sessionId === binding.sessionId);
        assert.deepEqual(listed.binding.payload.display, display);
    } finally { await f.close(); }
});

test('MI-01 rollback is reversible when unused and refuses while live exclusivity is retained', { skip }, async () => {
    const down = await readFile(new URL('../server/migrations/rollback/010_native_conversation_exclusivity.sql', import.meta.url), 'utf8');
    const f = await apiFixture(url);
    const column = async () => (await f.db.pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='bindings' AND column_name='native_conversation_key'")).rowCount;
    try {
        await f.db.transaction(client => client.query(down));
        assert.equal(await column(), 0);
        await f.db.migrate();
        assert.equal(await column(), 1);
        assert.equal((await register(f, nativeBinding())).status, 201);
        await assert.rejects(f.db.transaction(client => client.query(down)), /Refusing rollback/);
        assert.equal(await column(), 1);
    } finally { await f.close(); }
});
