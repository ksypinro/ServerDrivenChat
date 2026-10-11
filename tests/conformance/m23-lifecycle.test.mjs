import assert from 'node:assert/strict';
import test from 'node:test';
import {cancellable,ConnectManager} from '../../extensions/vscode/dist/connect.mjs';
import {delay} from '../helpers/api-fixture.mjs';
const context={installationId:'install',hostId:'host',windowId:'window',workspaceId:'workspace'};
const request=signal=>({input:{operation:'bridge.connect',serverProfileId:'p'},origin:{...context,taskId:'task',toolInvocationId:'invoke'},signal,assertCurrent(){}});
for(const step of ['confirm','pair'])test(`M23 cancellation during ${step} releases Connect and fences a late UI result`,async()=>{
 let release,entered;const ready=new Promise(r=>entered=r);let paired=0;let retry=false;
 const manager=new ConnectManager({context:()=>context,currentTask:()=>({taskId:'task'}),apiVersion:'1.2',clineVersion:'4.1.22'}, {
  profile:async()=>({id:'p',name:'profile',origin:'https://example.test',categories:['prompts']}),
  confirm:async()=>{if(retry)return false;if(step==='confirm'){entered();return new Promise(r=>release=r);}return true;},
  pair:async()=>{paired++;entered();return new Promise(r=>release=r);},changed(){},storePath:async()=>{throw Error('must not bind');}
 });
 const abort=new AbortController(),pending=manager.handle(request(abort.signal));await ready;abort.abort();
 assert.equal((await Promise.race([pending,delay(500).then(()=>{throw Error('Cancelled review held the Connect slot');})])).status,'rejected');
 retry=true;const next=await manager.handle(request(new AbortController().signal));assert.equal(next.status,'rejected');assert.match(next.displayMessage,/declined/);
 release(step==='confirm'?true:{deviceId:'device',credential:'disposable',expiresAt:new Date(Date.now()+60000).toISOString()});await delay(20);
 assert.equal(manager.current,undefined);assert.equal(paired,step==='pair'?1:0);
});
test('M23 already-aborted work rejects and observes a later failure without an unhandled rejection',async()=>{
 const abort=new AbortController();abort.abort();let reject;const pending=new Promise((_,r)=>reject=r);
 await assert.rejects(cancellable(pending,abort.signal),/cancelled/);reject(Error('late failure'));await delay(10);
});
