import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {canonicalJson,computeActionDigest,validateProtocolMessage} from '../protocol/dist/index.js';
const directory=process.argv[2]??'evidence/M23';
const read=async name=>JSON.parse(await readFile(`${directory}/${name}`,'utf8'));
const [before,after,server,fixture,manifest,observations]=await Promise.all(['live-vscode-before-reload.json','live-vscode.json','server-live.json','fixture.json','artifact-manifest.json','native-observations.json'].map(read));
const finalUi=await readFile(`${directory}/native-final-ui.txt`,'utf8');
assert.match(finalUi,/Cline bridge: disconnected/);assert.match(finalUi,/cline:cline-free\/solar-mini4/);assert.match(finalUi,new RegExp(`${fixture.marker}-LOCAL-OK`));
assert.equal(after.status,'captured','finish the post-reload native capture');
assert.equal(before.status,'recording','pre-reload capture is an intentional checkpoint, not a finished recording');
const nativeEvents=new Map();
for(const capture of [before,after]){
 assert.equal(capture.milestone,'M23');assert.equal(capture.apiVersion,'1.2');
 assert.equal(capture.artifacts.nativeAddon,`sha256:${manifest.nativeAddonSha256}`);assert.equal(capture.artifacts.companion,`sha256:${manifest.companionBundleSha256}`);
 for(const e of capture.trace){assert.equal(validateProtocolMessage(e).valid,true);if(nativeEvents.has(e.eventId))assert.equal(canonicalJson(e),canonicalJson(nativeEvents.get(e.eventId)));nativeEvents.set(e.eventId,e);}
}
for(const e of server.events){assert.equal(validateProtocolMessage(e).valid,true);if(nativeEvents.has(e.eventId))assert.equal(canonicalJson(e),canonicalJson(nativeEvents.get(e.eventId)));}
const proofs={};
for(const key of ['disconnect','reload','takeover']){
 const c=server.commands.find(c=>c.type==='turn.submit'&&c.payload.content.some(p=>p.text===fixture.prompts[key]));assert.ok(c,`missing exact ${key} prompt`);
 assert.equal(server.commands.filter(x=>x.commandId===c.commandId).length,1);
 const e=server.events.find(e=>e.type==='approval.required'&&e.payload.turnId===c.turnId);assert.ok(e,`missing real ${key} approval`);
 assert.ok(nativeEvents.has(e.eventId),'native and server must link the same approval event');
 const r=e.payload;assert.equal(r.action.arguments.input.path,`/private/tmp/sdc-m19-vscode-probe/${fixture.marker}-${key}.txt`);assert.equal(r.action.arguments.input.new_text,`${fixture.marker}-${key.toUpperCase()}`);
 const fields=['appId','appInstanceId','bindingId','sessionId','nativeConversationId','bindingRevision','leaseGeneration','turnId','nativeTurnId','requestId','nativeRequestId','requestRevision','action','requestedPermissions','availableDecisions'];
 assert.equal(r.actionDigest,await computeActionDigest(Object.fromEntries(fields.filter(k=>r[k]!==undefined).map(k=>[k,r[k]]))));
 assert.equal(r.requestId,observations[key].requestId);assert.equal(r.bindingId,observations[key].bindingId);
 assert.equal(server.fileEffects[key],null,'all three native file effects must remain absent');
 assert.equal(server.decisions.filter(d=>d.requestId===r.requestId).length,0,'no remote decision was accepted for these local failure checks');
 assert.ok(![...nativeEvents.values()].some(e=>e.type==='approval.applied'&&e.payload.requestId===r.requestId));
 const b=server.bindings.find(b=>b.bindingId===r.bindingId);assert.ok(b);assert.ok(server.acknowledgements.some(a=>a.command_id===c.commandId&&a.state==='applied'),'native prompt acceptance must be durable');
 proofs[key]={commandId:c.commandId,turnId:c.turnId,requestId:r.requestId,nativeRequestId:r.nativeRequestId,nativeTurnId:r.nativeTurnId,actionDigest:r.actionDigest,bindingId:b.bindingId,sessionId:b.sessionId};
 if(key==='disconnect'){
  const pending=await read('disconnect-pending-server.json'),detached=await read('disconnect-detached-server.json');
  assert.equal(pending.interactions.find(i=>i.request_id===r.requestId).state,'pending');assert.equal(detached.bindings.find(b=>b.bindingId===r.bindingId).state,'detached');
  assert.ok(before.states.some(s=>s.state==='disconnected'));assert.equal(b.state,'detached');
 }else if(key==='reload'){
  const pending=await read('reload-pending-server.json'),expired=await read('reload-expired-server.json');assert.equal(pending.interactions.find(i=>i.request_id===r.requestId).state,'pending');
  const old=expired.bindings.find(b=>b.bindingId===r.bindingId);assert.ok(old);assert.ok(old.state==='detached'||Date.parse(old.leaseExpiresAt)<=Date.parse(observations.reload.leaseExpiryObservedAt));
  const ui=await readFile(`${directory}/reload-expired-ui.txt`,'utf8');assert.match(ui,/Bridge unavailable/);assert.match(ui,/combobox "Decision" \[disabled\]/);
  const next=after.states.find(s=>s.state==='online'&&s.binding);assert.ok(next);assert.notEqual(next.binding.appInstanceId,r.appInstanceId,'reload must create a different native host');assert.notEqual(next.binding.nativeConversationId,r.nativeConversationId,'old pending task was left unresumed');
 }else{
  const rejectedUi=await readFile(`${directory}/takeover-local-reject-ui.txt`,'utf8');assert.match(rejectedUi,/All caught up/);assert.doesNotMatch(rejectedUi,/button "Record decision"/);
  assert.ok([...nativeEvents.values()].some(e=>e.type==='approval.resolved'&&e.payload.requestId===r.requestId&&e.payload.state==='resolved_elsewhere'),'local native Reject must win the request');
  assert.ok([...nativeEvents.values()].some(e=>e.type==='session.reconciliation_required'&&/local user prompt/.test(e.payload.reason)),'local prompt must invalidate remote binding');
  assert.equal(b.state,'detached');assert.ok(after.states.some(s=>s.state==='disconnected'));
  assert.ok([...nativeEvents.values()].some(e=>e.type==='output.item.created'&&e.payload.kind==='user_message'&&e.payload.content.some(p=>p.text===fixture.prompts.local)),'local takeover input must be native');
 }
 for(const screenshot of observations[key].screenshots??[])assert.ok((await stat(`${directory}/${screenshot}`)).size>1000);
}
console.log(JSON.stringify({milestone:'M23',status:'passed',marker:fixture.marker,proofs,nativeEvents:nativeEvents.size,serverEvents:server.events.length,scope:'Real pending-approval disconnect, reload with expired lease and explicit new host/task, local Reject then local takeover. Stale remote controls became unavailable; no remote decision submission or assertion consumption is claimed.'},null,2));
