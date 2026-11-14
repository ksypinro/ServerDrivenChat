import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureInstalledTree } from '../extensions/vscode-host/dist/artifacts.js';
import { createInstalledLoaderPorts } from '../extensions/vscode-host/dist/installed-loader.js';
import { loadReviewedBackend } from '../extensions/vscode-host/dist/loader.js';
import { BackendRegistry } from '../adapters/core/dist/index.js';
import { backendFixture } from './helpers/backend-driver.mjs';

async function fixture(t) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'sdc-installed-')));
    t.after(() => rm(root, { recursive: true, force: true }));
    const f = backendFixture();
    // Synthetic policy fixture only, never native acceptance evidence.
    f.qualification.evidenceLevel = 'native';
    let activated = 0;
    const driver = { descriptor: f.descriptor, discover: async () => [], createAdapter: async () => {}, readConversationRevision: async () => 0, dispose: async () => {} };
    for (const artifact of f.qualification.inventory.artifacts) {
        const directory = join(root, artifact.id); await mkdir(directory);
        await writeFile(join(directory, 'package.json'), JSON.stringify({ publisher: 'example', name: artifact.role, version: '1.0.0' }));
        artifact.sha256 = (await measureInstalledTree(directory)).sha256;
    }
    const ports = createInstalledLoaderPorts({ platform: f.inventory.platform, extension(id) {
        return { id, directory: join(root, id), activate: async () => { activated++; return { sdcBackendDriver: { descriptor: f.descriptor, createDriver: async () => driver } }; } };
    } });
    return { root, entry: { extensionId: 'example.driver', qualification: f.qualification }, ports, get activated() { return activated; } };
}
test('MB-04 installed loader measures real files and activates only matching full inventory', async t => {
    const f = await fixture(t), registry = new BackendRegistry();
    await loadReviewedBackend(registry, f.entry, f.ports);
    assert.equal(f.activated, 1); assert.equal(registry.list().length, 1);
});
test('MB-04 installed loader refuses added native bytes before driver activation', async t => {
    const f = await fixture(t);
    await writeFile(join(f.root, 'example.native', 'extra.js'), 'unreviewed');
    await assert.rejects(loadReviewedBackend(new BackendRegistry(), f.entry, f.ports), /differ/);
    assert.equal(f.activated, 0);
});
test('MB-04 installed loader refuses manifest identity substitution before activation', async t => {
    const f = await fixture(t);
    await writeFile(join(f.root, 'example.driver', 'package.json'), JSON.stringify({ publisher: 'other', name: 'driver', version: '1.0.0' }));
    await assert.rejects(loadReviewedBackend(new BackendRegistry(), f.entry, f.ports), /identity/);
    assert.equal(f.activated, 0);
});
