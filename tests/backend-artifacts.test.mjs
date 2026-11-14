import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, chmod, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureInstalledTree } from '../extensions/vscode-host/dist/artifacts.js';

async function fixture(t) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'sdc-artifact-')));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, 'dist'));
    await writeFile(join(root, 'package.json'), '{"version":"1.0.0"}');
    await writeFile(join(root, 'dist/main.js'), 'module.exports = {};');
    return root;
}
test('MB-04 complete installed digest is deterministic and detects nested bytes, additions and modes', async t => {
    const root = await fixture(t), baseline = await measureInstalledTree(root);
    assert.deepEqual(await measureInstalledTree(root), baseline);
    assert.equal(baseline.files, 2);
    await writeFile(join(root, 'dist/main.js'), 'module.exports = {changed:true};');
    assert.notEqual((await measureInstalledTree(root)).sha256, baseline.sha256);
    await writeFile(join(root, 'dist/main.js'), 'module.exports = {};');
    assert.equal((await measureInstalledTree(root)).sha256, baseline.sha256);
    await chmod(join(root, 'dist/main.js'), 0o755);
    assert.notEqual((await measureInstalledTree(root)).sha256, baseline.sha256);
    await chmod(join(root, 'dist/main.js'), 0o644);
    await writeFile(join(root, 'unlisted.js'), 'extra executable');
    assert.notEqual((await measureInstalledTree(root)).sha256, baseline.sha256);
});
test('MB-04 measurement refuses symlink files, directories, root aliases and relative paths', async t => {
    const root = await fixture(t);
    await assert.rejects(measureInstalledTree('.'), /absolute/);
    const link = join(root, 'alias');
    await symlink(join(root, 'dist'), link);
    await assert.rejects(measureInstalledTree(link), /symlink/);
    await assert.rejects(measureInstalledTree(root), /symlink/);
    await rm(link);
    await symlink(join(root, 'package.json'), link);
    await assert.rejects(measureInstalledTree(root), /symlink/);
});

test('MB-04 bundle measurement includes internal links and rejects escaping links', async t => {
    const root = await fixture(t);
    await symlink('dist', join(root, 'Current'));
    const measured = await measureInstalledTree(root, true);
    assert.equal(measured.format, 'sdc-bundle-tree-v1');
    assert.equal(measured.files, 2);
    await rm(join(root, 'Current'));
    await symlink('..', join(root, 'Current'));
    await assert.rejects(measureInstalledTree(root, true), /escapes/);
});
