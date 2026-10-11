import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {BridgeStore,BridgeStorageCapacity} from '../../bridge/dist/index.js';
const input=(id='one',seq=1,lane='prompt',payload={text:'one'})=>({commandId:id,sessionId:'session',deviceId:'device',lane,laneSeq:seq,payload});
const output=(id='event',seq=1,payload={text:'one'})=>({eventId:id,sessionId:'session',bridgeEpoch:'epoch',eventSeq:seq,payload});
function store(t,limits={}){const dir=mkdtempSync(join(tmpdir(),'m23-ledger-'));const db=new BridgeStore({path:join(dir,'bridge.sqlite'),limits});t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});return db;}
test('M23 byte budgets retain unresolved rows and allow exact duplicates at capacity',t=>{
 const db=store(t,{maxRecordBytes:64,maxHistoryBytes:80,maxUnackedBytes:25});
 db.acceptCommand(input());db.persistOutput(output());
 assert.equal(db.persistOutput(output()),'duplicate');
 assert.throws(()=>db.persistOutput(output('second',2)),BridgeStorageCapacity);
 assert.equal(db.getLastOutputSeq('session','epoch'),1);assert.equal(db.listUnackedOutput().length,1);
 assert.throws(()=>db.acceptCommand(input('big',2,'prompt',{text:'x'.repeat(64)})),BridgeStorageCapacity);
 assert.equal(db.getCursor('device','prompt'),1);
 db.acknowledgeOutput('event');db.persistOutput(output('second',2));
 assert.equal(db.getLastOutputSeq('session','epoch'),2);
});
test('M23 prompt saturation reserves a separate control lane; unresolved state is never evicted',t=>{
 const db=store(t,{maxPendingPrompts:1,maxPendingControls:1});db.acceptCommand(input());
 assert.throws(()=>db.acceptCommand(input('two',2)),BridgeStorageCapacity);
 db.acceptCommand(input('cancel',1,'control'));
 db.beginDispatch('one','attempt',{});db.recoverAfterRestart();
 assert.equal(db.getDispatchState('one'),'reconciliation_required');
 assert.throws(()=>db.acceptCommand(input('two',2)),BridgeStorageCapacity);
 assert.equal(db.listQueuedCommands('device','control').length,1);
});
test('M23 physical SQLite exhaustion rolls back the new record and preserves prior receipts',t=>{
 const db=store(t,{maxDatabasePages:32});db.acceptCommand(input());
 assert.throws(()=>db.persistOutput(output('full',1,{text:'x'.repeat(160000)})),BridgeStorageCapacity);
 assert.equal(db.getCursor('device','prompt'),1);assert.equal(db.getDispatchState('one'),'queued');
 assert.equal(db.getLastOutputSeq('session','epoch'),0);assert.equal(db.acceptCommand(input()),'duplicate');
});
for(const boundary of ['receive-transaction','before-effect','after-effect','before-ack'])test(`M23 SIGKILL at ${boundary} recovers without replaying an uncertain effect`,t=>{
 const dir=mkdtempSync(join(tmpdir(),'m23-crash-')),path=join(dir,'bridge.sqlite'),marker=join(dir,'effect.txt');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const moduleUrl=new URL('../../bridge/dist/index.js',import.meta.url).href;
 const script=`import {BridgeStore} from ${JSON.stringify(moduleUrl)};import {writeFileSync} from 'node:fs';const kill=()=>process.kill(process.pid,'SIGKILL');const db=new BridgeStore({path:${JSON.stringify(path)},fault:point=>{if(${JSON.stringify(boundary)}==='receive-transaction'&&point==='after_inbox_insert')kill();}});db.acceptCommand(${JSON.stringify(input())});db.beginDispatch('one','attempt',{});if(${JSON.stringify(boundary)}==='before-effect')kill();writeFileSync(${JSON.stringify(marker)},'one effect');if(${JSON.stringify(boundary)}==='after-effect')kill();db.finishDispatch('one','applied');kill();`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});assert.equal(result.signal,'SIGKILL',result.stderr);
 const db=new BridgeStore({path});try{const recovered=db.recoverAfterRestart('session');
  if(boundary==='receive-transaction'){assert.equal(db.getCursor('device','prompt'),0);assert.equal(db.getDispatchState('one'),undefined);}
  else {assert.equal(db.getCursor('device','prompt'),1);assert.equal(db.listQueuedCommands('device','prompt').length,0);assert.equal(db.getDispatchState('one'),boundary==='before-ack'?'applied':'reconciliation_required');}
  if(['after-effect','before-ack'].includes(boundary))assert.equal(readFileSync(marker,'utf8'),'one effect');
  if(boundary==='after-effect')assert.equal(recovered.attempts[0].state,'reconciliation_required');
 }finally{db.close();}
});
