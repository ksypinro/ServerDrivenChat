import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {ServerDatabase} from '../server/dist/index.js';
import {apiFixture,command,event} from './helpers/api-fixture.mjs';
const url=process.env.M06_TEST_DATABASE_URL;
const enabled=process.env.M06_TEST_DOCKER_RESTORE==='1';

test('PostgreSQL dump restores migrations, accepted records, watermarks, and deduplication',{skip:!url||!enabled},async()=>{
 assert.match(url,/@127\.0\.0\.1:55432\/sdc_m06_test$/,'restore check is restricted to the disposable compose database');
 const f=await apiFixture(url);const target=`${f.schema}_restored`;let restored;
 try {
  await f.bind('s');const c=await f.db.recordCommand({commandId:'restore-c',sessionId:'s',deviceId:f.issued.deviceId,lane:'prompt',payload:command('s','restore-c')});
  const e={eventId:'restore-e',sessionId:'s',bridgeEpoch:'epoch',producerSeq:1,payload:event('s','restore-e')};await f.db.recordEvent(e);
  await f.db.recordCommandAck({deviceId:f.issued.deviceId,lane:'prompt',laneSeq:c.laneSeq,state:'received',payload:{sessionId:'s'}});
  const snapshot=await f.db.readSnapshot('s');
  const sql=execFileSync('docker',['compose','exec','-T','postgres-m06','pg_dump','-U','sdc_m06_test','-d','sdc_m06_test','--schema',f.schema],{encoding:'utf8',maxBuffer:4*1024*1024});
  execFileSync('docker',['compose','exec','-T','postgres-m06','psql','-U','sdc_m06_test','-d','sdc_m06_test','-v','ON_ERROR_STOP=1'],{input:sql.replaceAll(f.schema,target),encoding:'utf8',stdio:['pipe','pipe','pipe']});
  restored=new ServerDatabase({poolConfig:{connectionString:url,options:`-c search_path=${target}`}});
  await restored.migrate();assert.deepEqual(await restored.readSnapshot('s'),snapshot);
  assert.equal((await restored.recordEvent(e)).disposition,'identical');assert.equal((await restored.readCommands(f.issued.deviceId,'prompt',0))[0].laneSeq,c.laneSeq);
  assert.equal((await restored.pool.query('SELECT state FROM command_acknowledgements')).rows[0].state,'received');
 }finally{await restored?.close();await f.db.pool.query(`DROP SCHEMA IF EXISTS ${target} CASCADE`);await f.close();}
});
