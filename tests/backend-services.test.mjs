import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackendServices, profileStorageKey } from '../extensions/vscode-host/dist/connect.js';
import { forgetProfileCredentials } from '../extensions/vscode-host/dist/credentials.js';
import { FakeAppAdapter } from '../adapters/fake/dist/index.js';

test('MB-03 generic service uses real bridge/file SQLite with simulated authenticated HTTP and preserves recovery intent on failed detach', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'sdc-mb03-'));
    const originalFetch = globalThis.fetch;
    const adapter = new FakeAppAdapter(), binding = (await adapter.attach({ appId: 'fake.app', appInstanceId: 'fake-instance', conversationId: 'fake-conversation' })).value;
    const profile = { id: 'lab', name: 'Lab', origin: 'https://server.invalid', categories: ['prompts'] };
    const device = { deviceId: 'device', credential: 'SIMULATED-disposable', expiresAt: '2099-01-01T00:00:00Z' };
    let pending, paired = 0, registered = 0, failDetach = false, session;
    const states = [], savedScopes = [];
    const scope = 'SIMULATED-exact-scope';
    const context = { installationId: 'install', hostId: 'host', windowId: 'window', workspaceId: 'workspace' };
    const ui = { profile: async () => profile, pair: async () => { paired++; return device; }, confirm: async () => true, storePath: async () => join(folder, 'inbox.sqlite'), changed: state => states.push(state) };
    const services = createBackendServices(ui, context, async p => savedScopes.push(p), async (_scope, value) => { pending = value; });
    globalThis.fetch = async (url, init) => {
        assert.equal(init.headers.authorization, `Bearer ${device.credential}`);
        const path = new URL(url).pathname;
        if (path.endsWith('/bindings')) {
            assert.equal(pending.binding.bindingId, binding.bindingId, 'recovery intent persisted before HTTP registration');
            const body = JSON.parse(init.body); assert.equal(body.conversationRevision, 12); registered++;
            return Response.json({ binding });
        }
        if (path.endsWith('/detach')) return failDetach ? Response.json({}, { status: 503 }) : Response.json({ detached: true });
        if (path.endsWith('/lease/renew')) return Response.json({ status: 'renewed', bindingRevision: 1, leaseGeneration: 1, serverTime: new Date().toISOString(), leaseExpiresAt: new Date(Date.now() + 60000).toISOString() });
        if (path.endsWith('/commands')) return new Response(new ReadableStream({ start(controller) { init.signal.addEventListener('abort', () => controller.close(), { once: true }); } }), { headers: { 'content-type': 'text/event-stream' } });
        return Response.json({ durable: true }, { status: 202 });
    };
    const capabilities = await adapter.probe(), choice = { backendId: 'fake', choiceId: 'local-choice', label: 'SIMULATED conversation', revision: 'generation-1', selection: binding };
    const authority = { signal: new AbortController().signal, assertAuthority() {} };
    try {
        const allowed = await services.confirm(choice, profile, capabilities, authority.signal);
        assert.ok(allowed.includes('submit')); assert.ok(!allowed.includes('resolveApproval'));
        capabilities.operations.resolveApproval = { status: 'unsupported', reason: 'not delegated' };
        capabilities.operations.respondInput = { status: 'unsupported', reason: 'not delegated' };
        capabilities.operations.cancel = { status: 'unsupported', reason: 'not delegated' };
        session = await services.start({ choice, profile, scope, binding, adapter, capabilities, conversationRevision: 12, context: authority });
        assert.equal(paired, 1); assert.equal(registered, 1); assert.ok(states.includes('online')); assert.equal(savedScopes[0].scope, scope);
        failDetach = true; session.disable(); await assert.rejects(session.close(), /503/);
        assert.ok(pending, 'uncertain detach must retain recovery metadata');
    } finally { globalThis.fetch = originalFetch; await adapter.detach(binding); await rm(folder, { recursive: true, force: true }); }
});

test('MB-03 generic credential keys isolate scopes and never reuse Cline profile keys', () => {
    const p = { id: 'same', origin: 'https://example.test', scope: 'backend-a' };
    assert.match(profileStorageKey(p), /^sdc\.backendHost\.v1\./);
    assert.notEqual(profileStorageKey(p), profileStorageKey({ ...p, scope: 'backend-b' }));
    assert.notEqual(profileStorageKey(p), profileStorageKey({ ...p, origin: 'https://other.test' }));
    assert.throws(() => profileStorageKey({ ...p, scope: undefined }), /scope/);
});

test('MB-03 credential cleanup can revoke retained device after loss of its device token and retains everything on refusal', async () => {
    const profile = { id: 'p', origin: 'https://example.test', scope: 'scope' }, key = profileStorageKey(profile);
    const data = new Map([[key + '.user', JSON.stringify({ userId: 'owner', accessToken: 'SIMULATED-user', expiresAt: '2099-01-01T00:00:00Z' })]]);
    const secrets = { get: async k => data.get(k), store: async (k, v) => data.set(k, v), delete: async k => data.delete(k) };
    let removed = 0;
    await assert.rejects(forgetProfileCredentials(profile, secrets, async () => { removed++; }, async () => { throw new Error('SIMULATED denied'); }, undefined, 'retained-device'), /denied/);
    assert.equal(removed, 0); assert.equal(data.size, 1);
    await forgetProfileCredentials(profile, secrets, async d => { assert.equal(d.deviceId, 'retained-device'); removed++; }, async (_p, route, _body, token) => {
        assert.equal(route, '/api/v1/devices/retained-device/revoke'); assert.equal(token, 'SIMULATED-user'); return {};
    }, undefined, 'retained-device');
    assert.equal(removed, 1); assert.equal(data.size, 0);
});
