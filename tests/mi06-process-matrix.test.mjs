import assert from 'node:assert/strict';
import test from 'node:test';
import {join} from 'node:path';
import {BridgeStore} from '../bridge/dist/index.js';
import {processFixture} from './helpers/mi06-process-fixture.mjs';
import {command,waitFor} from './helpers/api-fixture.mjs';
const url=process.env.MI06_TEST_DATABASE_URL,skip=!url&&'requires disposable PostgreSQL';
test('MI-06 real recovery crosses only the safe prefix before a pending hole',{skip,timeout:30000},async()=>{const h=await processFixture(url);try{
 const a=await h.start('alpha'),b=await h.start('beta',{stall:true});await waitFor(()=>b.messages.some(m=>m.type==='stalled'));await h.submit('alpha','prefix');
 for(const id of ['hole','later']){const c=command('ghost',id);const r=await h.f.db.recordCommand({commandId:id,sessionId:'ghost',deviceId:h.f.issued.deviceId,lane:'prompt',payload:c});if(id==='later')await h.f.db.recordCommandAck({deviceId:h.f.issued.deviceId,lane:'prompt',laneSeq:r.laneSeq,state:'rejected',payload:{sessionId:'ghost'}});}
 assert.equal((await h.compact()).floor,1);b.child.send('resume');await waitFor(()=>b.messages.some(m=>m.type==='checkpoint'));await h.submit('beta','after-hole');await h.submit('alpha','peer-after-hole');assert.equal((await h.compact()).floor,1);
 assert.deepEqual(b.messages.filter(m=>m.type==='effect').map(m=>m.commandId),['after-hole']);assert.deepEqual(a.messages.filter(m=>m.type==='effect').map(m=>m.commandId),['prefix','peer-after-hole']);
}finally{await h.close();}});
for(const state of ['queued','applying','reconciliation_required'])test(`MI-06 actual 410 preserves ${state} conflict through restart and keeps peer usable`,{skip,timeout:30000},async()=>{const h=await processFixture(url);try{
 const inputs=[];for(let i=1;i<=3;i++){const session=i===2?'beta':'alpha',c=command(session,'conflict-'+i,'control','session.inspect',{});delete c.turnId;const r=await h.f.db.recordCommand({commandId:c.commandId,sessionId:session,deviceId:h.f.issued.deviceId,lane:'control',payload:c});inputs.push(c);await h.f.db.recordCommandAck({deviceId:h.f.issued.deviceId,lane:'control',laneSeq:r.laneSeq,state:'applied',payload:{sessionId:session}});}
 const path=join(h.dir,'beta.sqlite');let store=new BridgeStore({path,sessionId:'beta'});store.acceptCommand({deviceId:h.f.issued.deviceId,lane:'control',laneSeq:1,sessionId:'alpha',commandId:inputs[0].commandId,payload:inputs[0]});store.acceptCommand({deviceId:h.f.issued.deviceId,lane:'control',laneSeq:2,sessionId:'beta',commandId:inputs[1].commandId,payload:inputs[1]});if(state!=='queued'){store.beginDispatch(inputs[1].commandId,'uncertain-attempt',inputs[1]);if(state==='reconciliation_required')store.finishDispatch(inputs[1].commandId,'reconciliation_required');}store.persistOutput({eventId:'preserved-output',sessionId:'beta',eventSeq:1,bridgeEpoch:'held',payload:{}});const acks=store.listPendingServerAcks(h.f.issued.deviceId);if(state==='applying')acks[0].ackState='reconciliation_required';store.close();assert.equal((await h.compact('control')).floor,3);
 const a=await h.start('alpha');let b=await h.start('beta',{holdWrites:true});for(let restart=0;restart<2;restart++){
 await waitFor(()=>b.messages.some(m=>m.type==='expired')&&b.messages.some(m=>m.type==='checkpoint')&&b.messages.some(m=>m.type==='state'&&m.state==='reconciliation_required'),10000);assert.equal(b.messages.some(m=>m.type==='effect'||m.type==='revoke-effect'),false);store=new BridgeStore({path,sessionId:'beta'});assert.equal(store.getCursor(h.f.issued.deviceId,'control'),2);assert.equal(store.getDispatchState(inputs[1].commandId),'reconciliation_required');assert.equal(store.listUnackedOutput().length,1);assert.deepEqual(store.listPendingServerAcks(h.f.issued.deviceId),acks);if(state!=='queued')assert.equal(store.getAttempt('uncertain-attempt').state,'reconciliation_required');store.close();if(restart===0){await h.stop(b);b=await h.start('beta',{holdWrites:true});}}
 await h.submit('alpha','healthy-peer');assert.deepEqual(a.messages.filter(m=>m.type==='effect').map(m=>m.commandId),['healthy-peer']);
}finally{await h.close();}});
for(const packaged of [false,true])test(`MI-06 seeded real reconnect traces match durable reference model; packaged=${packaged}`,{skip,timeout:45000},async()=>{const h=await processFixture(url);try{
 const a=await h.start('alpha',{packaged});let b=await h.start('beta',{packaged});const expectedA=[],expectedB=[];let seed=0x5115,head=0;
 for(let round=0;round<3;round++){
 await h.stop(b);seed=(Math.imul(seed,1664525)+1013904223)>>>0;const count=1+seed%3;for(let i=0;i<count;i++){const id=`seed-a-${round}-${i}`;await h.submit('alpha',id);expectedA.push(id);head++;}
 assert.equal((await h.compact()).floor,head);b=await h.start('beta',{packaged});await waitFor(()=>b.messages.some(m=>m.type==='expired')&&b.messages.some(m=>m.type==='checkpoint'));const id=`seed-b-${round}`;await h.submit('beta',id);expectedB.push(id);head++;
 await waitFor(()=>{const s=new BridgeStore({path:b.config.storePath,sessionId:'beta'});try{return s.getCursor(h.f.issued.deviceId,'prompt')===head;}finally{s.close();}});const s=new BridgeStore({path:b.config.storePath,sessionId:'beta'});try{assert.deepEqual(s.listQueuedCommands(h.f.issued.deviceId,'prompt',100,'beta'),[]);}finally{s.close();}
 assert.deepEqual(a.messages.filter(m=>m.type==='effect').map(m=>m.commandId),expectedA);assert.deepEqual(h.windows.filter(w=>w.config.sessionId==='beta').flatMap(w=>w.messages.filter(m=>m.type==='effect').map(m=>m.commandId)),expectedB);
 }
}finally{await h.close();}});
