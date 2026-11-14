import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import {
    REQUIRED_METHODS, REVIEWED_SCHEMA, analyzeBundle, buildProfile, loadPackage, methodDefinitions, scanBalanced
} from '../extensions/vscode/scripts/analyze-cline.mjs';
import { readZipEntries, writeZip } from '../extensions/vscode/scripts/vsix.mjs';
import { syntheticClineBundle as bundle, syntheticClineManifest as manifest } from './helpers/cline-bundle.mjs';

test('Cline analyzer treats differently minified but identical code as compatible', () => {
    const baseline = buildProfile(bundle(), manifest);
    const report = analyzeBundle(bundle({ factory: 'q6u', local: 'n' }), { ...manifest, version: '4.1.23' }, baseline, ['dist/extension.js']);
    assert.equal(report.verdict, 'COMPATIBLE', JSON.stringify(report.blockers.concat(report.reviews)));
    assert.equal(report.anchor.name, 'q6u');
    assert.equal(report.anchor.callSites, 1);
    assert.match(report.anchor.insertion, /^function q6u\(t\)\{return\{serverDrivenChat:require\("\.\/sdc-native\.cjs"\)\.createPinnedClineApi\(t\),startNewTask:async$/);
    assert.ok(REQUIRED_METHODS.every(name => report.methods[name].status === 'identical'));
    assert.equal(report.methods.denyPendingToolApproval.status, 'absent');
});

test('Cline analyzer accepts only changes whose exact fingerprints were reviewed', () => {
    const baseline = buildProfile(bundle(), manifest);
    const changed = bundle({ bodies: { clearPending: 'this.denyPendingToolApproval(e)' }, optional: ['denyPendingToolApproval'] });
    const reviewed = { schema: REVIEWED_SCHEMA, methods: {
        clearPending: [{ definitions: methodDefinitions(changed, 'clearPending'), since: '4.1.23', review: 'synthetic' }],
        denyPendingToolApproval: [{ definitions: methodDefinitions(changed, 'denyPendingToolApproval'), since: '4.1.23', review: 'synthetic' }] } };
    const report = analyzeBundle(changed, manifest, baseline, [], reviewed);
    assert.equal(report.verdict, 'COMPATIBLE');
    assert.equal(report.methods.clearPending.status, 'reviewed');
    assert.equal(report.methods.denyPendingToolApproval.status, 'reviewed');
    const unreviewedHelper = analyzeBundle(changed, manifest, baseline, [], { schema: REVIEWED_SCHEMA, methods: { clearPending: reviewed.methods.clearPending } });
    assert.equal(unreviewedHelper.verdict, 'REVIEW');
    assert.equal(unreviewedHelper.methods.denyPendingToolApproval.status, 'changed');
    const different = bundle({ bodies: { clearPending: 'this.denyPendingToolApproval(e),this.other()' }, optional: ['denyPendingToolApproval'] });
    assert.equal(analyzeBundle(different, manifest, baseline, [], reviewed).methods.clearPending.status, 'changed');
    assert.throws(() => analyzeBundle(changed, manifest, baseline, [], { schema: 'other' }), /Reviewed changes/);
});

test('Cline analyzer asks for review when a required method body changes', () => {
    const baseline = buildProfile(bundle(), manifest);
    const report = analyzeBundle(bundle({ bodies: { clearPending: 'this.denyPendingToolApproval(e)' } }), manifest, baseline);
    assert.equal(report.verdict, 'REVIEW');
    assert.equal(report.methods.clearPending.status, 'changed');
    assert.deepEqual(report.blockers, []);
});

test('Cline analyzer refuses missing members, ambiguous anchors, patched bundles and other extensions', () => {
    const baseline = buildProfile(bundle(), manifest);
    const missing = analyzeBundle(bundle({ omit: ['fireAndForgetSend'] }), manifest, baseline);
    assert.equal(missing.verdict, 'INCOMPATIBLE');
    assert.equal(missing.methods.fireAndForgetSend.status, 'missing');
    assert.equal(analyzeBundle(bundle({ extraFactory: true }), manifest, baseline).verdict, 'INCOMPATIBLE');
    const patched = analyzeBundle(bundle({ patched: true }), manifest, baseline);
    assert.equal(patched.verdict, 'INCOMPATIBLE');
    assert.equal(patched.anchor.alreadyPatched, true);
    assert.equal(analyzeBundle(bundle(), { ...manifest, publisher: 'someone' }, baseline).verdict, 'INCOMPATIBLE');
    assert.equal(analyzeBundle(bundle(), manifest, baseline, ['dist/extension.js', 'dist/sdc-native.cjs']).verdict, 'INCOMPATIBLE');
    assert.throws(() => analyzeBundle(bundle(), manifest, { schema: 'other' }), /profile/);
});

test('Cline analyzer bracket scanner skips strings, templates, regex literals and comments', () => {
    const source = 'f(a){let s="}",t=`${{b:"}"}.b}`,r=/[}{]\\}/g;/* } */return a/2}+1';
    assert.equal(source.slice(0, scanBalanced(source, 4)), source.slice(0, -2));
});

/** Build a small deflated ZIP (VSIX) in memory. */
function zip(files) {
    const locals = [], centrals = [];
    let offset = 0;
    for (const [name, text] of Object.entries(files)) {
        const data = Buffer.from(text), packed = deflateRawSync(data), nameBytes = Buffer.from(name);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8);
        header.writeUInt32LE(crc32(data), 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(nameBytes.length, 26);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
        central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
        locals.push(header, nameBytes, packed); centrals.push(central, nameBytes);
        offset += header.length + nameBytes.length + packed.length;
    }
    const directory = Buffer.concat(centrals), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
    end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, directory, end]);
}

test('VSIX writer round-trips deterministically through the reader', () => {
    const entries = [['extension.vsixmanifest', '<x/>'], ['extension/dist/extension.js', 'a'.repeat(5000)], ['extension/ü.txt', Buffer.from([0, 1, 2])]];
    const archive = writeZip(entries);
    assert.deepEqual(writeZip(entries), archive);
    const { names, entries: read } = readZipEntries(archive);
    assert.deepEqual(names, entries.map(([name]) => name));
    for (const [name, data] of entries) assert.deepEqual(read.get(name), Buffer.from(data));
});

test('Cline analyzer reads a VSIX without extracting it and verifies entry integrity', async t => {
    const root = await mkdtemp(join(tmpdir(), 'sdc-cline-analyzer-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const source = bundle(), path = join(root, 'cline.vsix');
    const archive = zip({ 'extension/package.json': JSON.stringify(manifest), 'extension/dist/extension.js': source, 'extension/dist/extra.mjs': '' });
    await writeFile(path, archive);
    const loaded = loadPackage(path);
    assert.equal(loaded.source, source);
    assert.deepEqual(loaded.files, ['dist/extension.js', 'dist/extra.mjs']);
    assert.match(analyzeBundle(loaded.source, loaded.manifest, buildProfile(source, manifest), loaded.files).notes.join(), /dist\/extra\.mjs/);
    const corrupt = Buffer.from(archive);
    corrupt.writeUInt32LE((corrupt.readUInt32LE(14) + 1) >>> 0, 14 + 0);
    const centralCrc = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 16;
    corrupt.writeUInt32LE((corrupt.readUInt32LE(centralCrc) + 1) >>> 0, centralCrc);
    await writeFile(path, corrupt);
    assert.throws(() => loadPackage(path), /Integrity check failed/);
});
