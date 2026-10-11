import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {assertReviewedClinePin} from '../../extensions/vscode/dist/pin.mjs';
import {ClineAppAdapter} from '../../adapters/cline/dist/index.js';
test('M23 adopted pin and M30 exact disposable candidate reject changed versions, revisions and bundles',async(t)=>{
 const directory=new URL('../../extensions/vscode/dist/cline-4.1.22-sdc-m21.3/',import.meta.url);
 const manifestText=await readFile(new URL('package.json',directory),'utf8').catch(error=>{
  if(error.code==='ENOENT' && process.env.SDC_REQUIRE_NATIVE_ARTIFACTS!=='1')return null;
  throw error;
 });
 if(manifestText===null){t.skip('Preserved native release artifacts absent; set SDC_REQUIRE_NATIVE_ARTIFACTS=1 for release qualification');return;}
 const manifest=JSON.parse(manifestText);
 const [extension,native]=await Promise.all([readFile(new URL('dist/extension.js',directory)),readFile(new URL('dist/sdc-native.cjs',directory))]);
 assert.doesNotThrow(()=>assertReviewedClinePin(manifest,extension,native));
 for(const changed of [{version:'4.1.22'},{...manifest,version:'4.2.0'},{...manifest,sdcPatch:{...manifest.sdcPatch,revision:4}}])assert.throws(()=>assertReviewedClinePin(changed,extension,native),/changed or is unsupported/);
 assert.throws(()=>assertReviewedClinePin(manifest,Buffer.concat([extension,Buffer.from('tamper')]),native));assert.throws(()=>assertReviewedClinePin(manifest,extension,Buffer.concat([native,Buffer.from('tamper')])));
 const candidate=new URL('../../extensions/vscode/dist/cline-4.1.22-sdc-m30.1/',import.meta.url);
 const candidateText=await readFile(new URL('package.json',candidate),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(candidateText){
  const candidateManifest=JSON.parse(candidateText),candidateNative=await readFile(new URL('dist/sdc-native.cjs',candidate));
  assert.doesNotThrow(()=>assertReviewedClinePin(candidateManifest,extension,candidateNative));
  assert.throws(()=>assertReviewedClinePin(candidateManifest,extension,native),/changed or is unsupported/);
  assert.throws(()=>assertReviewedClinePin(candidateManifest,extension,Buffer.concat([candidateNative,Buffer.from('tamper')])),/changed or is unsupported/);
 }
});
test('unsupported native API and Cline versions are rejected without release artifacts',()=>{
 for(const api of [{apiVersion:'1.4',clineVersion:'4.1.22'},{apiVersion:'1.3',clineVersion:'4.2.0'}])assert.throws(()=>new ClineAppAdapter(api),/Unsupported/);
});
