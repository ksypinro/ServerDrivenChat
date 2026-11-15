import assert from 'node:assert/strict';
import test from 'node:test';
import {apiFixture,command} from './helpers/api-fixture.mjs';
const url=process.env.MI06_TEST_DATABASE_URL;
test('MI-06 failed compaction rolls back the entire payload and floor transaction',{skip:!url && 'requires disposable PostgreSQL'},async()=>{
 const f=await apiFixture(url);try{await f.bind('atomic');for(const id of ['atomic1','atomic2']){const c=command('atomic',id);const row=await f.db.recordCommand({commandId:id,sessionId:'atomic',deviceId:f.issued.deviceId,lane:'prompt',payload:c});await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:row.laneSeq,state:'rejected',payload:{sessionId:'atomic'}});}
  await f.db.pool.query(`CREATE FUNCTION fail_second_archive() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command_id='atomic2' AND NEW.archived_at IS NOT NULL THEN RAISE EXCEPTION 'injected archive failure'; END IF; RETURN NEW; END $$`);
  await f.db.pool.query('CREATE TRIGGER fail_second_archive BEFORE UPDATE ON commands FOR EACH ROW EXECUTE FUNCTION fail_second_archive()');
  await assert.rejects(f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:10}),/injected archive failure/);
  const rows=await f.db.pool.query('SELECT payload,archived_at FROM commands ORDER BY lane_seq');assert.equal(rows.rowCount,2);assert.ok(rows.rows.every(r=>r.payload && !r.archived_at));assert.equal((await f.db.readCommandBatch(f.issued.deviceId,'prompt',0)).floor,0);
  await f.db.close();const {ServerDatabase}=await import('../server/dist/index.js');const reopened=new ServerDatabase({poolConfig:{connectionString:url,options:`-c search_path=${f.schema}`}});try{assert.equal((await reopened.readCommandBatch(f.issued.deviceId,'prompt',0)).floor,0);assert.equal((await reopened.pool.query('SELECT count(*) FROM commands WHERE payload IS NOT NULL AND archived_at IS NULL')).rows[0].count,'2');}finally{await reopened.close();}
 }finally{await f.close();}
});
test('MI-06 lost HTTP approval ACK response retries after compaction with one grant transition',{skip:!url && 'requires disposable PostgreSQL'},async()=>{
 const f=await apiFixture(url);try{await f.bind('approval');
  await f.db.pool.query("INSERT INTO interactions(interaction_id,session_id,request_id,request_revision,kind,state,payload) VALUES('i','approval','r',1,'approval','decision_recorded',$1::jsonb)",[JSON.stringify({availableDecisions:[{id:'allow',effect:'allow'}]})]);
  await f.db.pool.query("INSERT INTO decisions(decision_id,session_id,request_id,request_revision,payload) VALUES('decision','approval','r',1,$1::jsonb)",[JSON.stringify({choiceId:'allow'})]);
  await f.db.pool.query("INSERT INTO grants(grant_id,session_id,request_id,decision_id,state,payload) VALUES('grant','approval','r','decision','pending','{}')");
  const c=command('approval','approval-cmd','control','approval.decide',{decisionId:'decision',requestId:'r',requestRevision:1,actionDigest:`sha256:${'a'.repeat(64)}`,choiceId:'allow',grantedPermissions:[],expiresAt:new Date(Date.now()+60000).toISOString(),assertion:'synthetic-assertion'});delete c.turnId;
  await f.db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'control',payload:c});
  const ack={deviceId:f.issued.deviceId,lane:'control',laneSeq:1,state:'applied',payload:{sessionId:'approval',details:null}};
  const {createServer}=await import('node:http');let committed;const durable=new Promise((resolve,reject)=>{committed={resolve,reject};});
  const body={sessionId:'approval',lane:'control',laneSeq:1,state:'applied',bindingRevision:1,leaseGeneration:1};
  const proxy=createServer((_req,res)=>{void f.request(`/v2/devices/${f.issued.deviceId}/acks`,body).then(async r=>{assert.equal(r.status,202);assert.equal((await r.json()).disposition,'created');committed.resolve();res.destroy();}).catch(e=>{committed.reject(e);res.destroy();});});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
  try{await assert.rejects(fetch(`http://127.0.0.1:${proxy.address().port}/lost-ack`,{method:'POST'}));await durable;}finally{proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}

  const before=await f.db.pool.query("SELECT state,payload FROM grants WHERE grant_id='grant'");assert.equal(before.rows[0].state,'active');
  assert.equal((await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'control',minAgeSeconds:0,keepLast:0,batchSize:10,now:new Date(Date.now()+1000)})).compacted,1);
  const retried=await f.request(`/v2/devices/${f.issued.deviceId}/acks`,body);assert.equal(retried.status,202);assert.equal((await retried.json()).disposition,'identical');assert.equal((await f.db.recordCommandAck(ack)).disposition,'identical');assert.deepEqual((await f.db.pool.query("SELECT state,payload FROM grants WHERE grant_id='grant'")).rows,before.rows);
  await assert.rejects(f.db.recordCommandAck({...ack,payload:{sessionId:'approval',extra:'changed'}}),/immutable/);
 }finally{await f.close();}
});
test('MI-06 archived command cannot obtain a new dispatch permit',{skip:!url && 'requires disposable PostgreSQL'},async()=>{
 const f=await apiFixture(url);try{await f.bind('permit');const c=command('permit','permit-cmd');await f.db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'prompt',payload:c});await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:1,state:'rejected',payload:{sessionId:'permit'}});assert.equal((await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:10,now:new Date(Date.now()+1000)})).compacted,1);
  const r=await f.request(`/v2/devices/${f.issued.deviceId}/dispatch`,{sessionId:'permit',bindingRevision:1,leaseGeneration:1,commandId:c.commandId});assert.equal(r.status,409);assert.equal((await r.json()).error.code,'COMMAND_ARCHIVED');
 }finally{await f.close();}
});
test('MI-06 worker fairly advances both lanes with one-lane batches',{skip:!url && 'requires disposable PostgreSQL'},async()=>{
 const {RetentionWorker}=await import('../server/dist/index.js');const f=await apiFixture(url);let w;try{await f.bind('fair');for(const lane of ['prompt','control']){const c=command('fair',`fair-${lane}`,lane);await f.db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane,payload:c});await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane,laneSeq:1,state:'rejected',payload:{sessionId:'fair'}});}
  w=new RetentionWorker({database:f.db,deviceIds:[f.issued.deviceId],minAgeSeconds:0,keepLast:0,lanesPerTick:1});await w.tick();await w.tick();for(const lane of ['prompt','control'])assert.equal((await f.db.readCommandBatch(f.issued.deviceId,lane,1)).floor,1);
 }finally{await w?.stop();await f.close();}
});
test('MI-06 worker shutdown waits for its running sweep',async()=>{
 const {RetentionWorker}=await import('../server/dist/index.js');let release,started;const ready=new Promise(r=>{started=r;});const gate=new Promise(r=>{release=r;});
 const database={pool:{query:async()=>({rows:[{device_id:'d',lane:'prompt'}]})},compactCommandLane:async()=>{started();await gate;return {floor:1,compacted:1};}};
 const w=new RetentionWorker({database,deviceIds:['d']});const tick=w.tick();await ready;let stopped=false;const stop=w.stop().then(()=>{stopped=true;});await Promise.resolve();assert.equal(stopped,false);release();await Promise.all([tick,stop]);assert.equal(stopped,true);
});
test('MI-06 append, ACK and compaction interleavings keep one contiguous ledger',{skip:!url && 'requires disposable PostgreSQL',timeout:15000},async()=>{
 const f=await apiFixture(url);try{await f.bind('race');
  const make=i=>{const c=command('race',`race-${i}`);return {commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'prompt',payload:c};};
  for(let i=0;i<12;i++){
   const record=make(i);const [first,duplicate]=await Promise.all([f.db.recordCommand(record),f.db.recordCommand(record)]);assert.equal(first.laneSeq,duplicate.laneSeq);
   await Promise.all([f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:first.laneSeq,state:'rejected',payload:{sessionId:'race'}}),f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:3,now:new Date(Date.now()+1000)})]);
  }
  for(let i=0;i<8;i++)await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:3,now:new Date(Date.now()+1000)});
  const result=await f.db.readCommandBatch(f.issued.deviceId,'prompt',12);assert.equal(result.head,12);assert.equal(result.floor,12);const rows=await f.db.pool.query('SELECT lane_seq FROM commands ORDER BY lane_seq');assert.deepEqual(rows.rows.map(r=>Number(r.lane_seq)),Array.from({length:12},(_,i)=>i+1));
 }finally{await f.close();}
});
test('MI-06 revoked device cannot checkpoint or obtain a permit after compaction',{skip:!url && 'requires disposable PostgreSQL'},async()=>{
 const f=await apiFixture(url);try{await f.bind('revoked');const c=command('revoked','revoke-cmd');await f.db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'prompt',payload:c});await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:1,state:'rejected',payload:{sessionId:'revoked'}});await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:10,now:new Date(Date.now()+1000)});
  await f.auth.revokeDevice(f.owner,f.issued.deviceId);
  const cp=await f.request(`/v2/devices/${f.issued.deviceId}/commands/checkpoint?lane=prompt&sessionId=revoked&bindingRevision=1&leaseGeneration=1`);assert.equal(cp.status,401);
  const permit=await f.request(`/v2/devices/${f.issued.deviceId}/dispatch`,{sessionId:'revoked',bindingRevision:1,leaseGeneration:1,commandId:c.commandId});assert.equal(permit.status,401);
 }finally{await f.close();}
});
test('MI-06 live permit, compaction and revocation serialize without post-archive authority',{skip:!url && 'requires disposable PostgreSQL',timeout:10000},async()=>{
 const f=await apiFixture(url);let controller;try{await f.bind('barrier');const c=command('barrier','barrier-cmd');await f.db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'prompt',payload:c});await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:1,state:'rejected',payload:{sessionId:'barrier'}});
  controller=new AbortController();const permit=await fetch(`${f.base}/v2/devices/${f.issued.deviceId}/dispatch`,{method:'POST',headers:{authorization:`Bearer ${f.issued.credential}`,'content-type':'application/json'},body:JSON.stringify({sessionId:'barrier',bindingRevision:1,leaseGeneration:1,commandId:c.commandId}),signal:controller.signal});assert.equal(permit.status,200);await permit.body.getReader().read();
  const policy={deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:10,now:new Date(Date.now()+1000)};
  const revoke=f.auth.revokeDevice(f.owner,f.issued.deviceId);const busy=await f.db.compactCommandLane(policy);assert.equal(busy.busy,true);
  controller.abort();await revoke;
  let done;for(let i=0;i<50;i++){done=await f.db.compactCommandLane(policy);if(!done.busy)break;await new Promise(r=>setTimeout(r,10));}assert.equal(done.compacted,1);
  const denied=await f.request(`/v2/devices/${f.issued.deviceId}/dispatch`,{sessionId:'barrier',bindingRevision:1,leaseGeneration:1,commandId:c.commandId});assert.equal(denied.status,401);
 }finally{controller?.abort();await f.close();}
});
test('MI-06 seeded append, ACK, archive and replay traces preserve the prefix',{skip:!url && 'requires disposable PostgreSQL',timeout:20000},async()=>{
 const f=await apiFixture(url);try{await f.bind('seeded');let state=0x5eed1234;const rand=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};const rows=[];let expectedFloor=0;
  for(let step=0;step<75;step++){
   const op=rand(3);if(op===0||!rows.length){const id=`seed-${rows.length}`;const c=command('seeded',id);const r=await f.db.recordCommand({commandId:id,sessionId:'seeded',deviceId:f.issued.deviceId,lane:'prompt',payload:c});rows.push({seq:r.laneSeq,c,ack:false});}
   else if(op===1){const row=rows[rand(rows.length)];if(!row.ack){await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:row.seq,state:'rejected',payload:{sessionId:'seeded'}});row.ack=true;}}
   else {const batch=1+rand(4);const result=await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:batch,now:new Date(Date.now()+1000)});let n=0;while(n<batch&&rows[expectedFloor]?.ack){expectedFloor++;n++;}assert.equal(result.floor,expectedFloor);const replay=await f.db.readCommandBatch(f.issued.deviceId,'prompt',expectedFloor);assert.deepEqual(replay.records.map(x=>x.laneSeq),rows.slice(expectedFloor).map(x=>x.seq));if(expectedFloor){const old=rows[rand(expectedFloor)];const retry=await f.db.recordCommand({commandId:old.c.commandId,sessionId:'seeded',deviceId:f.issued.deviceId,lane:'prompt',payload:old.c});assert.equal(retry.laneSeq,old.seq);assert.equal(retry.disposition,'identical');}}
  }
 }finally{await f.close();}
});
test('MI-06 malformed historical terminal evidence blocks prompt compaction',{skip:!url && 'requires disposable PostgreSQL'},async()=>{
 const f=await apiFixture(url);try{await f.bind('bad-event');const c=command('bad-event','bad-event-command');await f.db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'prompt',payload:c});await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:1,state:'applied',payload:{sessionId:'bad-event'}});await f.db.recordEvent({eventId:'malformed',sessionId:'bad-event',bridgeEpoch:'old',producerSeq:1,payload:{type:'turn.completed',payload:{turnId:c.turnId}}});
  const result=await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:10,now:new Date(Date.now()+1000)});assert.equal(result.floor,0);assert.equal(result.compacted,0);
 }finally{await f.close();}
});
test('MI-06 compaction preserves public cancellation foreign keys and receipts',{skip:!url && 'requires disposable PostgreSQL'},async()=>{
 const {ConversationService}=await import('../server/dist/index.js');const f=await apiFixture(url);try{await f.bind('session');await f.db.pool.query('UPDATE bindings SET payload=$1::jsonb',[JSON.stringify({conversationRevision:0,capabilities:{submit:{status:'supported'},cancel:{status:'supported'}}})]);const service=new ConversationService(f.db,f.auth);
  const request={model:'sdc-default',sessionId:'session',history:[{role:'user',content:'fixture'}],instructions:'Be brief',contextMode:'exclusive',tools:[],toolChoice:'auto',parallelTools:false,budget:{inputUnits:32768,outputUnits:8192,deadlineSeconds:600},background:true};const gen=await service.generate(f.owner,'cancel-retention',request);const operation=await f.db.pool.query('SELECT turn_id FROM public_operations WHERE operation_id=$1',[gen.generationId]);const e={protocolVersion:'2.0',type:'turn.started',sessionId:'session',eventId:'cancel-start',bridgeEpoch:'epoch',producerSeq:1,bindingRevision:1,leaseGeneration:1,createdAt:new Date().toISOString(),payload:{turnId:operation.rows[0].turn_id,state:'running',conversationRevision:1}};await f.db.recordEvent({eventId:e.eventId,sessionId:'session',bridgeEpoch:e.bridgeEpoch,producerSeq:1,payload:e});await service.cancel(f.owner,gen.generationId);
  const before=(await f.db.pool.query('SELECT cancellation_command_id FROM public_generations WHERE generation_id=$1',[gen.generationId])).rows[0].cancellation_command_id;assert.ok(before);const row=await f.db.pool.query('SELECT lane_seq FROM commands WHERE command_id=$1',[before]);const ack={deviceId:f.issued.deviceId,lane:'control',laneSeq:Number(row.rows[0].lane_seq),state:'applied',payload:{sessionId:'session'}};await f.db.recordCommandAck(ack);assert.equal((await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'control',minAgeSeconds:0,keepLast:0,batchSize:10,now:new Date(Date.now()+1000)})).compacted,1);
  assert.equal((await f.db.pool.query('SELECT cancellation_command_id FROM public_generations WHERE generation_id=$1',[gen.generationId])).rows[0].cancellation_command_id,before);assert.equal((await f.db.recordCommandAck(ack)).disposition,'identical');await assert.rejects(f.db.pool.query('DELETE FROM commands WHERE command_id=$1',[before]),/foreign key/);
 }finally{await f.close();}
});
test('MI-06 concurrent workers cannot archive a prefix twice',{skip:!url && 'requires disposable PostgreSQL'},async()=>{
 const {RetentionWorker}=await import('../server/dist/index.js');const f=await apiFixture(url);let a,b;try{await f.bind('workers');for(let i=0;i<4;i++){const c=command('workers',`two-workers-${i}`);const r=await f.db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'prompt',payload:c});await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:r.laneSeq,state:'rejected',payload:{sessionId:'workers'}});}
  const summaries=[];const opt={database:f.db,deviceIds:[f.issued.deviceId],minAgeSeconds:0,keepLast:0,batchSize:10,onSweep:x=>summaries.push(x)};a=new RetentionWorker(opt);b=new RetentionWorker(opt);await Promise.all([a.tick(),b.tick()]);assert.equal((await f.db.readCommandBatch(f.issued.deviceId,'prompt',4)).floor,4);assert.equal(summaries.reduce((n,x)=>n+x.compacted,0),4);
 }finally{await a?.stop();await b?.stop();await f.close();}
});
test('MI-06 one-lane sweeps fairly visit both lanes across two devices',{skip:!url&&'requires disposable PostgreSQL'},async()=>{
 const {RetentionWorker}=await import('../server/dist/index.js');const f=await apiFixture(url);let worker;try{
  await f.bind('primary');await f.db.putDevice({deviceId:'second-device',userId:f.owner.userId,status:'active',payload:{}});await f.db.putSession({sessionId:'secondary',ownerUserId:f.owner.userId});await f.db.putBinding({bindingId:'second-binding',sessionId:'secondary',deviceId:'second-device',bindingRevision:1,leaseGeneration:1,state:'active',payload:{}});
  for(const [deviceId,sessionId] of [[f.issued.deviceId,'primary'],['second-device','secondary']])for(const lane of ['prompt','control']){const c=command(sessionId,`${sessionId}-${lane}`,lane);await f.db.recordCommand({commandId:c.commandId,sessionId,deviceId,lane,payload:c});await f.db.recordCommandAck({deviceId,lane,laneSeq:1,state:'rejected',payload:{sessionId}});}
  worker=new RetentionWorker({database:f.db,deviceIds:[f.issued.deviceId,'second-device'],minAgeSeconds:0,keepLast:0,lanesPerTick:1});for(let i=0;i<4;i++)await worker.tick();for(const device of [f.issued.deviceId,'second-device'])for(const lane of ['prompt','control'])assert.equal((await f.db.readCommandBatch(device,lane,1)).floor,1);
 }finally{await worker?.stop();await f.close();}
});
