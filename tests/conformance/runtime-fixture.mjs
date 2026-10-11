import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {BridgeRuntime,BridgeStore,reconnectDelay} from '../../bridge/dist/index.js';
import {FakeAppAdapter} from '../../adapters/fake/dist/index.js';
import {command,delay,waitFor} from '../helpers/api-fixture.mjs';

export async function fixture(overrides={}) {
 const dir=mkdtempSync(join(tmpdir(),'runtime-repair-'));const store=new BridgeStore({path:join(dir,'db.sqlite'),limits:overrides.storeLimits});
 const adapter=new FakeAppAdapter({now:()=>new Date().toISOString()});
 const binding=(await adapter.attach({appId:'fake.app',appInstanceId:'fake-instance',conversationId:'fake-conversation'})).value;
 let elapsed=1000;let submits=0;let renewals=0;let gate;let permission=false;
 const originalSubmit=adapter.submit.bind(adapter);adapter.submit=async(...args)=>{args[2]?.assertAuthority();submits++;return originalSubmit(...args);};
 const streaming=(text,signal)=>new Response(new ReadableStream({start(c){if(text)c.enqueue(new TextEncoder().encode(text));signal?.addEventListener('abort',()=>{try{c.close();}catch{}},{once:true});},cancel(){}}),{headers:{'content-type':'text/event-stream'}});
 const fetcher=async(url,init={})=>{
  const path=new URL(url).pathname;
  const overridden=await overrides.request?.(url,init);if(overridden)return overridden;
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
