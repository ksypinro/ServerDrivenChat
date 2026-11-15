import assert from 'node:assert/strict';
import test from 'node:test';
import { fork } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { apiFixture, command, waitFor } from './helpers/api-fixture.mjs';
const url=process.env.MI06_TEST_DATABASE_URL;
for (const mode of ['source','packaged','older','malformed','authority']) test(`MI-06 ${mode} bridge ${['older','malformed','authority'].includes(mode)?'fails closed on expiry':'recovers an expired device cursor without duplicate effects'}`, {skip:!url && 'requires disposable PostgreSQL',timeout:30000}, async()=>{
 const f=await apiFixture(url),dir=await mkdtemp(join(tmpdir(),'mi06-process-')),windows=[];
 try{
  for(const [index,sessionId] of ['alpha','beta'].entries()){
   await f.bind(sessionId);
   const config={corruptCheckpoint:index===1&&['malformed','authority'].includes(mode)?mode:undefined,packaged:mode==='packaged'?true:(mode==='older'&&index===1?'mi04':false),serverUrl:f.base,deviceId:f.issued.deviceId,credential:f.issued.credential,sessionId,appInstanceId:`window-${sessionId}`,storePath:join(dir,sessionId+'.sqlite'),second:index===1,stall:index===1};
   const child=fork(new URL('./helpers/mi06-window.mjs',import.meta.url),[JSON.stringify(config)],{stdio:['ignore','ignore','inherit','ipc']});const messages=[];child.on('message',message=>messages.push(message));windows.push({child,messages,config});
   await waitFor(()=>messages.some(m=>m.type==='binding'));const binding=messages.find(m=>m.type==='binding').binding;
   await f.db.pool.query('UPDATE bindings SET binding_id=$1 WHERE session_id=$2',[binding.bindingId,sessionId]);child.send('start');await waitFor(()=>messages.some(m=>m.type==='started'));
  }
  const [a,b]=windows;await waitFor(()=>b.messages.some(m=>m.type==='stalled'));
  for(const id of ['a1','a2']){
   const c=command('alpha',id);assert.equal((await f.request('/v2/sessions/alpha/turns',{command:c},'owner')).status,202);
   await waitFor(async()=>{const r=await f.db.pool.query("SELECT a.state FROM commands c JOIN command_acknowledgements a USING(device_id,lane,lane_seq) WHERE c.command_id=$1",[id]);return r.rows[0]?.state==='applied' && (await f.db.readEvents('alpha',0)).some(e=>e.payload.type==='turn.completed' && e.payload.payload.turnId===c.turnId);},10000);
  }
  const result=await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:100,now:new Date(Date.now()+1000)});assert.equal(result.floor,2);
  b.child.send('resume');
  if(['older','malformed','authority'].includes(mode)){await waitFor(()=>b.messages.some(m=>m.type==='expired')&&b.messages.some(m=>m.type==='state'&&m.state==='reconciliation_required'),10000);assert.equal(b.messages.some(m=>m.type==='effect'),false);if(mode==='older')assert.equal(b.messages.some(m=>m.type==='checkpoint'),false);else assert.ok(b.messages.some(m=>m.type==='checkpoint'));return;}
  await waitFor(()=>b.messages.some(m=>m.type==='expired')&&b.messages.some(m=>m.type==='checkpoint'),10000);
  await waitFor(()=>{const db=new DatabaseSync(b.config.storePath);try{return Number(db.prepare("SELECT last_contiguous_seq FROM receipt_cursors WHERE device_id=? AND lane='prompt'").get(f.issued.deviceId)?.last_contiguous_seq)===2;}finally{db.close();}},10000);
  for(const [sessionId,id] of [['beta','b1'],['alpha','a3']]){const c=command(sessionId,id);assert.equal((await f.request(`/v2/sessions/${sessionId}/turns`,{command:c},'owner')).status,202);await waitFor(async()=>(await f.db.readEvents(sessionId,0)).some(e=>e.payload.type==='turn.completed'&&e.payload.payload.turnId===c.turnId),10000);}
  assert.deepEqual(a.messages.filter(m=>m.type==='effect').map(m=>m.commandId),['a1','a2','a3']);assert.deepEqual(b.messages.filter(m=>m.type==='effect').map(m=>m.commandId),['b1']);
  for(const w of windows){const db=new DatabaseSync(w.config.storePath);try{assert.deepEqual(db.prepare('SELECT DISTINCT session_id FROM inbox_commands').all().map(x=>x.session_id),[w.config.sessionId]);}finally{db.close();}}
 }finally{for(const w of windows)if(w.child.connected)w.child.send('stop');for(const w of windows){await Promise.race([new Promise(resolve=>w.child.once('exit',resolve)),new Promise(resolve=>setTimeout(()=>{w.child.kill('SIGKILL');resolve();},2000))]);}await f.close();await rm(dir,{recursive:true,force:true});}
});
test('MI-06 control lane recovers a real expired cursor and dispatches once',{skip:!url && 'requires disposable PostgreSQL',timeout:30000},async()=>{
 const f=await apiFixture(url),dir=await mkdtemp(join(tmpdir(),'mi06-control-')),windows=[];
 try{await f.bind('alpha');await f.bind('beta');const c=command('alpha','past-control','control','permission.revoke',{grantId:'old-grant'});delete c.turnId;await f.db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'control',payload:c});await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'control',laneSeq:1,state:'rejected',payload:{sessionId:'alpha'}});assert.equal((await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'control',minAgeSeconds:0,keepLast:0,batchSize:10,now:new Date(Date.now()+1000)})).floor,1);
  for(const [index,sessionId] of ['alpha','beta'].entries()){
   const config={serverUrl:f.base,deviceId:f.issued.deviceId,credential:f.issued.credential,sessionId,appInstanceId:`control-${sessionId}`,storePath:join(dir,sessionId+'.sqlite'),second:index===1,stall:index===1,stallLane:'control'};
   const child=fork(new URL('./helpers/mi06-window.mjs',import.meta.url),[JSON.stringify(config)],{stdio:['ignore','ignore','inherit','ipc']});const messages=[];child.on('message',m=>messages.push(m));windows.push({child,messages,config});await waitFor(()=>messages.some(m=>m.type==='binding'));await f.db.pool.query('UPDATE bindings SET binding_id=$1 WHERE session_id=$2',[messages.find(m=>m.type==='binding').binding.bindingId,sessionId]);child.send('start');await waitFor(()=>messages.some(m=>m.type==='started'));
  }
  const [a,b]=windows;await waitFor(()=>b.messages.some(m=>m.type==='stalled'));b.child.send('resume');await waitFor(()=>b.messages.some(m=>m.type==='expired')&&b.messages.some(m=>m.type==='checkpoint'));
  const next=command('beta','new-control','control','permission.revoke',{grantId:'new-grant'});delete next.turnId;const r=await f.request('/v2/sessions/beta/turns/transport/controls',{command:next},'owner');assert.equal(r.status,202);await waitFor(()=>b.messages.some(m=>m.type==='revoke-effect'),10000);assert.deepEqual(b.messages.filter(m=>m.type==='revoke-effect').map(m=>m.grantId),['new-grant']);assert.equal(a.messages.filter(m=>m.type==='revoke-effect').length,0);
 }finally{for(const w of windows)if(w.child.connected)w.child.send('stop');for(const w of windows)await Promise.race([new Promise(r=>w.child.once('exit',r)),new Promise(r=>setTimeout(()=>{w.child.kill('SIGKILL');r();},2000))]);await f.close();await rm(dir,{recursive:true,force:true});}
});
test('MI-06 bridge killed during real checkpoint recovers after restart while peer stays online',{skip:!url && 'requires disposable PostgreSQL',timeout:30000},async()=>{
 const f=await apiFixture(url),dir=await mkdtemp(join(tmpdir(),'mi06-runtime-crash-')),windows=[];let killed;
 const spawn=async config=>{const child=fork(new URL('./helpers/mi06-window.mjs',import.meta.url),[JSON.stringify(config)],{stdio:['ignore','ignore','inherit','ipc']});const messages=[];child.on('message',m=>messages.push(m));const w={child,messages,config};windows.push(w);await waitFor(()=>messages.some(m=>m.type==='binding'));await f.db.pool.query('UPDATE bindings SET binding_id=$1 WHERE session_id=$2',[messages.find(m=>m.type==='binding').binding.bindingId,config.sessionId]);child.send('start');await waitFor(()=>messages.some(m=>m.type==='started'));return w;};
 try{for(const id of ['alpha','beta'])await f.bind(id);const base={serverUrl:f.base,deviceId:f.issued.deviceId,credential:f.issued.credential};
  const a=await spawn({...base,sessionId:'alpha',appInstanceId:'crash-alpha',storePath:join(dir,'alpha.sqlite')});
  const bConfig={...base,sessionId:'beta',appInstanceId:'crash-beta',storePath:join(dir,'beta.sqlite'),second:true,stall:true,crashCheckpoint:'after_retention_cursor'};const b=await spawn(bConfig);await waitFor(()=>b.messages.some(m=>m.type==='stalled'));
  const first=command('alpha','crash-first');assert.equal((await f.request('/v2/sessions/alpha/turns',{command:first},'owner')).status,202);await waitFor(async()=>{const r=await f.db.pool.query("SELECT a.state FROM commands c JOIN command_acknowledgements a USING(device_id,lane,lane_seq) WHERE c.command_id=$1",[first.commandId]);return r.rows[0]?.state==='applied'&&(await f.db.readEvents('alpha',0)).some(e=>e.payload.type==='turn.completed'&&e.payload.payload.turnId===first.turnId);},10000);
  assert.equal((await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:10,now:new Date(Date.now()+1000)})).floor,1);const exited=new Promise(resolve=>b.child.once('exit',(code,signal)=>resolve({code,signal})));b.child.send('resume');killed=await exited;assert.equal(killed.signal,'SIGKILL');assert.ok(b.messages.some(m=>m.type==='expired'));
  const db=new DatabaseSync(bConfig.storePath);try{assert.equal(Number(db.prepare("SELECT last_contiguous_seq FROM receipt_cursors WHERE device_id=? AND lane='prompt'").get(f.issued.deviceId).last_contiguous_seq),0);}finally{db.close();}
  const restored=await spawn({...bConfig,stall:false,crashCheckpoint:undefined});await waitFor(()=>restored.messages.some(m=>m.type==='checkpoint'),10000);
  for(const [sessionId,id] of [['beta','crash-recovered'],['alpha','crash-peer']]){const c=command(sessionId,id);assert.equal((await f.request(`/v2/sessions/${sessionId}/turns`,{command:c},'owner')).status,202);await waitFor(async()=>(await f.db.readEvents(sessionId,0)).some(e=>e.payload.type==='turn.completed'&&e.payload.payload.turnId===c.turnId),10000);}
  assert.deepEqual(restored.messages.filter(m=>m.type==='effect').map(m=>m.commandId),['crash-recovered']);assert.deepEqual(a.messages.filter(m=>m.type==='effect').map(m=>m.commandId),['crash-first','crash-peer']);
 }finally{for(const w of windows)if(w.child.connected)w.child.send('stop');for(const w of windows)if(w.child.exitCode===null&&w.child.signalCode===null)await Promise.race([new Promise(r=>w.child.once('exit',r)),new Promise(r=>setTimeout(()=>{w.child.kill('SIGKILL');r();},2000))]);await f.close();await rm(dir,{recursive:true,force:true});}
});
