// Developer-only candidate packager. Preserves the accepted upstream bundle and frozen archives.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readZipEntries, writeZip } from './vsix.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const extension = join(root, 'extensions/vscode');
const out = join(extension, 'dist/mi04-candidate');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const signed = JSON.parse(await readFile(join(root, 'evidence/M24/artifact-manifest.json'), 'utf8'));
const baseName = 'cline-4.1.22-sdc-m24.1.vsix';
const base = await readFile(join(extension, 'dist/m24-release-candidate', baseName));
if (hash(base) !== signed.artifacts.find(a => a.file === baseName)?.sha256) throw Error('Accepted base archive changed');
const native = await readFile(join(extension, 'dist/sdc-native.cjs'));
const { MI04_CANDIDATE_CLINE_PIN: pin, assertReviewedClinePin } = await import('../dist/pin.mjs');
const cline = readZipEntries(base).entries;
const manifest = JSON.parse(cline.get('extension/package.json'));
manifest.version = pin.version;
manifest.displayName = 'Cline (SDC MI-04 candidate)';
manifest.sdcPatch = { ...manifest.sdcPatch, revision: pin.revision, nativeAddonSha256: hash(native), acceptance: 'MI-04 candidate; requires real native acceptance' };
assertReviewedClinePin(manifest, cline.get('extension/dist/extension.js'), native);
cline.set('extension/package.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
cline.set('extension/dist/sdc-native.cjs', native);
cline.set('extension.vsixmanifest', Buffer.from(cline.get('extension.vsixmanifest').toString().replace(/Version="4\.1\.2204"/g, 'Version="' + pin.version + '"')));
const clineBytes = writeZip([...cline]);
const companionBase = await readFile(join(extension, 'dist/mi03-candidate/sdc-cline-bridge-0.8.0-mi03.1.vsix'));
const companion = readZipEntries(companionBase).entries;
const source = JSON.parse(await readFile(join(extension, 'package.json'), 'utf8'));
if (source.version !== '0.9.0') throw Error('Expected MI-04 companion 0.9.0');
const packaged = JSON.parse(companion.get('extension/package.json'));
packaged.version = source.version; packaged.contributes = source.contributes;
const bundle = await readFile(join(extension, 'dist/extension.cjs'));
companion.set('extension/package.json', Buffer.from(JSON.stringify(packaged, null, 2) + '\n'));
companion.set('extension/dist/extension.cjs', bundle);
companion.set('extension/README.md', Buffer.from('# MI-04 candidate\n\nUnsigned isolated same-workspace and session-continuity candidate. Requires native acceptance.\n'));
companion.set('extension.vsixmanifest', Buffer.from(companion.get('extension.vsixmanifest').toString().replace(/Version="0\.8\.0"/g, 'Version="0.9.0"')));
const companionBytes = writeZip([...companion]);
await mkdir(out, { recursive: true });
await mkdir(join(root, 'evidence/MI04'), { recursive: true });
const files = [
    { file: 'cline-4.1.2206-mi04.1.vsix', bytes: clineBytes },
    { file: 'sdc-cline-bridge-0.9.0-mi04.10.vsix', bytes: companionBytes }
];
for (const file of files) await writeFile(join(out, file.file), file.bytes);
const record = { milestone: 'MI-04', status: 'unsigned-candidate-needs-native-acceptance', nativePin: pin,
    companion: source.version, companionBundleSha256: hash(bundle), nativeApi: '1.3',
    artifacts: files.map(f => ({ file: f.file, sha256: hash(f.bytes) })),
    baseArchiveSha256: hash(base), publication: 'none' };
await writeFile(join(root, 'evidence/MI04/artifact-manifest.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
