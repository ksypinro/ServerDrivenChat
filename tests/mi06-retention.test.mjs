import assert from 'node:assert/strict';
import test from 'node:test';
import { apiFixture, command, event } from './helpers/api-fixture.mjs';
const url=process.env.MI06_TEST_DATABASE_URL;
test('MI-06 compacts only a terminal prefix and preserves command identity', {skip:!url && 'requires disposable PostgreSQL'}, async()=>{
 const f=await apiFixture(url);try{
  await f.bind('mi06');
  const inputs=['first','second'].map(id=>command('mi06',id));
  for(const c of inputs) await f.db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'prompt',payload:c});
  await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:1,state:'rejected',payload:{sessionId:'mi06'}});
  await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:2,state:'received',payload:{sessionId:'mi06'}});
  const compact=()=>f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:100});
  assert.deepEqual(await compact(),{floor:1,compacted:1,blocked:'ack_not_final'});
  await assert.rejects(f.db.readCommands(f.issued.deviceId,'prompt',0),/cursor has expired/);
  assert.deepEqual((await f.db.readCommands(f.issued.deviceId,'prompt',1)).map(c=>c.commandId),['second']);
  const retry=await f.db.recordCommand({commandId:'first',sessionId:'mi06',deviceId:f.issued.deviceId,lane:'prompt',payload:inputs[0]});
  assert.equal(retry.disposition,'identical');assert.equal(retry.laneSeq,1);
  await assert.rejects(f.db.recordCommand({commandId:'first',sessionId:'mi06',deviceId:f.issued.deviceId,lane:'prompt',payload:{...inputs[0],turnId:'changed'}}),/conflicting content/);
  await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:2,state:'applied',payload:{sessionId:'mi06'}});
  assert.equal((await compact()).blocked,'turn_not_terminal');
  const terminal=event('mi06','terminal');terminal.payload.turnId=inputs[1].turnId;
  await f.db.recordEvent({eventId:terminal.eventId,sessionId:'mi06',bridgeEpoch:terminal.bridgeEpoch,producerSeq:terminal.producerSeq,payload:terminal});
  assert.deepEqual(await compact(),{floor:2,compacted:1});
  const response=await f.request(`/v2/devices/${f.issued.deviceId}/commands?lane=prompt&after=0`);assert.equal(response.status,410);assert.equal((await response.json()).error.code,'CURSOR_EXPIRED');
  const checkpoint=await f.request(`/v2/devices/${f.issued.deviceId}/commands/checkpoint?lane=prompt&sessionId=mi06&bindingRevision=1&leaseGeneration=1`);
  assert.equal(checkpoint.status,200);const data=await checkpoint.json();assert.equal(data.archivedThrough,2);assert.equal(data.head,2);assert.equal(data.bindingId,'b-mi06');
 }finally{await f.close();}
});
test('MI-06 worker is allowlisted, skips busy lanes and serializes sweeps', {skip:!url && 'requires disposable PostgreSQL'}, async()=>{
 const { RetentionWorker }=await import('../server/dist/index.js');const f=await apiFixture(url);let held;let worker;
 try{
  await f.bind('worker');const c=command('worker','worker-one');await f.db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'prompt',payload:c});await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:1,state:'rejected',payload:{sessionId:'worker'}});
  const off=new RetentionWorker({database:f.db,deviceIds:[],minAgeSeconds:0,keepLast:0});await off.tick();await off.stop();assert.equal((await f.db.readCommandBatch(f.issued.deviceId,'prompt',0)).floor,0);
  const summaries=[];worker=new RetentionWorker({database:f.db,deviceIds:[f.issued.deviceId],minAgeSeconds:0,keepLast:0,lanesPerTick:1,onSweep:s=>summaries.push(s)});
  held=await f.db.pool.connect();await held.query('BEGIN');await held.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`lane:${f.issued.deviceId}:prompt`]);await worker.tick();assert.equal(summaries.at(-1).busy,1);
  await held.query('ROLLBACK');held.release();held=undefined;await Promise.all([worker.tick(),worker.tick()]);assert.equal(summaries.length,2);assert.equal(summaries.at(-1).compacted,1);assert.equal((await f.db.readCommandBatch(f.issued.deviceId,'prompt',1)).floor,1);
 }finally{if(held){await held.query('ROLLBACK');held.release();}await worker?.stop();await f.close();}
});
test('MI-06 honors terminal age and the recent-tail boundary', {skip:!url && 'requires disposable PostgreSQL'}, async()=>{
 const f=await apiFixture(url);try{await f.bind('limits');for(const id of ['l1','l2','l3']){const c=command('limits',id);const r=await f.db.recordCommand({commandId:id,sessionId:'limits',deviceId:f.issued.deviceId,lane:'prompt',payload:c});await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:r.laneSeq,state:'rejected',payload:{sessionId:'limits'}});}
  const p={deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:86400,keepLast:1,batchSize:1};assert.equal((await f.db.compactCommandLane(p)).blocked,'too_recent');
  await f.db.pool.query("UPDATE command_acknowledgements SET updated_at=clock_timestamp()-interval '2 days' WHERE device_id=$1",[f.issued.deviceId]);
  assert.deepEqual(await f.db.compactCommandLane(p),{floor:1,compacted:1});assert.deepEqual(await f.db.compactCommandLane(p),{floor:2,compacted:1});assert.deepEqual(await f.db.compactCommandLane(p),{floor:2,compacted:0});assert.equal((await f.db.readCommandBatch(f.issued.deviceId,'prompt',2)).records.length,1);
 }finally{await f.close();}
});
test('MI-06 HTTP cursor boundaries and checkpoint authority are enforced', {skip:!url && 'requires disposable PostgreSQL'}, async()=>{
 const f=await apiFixture(url);try{await f.bind('http');for(const id of ['h1','h2']){const c=command('http',id);const r=await f.db.recordCommand({commandId:id,sessionId:'http',deviceId:f.issued.deviceId,lane:'prompt',payload:c});if(id==='h1')await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:r.laneSeq,state:'rejected',payload:{sessionId:'http'}});}
  assert.equal((await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:100})).floor,1);
  const base=`/v2/devices/${f.issued.deviceId}/commands`,cp=`${base}/checkpoint?lane=prompt&sessionId=http&bindingRevision=1&leaseGeneration=1`;
  assert.equal((await f.request(`${base}?lane=prompt&after=0`)).status,410);
  assert.equal((await f.request(`${base}?lane=prompt&after=3`)).status,409);
  assert.equal((await f.request(cp,undefined,'invalid-token')).status,401);
  assert.equal((await f.request(cp.replace('bindingRevision=1','bindingRevision=2'))).status,409);
  const controller=new AbortController();const valid=await fetch(f.base+`${base}?lane=prompt&after=1`,{headers:{authorization:`Bearer ${f.issued.credential}`},signal:controller.signal});assert.equal(valid.status,200);assert.match(valid.headers.get('content-type'),/text\/event-stream/);controller.abort();
  const expired=await fetch(f.base+`${base}?lane=prompt&after=1`,{headers:{authorization:`Bearer ${f.issued.credential}`,'last-event-id':'0'}});assert.equal(expired.status,410);
 }finally{await f.close();}
});
test('MI-06 compaction bounds row-lock waits held by a dispatch permit', {skip:!url && 'requires disposable PostgreSQL'}, async()=>{
 const f=await apiFixture(url);let client;try{await f.bind('locked');const c=command('locked','locked-command');await f.db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'prompt',payload:c});await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:1,state:'rejected',payload:{sessionId:'locked'}});
  client=await f.db.pool.connect();await client.query('BEGIN');await client.query('SELECT 1 FROM commands WHERE command_id=$1 FOR SHARE',[c.commandId]);const start=performance.now();const result=await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:100});assert.equal(result.busy,true);assert.ok(performance.now()-start<1500);await client.query('ROLLBACK');client.release();client=undefined;assert.equal((await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:100})).compacted,1);
 }finally{if(client){await client.query('ROLLBACK');client.release();}await f.close();}
});
for(const state of ['missing','received','unknown','reconciliation_required']) test(`MI-06 ${state} acknowledgement blocks the contiguous prefix`,{skip:!url && 'requires disposable PostgreSQL'},async()=>{
 const f=await apiFixture(url);try{await f.bind('blocked');for(const id of ['p1','p2']){const c=command('blocked',id);await f.db.recordCommand({commandId:id,sessionId:'blocked',deviceId:f.issued.deviceId,lane:'prompt',payload:c});}
  if(state!=='missing')await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:1,state,payload:{sessionId:'blocked'}});
  await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:2,state:'rejected',payload:{sessionId:'blocked'}});
  assert.deepEqual(await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:10}),{floor:0,compacted:0,blocked:'ack_not_final'});
  assert.deepEqual((await f.db.readCommands(f.issued.deviceId,'prompt',0)).map(c=>c.commandId),['p1','p2']);
 }finally{await f.close();}
});
test('MI-06 public operation identity, result and command receipt survive compaction',{skip:!url && 'requires disposable PostgreSQL'},async()=>{
 const {PublicApiService}=await import('../server/dist/index.js');const f=await apiFixture(url);try{
  await f.bind('public');await f.db.pool.query("UPDATE bindings SET payload=$2::jsonb WHERE session_id=$1",['public',JSON.stringify({conversationRevision:0,capabilities:{submit:{status:'supported',reason:'fixture'}}})]);
  const service=new PublicApiService(f.db,f.auth),request={model:'sdc.b-public',content:[{type:'text',text:'fixture'}],delivery:'queue'};
  const op=await service.submit(f.owner,'public','stable-key',request);
  const cmd=await f.db.pool.query('SELECT lane_seq FROM commands WHERE command_id=$1',[op.commandId]);
  await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:Number(cmd.rows[0].lane_seq),state:'applied',payload:{sessionId:'public'}});
  const e=event('public','public-terminal');e.payload.turnId=op.turnId;await f.db.recordEvent({eventId:e.eventId,sessionId:'public',bridgeEpoch:e.bridgeEpoch,producerSeq:e.producerSeq,payload:e});
  const before=await service.operation(f.owner,op.operationId);const receiptBefore=await f.request(`/v2/public/sessions/public/commands/${op.commandId}`,undefined,'owner');assert.equal(receiptBefore.status,200);const receipt=await receiptBefore.json();
  assert.equal((await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:10,now:new Date(Date.now()+1000)})).compacted,1);
  assert.deepEqual(await service.operation(f.owner,op.operationId),before);assert.equal((await service.submit(f.owner,'public','stable-key',request)).operationId,op.operationId);
  const after=await f.request(`/v2/public/sessions/public/commands/${op.commandId}`,undefined,'owner');assert.equal(after.status,200);assert.deepEqual(await after.json(),receipt);
 }finally{await f.close();}
});
test('MI-06 compaction frees hot capacity but a pending hole still refuses admission',{skip:!url && 'requires disposable PostgreSQL'},async()=>{
 const f=await apiFixture(url,{}, {limits:{maxLaneCommands:2}});try{await f.bind('capacity');
  for(const id of ['cap1','cap2']){const c=command('capacity',id);await f.db.recordCommand({commandId:id,sessionId:'capacity',deviceId:f.issued.deviceId,lane:'prompt',payload:c});}
  const third=command('capacity','cap3');const insert=()=>f.db.recordCommand({commandId:third.commandId,sessionId:'capacity',deviceId:f.issued.deviceId,lane:'prompt',payload:third});
  await assert.rejects(insert(),/capacity is full/);
  assert.equal((await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:10})).compacted,0);
  await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:1,state:'rejected',payload:{sessionId:'capacity'}});
  assert.equal((await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:10})).compacted,1);
  assert.equal((await insert()).laneSeq,3);
 }finally{await f.close();}
});
test('MI-06 open SSE closes when compaction overtakes its last sent cursor',{skip:!url && 'requires disposable PostgreSQL',timeout:12000},async()=>{
 const f=await apiFixture(url,{pollMs:1500,heartbeatMs:100});let controller;
 try{await f.bind('stream');controller=new AbortController();const path=`/v2/devices/${f.issued.deviceId}/commands?lane=prompt&after=0`;
  const response=await fetch(f.base+path,{headers:{authorization:`Bearer ${f.issued.credential}`},signal:controller.signal});assert.equal(response.status,200);
  const reader=response.body.getReader();const first=await reader.read();assert.equal(first.done,false);
  const c=command('stream','overtake');await f.db.recordCommand({commandId:c.commandId,sessionId:'stream',deviceId:f.issued.deviceId,lane:'prompt',payload:c});await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:1,state:'rejected',payload:{sessionId:'stream'}});
  assert.equal((await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:10,now:new Date(Date.now()+1000)})).floor,1);
  let text='';while(true){const part=await reader.read();if(part.done)break;text+=Buffer.from(part.value).toString();}assert.ok(!text.includes('overtake'));assert.equal((await f.request(path)).status,410);
 }finally{controller?.abort();await f.close();}
});
