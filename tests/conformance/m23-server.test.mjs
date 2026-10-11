import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {ServerDatabase,StorageCapacityError,AttachmentService} from '../../server/dist/index.js';
import {apiFixture,command,event} from '../helpers/api-fixture.mjs';
const url=process.env.M23_TEST_DATABASE_URL,skip=!url&&'requires disposable PostgreSQL 17';
test('M23 history byte quotas account for PostgreSQL JSONB serialization before admission',{skip},async()=>{
 const f=await apiFixture(url);try{await f.bind('session');
  const payload={a:1,b:2};const canonicalBytes=Buffer.byteLength(JSON.stringify(payload));
  const db=new ServerDatabase({pool:f.db.pool,limits:{maxLaneCommandBytes:canonicalBytes,maxSessionEventBytes:canonicalBytes}});
  await assert.rejects(db.recordCommand({commandId:'too-wide',sessionId:'session',deviceId:f.issued.deviceId,lane:'prompt',payload}),StorageCapacityError);
  await assert.rejects(db.recordEvent({eventId:'too-wide',sessionId:'session',bridgeEpoch:'epoch',producerSeq:1,payload}),StorageCapacityError);
  assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0)).length,0);
  assert.equal((await f.db.readSnapshot('session')).watermark.sessionSeq,0);
 }finally{await f.close();}
});
test('M23 concurrent retained-output quota rolls back sequence allocation and still admits controls and duplicates',{skip},async()=>{
 const f=await apiFixture(url);try{await f.bind('session');const db=new ServerDatabase({pool:f.db.pool,limits:{maxSessionEvents:2}});
  const events=[1,2,3].map(seq=>({eventId:`event-${seq}`,sessionId:'session',bridgeEpoch:'epoch',producerSeq:seq,payload:event('session',`event-${seq}`,seq)}));
  const results=await Promise.allSettled(events.map(e=>db.recordEvent(e)));assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.ok(results.find(r=>r.status==='rejected').reason instanceof StorageCapacityError);
  const saved=events.find((_,i)=>results[i].status==='fulfilled');assert.equal((await db.recordEvent(saved)).disposition,'identical');
  const snapshot=await f.db.readSnapshot('session');assert.equal(snapshot.watermark.sessionSeq,2);assert.deepEqual(snapshot.events.map(e=>e.sessionSeq),[1,2]);
  await db.recordCommand({commandId:'cancel',sessionId:'session',deviceId:f.issued.deviceId,lane:'control',payload:command('session','cancel','control')});
  assert.equal((await db.readCommands(f.issued.deviceId,'control',0)).length,1);
 }finally{await f.close();}
});
test('M23 retained command quotas preserve identity and reserve independent control history',{skip},async()=>{
 const f=await apiFixture(url);try{await f.bind('session');const db=new ServerDatabase({pool:f.db.pool,limits:{maxLaneCommands:1}});
  const record={commandId:'one',sessionId:'session',deviceId:f.issued.deviceId,lane:'prompt',payload:command('session','one')};await db.recordCommand(record);
  await assert.rejects(db.recordCommand({...record,commandId:'two',payload:command('session','two')}),StorageCapacityError);
  assert.equal((await db.recordCommand(record)).disposition,'identical');assert.equal((await db.readCommands(f.issued.deviceId,'prompt',0)).length,1);
  await db.recordCommand({...record,lane:'control',commandId:'cancel',payload:command('session','cancel','control')});
 }finally{await f.close();}
});
test('M23 concurrent upload reservations, expiry, cross-owner/session access and rename-crash cleanup',{skip},async()=>{
 const f=await apiFixture(url),root=await mkdtemp(join(tmpdir(),'m23-attachments-'));let now=Date.now();try{
  await f.bind('session');const service=new AttachmentService(f.db,{rootDirectory:root,maxRetainedBytes:4,maxRetainedUploads:2,uploadTtlSeconds:60,retentionSeconds:60,now:()=>now});
  const bytes=Buffer.from('test'),sha256='sha256:'+createHash('sha256').update(bytes).digest('hex');
  const input={sessionId:'session',ownerUserId:f.owner.userId,mimeType:'text/plain',filename:'test.txt',sizeBytes:4,sha256};
  const reserved=await Promise.allSettled([service.createUpload(input),service.createUpload(input)]);assert.equal(reserved.filter(r=>r.status==='fulfilled').length,1);assert.ok(reserved.find(r=>r.status==='rejected').reason instanceof StorageCapacityError);
  const upload=reserved.find(r=>r.status==='fulfilled').value;
  await assert.rejects(service.receive(upload.attachmentId,'other',(async function*(){yield bytes;})()));
  await service.receive(upload.attachmentId,f.owner.userId,(async function*(){yield bytes;})());await service.commit(upload.attachmentId,f.owner.userId,sha256);
  await assert.rejects(service.readCommitted(upload.attachmentId,'other'));await assert.rejects(service.readForSession(upload.attachmentId,'other-session'));
  now+=61000;await assert.rejects(service.readForSession(upload.attachmentId,'session'));await service.cleanup();
  const pending=await service.createUpload(input);await writeFile(join(root,pending.attachmentId+'.blob'),bytes);now+=61000;
  await assert.rejects(service.commit(pending.attachmentId,f.owner.userId,sha256),/expired/);await assert.rejects(service.receive(pending.attachmentId,f.owner.userId,(async function*(){yield bytes;})()),/expired/);
  await service.cleanup();await assert.rejects(access(join(root,pending.attachmentId+'.blob')));await service.createUpload(input);
 }finally{await f.close();await rm(root,{recursive:true,force:true});}
});
