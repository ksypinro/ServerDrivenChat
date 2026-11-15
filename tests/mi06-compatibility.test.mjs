import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync, fork} from 'node:child_process';
import {mkdtemp,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {apiFixture,command,waitFor} from './helpers/api-fixture.mjs';
const url=process.env.MI06_TEST_DATABASE_URL;
test('MI-06 bridge interoperates with the accepted MI-04 server transport when retention is absent',{skip:!url && 'requires disposable PostgreSQL',timeout:30000},async()=>{
 const image='sdc-server:mi04-reindex-candidate',expected='sha256:8d54282b63035ba283c2e371e82f5d4ad144a4e870f8edf5b170ec13eea4cf1c';
 const actual=execFileSync('docker',['image','inspect','--format','{{.Id}}',image],{encoding:'utf8'}).trim();assert.equal(actual,expected,'accepted MI-04 server image is required');
 const dir=await mkdtemp(join(tmpdir(),'mi06-old-server-'));let container,fixture,child;
 try{
  container=execFileSync('docker',['create',image],{encoding:'utf8'}).trim();
  execFileSync('docker',['cp',`${container}:/workspace/server/dist`,join(dir,'dist')]);
  await symlink(fileURLToPath(new URL('../node_modules',import.meta.url)),join(dir,'node_modules'));
  const {createApiServer}=await import(pathToFileURL(join(dir,'dist/http/index.js')).href);
  fixture=await apiFixture(url,{}, {apiServerFactory:createApiServer});await fixture.bind('compat');
  const config={serverUrl:fixture.base,deviceId:fixture.issued.deviceId,credential:fixture.issued.credential,sessionId:'compat',appInstanceId:'compat-window',storePath:join(dir,'compat.sqlite')};
  child=fork(new URL('./helpers/mi06-window.mjs',import.meta.url),[JSON.stringify(config)],{stdio:['ignore','ignore','inherit','ipc']});const messages=[];child.on('message',m=>messages.push(m));await waitFor(()=>messages.some(m=>m.type==='binding'));await fixture.db.pool.query('UPDATE bindings SET binding_id=$1 WHERE session_id=$2',[messages.find(m=>m.type==='binding').binding.bindingId,'compat']);child.send('start');await waitFor(()=>messages.some(m=>m.type==='started'));
  const c=command('compat','compat-cmd');assert.equal((await fixture.request('/v2/sessions/compat/turns',{command:c},'owner')).status,202);await waitFor(()=>messages.some(m=>m.type==='effect'),10000);assert.deepEqual(messages.filter(m=>m.type==='effect').map(m=>m.commandId),['compat-cmd']);assert.equal(messages.some(m=>m.type==='checkpoint'),false);
 }finally{if(child?.connected)child.send('stop');if(child)await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(()=>{child.kill('SIGKILL');r();},2000))]);await fixture?.close();if(container)execFileSync('docker',['rm','-f',container],{stdio:'ignore'});await rm(dir,{recursive:true,force:true});}
});
