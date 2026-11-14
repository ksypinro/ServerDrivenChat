import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REVIEWED_SCHEMA, buildProfile, findAnchor } from '../extensions/vscode/scripts/analyze-cline.mjs';
import { ADDON_REVISION, assertAddonFresh, buildPatchedCline, readClinePackage } from '../extensions/vscode/scripts/patch-cline.mjs';
import { readZipEntries, writeZip } from '../extensions/vscode/scripts/vsix.mjs';
import { syntheticClineBundle, syntheticClineManifest } from './helpers/cline-bundle.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const addon = Buffer.from('"use strict";exports.createPinnedClineApi=function(){};');
const license = 'MIT License\n\nSynthetic project license.\n';
const reviewed = { schema: REVIEWED_SCHEMA, methods: {} };
const template = '<?xml version="1.0" encoding="utf-8"?><PackageManifest><Metadata><Identity Language="en-US" Id="claude-dev" Version="4.1.22" Publisher="saoudrizwan" /><DisplayName>Cline</DisplayName></Metadata></PackageManifest>';

/** Installed-extension layout: VS Code adds __metadata and keeps the original manifest as .vsixmanifest. */
async function installedCline(t, source = syntheticClineBundle()) {
    const root = await mkdtemp(join(tmpdir(), 'sdc-cline-patch-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, 'dist'));
    await mkdir(join(root, 'webview-ui/build'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ ...syntheticClineManifest, displayName: 'Cline', __metadata: { installedTimestamp: 1 } }));
    await writeFile(join(root, 'dist/extension.js'), `${source}/*! Bundled license information:\nupstream notices */`);
    await writeFile(join(root, 'webview-ui/build/index.html'), '<html></html>');
    await writeFile(join(root, 'LICENSE.txt'), 'Apache License 2.0');
    await writeFile(join(root, '.vsixmanifest'), template);
    return root;
}

test('Patch tool builds a deterministic patched VSIX from a compatible installed Cline without touching it', async t => {
    const root = await installedCline(t), before = await readFile(join(root, 'dist/extension.js'));
    const stock = readClinePackage(root);
    const baseline = buildProfile(stock.files.get('dist/extension.js').toString('utf8'), syntheticClineManifest);
    const first = buildPatchedCline(stock, { addon, license, baseline, reviewed });
    assert.deepEqual(buildPatchedCline(readClinePackage(root), { addon, license, baseline, reviewed }).vsix, first.vsix, 'same inputs produce identical bytes');
    assert.deepEqual(await readFile(join(root, 'dist/extension.js')), before, 'input package is not modified');

    const { names, entries } = readZipEntries(first.vsix);
    assert.deepEqual(names.slice(0, 2), ['extension.vsixmanifest', '[Content_Types].xml']);
    assert.ok(names.includes('extension/webview-ui/build/index.html'));
    assert.ok(!names.includes('extension/.vsixmanifest'));
    const manifest = JSON.parse(entries.get('extension/package.json').toString('utf8'));
    assert.equal(manifest.version, `4.1.${22 * 100 + ADDON_REVISION}`);
    assert.equal(manifest.__metadata, undefined);
    assert.equal(manifest.sdcPatch.baseVersion, '4.1.22');
    assert.equal(manifest.sdcPatch.revision, ADDON_REVISION);
    assert.match(entries.get('extension.vsixmanifest').toString('utf8'), new RegExp(`Version="4\\.1\\.${22 * 100 + ADDON_REVISION}"`));
    const patched = entries.get('extension/dist/extension.js').toString('utf8');
    assert.equal(findAnchor(patched).alreadyPatched, true);
    assert.equal(patched.replace('serverDrivenChat:require("./sdc-native.cjs").createPinnedClineApi(t),', ''), before.toString('utf8'));
    assert.deepEqual(entries.get('extension/dist/sdc-native.cjs'), addon);
    assert.equal(entries.get('extension/SDC-PATCH-LICENSE.txt').toString('utf8'), license);
    assert.match(entries.get('extension/CLINE-UPSTREAM-BUNDLED-NOTICES.txt').toString('utf8'), /upstream notices/);
    assert.equal(first.record.patchedBundleSha256, sha256(patched));
    assert.equal(first.record.nativeAddonSha256, sha256(addon));
    assert.equal(first.record.vsixSha256, sha256(first.vsix));
});

test('Patch tool reads stock VSIX input and refuses anything the analyzer does not rate COMPATIBLE', async t => {
    const baseline = buildProfile(syntheticClineBundle(), syntheticClineManifest);
    const vsix = writeZip([['extension.vsixmanifest', template], ['extension/package.json', JSON.stringify(syntheticClineManifest)], ['extension/dist/extension.js', syntheticClineBundle({ factory: 'q6u', local: 'n' })]]);
    const root = await mkdtemp(join(tmpdir(), 'sdc-cline-patch-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await writeFile(join(root, 'stock.vsix'), vsix);
    assert.equal(buildPatchedCline(readClinePackage(join(root, 'stock.vsix')), { addon, license, baseline, reviewed }).record.exportFactory, 'q6u');

    const changed = await installedCline(t, syntheticClineBundle({ bodies: { clearPending: 'this.somethingNew(e)' } }));
    assert.throws(() => buildPatchedCline(readClinePackage(changed), { addon, license, baseline, reviewed }), /verdict is REVIEW/);
    const patched = await installedCline(t, syntheticClineBundle({ patched: true }));
    assert.throws(() => buildPatchedCline(readClinePackage(patched), { addon, license, baseline, reviewed }), /verdict is INCOMPATIBLE/);
    const compatible = readClinePackage(await installedCline(t));
    assert.throws(() => buildPatchedCline(compatible, { addon: Buffer.from('nothing'), license, baseline, reviewed }), /createPinnedClineApi/);
    assert.throws(() => buildPatchedCline(compatible, { addon, license: 'Proprietary', baseline, reviewed }), /MIT/);
});

test('Patch tool refuses symbolic links and a stale add-on build', async t => {
    const root = await installedCline(t);
    await symlink('/etc/hosts', join(root, 'dist/link.js'));
    assert.throws(() => readClinePackage(root), /symbolic link/);
    const built = join(root, 'addon.cjs'), source = join(root, 'source.ts');
    await writeFile(built, 'built'); await writeFile(source, 'source');
    await utimes(built, new Date(1000), new Date(1000));
    assert.throws(() => assertAddonFresh(built, [source]), /older than its sources/);
    await utimes(built, new Date(), new Date(Date.now() + 60_000));
    assert.doesNotThrow(() => assertAddonFresh(built, [source]));
    assert.throws(() => assertAddonFresh(join(root, 'missing.cjs'), []), /not built/);
});
