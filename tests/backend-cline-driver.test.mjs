import test from 'node:test';
import assert from 'node:assert/strict';
import { createClineBackendDriver } from '../adapters/cline/dist/index.js';
import { nativeFixture } from './helpers/m21-native.mjs';

function hostContext() {
    const abort = new AbortController();
    return { installationId: 'host-installation', hostId: 'host-process', windowId: 'window', workspaceId: 'workspace', signal: abort.signal,
        assertCurrent() { if (abort.signal.aborted) throw new Error('Host invalidated'); }, invalidate() { abort.abort(); } };
}

test('MB-04 Cline candidate wraps exact selected-task API and exposes native conversation revision', async () => {
    const native = nativeFixture({ callerToolFence: true }), context = hostContext(); native.complete();
    const driver = createClineBackendDriver(native.api);
    try {
        const [choice] = await driver.discover(context, context.signal);
        assert.equal(choice.selection.conversationId, 'native-task');
        const adapter = await driver.createAdapter(context, choice);
        const bound = await adapter.attach(choice.selection); assert.equal(bound.outcome, 'accepted');
        assert.ok(Number.isSafeInteger(await driver.readConversationRevision(adapter, bound.value)));
        await assert.rejects(driver.readConversationRevision(adapter, { ...bound.value, leaseGeneration: 99 }), /Unknown/);
        await driver.dispose(); assert.equal(context.signal.aborted, true);
        assert.equal(native.sent.length, 0, 'selection/attach/revision does not start a model');
    } finally { native.api.dispose(); }
});

test('MB-04 Cline candidate rejects old API, other window, changed selection and revoked host before attach', async () => {
    const old = nativeFixture(); assert.throws(() => createClineBackendDriver(old.api), /API 1.3/); old.api.dispose();
    const native = nativeFixture({ callerToolFence: true }), context = hostContext(), driver = createClineBackendDriver(native.api);
    try {
        await assert.rejects(driver.discover({ ...context, windowId: 'other' }, context.signal), /different window/);
        const [choice] = await driver.discover(context, context.signal);
        await assert.rejects(driver.createAdapter(context, { ...choice, revision: 'stale' }), /selection changed/);
        const adapter = await driver.createAdapter(context, choice);
        context.invalidate(); await assert.rejects(adapter.attach(choice.selection), /invalidated/);
        assert.equal(native.sent.length, 0);
    } finally { native.api.dispose(); }
});
