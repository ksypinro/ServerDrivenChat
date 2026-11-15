import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BridgeStore } from '../bridge/dist/index.js';

for (const fault of ['after_retention_checkpoint','after_retention_cursor']) test(`MI-06 checkpoint transaction rolls back and survives reopen: ${fault}`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'mi06-checkpoint-')),path=join(dir,'inbox.sqlite');let store;
 try{
  store=new BridgeStore({path,sessionId:'s',fault:point=>{if(point===fault)throw Error('injected');}});
  store.acceptCommand({deviceId:'d',lane:'prompt',laneSeq:3,sessionId:'other',commandId:'foreign',payload:{}});
  const cp={deviceId:'d',lane:'prompt',sessionId:'s',expectedCursor:0,archivedThrough:2,head:3};
  assert.throws(()=>store.applyCommandRecoveryCheckpoint(cp),/injected/);assert.equal(store.getCursor('d','prompt'),0);store.close();
  store=new BridgeStore({path,sessionId:'s'});assert.equal(store.getCursor('d','prompt'),0);assert.equal(store.applyCommandRecoveryCheckpoint(cp),3);
  assert.throws(()=>store.acceptCommand({deviceId:'d',lane:'prompt',laneSeq:1,sessionId:'s',commandId:'late',payload:{}}),/archive floor/);
  assert.throws(()=>store.acceptCommand({deviceId:'d',lane:'prompt',laneSeq:1,sessionId:'other',commandId:'late-foreign',payload:{secret:'must not persist'}}),/archive floor/);assert.throws(()=>store.acceptSkip({deviceId:'d',lane:'prompt',laneSeq:1,commandId:'late-skip',reason:'obsolete_binding'}),/archive floor/);assert.throws(()=>store.applyCommandRecoveryCheckpoint(cp),/raced or regressed/);store.close();store=new BridgeStore({path,sessionId:'s'});assert.equal(store.getCursor('d','prompt'),3);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('MI-06 checkpoint preserves unfinished local commands and output',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mi06-conflict-'));const store=new BridgeStore({path:join(dir,'inbox.sqlite'),sessionId:'s'});
 try{
  store.acceptCommand({deviceId:'d',lane:'prompt',laneSeq:2,sessionId:'s',commandId:'pending',payload:{}});
  store.persistOutput({eventId:'e',sessionId:'s',eventSeq:1,payload:{}});
  assert.throws(()=>store.applyCommandRecoveryCheckpoint({deviceId:'d',lane:'prompt',sessionId:'s',expectedCursor:0,archivedThrough:2,head:3}),/unfinished/);
  assert.equal(store.getCursor('d','prompt'),0);assert.equal(store.getDispatchState('pending'),'reconciliation_required');assert.equal(store.listUnackedOutput().length,1);assert.equal(store.hasCommandReconciliation('s'),true);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('MI-06 process killed during checkpoint preserves an atomic durable cursor',async()=>{
 const {spawnSync}=await import('node:child_process');const {fileURLToPath}=await import('node:url');
 for(const point of ['after_retention_checkpoint','after_retention_cursor']){const dir=mkdtempSync(join(tmpdir(),'mi06-kill-')),path=join(dir,'db.sqlite');try{
  const initial=new BridgeStore({path,sessionId:'s'});initial.initializeCursors('d',{prompt:0,control:0});initial.close();
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('./helpers/mi06-crash.mjs',import.meta.url)),path,point],{encoding:'utf8'});assert.equal(child.signal,'SIGKILL');
  const reopened=new BridgeStore({path,sessionId:'s'});assert.equal(reopened.getCursor('d','prompt'),0);assert.equal(reopened.applyCommandRecoveryCheckpoint({deviceId:'d',lane:'prompt',sessionId:'s',expectedCursor:0,archivedThrough:2,head:2}),2);reopened.close();
 }finally{rmSync(dir,{recursive:true,force:true});}}
});
test('MI-06 applying attempts and unsent ACKs survive a conflicting checkpoint',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mi06-applying-'));const path=join(dir,'db.sqlite');let store=new BridgeStore({path,sessionId:'s'});try{
  store.acceptCommand({deviceId:'d',lane:'prompt',laneSeq:2,sessionId:'s',commandId:'applying',payload:{}});store.beginDispatch('applying','attempt',{});
  assert.throws(()=>store.applyCommandRecoveryCheckpoint({deviceId:'d',lane:'prompt',sessionId:'s',expectedCursor:0,archivedThrough:2,head:2}),/unfinished/);
  assert.equal(store.listPendingServerAcks('d').length,1);store.close();store=new BridgeStore({path,sessionId:'s'});assert.equal(store.getDispatchState('applying'),'reconciliation_required');assert.equal(store.hasCommandReconciliation('s'),true);assert.equal(store.recoverAfterRestart('s').attempts[0].state,'reconciliation_required');assert.equal(store.listPendingServerAcks('d').length,1);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('MI-06 checkpoint compare-and-set rejects a competing SQLite connection',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mi06-cas-'));const path=join(dir,'db.sqlite');const a=new BridgeStore({path,sessionId:'s'}),b=new BridgeStore({path,sessionId:'s'});try{
  const cp={deviceId:'d',lane:'prompt',sessionId:'s',expectedCursor:0,archivedThrough:2,head:3};assert.equal(a.applyCommandRecoveryCheckpoint(cp),2);assert.throws(()=>b.applyCommandRecoveryCheckpoint(cp),/raced or regressed/);assert.equal(b.getCursor('d','prompt'),2);
 }finally{a.close();b.close();rmSync(dir,{recursive:true,force:true});}
});
test('MI-06 conflicting queued work remains reconciliation-required after restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mi06-durable-conflict-'));const path=join(dir,'db.sqlite');let store=new BridgeStore({path,sessionId:'s'});try{
  store.acceptCommand({deviceId:'d',lane:'prompt',laneSeq:2,sessionId:'s',commandId:'queued',payload:{}});const acks=store.listPendingServerAcks('d');
  assert.throws(()=>store.applyCommandRecoveryCheckpoint({deviceId:'d',lane:'prompt',sessionId:'s',expectedCursor:0,archivedThrough:2,head:2}),/unfinished/);store.close();store=new BridgeStore({path,sessionId:'s'});
  assert.equal(store.hasCommandReconciliation('s'),true);assert.equal(store.countUnresolvedAttempts('s'),1);assert.equal(store.getDispatchState('queued'),'reconciliation_required');assert.deepEqual(store.listPendingServerAcks('d'),acks);assert.deepEqual(store.listQueuedCommands('d','prompt',100,'s'),[]);assert.equal(store.getCursor('d','prompt'),0);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
