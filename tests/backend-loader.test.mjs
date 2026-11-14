import test from 'node:test';
import assert from 'node:assert/strict';
import { BackendRegistry } from '../adapters/core/dist/index.js';
import { loadReviewedBackend } from '../extensions/vscode-host/dist/loader.js';
import { backendFixture } from './helpers/backend-driver.mjs';

function fixture() {
    const f = backendFixture(), registry = new BackendRegistry();
    // Synthetic catalog record to test loader policy; this is never installed or native evidence.
    f.qualification.evidenceLevel = 'native';
    let activated = 0, disposed = 0, measured = 0;
    const driver = { descriptor: f.descriptor, discover: async () => [], createAdapter: async () => { throw new Error('No native runtime in fixture'); }, readConversationRevision: async () => 0, dispose: async () => { disposed++; } };
    const entry = { extensionId: 'example.driver', qualification: f.qualification };
    const ports = { measure: async () => { measured++; return structuredClone(f.inventory); }, activate: async id => { assert.equal(id, entry.extensionId); activated++; return { sdcBackendDriver: { descriptor: f.descriptor, createDriver: async () => driver } }; } };
    return { ...f, registry, entry, ports, driver, get counts() { return { activated, disposed, measured }; } };
}

test('MB-04 reviewed loader verifies before/after activation and registers the exact exported driver', async () => {
    const f = fixture(); await loadReviewedBackend(f.registry, f.entry, f.ports);
    assert.deepEqual(f.counts, { activated: 1, disposed: 0, measured: 2 });
    assert.equal(f.registry.list()[0].backendId, 'example');
    await f.registry.remove('example'); assert.equal(f.counts.disposed, 1);
});

test('MB-04 loader refuses simulation, wrong registration identity and changed installed bytes before activation', async () => {
    for (const change of [
        f => { f.entry.qualification.evidenceLevel = 'simulation'; },
        f => { f.entry.extensionId = 'other.driver'; },
        f => { f.ports.measure = async () => ({ ...f.inventory, nativeApiVersion: 'changed' }); }
    ]) {
        const f = fixture(); change(f); await assert.rejects(loadReviewedBackend(f.registry, f.entry, f.ports));
        assert.equal(f.counts.activated, 0); assert.equal(f.registry.list().length, 0);
    }
});

test('MB-04 loader refuses missing export and changed factory identity without registration', async () => {
    const absent = fixture(); absent.ports.activate = async () => ({});
    await assert.rejects(loadReviewedBackend(absent.registry, absent.entry, absent.ports), /Missing/);
    const changed = fixture(); changed.ports.activate = async () => ({ sdcBackendDriver: { descriptor: changed.descriptor, createDriver: async () => ({ ...changed.driver, descriptor: { ...changed.descriptor, backendId: 'different' } }) } });
    await assert.rejects(loadReviewedBackend(changed.registry, changed.entry, changed.ports), /different driver/);
    assert.equal(changed.counts.disposed, 1); assert.equal(changed.registry.list().length, 0);
});

test('MB-04 a package change during activation disposes the candidate and fails closed', async () => {
    const f = fixture(); let count = 0;
    f.ports.measure = async () => ++count === 1 ? f.inventory : { ...f.inventory, platform: 'changed' };
    await assert.rejects(loadReviewedBackend(f.registry, f.entry, f.ports), /changed during activation/);
    assert.equal(f.counts.disposed, 1); assert.equal(f.registry.list().length, 0);
});

test('MB-04 evaluation loader is explicit and cannot admit native or simulation records as evaluation', async () => {
    const { loadEvaluationBackend } = await import('../extensions/vscode-host/dist/loader.js');
    for (const level of ['native', 'simulation']) {
        const f = fixture(); f.entry.qualification.evidenceLevel = level;
        await assert.rejects(loadEvaluationBackend(f.registry, f.entry, f.ports), /evaluation evidence/);
        assert.equal(f.counts.activated, 0);
    }
    const f = fixture(); f.entry.qualification.evidenceLevel = 'evaluation';
    await assert.rejects(loadReviewedBackend(f.registry, f.entry, f.ports), /native evidence/);
    await loadEvaluationBackend(f.registry, f.entry, f.ports);
    assert.equal(f.registry.resolve('example').qualification.evidenceLevel, 'evaluation');
});
