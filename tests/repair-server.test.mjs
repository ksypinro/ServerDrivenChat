import assert from 'node:assert/strict';
import test from 'node:test';
import {apiFixture,command,event,delay,waitFor} from './helpers/api-fixture.mjs';
import {parseSse} from '../bridge/dist/index.js';
const url=process.env.M09_TEST_DATABASE_URL;
const devicePath=(f,suffix)=>`/v2/devices/${f.issued.deviceId}/${suffix}`;
const watch=async response=>{const frames=[];let closed=false;const done=(async()=>{try{for await(const frame of parseSse(response.body))frames.push(frame);}catch{}finally{closed=true;}})();return {frames,done,get closed(){return closed;}};};

test('open SSE ends on viewer revocation, token expiry, and device credential rotation',{skip:!url},async()=>{
 const f=await apiFixture(url);
 try {
  await f.bind('s');const viewer=await f.signIn('viewer');await f.auth.setSessionRole(f.owner,'s',viewer.userId,'viewer');
  const revoked=await watch(await f.request('/v2/sessions/s/events',undefined,'viewer'));
  await f.auth.revokeSessionRole(f.owner,'s',viewer.userId);
  await f.db.recordEvent({eventId:'private-1',sessionId:'s',bridgeEpoch:'epoch-1',producerSeq:1,payload:event('s','private-1')});
  await waitFor(()=>revoked.closed);assert.equal(revoked.frames.length,0);
  await f.auth.setSessionRole(f.owner,'s',viewer.userId,'viewer');
  const expired=await watch(await f.request('/v2/sessions/s/events?after=1',undefined,'viewer'));f.tokens.delete('viewer');
  await f.db.recordEvent({eventId:'private-2',sessionId:'s',bridgeEpoch:'epoch-1',producerSeq:2,payload:event('s','private-2',2)});
  await waitFor(()=>expired.closed);assert.equal(expired.frames.length,0);
  const device=await watch(await f.request(devicePath(f,'commands?lane=prompt')));
  const replacement=await f.auth.rotateDeviceCredential(await f.auth.authenticateDevice(f.issued.credential),f.issued.credential);
  await waitFor(()=>device.closed);assert.equal(device.frames.length,0);
  const deviceExpired=await watch(await f.request(devicePath(f,'commands?lane=prompt'),undefined,replacement.credential));
  await f.db.pool.query("UPDATE device_credentials SET expires_at=clock_timestamp()-interval '1 second' WHERE device_id=$1",[f.issued.deviceId]);
  await waitFor(()=>deviceExpired.closed);assert.equal(deviceExpired.frames.length,0);
 } finally {await f.close();}
});

test('pending queues admit atomically, deduplicate at capacity, reserve controls, and recover after ack',{skip:!url},async()=>{
 const f=await apiFixture(url,{maxPendingPrompts:2,maxPendingControls:1});
 try {await f.bind('s');
  const results=await Promise.all([1,2,3,4].map(n=>f.request('/v2/sessions/s/turns',{command:command('s',`p${n}`)},'owner')));
  assert.deepEqual(results.map(r=>r.status).sort(),[202,202,429,429]);
  const accepted=(await f.db.readCommands(f.issued.deviceId,'prompt',0));assert.equal(accepted.length,2);
  assert.equal((await f.request('/v2/sessions/s/turns',{command:accepted[0].payload},'owner')).status,202);
  const control=command('s','control','control');assert.equal((await f.request(`/v2/sessions/s/turns/${control.turnId}/controls`,{command:control},'owner')).status,202);
  const excess=command('s','excess','control');assert.equal((await f.request(`/v2/sessions/s/turns/${excess.turnId}/controls`,{command:excess},'owner')).status,429);
  assert.equal((await f.request(devicePath(f,'acks'),{sessionId:'s',bindingRevision:1,leaseGeneration:1,lane:'prompt',laneSeq:accepted[0].laneSeq,state:'applied'})).status,202);
  assert.equal((await f.request('/v2/sessions/s/turns',{command:command('s','after-ack')},'owner')).status,202);
 } finally {await f.close();}
});

test('events, acknowledgements, and commands reject a takeover committed before storage admission',{skip:!url},async()=>{
 const f=await apiFixture(url);
 try {await f.bind('s');const c=await f.db.recordCommand({commandId:'c',sessionId:'s',deviceId:f.issued.deviceId,lane:'prompt',payload:command('s','c')});
  for(const [method,path,body] of [
   ['recordEvent',devicePath(f,'events'),{event:event('s','e')}],
   ['recordCommandAck',devicePath(f,'acks'),{sessionId:'s',bindingRevision:1,leaseGeneration:1,lane:'prompt',laneSeq:c.laneSeq,state:'applied'}],
   ['recordCommand','/v2/sessions/s/turns',{command:command('s','new')}]
  ]) {
   await f.db.pool.query("UPDATE bindings SET lease_generation=1 WHERE session_id='s'");
   const original=f.db[method].bind(f.db);
   f.db[method]=async(...args)=>{await f.db.pool.query("UPDATE bindings SET lease_generation=2 WHERE session_id='s'");return original(...args);};
   assert.equal((await f.request(path,body,method==='recordCommand'?'owner':f.issued.credential)).status,409);
   f.db[method]=original;
  }
  assert.equal((await f.db.readEvents('s',0)).length,0);
  assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0)).length,1);
  assert.equal((await f.db.pool.query('SELECT * FROM command_acknowledgements')).rowCount,0);
 } finally {await f.close();}
});

test('authority locks order commits against takeover and check expiry after lock waits',{skip:!url},async()=>{
 const f=await apiFixture(url);
 try {await f.bind('s');const fence={deviceId:f.issued.deviceId,sessionId:'s',bindingRevision:1,leaseGeneration:1};
  let release;const held=new Promise(r=>release=r);let locked=false;
  const write=f.db.transaction(async client=>{await f.db.lockBindingFence(client,fence);locked=true;await held;return f.db.recordEvent({eventId:'before',sessionId:'s',bridgeEpoch:'epoch',producerSeq:1,payload:{}},{client,fence});});
  await waitFor(()=>locked);let takeoverDone=false;
  const takeover=f.db.pool.query("UPDATE bindings SET lease_generation=2 WHERE session_id='s'").then(()=>takeoverDone=true);
  await delay(75);assert.equal(takeoverDone,false);release();await write;await takeover;
  assert.equal((await f.db.readEvents('s',0)).length,1);
  const client=await f.db.pool.connect();await client.query('BEGIN');
  await client.query("UPDATE bindings SET lease_generation=1,lease_expires_at=clock_timestamp()+interval '80 milliseconds' WHERE session_id='s'");
  const waiting=f.db.recordEvent({eventId:'expired',sessionId:'s',bridgeEpoch:'epoch',producerSeq:2,payload:{}},{fence});
  const rejection=assert.rejects(waiting,/fenced/);await delay(120);await client.query('COMMIT');client.release();await rejection;
  assert.equal((await f.db.readEvents('s',0)).length,1);
 } finally {await f.close();}
});

test('obsolete device-lane records emit immutable authenticated skips before later commands',{skip:!url},async()=>{
 const f=await apiFixture(url);
 try {await f.bind('old');await f.bind('new');
  await f.db.recordCommand({commandId:'old-c',sessionId:'old',deviceId:f.issued.deviceId,lane:'prompt',payload:command('old','old-c')});
  await f.db.recordCommand({commandId:'new-c',sessionId:'new',deviceId:f.issued.deviceId,lane:'prompt',payload:command('new','new-c')});
  await f.db.pool.query("UPDATE bindings SET state='detached' WHERE session_id='old'");
  const response=await f.request(devicePath(f,'commands?lane=prompt'));const stream=parseSse(response.body)[Symbol.asyncIterator]();
  const a=(await stream.next()).value;const b=(await stream.next()).value;
  assert.equal(a.event,'command.skipped');assert.equal(a.id,'1');assert.equal(b.event,'command');assert.equal(b.id,'2');
  assert.equal(JSON.parse(a.data).sessionId,undefined);await stream.return();
  assert.equal((await f.db.pool.query('SELECT state FROM command_acknowledgements')).rows[0].state,'rejected');
 } finally {await f.close();}
});


test('command admission rechecks roles in its transaction after earlier authorization',{skip:!url},async()=>{
 const f=await apiFixture(url);try{await f.bind('s');const operator=await f.signIn('operator');await f.auth.setSessionRole(f.owner,'s',operator.userId,'operator');
  const original=f.db.recordCommand.bind(f.db);f.db.recordCommand=async(...args)=>{await f.auth.revokeSessionRole(f.owner,'s',operator.userId);return original(...args);};
  assert.equal((await f.request('/v2/sessions/s/turns',{command:command('s','revoked')},'operator')).status,403);
  assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0)).length,0);
 }finally{await f.close();}
});

test('command and event admission use binding-before-session order without deadlock',{skip:!url},async()=>{
 const f=await apiFixture(url);try{await f.bind('s');const fence={deviceId:f.issued.deviceId,sessionId:'s',bindingRevision:1,leaseGeneration:1};
  let locked=false;let proceed;const pending=new Promise(r=>proceed=r);
  const output=f.db.transaction(async client=>{await f.db.lockBindingFence(client,fence);locked=true;await pending;return f.db.recordEvent({sessionId:'s',eventId:'concurrent-event',bridgeEpoch:'epoch',producerSeq:1,payload:{}},{client,fence});});
  await waitFor(()=>locked);
  const accepted=f.db.recordCommand({commandId:'concurrent-command',sessionId:'s',deviceId:f.issued.deviceId,lane:'prompt',payload:command('s','concurrent-command')},{fence,userFence:{sessionId:'s',userId:f.owner.userId,permission:'prompt'}});
  const results=Promise.all([output,accepted]);await delay(75);proceed();await results;
  assert.equal((await f.db.readEvents('s',0)).length,1);assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0)).length,1);
 }finally{await f.close();}
});
