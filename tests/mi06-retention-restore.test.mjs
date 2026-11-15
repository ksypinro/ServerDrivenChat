import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { apiFixture, command } from './helpers/api-fixture.mjs';
import { ServerDatabase } from '../server/dist/index.js';
const url=process.env.MI06_TEST_DATABASE_URL;
const container=process.env.MI06_TEST_PG_CONTAINER;
test('MI-06 used retention state survives disposable backup and restore', {skip:!url && 'requires disposable PostgreSQL'}, async()=>{
 if(container!=='sdc-mi06-test-pg' || !url.startsWith('postgres://sdc_mi06_test:mi06_local_test_only@127.0.0.1:55434/sdc_mi06_test')) throw Error('Set MI06_TEST_PG_CONTAINER=sdc-mi06-test-pg and use the explicitly disposable MI-06 database');
 const f=await apiFixture(url), restored=`repair_${randomUUID().replaceAll('-','')}`; let db;
 try{
  await f.bind('restore');const c=command('restore','restore-cmd');
  await f.db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'prompt',payload:c});
  await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:1,state:'rejected',payload:{sessionId:'restore'}});
  assert.equal((await f.db.compactCommandLane({deviceId:f.issued.deviceId,lane:'prompt',minAgeSeconds:0,keepLast:0,batchSize:10})).floor,1);
  const dump=execFileSync('docker',['exec',container,'pg_dump','-U','sdc_mi06_test','-d','sdc_mi06_test','--schema',f.schema],{encoding:'utf8',maxBuffer:20_000_000});
  execFileSync('docker',['exec','-i',container,'psql','-v','ON_ERROR_STOP=1','-U','sdc_mi06_test','-d','sdc_mi06_test'],{input:dump.replaceAll(f.schema,restored),stdio:['pipe','pipe','pipe'],maxBuffer:20_000_000});
  db=new ServerDatabase({poolConfig:{connectionString:url,options:`-c search_path=${restored}`}});
  assert.equal((await db.readCommandBatch(f.issued.deviceId,'prompt',1)).floor,1);
  const retry=await db.recordCommand({commandId:c.commandId,sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'prompt',payload:c});
  assert.equal(retry.disposition,'identical');assert.equal(retry.laneSeq,1);await assert.rejects(db.recordCommand({commandId:'new-owner',sessionId:c.sessionId,deviceId:f.issued.deviceId,lane:'prompt',payload:{...c,commandId:'new-owner'}}),/Turn ID already/);
  await assert.rejects(db.readCommandBatch(f.issued.deviceId,'prompt',0),/cursor has expired/);
  const rows=await db.pool.query('SELECT archived_at,payload FROM commands WHERE command_id=$1',[c.commandId]);assert.ok(rows.rows[0].archived_at);assert.equal(rows.rows[0].payload,null);
 }finally{await db?.close();await f.db.pool.query(`DROP SCHEMA IF EXISTS ${restored} CASCADE`);await f.close();}
});
