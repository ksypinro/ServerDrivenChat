import assert from 'node:assert/strict';
import test from 'node:test';
import { installConnectTools } from '../adapters/cline/dist/native-connect.js';
import { serverOrigin, profileStorageKey, ConnectManager } from '../extensions/vscode/dist/connect.mjs';

function fixture() {
 let task={taskId:'task-A'}, session={sessionId:'task-A',sdkHost:{}}, workspace='workspace-A', disposed=false, config;
 const sessions={getActiveSession:()=>session,startNewSession:async input=>{config=input.config;return {sessionId:input.config.sessionId};}};
 const original=sessions.startNewSession;
 const native=installConnectTools({sessions,task:()=>task,context:()=>({installationId:'install',hostId:'host',windowId:'window',workspaceId:workspace}),disposed:()=>disposed});
 const start=async()=>{await sessions.startNewSession({config:{sessionId:'task-A',extraTools:[{name:'existing'}]}});return config.extraTools;};
 return {native,sessions,start,original,change:()=>{task={taskId:'task-A'};},session:()=>{session={sessionId:'task-A',sdkHost:{}};},workspace:()=>{workspace='workspace-B';},dispose:()=>{disposed=true;native.dispose();}};
}
const sdk=()=>({sessionId:'task-A',toolCallId:'native-call-1',signal:new AbortController().signal});
test('M21 tools are discoverable, bounded, sequential and preserve existing native tools',async t=>{
 const f=fixture();t.after(f.dispose);const unregister=f.native.api.register(async req=>{req.assertCurrent();assert.equal(req.origin.taskId,'task-A');assert.equal(req.origin.toolInvocationId,'native-call-1');assert.deepEqual(req.input,{operation:'bridge.connect',serverProfileId:'configured'});return {status:'connected',displayMessage:'connected',connectionId:'binding',credential:'must not leave host'};},()=>['configured']);t.after(unregister);
 const tools=await f.start();assert.equal(tools[0].name,'existing');const connect=tools[1];assert.equal(connect.name,'bridge_connect');assert.match(connect.description,/configured/);assert.equal(connect.retryable,false);assert.equal(connect.executionMode,'sequential');assert.equal(connect.inputSchema.additionalProperties,false);
 assert.deepEqual(await connect.execute({serverProfileId:'configured'},sdk()),{status:'connected',displayMessage:'connected',connectionId:'binding'});
 assert.equal(tools[2].name,'bridge_disconnect');
});
test('M21 model URL/task/credential injection and ambiguous SDK origin fail before handler',async t=>{
 const f=fixture();t.after(f.dispose);let calls=0;f.native.api.register(async()=>{calls++;return {status:'connected',displayMessage:'ok'};},()=>['configured']);const [,connect]=await f.start();
 for(const input of [{serverProfileId:'configured',taskId:'other'},{serverProfileId:'configured',serverUrl:'https://evil.test'},{serverProfileId:'configured',credential:'secret'},{serverProfileId:'configured',displayLabel:5},{serverProfileId:''},null])assert.equal((await connect.execute(input,sdk())).status,'rejected');
 for(const ctx of [{toolCallId:'id'},{sessionId:'task-B',toolCallId:'id'},{sessionId:'task-A'}])assert.equal((await connect.execute({serverProfileId:'configured'},ctx)).status,'rejected');assert.equal(calls,0);
});
for(const change of ['change','session','workspace'])test(`M21 captured native ${change} is rechecked after graphical await`,async t=>{
 const f=fixture();t.after(f.dispose);let release;f.native.api.register(async req=>{await new Promise(resolve=>release=resolve);req.assertCurrent();return {status:'connected',displayMessage:'wrong'};},()=>['configured']);const [,connect]=await f.start();const pending=connect.execute({serverProfileId:'configured'},sdk());f[change]();release();assert.equal((await pending).status,'rejected');
});
test('M21 cancelled tool and unregistered handler cannot start late connection',async t=>{
 const f=fixture();t.after(f.dispose);let release,mutated=false;const unreg=f.native.api.register(async req=>{await new Promise(r=>release=r);req.assertCurrent();mutated=true;return {status:'connected',displayMessage:'wrong'};},()=>['configured']);const [,connect]=await f.start();const abort=new AbortController();const pending=connect.execute({serverProfileId:'configured'},{...sdk(),signal:abort.signal});abort.abort();assert.equal((await pending).status,'rejected');release();await new Promise(r=>setImmediate(r));assert.equal(mutated,false);unreg();assert.equal((await connect.execute({serverProfileId:'configured'},sdk())).status,'rejected');
});
test('M21 profiles reject non-TLS remote endpoints and credential-bearing URLs; credential keys include origin',()=>{
 for(const url of ['http://remote.test','https://user:password@example.test','https://example.test/path','https://example.test/?token=secret','https://example.test/#secret'])assert.throws(()=>serverOrigin(url));
 assert.equal(serverOrigin('http://127.0.0.1:8765'),'http://127.0.0.1:8765');assert.equal(serverOrigin('https://example.test/'),'https://example.test');assert.notEqual(profileStorageKey({id:'same',origin:'https://a.test'}),profileStorageKey({id:'same',origin:'https://b.test'}));
});
test('M21 explicit local disable fences a pending graphical review before pairing',async()=>{
 const context={installationId:'install',hostId:'host',windowId:'window',workspaceId:'workspace'};let release,paired=false;
 const manager=new ConnectManager({context:()=>context,currentTask:()=>({taskId:'task'}),apiVersion:'1.2',clineVersion:'4.1.22'}, {profile:async()=>({id:'p',name:'profile',origin:'https://example.test',categories:['prompts']}),confirm:()=>new Promise(r=>release=r),pair:async()=>{paired=true;throw Error('must not pair');},changed(){},storePath:async()=>''});
 const request={input:{operation:'bridge.connect',serverProfileId:'p'},origin:{...context,taskId:'task',toolInvocationId:'invoke'},signal:new AbortController().signal,assertCurrent(){}};
 const work=manager.handle(request);await new Promise(r=>setImmediate(r));await manager.disconnect();release(true);assert.equal((await work).status,'rejected');assert.equal(paired,false);
});

test('M21 authenticated setup refuses HTTP redirection and never contacts redirected destination',async()=>{
 const {apiJson}=await import('../extensions/vscode/dist/connect.mjs');const {createServer}=await import('node:http');let contacted=0;
 const target=createServer((req,res)=>{contacted++;res.end('{}');});await new Promise((resolve,reject)=>{target.once('error',reject);target.listen(0,'127.0.0.1',resolve);});
 const server=createServer((req,res)=>{res.writeHead(307,{location:`http://127.0.0.1:${target.address().port}/capture`}).end();});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{await assert.rejects(apiJson({origin:`http://127.0.0.1:${server.address().port}`},'/v2/setup',{},'disposable-secret'));assert.equal(contacted,0);}
 finally{server.closeAllConnections();target.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>target.close(r))]);}
});
