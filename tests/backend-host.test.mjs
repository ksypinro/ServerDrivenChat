import test from 'node:test';
import assert from 'node:assert/strict';
import { BackendRegistry, BackendHost, backendStorageScope } from '../adapters/core/dist/index.js';
import { ADAPTER_OPERATIONS } from '../protocol/dist/index.js';
import { backendFixture } from './helpers/backend-driver.mjs';

const context = { installationId: 'installation', hostId: 'host', windowId: 'window', workspaceId: 'workspace' };
const profile = { id: 'default', origin: 'https://example.test' };
const authority = () => ({ signal: new AbortController().signal, assertAuthority() {} });
const applied = () => Promise.resolve({ outcome: 'applied', evidence: 'SIMULATED' });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function fixture(options = {}) {
    const f = backendFixture(), registry = new BackendRegistry();
    if (options.backendId) {
        f.descriptor.backendId = options.backendId; f.descriptor.driverId = `${options.backendId}.driver`; f.descriptor.appId = `${options.backendId}.app`;
        f.report.adapterId = f.descriptor.driverId; f.report.appId = f.descriptor.appId;
        f.qualification.descriptor = structuredClone(f.descriptor);
    }
    let starts = 0, effects = 0, disabled = 0, closed = 0, detached = 0, approved = 0, selected = 'conversation', revision = 'generation-1', exported, driverContext;
    const selection = () => ({ appId: f.descriptor.appId, appInstanceId: 'installation/host/window', workspaceId: 'workspace', accountId: 'account', conversationId: selected });
    const adapter = {
        probe: async () => f.report,
        attach: async choice => ({ outcome: 'accepted', evidence: 'SIMULATED', value: { ...choice, ...(options.wrongAttach ? { conversationId: 'wrong' } : {}), bindingId: 'binding', sessionId: 'session', nativeConversationId: 'native-conversation', bindingRevision: 1, leaseGeneration: 1, capabilitiesRevision: 'capabilities-1' } }),
        inspect: async () => ({ outcome: 'unknown', reason: 'SIMULATED uncertainty' }),
        async *subscribe() {},
        submit: async (_b, _c, ctx) => { if (options.queue) await options.queue.promise; ctx.assertAuthority(); effects++; return { outcome: 'accepted', evidence: 'SIMULATED queued native input' }; },
        respondInput: applied, resolveApproval: applied, cancel: applied, revoke: applied, stageAttachment: applied,
        detach: async () => { detached++; return options.uncertainDetach ? { outcome: 'unknown', reason: 'SIMULATED lost detach receipt' } : { outcome: 'applied', evidence: 'SIMULATED detach' }; }
    };
    const driver = { descriptor: f.descriptor, discover: async ctx => { driverContext = ctx; return [{ label: 'Existing conversation', revision, selection: selection() }]; }, createAdapter: async ctx => { driverContext = ctx; return adapter; }, readConversationRevision: async () => 0, dispose: async () => {} };
    if (options.evaluation) f.qualification.evidenceLevel = "evaluation";
    registry.register(driver, f.inventory, options.unqualified ? undefined : f.qualification);
    const services = {
        confirm: async () => { approved++; if (options.review) await options.review.promise; return options.decline ? undefined : options.operations ?? ADAPTER_OPERATIONS; },
        start: async input => { starts++; exported = input; if (options.start) await options.start.promise; return { disable() { disabled++; }, async close() { closed++; if (options.failedClose) throw new Error('server detach failed'); } }; }
    };
    const host = new BackendHost(registry, options.hostContext ?? context, services, options.evaluation ? "evaluation" : true, options.expiresAt);
    return { ...f, registry, host, adapter, driver, services, select: async () => (await host.discover('example', new AbortController().signal))[0],
        get exported() { return exported; }, get driverContext() { return driverContext; }, get counts() { return { starts, effects, disabled, closed, detached, approved }; }, changeTask() { selected = 'another'; }, changeGeneration() { revision = 'generation-2'; } };
}

test('MB-03 registration rejects duplicates, changed bytes, missing exports and identity replacement', () => {
    const f = fixture();
    assert.throws(() => f.registry.register(f.driver, f.inventory, f.qualification), /Duplicate/);
    const registry = new BackendRegistry();
    assert.throws(() => registry.register({ descriptor: f.descriptor }, f.inventory), /export/);
    const inventory = structuredClone(f.inventory); inventory.artifacts[0].sha256 = 'f'.repeat(64);
    assert.throws(() => registry.register(f.driver, inventory, f.qualification), /qualification/);
    f.driver.descriptor.driverVersion = '2.0';
    assert.throws(() => f.registry.resolve('example'), /identity changed/);
    assert.throws(() => registry.resolve('missing'), /not registered/);
});

test('MB-03 connection requires a host-local choice and explicit consent; unknown outcomes remain unknown', async () => {
    const f = fixture();
    await assert.rejects(f.host.connect('model-provided-task-id', profile), /locally/);
    const choice = await f.select();
    await f.host.connect(choice.choiceId, profile);
    assert.equal(f.host.state, 'connected');
    assert.equal((await f.exported.adapter.inspect(f.exported.binding)).outcome, 'unknown');
    await assert.rejects(f.host.connect(choice.choiceId, profile), /Disconnect/);
    await f.exported.adapter.submit(f.exported.binding, {}, authority());
    assert.equal(f.counts.effects, 1);
    await f.host.disconnect();
    assert.equal(f.host.state, 'disconnected');
    assert.equal(f.counts.closed, 1);
    assert.equal(f.counts.detached, 1);
    await assert.rejects(f.host.connect(choice.choiceId, profile), /locally/);
});

test('MB-03 unqualified native route never asks for consent or starts pairing/bridge', async () => {
    const f = fixture({ unqualified: true }), choice = await f.select();
    await assert.rejects(f.host.connect(choice.choiceId, profile), /qualified/);
    assert.deepEqual(f.counts, { starts: 0, effects: 0, disabled: 0, closed: 0, detached: 0, approved: 0 });
});

test('MB-03 declined and stale selection reviews cannot attach', async () => {
    const declined = fixture({ decline: true }), choice = await declined.select();
    await assert.rejects(declined.host.connect(choice.choiceId, profile), /declined/);
    assert.equal(declined.counts.starts, 0);
    const review = deferred(), f = fixture({ review }), c = await f.select();
    const work = f.host.connect(c.choiceId, profile);
    await new Promise(r => setImmediate(r)); f.changeTask(); review.resolve();
    await assert.rejects(work, /changed during review/);
    assert.equal(f.counts.starts, 0);
});

test('MB-03 wrong returned attachment is detached and never registered on the server', async () => {
    const f = fixture({ wrongAttach: true }), choice = await f.select();
    await assert.rejects(f.host.connect(choice.choiceId, profile), /different identity/);
    assert.equal(f.counts.starts, 0); assert.equal(f.counts.detached, 1);
});

test('MB-03 a changed generation of the same conversation invalidates the consent review', async () => {
    const review = deferred(), f = fixture({ review }), choice = await f.select();
    const work = f.host.connect(choice.choiceId, profile);
    await new Promise(r => setImmediate(r)); f.changeGeneration(); review.resolve();
    await assert.rejects(work, /changed during review/); assert.equal(f.counts.starts, 0);
});

for (const reason of ['disconnect', 'driver-invalidated', 'removed', 'lease-expired']) test(`MB-03 queued native mutation is fenced at effect after ${reason}`, async () => {
    const queue = deferred(), f = fixture({ queue }), choice = await f.select();
    await f.host.connect(choice.choiceId, profile);
    const auth = authority(); let live = true; auth.assertAuthority = () => { if (!live) throw new Error('lease expired'); };
    const work = f.exported.adapter.submit(f.exported.binding, {}, auth);
    if (reason === 'disconnect') await f.host.disconnect();
    if (reason === 'driver-invalidated') f.driverContext.invalidate('native local takeover');
    if (reason === 'removed') await f.registry.remove('example');
    if (reason === 'lease-expired') live = false;
    queue.resolve(); await assert.rejects(work);
    assert.equal(f.counts.effects, 0);
    await f.host.dispose();
});

test('MB-03 late bridge startup is disabled/closed after disconnect and does not revive the binding', async () => {
    const start = deferred(), f = fixture({ start }), choice = await f.select();
    const work = f.host.connect(choice.choiceId, profile);
    await new Promise(r => setImmediate(r)); assert.equal(f.counts.starts, 1);
    await f.host.disconnect(); start.resolve(); await assert.rejects(work, /invalidated/);
    assert.equal(f.host.state, 'disconnected'); assert.equal(f.counts.closed, 1); assert.equal(f.counts.detached, 1);
});

test('MB-03 uncertain detach requires reconciliation and refuses automatic switching', async () => {
    const f = fixture({ uncertainDetach: true }), choice = await f.select();
    await f.host.connect(choice.choiceId, profile); await f.host.disconnect();
    assert.equal(f.host.state, 'reconciliation_required');
    await assert.rejects(f.select(), /reconcile/);
    await assert.rejects(f.host.connect(choice.choiceId, profile), /reconcile/);
});

test('MB-03 server cleanup failure still detaches native binding and blocks automatic rebind', async () => {
    const f = fixture({ failedClose: true }), choice = await f.select();
    await f.host.connect(choice.choiceId, profile); await f.host.disconnect();
    assert.equal(f.counts.detached, 1); assert.equal(f.host.state, 'reconciliation_required');
});

test('MB-03 explicit switching creates a fresh scope and fences the old backend', async () => {
    const first = fixture(), second = fixture({ backendId: 'second' }), choice = await first.select();
    first.registry.register(second.driver, second.inventory, second.qualification);
    await first.host.connect(choice.choiceId, profile);
    const old = first.exported;
    await first.host.disconnect();
    const [next] = await first.host.discover('second', new AbortController().signal);
    await first.host.connect(next.choiceId, profile);
    assert.notEqual(first.exported.scope, old.scope);
    assert.throws(() => old.adapter.submit(old.binding, {}, authority()), /invalidated/);
    await first.exported.adapter.submit(first.exported.binding, {}, authority());
    assert.equal(second.counts.effects, 1); assert.equal(first.counts.effects, 0);
    await first.host.dispose(); await second.host.dispose();
});

test('MB-03 wrong binding, missing authority and unavailable local operation never reach native control', async () => {
    const f = fixture({ operations: ADAPTER_OPERATIONS.filter(op => op !== 'cancel') }), choice = await f.select();
    await f.host.connect(choice.choiceId, profile);
    const { adapter, binding } = f.exported;
    assert.throws(() => adapter.submit(binding, {}), /authority/);
    for (const override of [{ sessionId: 'other' }, { conversationId: 'other' }, { leaseGeneration: 2 }, { accountId: 'other' }, { workspaceId: 'other' }]) assert.throws(() => adapter.submit({ ...binding, ...override }, {}, authority()), /binding/);
    assert.throws(() => adapter.cancel(binding, 'turn', authority()), /permitted/);
    assert.equal(f.counts.effects, 0); await f.host.dispose();
});

test('MB-03 multiple windows cannot reuse local selection handles or credential/store namespaces', async () => {
    const a = fixture(), b = fixture({ hostContext: { ...context, windowId: 'second-window' } }), choice = await a.select();
    await assert.rejects(b.host.connect(choice.choiceId, profile), /locally/);
    const first = backendStorageScope(context, a.descriptor, profile, choice);
    for (const scope of [backendStorageScope({ ...context, windowId: 'second-window' }, a.descriptor, profile, choice), backendStorageScope(context, { ...a.descriptor, backendId: 'other' }, profile, choice), backendStorageScope(context, a.descriptor, { ...profile, origin: 'https://other.test' }, choice)]) assert.notEqual(first, scope);
    await a.host.dispose(); await b.host.dispose();
});


test('MB-04 evaluation expiry fences queued native effects even before a timer runs', async () => {
    const queue = deferred(), f = fixture({ evaluation: true, expiresAt: Date.now() + 60000, queue });
    const choice = await f.select(); await f.host.connect(choice.choiceId, profile);
    const work = f.exported.adapter.submit(f.exported.binding, {}, authority());
    const original = Date.now;
    try {
        Date.now = () => original() + 120000;
        queue.resolve(); await assert.rejects(work, /invalidated/);
        assert.equal(f.counts.effects, 0);
    } finally { Date.now = original; await f.host.dispose(); }
    assert.throws(() => fixture({ evaluation: true }), /future expiry/);
});
