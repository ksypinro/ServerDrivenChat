import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {apiFixture,waitFor,command} from './helpers/api-fixture.mjs';
import {nativeFixture} from './helpers/m21-native.mjs';
import {ConnectManager} from '../extensions/vscode/dist/connect.mjs';
import {validateCapabilities,validateProtocolMessage} from '../protocol/dist/index.js';
const databaseUrl=process.env.M22_TEST_DATABASE_URL;
const skip=!databaseUrl&&'requires disposable PostgreSQL 17';

test('M22 capability validation rejects mismatched and unknown device metadata',()=>{
 assert.equal(validateCapabilities({}).valid,false);
 const valid={protocolVersion:'2.0',adapterId:'test',adapterVersion:'1',appId:'test',appVersion:'1',platform:'local',operations:{submit:{status:'supported',reason:'native'}},observedAt:new Date().toISOString()};
 assert.equal(validateCapabilities(valid).valid,true);
 assert.equal(validateCapabilities({...valid,operations:{executeAnything:{status:'supported',reason:'unsafe'}}}).valid,false);
 assert.equal(validateCapabilities({...valid,effectPolicies:{nativeToolsDenied:{status:'supported',reason:'native callback denial',evidenceRef:'evidence/M30/native-tool-run/native-tool-denial.json'}}}).valid,true);
 assert.equal(validateCapabilities({...valid,effectPolicies:{nativeToolsDenied:{status:'supported',reason:'native callback denial',unsafe:true}}}).valid,false);
});

test('M22 Connect reports delegated native capabilities, advances revisions atomically, reconnects, and fences local takeover',{skip},async()=>{
 const f=await apiFixture(databaseUrl),n=nativeFixture(),directory=await mkdtemp(join(tmpdir(),'m22-workflow-'));
 const states=[];const profile={id:'default',name:'disposable',origin:f.base,categories:['prompts']};
 const manager=new ConnectManager(n.api,{profile:async()=>profile,confirm:async()=>true,pair:async()=>f.issued,storePath:async()=>join(directory,'bridge.sqlite'),changed:state=>states.push(state)});
 n.api.connect.register(request=>manager.handle(request),()=>['default']);
 try{
  const tools=await n.start();assert.equal((await tools[0].execute({serverProfileId:'default'},{sessionId:'native-task',toolCallId:'connect'})).status,'connected');
  const b=manager.current.binding;
  const snapshot=async()=>{const r=await f.request(`/v2/sessions/${b.sessionId}/snapshot`,undefined,'owner');assert.equal(r.status,200);return r.json();};
  let stored=(await snapshot()).bindings[0].payload;
  assert.equal(stored.binding.nativeConversationId,'native-task');assert.equal(stored.capabilities.submit.status,'supported');
  assert.equal(stored.capabilities.cancel.status,'unsupported');assert.match(stored.capabilities.respondInput.reason,/not delegated/);
  const report=structuredClone(stored.capabilityReport);report.appId='foreign';
  assert.equal((await f.request(`/v2/devices/${f.issued.deviceId}/bindings`,{binding:{...b,bindingId:randomUUID(),sessionId:randomUUID()},conversationRevision:1,capabilities:report})).status,400);
  n.complete('Connected');
  for(let index=0;index<2;index++){
   const rev=(await snapshot()).bindings[0].payload.conversationRevision;
   const c=command(b.sessionId,`prompt-${index}`);c.payload.expectedConversationRevision=rev;
   assert.equal((await f.request(`/v2/sessions/${b.sessionId}/turns`,{command:c},'owner')).status,202);
   await waitFor(()=>n.sent.length===index+1);n.complete(index?'Continuity':'First');
   await waitFor(async()=>{const s=await snapshot();return s.events.some(e=>e.payload.type==='turn.completed'&&e.payload.payload.turnId===c.turnId)&&s.bindings[0].payload.conversationRevision===rev+1;});
   const s=await snapshot(),start=s.events.find(e=>e.payload.type==='turn.started'&&e.payload.payload.turnId===c.turnId).payload;
   assert.equal(validateProtocolMessage(start).valid,true);assert.match(start.payload.nativeTurnId,/^native-task:/);
   await f.db.recordEvent({eventId:start.eventId,sessionId:b.sessionId,bridgeEpoch:start.bridgeEpoch,producerSeq:start.producerSeq,payload:start});
   assert.equal((await snapshot()).bindings[0].payload.conversationRevision,rev+1,'event replay cannot advance revision twice');
  }
  f.server.closeAllConnections();await waitFor(()=>states.includes('reconnecting'));await waitFor(()=>manager.state==='online');
  const c=command(b.sessionId,'after-reconnect');c.payload.expectedConversationRevision=(await snapshot()).bindings[0].payload.conversationRevision;
  assert.equal((await f.request(`/v2/sessions/${b.sessionId}/turns`,{command:c},'owner')).status,202);await waitFor(()=>n.sent.length===3);n.complete('After reconnect');
  // Simulate a genuine app-owned local user echo; no server command receipt owns it.
  n.controller.task.messageStateHandler.add({ts:900,type:'say',say:'user_feedback',text:'Local takeover'});
  await waitFor(()=>manager.current===undefined);await waitFor(async()=>{const r=await f.db.pool.query('SELECT state FROM bindings WHERE binding_id=$1',[b.bindingId]);return r.rows[0].state==='detached';});
  assert.equal((await f.request(`/v2/sessions/${b.sessionId}/turns`,{command:command(b.sessionId,'after-takeover')},'owner')).status,409);
  assert.equal(n.sent.length,3);assert.equal(manager.state,'disconnected');
 }finally{await manager.disconnect();n.api.dispose();await f.close();await rm(directory,{recursive:true,force:true});}
});
