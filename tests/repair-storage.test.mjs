import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {BridgeStore} from '../bridge/dist/index.js';

test('epoch migration retains acknowledged and pending history, and checkpoints stay contiguous',()=>{
 const dir=mkdtempSync(join(tmpdir(),'epoch-repair-'));const path=join(dir,'db.sqlite');
 try {
  const old=new DatabaseSync(path);
  old.exec(`CREATE TABLE outbox_events(event_id TEXT PRIMARY KEY,session_id TEXT NOT NULL,event_seq INTEGER NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,acked_at INTEGER,UNIQUE(session_id,event_seq));
   INSERT INTO outbox_events VALUES('old-1','session',1,'{"bridgeEpoch":"old"}',1,2),('old-3','session',3,'{"bridgeEpoch":"old"}',1,NULL);`);old.close();
  let store=new BridgeStore({path});
  assert.equal(store.getLastOutputSeq('session','old'),1);
  store.persistOutput({eventId:'new-1',sessionId:'session',bridgeEpoch:'new',eventSeq:1,payload:{bridgeEpoch:'new'}});
  assert.equal(store.getLastOutputSeq('session','new'),1);
  assert.equal(store.persistOutput({eventId:'old-1',sessionId:'session',bridgeEpoch:'old',eventSeq:1,payload:{bridgeEpoch:'old'}}),'duplicate');
  store.persistOutput({eventId:'old-2',sessionId:'session',bridgeEpoch:'old',eventSeq:2,payload:{bridgeEpoch:'old'}});
  assert.equal(store.getLastOutputSeq('session','old'),3);
  assert.throws(()=>store.persistOutput({eventId:'collision',sessionId:'session',bridgeEpoch:'new',eventSeq:1,payload:{bridgeEpoch:'new'}}));
  store.close();store=new BridgeStore({path});
  assert.deepEqual(store.listUnackedOutput().map(x=>x.eventId).sort(),['new-1','old-2','old-3']);
  assert.deepEqual(new Set(store.getOutputCheckpoints('session').map(c=>c.bridgeEpoch)),new Set(['old','new']));
  store.close();
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('authenticated skips fill only the named gap and survive restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'skip-repair-'));const path=join(dir,'db.sqlite');
 try {let store=new BridgeStore({path});
  store.acceptCommand({commandId:'c2',sessionId:'s2',deviceId:'d',lane:'prompt',laneSeq:2,payload:{}});
  assert.equal(store.getCursor('d','prompt'),0);
  const skip={deviceId:'d',lane:'prompt',laneSeq:1,commandId:'obsolete',reason:'obsolete_binding'};
  store.acceptSkip(skip);store.acceptSkip(skip);
  assert.equal(store.getCursor('d','prompt'),2);
  assert.equal(store.listQueuedCommands('d','prompt',100,'s2').length,1);
  assert.equal(store.listQueuedCommands('d','prompt',100,'other').length,0);
  assert.throws(()=>store.acceptSkip({...skip,commandId:'wrong'}));
  store.close();store=new BridgeStore({path});assert.equal(store.getCursor('d','prompt'),2);store.close();
 } finally {rmSync(dir,{recursive:true,force:true});}
});
