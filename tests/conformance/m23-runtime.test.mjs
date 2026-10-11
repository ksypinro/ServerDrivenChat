import assert from 'node:assert/strict';
import test from 'node:test';
import {BridgeRuntime} from '../../bridge/dist/index.js';
import {fixture} from './runtime-fixture.mjs';
import {command,event,delay,waitFor} from '../helpers/api-fixture.mjs';
function queue(f,id,seq=1,lane='prompt',payload){const c=payload??command(f.binding.sessionId,id,lane);f.store.acceptCommand({commandId:id,sessionId:f.binding.sessionId,deviceId:'device',lane,laneSeq:seq,payload:c});}
test('M23 a stale prompt pauses the entire received batch while addressed controls remain dispatchable',async()=>{
 const f=await fixture();let controls=0;f.adapter.cancel=async(_b,_id,context)=>{context.assertAuthority();controls++;return {outcome:'applied',evidence:'SIMULATED cancel'};};
 try{const stale=command(f.binding.sessionId,'stale');stale.bindingRevision=2;queue(f,'stale',1,'prompt',stale);queue(f,'following',2);
  await f.runtime.start();await waitFor(()=>f.runtime.state==='reconciliation_required');await delay(120);assert.equal(f.submits,0);assert.equal(f.store.getDispatchState('following'),'queued');
  queue(f,'cancel',1,'control');await waitFor(()=>controls===1);assert.equal(f.store.getDispatchState('cancel'),'applied');assert.equal(f.submits,0);
 }finally{await f.close();}
});
test('M23 a hung output POST with a bounded 10 MiB backlog does not starve control dispatch',async()=>{
 let posting=false;const f=await fixture({request:async(url,init)=>{if(new URL(url).pathname.endsWith('/events')){posting=true;return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}}});let controls=0;
 f.adapter.cancel=async(_b,_id,context)=>{context.assertAuthority();controls++;return {outcome:'applied',evidence:'SIMULATED cancel'};};
 try{for(let seq=1;seq<=20;seq++)f.store.persistOutput({eventId:`flood-${seq}`,sessionId:f.binding.sessionId,eventSeq:seq,bridgeEpoch:'flood',payload:{text:'x'.repeat(512*1024)}});
  await f.runtime.start();await waitFor(()=>posting);queue(f,'cancel',1,'control');await waitFor(()=>controls===1,2000);assert.equal(f.store.countUnackedOutput(),20);
 }finally{await f.close();}
});
for(const mode of ['gap','bytes','http-size'])test(`M23 ${mode} output failure stops new native effects and preserves the durable prefix`,async()=>{
 const f=await fixture({storeLimits:mode==='bytes'?{maxUnackedBytes:100}:{},request:mode==='http-size'?async url=>new URL(url).pathname.endsWith('/events')?Response.json({}, {status:413}):undefined:undefined});
 f.adapter.subscribe=async function*(_binding,_checkpoint,{signal}){yield event(f.binding.sessionId,'new',mode==='gap'?2:1);await new Promise(r=>signal.addEventListener('abort',r,{once:true}));};
 try{await f.runtime.start();await waitFor(()=>f.runtime.state==='reconciliation_required');queue(f,'after-failure');await delay(50);assert.equal(f.submits,0);assert.equal(f.store.getLastOutputSeq(f.binding.sessionId,'epoch-1'),mode==='http-size'?1:0);}
 finally{await f.close();}
});
test('M23 loopback IPv6 is accepted and origin paths fail closed',async()=>{
 const f=await fixture({options:{serverUrl:'http://[::1]:8765'}});try{await f.runtime.start();assert.equal(f.runtime.state,'online');}finally{await f.close();}
 assert.throws(()=>new BridgeRuntime({...f.runtime.options,serverUrl:'https://server.invalid/ignored-path'}),/path/);
});
