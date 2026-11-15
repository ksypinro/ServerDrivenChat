import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readZipEntries} from '../extensions/vscode/scripts/vsix.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('MI-06 candidate .2 manifest matches tested bundle, preserved native archive, migrations and server image',async()=>{
 const m=JSON.parse(await readFile(new URL('../evidence/MI06/artifact-manifest.json',import.meta.url),'utf8'));
 for(const a of m.artifacts){const bytes=await readFile(new URL('../extensions/vscode/dist/mi06-candidate/'+a.file,import.meta.url));assert.equal(hash(bytes),a.sha256);if(a.file.includes('0.10.0')){const bundle=readZipEntries(bytes).entries.get('extension/dist/extension.cjs');assert.equal(hash(bundle),m.companionBundleSha256);assert.equal(hash(await readFile(new URL('../extensions/vscode/dist/extension.cjs',import.meta.url))),hash(bundle));}}
 const old=JSON.parse(await readFile(new URL('../evidence/MI04/artifact-manifest.json',import.meta.url),'utf8'));assert.equal(m.artifacts.find(a=>a.file.startsWith('cline-')).sha256,old.artifacts.find(a=>a.file.startsWith('cline-')).sha256);
 for(const entry of m.migrations)assert.equal(hash(await readFile(new URL('../server/migrations/'+entry.file,import.meta.url))),entry.sha256);
 assert.equal(execFileSync('docker',['image','inspect','--format','{{.Id}}',m.serverImage.tag],{encoding:'utf8'}).trim(),m.serverImage.imageId);
});
