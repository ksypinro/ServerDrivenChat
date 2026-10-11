import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {BridgeRuntime,BridgeStore,reconnectDelay} from '../bridge/dist/index.js';
import {FakeAppAdapter} from '../adapters/fake/dist/index.js';
import {command,delay,waitFor} from './helpers/api-fixture.mjs';

async function fixture(overrides={}) {
 const dir=mkdtempSync(join(tmpdir(),'runtime-repair-'));const store=new BridgeStore({path:join(dir,'db.sqlite')});
 const adapter=new FakeAppAdapter({now:()=>new Date().toISOString()});
 const binding=(await adapter.attach({appId:'fake.app',appInstanceId:'fake-instance',conversationId:'fake-conversation'})).value;
 let elapsed=1000;let submits=0;let renewals=0;let gate;let permission=false;
 const originalSubmit=adapter.submit.bind(adapter);adapter.submit=async(...args)=>{args[2]?.assertAuthority();submits++;return originalSubmit(...args);};
 const streaming=(text,signal)=>new Response(new ReadableStream({start(c){if(text)c.enqueue(new TextEncoder().encode(text));signal?.addEventListener('abort',()=>{try{c.close();}catch{}},{once:true});},cancel(){}}),{headers:{'content-type':'text/event-stream'}});
 const fetcher=async(url,init={})=>{
  const path=new URL(url).pathname;
  if(path.endsWith('/lease/renew')){renewals++;if(overrides.renew)return overrides.renew(()=>elapsed,v=>elapsed=v,renewals,init.signal);return Response.json({status:'renewed',bindingRevision:1,leaseGeneration:1,serverTime:'2026-01-01T00:00:00Z',leaseExpiresAt:'2026-01-01T00:01:00Z'});}
  if(path.endsWith('/commands'))return streaming('',init.signal);
  if(path.endsWith('/dispatch')) {
   if(permission)return Response.json({}, {status:409});
   return streaming(`event: dispatch.permit\ndata: ${JSON.stringify({sessionId:binding.sessionId,bindingRevision:1,leaseGeneration:1,serverTime:'2026-01-01T00:00:00Z',leaseExpiresAt:'2026-01-01T00:01:00Z'})}\n\n`,init.signal);
  }
  return Response.json({durable:true},{status:202});
 };
 const runtime=new BridgeRuntime({serverUrl:'https://server.invalid',deviceId:'device',credential:'disposable',store,adapter,binding,fetch:fetcher,now:()=>elapsed,leaseRenewIntervalMs:100,reconnectBaseMs:5,reconnectCapMs:10,...overrides.options});
 const queue=()=>{const payload=command(binding.sessionId,'race');store.acceptCommand({commandId:'race',sessionId:binding.sessionId,deviceId:'device',lane:'prompt',laneSeq:1,payload});};
 const holdInspect=()=>{const inspect=adapter.inspect.bind(adapter);let called=false;const held=new Promise(r=>gate=r);adapter.inspect=async(...args)=>{called=true;await held;return inspect(...args);};return ()=>called;};
 return {store,adapter,binding,runtime,queue,holdInspect,get gate(){return gate;},get submits(){return submits;},get renewals(){return renewals;},set elapsed(v){elapsed=v;},set fenced(v){permission=v;},close:async()=>{await runtime.stop();store.close();rmSync(dir,{recursive:true,force:true});}};
}

test('reconnect jitter respects the cap at both random extremes',()=>{
 for(const random of [()=>0,()=>1])for(const failures of [1,2,20,1000])assert.ok(reconnectDelay(500,30000,failures,random)<=30000);
});

for(const mode of ['disable','stop','expiry','takeover'])test(`paused native inspection cannot dispatch after ${mode}`,async()=>{
 const f=await fixture();try{
  await f.runtime.start();const called=f.holdInspect();f.queue();await waitFor(called);
  if(mode==='disable')f.runtime.disable();
  if(mode==='stop')await f.runtime.stop();
  if(mode==='expiry')f.elapsed=f.runtime.leaseExpiresAt+1;
  if(mode==='takeover')f.fenced=true;
  f.gate();await delay(100);assert.equal(f.submits,0);
  if(mode==='disable')assert.equal(f.runtime.state,'disabled');
  if(mode==='takeover')assert.equal(f.runtime.state,'lease_lost');
 }finally{f.gate?.();await f.close();}
});

for(const mode of ['disable','stop'])test(`startup is serialized and cannot override ${mode}`,async()=>{
 const f=await fixture();try{f.holdInspect();const starting=f.runtime.start();await assert.rejects(f.runtime.start(),/already started/);
  if(mode==='disable')f.runtime.disable();else await f.runtime.stop();
  await starting;f.gate();await delay(20);assert.equal(f.renewals,0);assert.equal(f.runtime.state,mode==='disable'?'disabled':'stopped');
 }finally{f.gate?.();await f.close();}
});

test('a lease exhausted in transit is rejected before subscriptions and dispatch',async()=>{
 const f=await fixture({renew:async(get,set)=>{set(get()+60001);return Response.json({status:'renewed',bindingRevision:1,leaseGeneration:1,serverTime:'2026-01-01T00:00:00Z',leaseExpiresAt:'2026-01-01T00:01:00Z'});}});
 try{f.queue();await f.runtime.start();assert.equal(f.runtime.state,'lease_lost');assert.equal(f.submits,0);assert.equal(f.runtime.leaseExpiresAt,0);}finally{await f.close();}
});

test('independent watchdog expires authority while renewal fetch is hung',async()=>{
 const f=await fixture({renew:async(get,set,count)=>count===1?Response.json({status:'renewed',bindingRevision:1,leaseGeneration:1,serverTime:'2026-01-01T00:00:00Z',leaseExpiresAt:'2026-01-01T00:01:00Z'}):new Promise(()=>{})});
 try{await f.runtime.start();await waitFor(()=>f.renewals===2);f.elapsed=f.runtime.leaseExpiresAt+1;await waitFor(()=>f.runtime.state==='lease_lost');f.queue();await delay(30);assert.equal(f.submits,0);}finally{await f.close();}
});

test('native mutation guard prevents a deferred adapter action after local disable',async()=>{
 const f=await fixture();let enter;const entered=new Promise(r=>enter=r);let resume;const resumed=new Promise(r=>resume=r);let actions=0;
 f.adapter.submit=async(_binding,_command,context)=>{enter();await resumed;context.assertAuthority();actions++;return {outcome:'applied',evidence:'SIMULATED'};};
 try{await f.runtime.start();f.queue();await entered;f.runtime.disable();resume();await delay(30);assert.equal(actions,0);assert.equal(f.store.getDispatchState('race'),'reconciliation_required');}finally{resume?.();await f.close();}
});

test('default lease authority uses monotonic time through a wall-clock rollback',async()=>{
 const f=await fixture({options:{now:undefined,leaseRenewIntervalMs:20000}});const now=Date.now;
 try {await f.runtime.start();const deadline=f.runtime.leaseExpiresAt;assert.ok(deadline<1e12);Date.now=()=>now()-86400000;f.queue();await delay(150);assert.equal(f.submits,1);assert.equal(f.runtime.leaseExpiresAt,deadline);}finally{Date.now=now;await f.close();}
});

test('a late command-stream response cannot override local disable',async()=>{
 let deliver;const held=new Promise(r=>deliver=r);let waiting=false;const f=await fixture({options:{fetch:async(url,init)=>{
  if(new URL(url).pathname.endsWith('/lease/renew'))return Response.json({status:'renewed',bindingRevision:1,leaseGeneration:1,serverTime:'2026-01-01T00:00:00Z',leaseExpiresAt:'2026-01-01T00:01:00Z'});
  waiting=true;await held;return new Response(new ReadableStream({start(c){c.close();}}),{headers:{'content-type':'text/event-stream'}});
 }}});
 try {await f.runtime.start();await waitFor(()=>waiting);f.runtime.disable();deliver();await delay(30);assert.equal(f.runtime.state,'disabled');assert.equal(f.submits,0);}finally{deliver?.();await f.close();}
});
