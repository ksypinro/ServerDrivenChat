import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {apiFixture} from './helpers/api-fixture.mjs';
const databaseUrl=process.env.M21_TEST_DATABASE_URL;
const binding=()=>({appId:'test.native',appInstanceId:'installation/host/window',workspaceId:'workspace',conversationId:'native-task',nativeConversationId:'native-task',bindingId:randomUUID(),sessionId:randomUUID(),bindingRevision:1,leaseGeneration:1,capabilitiesRevision:'api1.2'});
test('M21 authenticated device binding registration, idempotency, conflict, ownership and disconnect', {skip:!databaseUrl&&'requires disposable PostgreSQL 17'}, async()=>{
 const f=await apiFixture(databaseUrl);try{
  const b=binding(),path=`/v2/devices/${f.issued.deviceId}/bindings`;
  assert.equal((await f.request(path,{binding:b,conversationRevision:1},'owner')).status,401);
  assert.equal((await f.request('/v2/devices/foreign/bindings',{binding:b,conversationRevision:1})).status,403);
  let response=await f.request(path,{binding:b,conversationRevision:1});assert.equal(response.status,201,await response.clone().text());assert.deepEqual((await response.json()).binding,b);
  assert.equal((await f.request(path,{binding:b,conversationRevision:2})).status,201);
  assert.notEqual((await f.request(path,{binding:{...b,bindingId:randomUUID()},conversationRevision:1})).status,201);
  const principal=await f.auth.authenticateDevice(f.issued.credential);await assert.rejects(f.auth.registerBinding({...principal},f.issued.credential,b,1),/provider|authenticated|verified/);
  const other=await f.signIn('other');const foreign=binding();await f.db.putSession({sessionId:foreign.sessionId,ownerUserId:other.userId});assert.notEqual((await f.request(path,{binding:foreign,conversationRevision:1})).status,201);
  const renew=()=>f.request(`/v2/devices/${f.issued.deviceId}/lease/renew`,{sessionId:b.sessionId,bindingRevision:1,leaseGeneration:1});assert.equal((await renew()).status,200);
  assert.equal((await f.request(`${path}/${b.bindingId}/detach`,{})).status,200);assert.notEqual((await renew()).status,200);assert.equal((await f.request(`${path}/${b.bindingId}/detach`,{})).status,200);
  const revoked=binding();await f.auth.revokeDevice(f.owner,f.issued.deviceId);assert.equal((await f.request(path,{binding:revoked,conversationRevision:1})).status,401);
 }finally{await f.close();}
});

test('M21 extension listener delivers two server prompts after originating turn ends, repeated Connect is idempotent and disconnect fences delivery',{skip:!databaseUrl&&'requires disposable PostgreSQL 17'},async()=>{
 const {ConnectManager}=await import('../extensions/vscode/dist/connect.mjs');const {nativeFixture}=await import('./helpers/m21-native.mjs');const {waitFor}=await import('./helpers/api-fixture.mjs');const {mkdtemp,rm}=await import('node:fs/promises');const {join}=await import('node:path');const {tmpdir}=await import('node:os');
 const f=await apiFixture(databaseUrl),native=nativeFixture(),directory=await mkdtemp(join(tmpdir(),'m21-connect-'));let confirmations=0,pairings=0;const states=[];
 const profile={id:'default',name:'test',origin:f.base,categories:['prompts']};
 const manager=new ConnectManager(native.api,{profile:async id=>id==='default'?structuredClone(profile):undefined,confirm:async()=>{confirmations++;return true;},pair:async()=>{pairings++;return {...f.issued};},storePath:async()=>join(directory,'bridge.sqlite'),changed:state=>states.push(state)});
 native.api.connect.register(request=>manager.handle(request),()=>['default']);
 try{
  const [,disconnectTool]=await native.start();const tools=await native.start();const sdk={sessionId:'native-task',toolCallId:'connect-call'};
  const result=await tools[0].execute({serverProfileId:'default'},sdk);assert.equal(result.status,'connected');const b=manager.current.binding;
  assert.equal((await tools[0].execute({serverProfileId:'default'},{...sdk,toolCallId:'second-call'})).status,'already_connected');assert.equal(confirmations,1);assert.equal(pairings,1);
  assert.equal((await tools[0].execute({serverProfileId:'https://evil.test'},sdk)).status,'rejected');assert.equal(manager.current.binding.bindingId,b.bindingId);
  const push=async(id,revision)=>{const command={protocolVersion:'2.0',type:'turn.submit',commandId:id,lane:'prompt',seq:1,sessionId:b.sessionId,bindingRevision:1,leaseGeneration:1,turnId:'turn-'+id,promptId:'prompt-'+id,createdAt:new Date().toISOString(),payload:{content:[{type:'text',text:id}],delivery:'queue',expectedConversationRevision:revision}};const response=await f.request(`/v2/sessions/${b.sessionId}/turns`,{command},'owner');assert.equal(response.status,202,await response.clone().text());};
  await push('first-after-connect',1);await new Promise(r=>setTimeout(r,100));assert.equal(native.sent.length,0,'initiating native turn still running');native.complete('CONNECTED');await waitFor(()=>native.sent.length===1);assert.equal(native.sent[0].id,'native-task');native.complete('FIRST-OK');
  await push('followup-after-connect',2);await waitFor(()=>native.sent.length===2);native.complete('CONTINUITY-OK');await waitFor(async()=>{const rows=await f.db.pool.query("SELECT count(*) FROM events WHERE session_id=$1 AND payload->>'type'='turn.completed'",[b.sessionId]);return Number(rows.rows[0].count)>=3;});
  assert.equal((await disconnectTool.execute({scope:'current-binding'},{sessionId:'native-task',toolCallId:'disconnect-call'})).status,'disconnected');assert.equal(manager.current,undefined);assert.equal(manager.state,'disconnected');assert.ok(states.includes('online'));assert.ok(states.includes('disconnected'));
  assert.equal((await f.request(`/v2/sessions/${b.sessionId}/turns`,{command:{}},'owner')).status>=400,true);
 }finally{await manager.disconnect();native.api.dispose();await f.close();await rm(directory,{recursive:true,force:true});}
});
