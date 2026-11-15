import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {apiFixture,command,event} from './helpers/api-fixture.mjs';
const url=process.env.MI06_TEST_DATABASE_URL,skip=!url&&'requires disposable PostgreSQL';
const policy=f=>({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:100,now:new Date(Date.now()+1000)});
const put=(f,c)=>f.db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:c.lane,payload:c});
const ack=(f,seq)=>f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:seq,state:'applied',payload:{sessionId:'s'}});
async function finish(f,c,id='done',revision=1){const e=event('s',id);e.payload.turnId=c.turnId;e.bindingRevision=revision;await f.db.recordEvent({eventId:e.eventId,sessionId:'s',bridgeEpoch:e.bridgeEpoch,producerSeq:1,payload:e});}
test('MI-06 turn ownership rejects reuse before and after archival while identical retries survive',{skip},async()=>{const f=await apiFixture(url);try{
 await f.bind('s');const a=command('s','a'),b={...command('s','b'),turnId:a.turnId};await put(f,a);await ack(f,1);await finish(f,a);
 assert.equal((await f.request('/v2/sessions/s/turns',{command:b},'owner')).status,409);
 assert.equal((await f.db.compactCommandLane(policy(f))).floor,1);await assert.rejects(put(f,b),/Turn ID already/);const down=await readFile(new URL('../server/migrations/rollback/012_command_turn_ownership.sql',import.meta.url),'utf8');await assert.rejects(f.db.transaction(client=>client.query(down)),/Refusing rollback/);assert.equal((await put(f,a)).disposition,'identical');assert.equal((await f.db.pool.query("SELECT turn_id FROM commands WHERE command_id='a'")).rows[0].turn_id,a.turnId);
 await f.bind('other');assert.equal((await put(f,{...command('other','other'),turnId:a.turnId})).disposition,'created');
}finally{await f.close();}});
test('MI-06 concurrent ownership reservations admit exactly one command',{skip},async()=>{const f=await apiFixture(url);try{await f.bind('s');const a=command('s','a'),b={...command('s','b'),turnId:a.turnId};const r=await Promise.allSettled([put(f,a),put(f,b)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.filter(x=>x.status==='rejected').length,1);}finally{await f.close();}});
for(const scenario of ['duplicate','missing','older','binding','lease','malformed'])test(`MI-06 ${scenario} terminal evidence cannot release compaction or outstanding admission`,{skip},async()=>{const f=await apiFixture(url);try{
 await f.bind('s');const a=command('s','a');await put(f,a);await ack(f,1);
 if(scenario==='duplicate'){const b=command('s','b');await put(f,b);await f.db.pool.query("UPDATE commands SET turn_id=$1,payload=jsonb_set(payload,'{turnId}',to_jsonb($1::text)) WHERE command_id='b'",[a.turnId]);}
 await finish(f,a,'done',scenario==='binding'?2:1);
 if(scenario==='missing')await f.db.pool.query("UPDATE commands SET turn_id=NULL WHERE command_id='a'");
 if(scenario==='older')await f.db.pool.query("UPDATE events SET created_at=created_at-interval '1 hour'");
 if(scenario==='lease')await f.db.pool.query("UPDATE events SET payload=jsonb_set(payload,'{leaseGeneration}','2')");
 if(scenario==='malformed')await f.db.pool.query("UPDATE events SET payload=payload-'protocolVersion'");
 assert.equal((await f.db.compactCommandLane(policy(f))).floor,0);
 await assert.rejects(f.db.recordCommand({commandId:'next',sessionId:'s',deviceId:f.issued.deviceId,lane:'prompt',payload:command('s','next')},{singleOutstanding:true}),/outstanding/);
}finally{await f.close();}});
test('MI-06 migration 012 backfills duplicate identities and refuses already compacted 011',{skip},async()=>{const f=await apiFixture(url);try{
 const down=await readFile(new URL('../server/migrations/rollback/012_command_turn_ownership.sql',import.meta.url),'utf8');await f.db.transaction(c=>c.query(down));await f.bind('s');const a=command('s','a');
 await f.db.pool.query("INSERT INTO commands(command_id,session_id,device_id,lane,lane_seq,payload) VALUES('a','s',$1,'prompt',1,$2),('b','s',$1,'prompt',2,$2)",[f.issued.deviceId,JSON.stringify(a)]);await f.db.pool.query("INSERT INTO lane_counters VALUES($1,'prompt',2)",[f.issued.deviceId]);await f.db.migrate();assert.equal((await f.db.pool.query('SELECT count(*) FROM commands WHERE turn_id=$1',[a.turnId])).rows[0].count,'2');
 await f.db.transaction(c=>c.query(down));await f.db.pool.query("UPDATE commands SET payload=NULL,archived_at=now(),payload_sha256=repeat('a',64),original_payload_bytes=1 WHERE command_id='a'");await assert.rejects(f.db.migrate(),/pre-compaction backup/);assert.equal((await f.db.pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='commands' AND column_name='turn_id'")).rowCount,0);
}finally{await f.close();}});
