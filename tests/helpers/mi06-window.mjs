import { BridgeRuntime as SourceRuntime, BridgeStore as SourceStore } from '../../bridge/dist/index.js';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {readZipEntries} from '../../extensions/vscode/scripts/vsix.mjs';
import { FakeAppAdapter } from '../../adapters/fake/dist/index.js';
const config=JSON.parse(process.argv[2]);
let BridgeRuntime=SourceRuntime, BridgeStore=SourceStore;
if(config.packaged){
 const archive=config.packaged==='mi04'?'../../extensions/vscode/dist/mi04-candidate/sdc-cline-bridge-0.9.0-mi04.10.vsix':'../../extensions/vscode/dist/mi06-candidate/sdc-cline-bridge-0.10.0-mi06.2.vsix';
 const entries=readZipEntries(await readFile(new URL(archive,import.meta.url))).entries;
 const bundle=entries.get('extension/dist/extension.cjs').toString();
 const localRequire=createRequire(import.meta.url); const module={exports:{}};
 const expose=vm.runInThisContext('(function(require,module,exports){'+bundle+'\n;return {BridgeRuntime,BridgeStore};})',{filename:'packaged-companion.cjs'});
 ({BridgeRuntime,BridgeStore}=expose(name=>name==='vscode'?{}:localRequire(name),module,module.exports));
}
const adapter=new FakeAppAdapter({sessionId:config.sessionId,appInstanceId:config.appInstanceId,bridgeEpoch:config.epoch??`mi06-${config.sessionId}`,now:()=>new Date().toISOString()});
const selection={appId:'fake.app',appInstanceId:config.appInstanceId,conversationId:'fake-conversation'};
if(config.second){const temporary=(await adapter.attach(selection)).value;await adapter.detach(temporary);}
const binding=(await adapter.attach(selection)).value;
const submit=adapter.submit.bind(adapter);adapter.submit=async(...args)=>{process.send?.({type:'effect',commandId:args[1].commandId});return submit(...args);};
const revoke=adapter.revoke.bind(adapter);adapter.revoke=async(...args)=>{process.send?.({type:'revoke-effect',grantId:args[1]});return revoke(...args);};
const store=new BridgeStore({path:config.storePath,sessionId:config.sessionId,fault:point=>{if(config.crashCheckpoint===point)process.kill(process.pid,'SIGKILL');}});store.initializeCursors(config.deviceId,{prompt:0,control:0});
let resume;const gate=new Promise(resolve=>{resume=resolve;});let stalled=Boolean(config.stall);
const tracedFetch=async(resource,init)=>{const url=new URL(resource);if(stalled && url.pathname.endsWith('/commands') && url.searchParams.get('lane')===(config.stallLane??'prompt')){process.send?.({type:'stalled'});await gate;stalled=false;}if(config.holdWrites && /\/(acks|events|dispatch)$/.test(url.pathname)){process.send?.({type:'write-held',path:url.pathname});await new Promise((_,reject)=>{const fail=()=>reject(new DOMException('Stopped','AbortError'));if(init.signal.aborted)fail();else init.signal.addEventListener('abort',fail,{once:true});});}const response=await fetch(resource,init);if(url.pathname.endsWith('/commands') && response.status===410)process.send?.({type:'expired'});if(url.pathname.endsWith('/commands/checkpoint') && response.status===200){process.send?.({type:'checkpoint'});if(config.corruptCheckpoint){const value=await response.json();if(config.corruptCheckpoint==='authority')value.bindingId='wrong-binding';else value.archivedThrough=value.head+1;return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});}}return response;};
const runtime=new BridgeRuntime({serverUrl:config.serverUrl,deviceId:config.deviceId,credential:config.credential,binding,adapter,store,fetch:tracedFetch,reconnectBaseMs:10,reconnectCapMs:50,leaseRenewIntervalMs:1000,random:()=>0,onStateChange:state=>process.send?.({type:'state',state})});
process.send?.({type:'binding',binding});
process.on('message',message=>{if(message==='start')void runtime.start().then(()=>process.send?.({type:'started'}));if(message==='resume')resume();if(message==='stop'){resume();void runtime.stop().then(()=>{process.send?.({type:'stopped',cursor:store.getCursor(config.deviceId,'prompt')});store.close();process.disconnect?.();});}});
