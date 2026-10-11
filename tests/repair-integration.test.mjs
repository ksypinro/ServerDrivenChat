import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {BridgeRuntime,BridgeStore} from '../bridge/dist/index.js';
import {FakeAppAdapter} from '../adapters/fake/dist/index.js';
import {apiFixture,command,waitFor,delay} from './helpers/api-fixture.mjs';
const url=process.env.M10_TEST_DATABASE_URL;

test('real runtime/API routes two bindings, skips obsolete work, handles blocked cancellation and queued turns',{skip:!url},async()=>{
 const f=await apiFixture(url);const dir=mkdtempSync(join(tmpdir(),'integration-repair-'));const store=new BridgeStore({path:join(dir,'db.sqlite')});const runtimes=[];
 try{
  await f.bind('obsolete');await f.db.recordCommand({commandId:'obsolete-prompt',sessionId:'obsolete',deviceId:f.issued.deviceId,lane:'prompt',payload:command('obsolete','obsolete-prompt')});await f.db.pool.query("UPDATE bindings SET state='detached' WHERE session_id='obsolete'");
  const bindings=[];
  for(const sessionId of ['alpha','beta']){
   const adapter=new FakeAppAdapter({sessionId,appInstanceId:sessionId,bridgeEpoch:`epoch-${sessionId}`,now:()=>new Date().toISOString(),script:[{type:'input',requestId:`input-${sessionId}`,requestRevision:1,question:'Wait'}]});
   const binding=(await adapter.attach({appId:'fake.app',appInstanceId:sessionId,conversationId:'fake-conversation'})).value;
   await f.bind(sessionId);bindings.push({adapter,binding});
   const runtime=new BridgeRuntime({serverUrl:f.base,deviceId:f.issued.deviceId,credential:f.issued.credential,binding,adapter,store,reconnectBaseMs:10,reconnectCapMs:100});runtimes.push(runtime);await runtime.start();
  }
  for(const sessionId of ['alpha','beta']){
   const first=command(sessionId,`${sessionId}-1`);const second=command(sessionId,`${sessionId}-2`);
   assert.equal((await f.request(`/v2/sessions/${sessionId}/turns`,{command:first},'owner')).status,202);
   assert.equal((await f.request(`/v2/sessions/${sessionId}/turns`,{command:second},'owner')).status,202);
  }
  await waitFor(async()=> (await f.db.readEvents('alpha',0)).some(e=>e.payload.type==='input.required')&&(await f.db.readEvents('beta',0)).some(e=>e.payload.type==='input.required'));
  assert.equal(store.getCursor(f.issued.deviceId,'prompt'),5);
  assert.equal(store.getDispatchState('alpha-2'),'queued');assert.equal(store.getDispatchState('beta-2'),'queued');
  const cancel={...command('alpha','cancel','control'),turnId:'turn-alpha-1'};
  assert.equal((await f.request('/v2/sessions/alpha/turns/turn-alpha-1/controls',{command:cancel},'owner')).status,202);
  const input={...command('beta','answer','control','input.respond',{requestId:'input-beta',requestRevision:1,answer:{createdAt:'yesterday'}})};delete input.turnId;
  assert.equal((await f.request('/v2/sessions/beta/turns/turn-beta-1/controls',{command:input},'owner')).status,202);
  await waitFor(async()=> (await f.db.readEvents('alpha',0)).some(e=>e.payload.type==='turn.completed'&&e.payload.payload.turnId==='turn-alpha-2')&&(await f.db.readEvents('beta',0)).some(e=>e.payload.type==='turn.completed'&&e.payload.payload.turnId==='turn-beta-2'));
  assert.ok((await f.db.readEvents('alpha',0)).some(e=>e.payload.type==='turn.cancelled'));
  assert.ok((await f.db.readEvents('beta',0)).some(e=>e.payload.type==='input.resolved'));
  await waitFor(()=>store.countUnackedOutput()===0);
  for(const runtime of runtimes)assert.equal(runtime.state,'online');
  assert.equal(store.getCursor(f.issued.deviceId,'control'),2);
  const aEvents=await f.db.readEvents('alpha',0);const bEvents=await f.db.readEvents('beta',0);assert.ok(aEvents.every(e=>e.payload.sessionId==='alpha'));assert.ok(bEvents.every(e=>e.payload.sessionId==='beta'));
 }finally{await Promise.all(runtimes.map(r=>r.stop()));store.close();rmSync(dir,{recursive:true,force:true});await f.close();}
});

test('dispatch permit orders a takeover after app admission, then fences the next native action',{skip:!url},async()=>{
 const f=await apiFixture(url);const dir=mkdtempSync(join(tmpdir(),'takeover-repair-'));const store=new BridgeStore({path:join(dir,'db.sqlite')});let runtime;let resume;
 try {
  const adapter=new FakeAppAdapter({sessionId:'s',now:()=>new Date().toISOString()});const binding=(await adapter.attach({appId:'fake.app',appInstanceId:'fake-instance',conversationId:'fake-conversation'})).value;await f.bind('s');
  let entered=false;const waiting=new Promise(r=>resume=r);const submit=adapter.submit.bind(adapter);let calls=0;
  adapter.submit=async(...args)=>{entered=true;await waiting;args[2].assertAuthority();calls++;return submit(...args);};
  runtime=new BridgeRuntime({serverUrl:f.base,deviceId:f.issued.deviceId,credential:f.issued.credential,binding,adapter,store});await runtime.start();
  await f.request('/v2/sessions/s/turns',{command:command('s','first')},'owner');await waitFor(()=>entered);
  let takeoverDone=false;const takeover=f.db.pool.query("UPDATE bindings SET lease_generation=2 WHERE session_id='s'").then(()=>takeoverDone=true);
  await delay(50);assert.equal(takeoverDone,false,'takeover must wait for admitted native mutation');resume();await takeover;
  assert.equal(calls,1);
  store.acceptCommand({deviceId:f.issued.deviceId,sessionId:'s',commandId:'second',lane:'prompt',laneSeq:2,payload:command('s','second')});
  await waitFor(()=>['lease_lost','reconciliation_required'].includes(runtime.state));assert.equal(calls,1);
 }finally{resume?.();await runtime?.stop();store.close();rmSync(dir,{recursive:true,force:true});await f.close();}
});

test('restart sends retained old-epoch output and accepts new-epoch sequence one',{skip:!url},async()=>{
 const f=await apiFixture(url);const dir=mkdtempSync(join(tmpdir(),'epoch-runtime-repair-'));const store=new BridgeStore({path:join(dir,'db.sqlite')});let first;let second;
 try{await f.bind('s');
  const attach=async epoch=>{const adapter=new FakeAppAdapter({sessionId:'s',bridgeEpoch:epoch,now:()=>new Date().toISOString()});return {adapter,binding:(await adapter.attach({appId:'fake.app',appInstanceId:'fake-instance',conversationId:'fake-conversation'})).value};};
  const old=await attach('old');
  first=new BridgeRuntime({serverUrl:f.base,deviceId:f.issued.deviceId,credential:f.issued.credential,store,...old,fetch:async(url,init)=>new URL(url).pathname.endsWith('/events')?Response.json({},{status:503}):fetch(url,init),reconnectBaseMs:10,reconnectCapMs:20});
  await first.start();await f.request('/v2/sessions/s/turns',{command:command('s','old-turn')},'owner');await waitFor(()=>store.getDispatchState("old-turn")==="applied"&&store.listUnackedOutput().some(e=>e.payload.type==="turn.completed"));await first.stop();
  const retained=store.listUnackedOutput().length;assert.ok(retained>0);
  const current=await attach('new');second=new BridgeRuntime({serverUrl:f.base,deviceId:f.issued.deviceId,credential:f.issued.credential,store,...current});await second.start();
  assert.equal((await f.request('/v2/sessions/s/turns',{command:command('s','new-turn')},'owner')).status,202);
  try {await waitFor(async()=>{const events=await f.db.readEvents('s',0);return events.some(e=>e.bridgeEpoch==='new'&&e.producerSeq===1)&&events.filter(e=>e.bridgeEpoch==='old').length===retained&&store.countUnackedOutput()===0;});}
  catch(error){throw Error(JSON.stringify({reason:error.message,state:second.state,retained,output:store.listUnackedOutput().map(e=>({id:e.eventId,epoch:e.bridgeEpoch,seq:e.eventSeq})),events:(await f.db.readEvents('s',0)).map(e=>({id:e.eventId,epoch:e.bridgeEpoch,seq:e.producerSeq})),commands:await f.db.pool.query("SELECT command_id,state FROM commands LEFT JOIN command_acknowledgements USING(device_id,lane,lane_seq)").then(r=>r.rows)}));}
  assert.equal(second.state,'online');assert.equal(store.getLastOutputSeq('s','old'),retained);assert.ok(store.getLastOutputSeq('s','new')>0);
 }finally{await first?.stop();await second?.stop();store.close();rmSync(dir,{recursive:true,force:true});await f.close();}
});
