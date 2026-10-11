import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canonicalJson,computeActionDigest,validateProtocolMessage} from '../protocol/dist/index.js';
const directory=process.argv[2]??'evidence/M22';
const read=async name=>JSON.parse(await readFile(`${directory}/${name}`,'utf8'));
const [native,server,fixture,manifest]=await Promise.all(['live-vscode.json','server-live.json','fixture.json','artifact-manifest.json'].map(read));
assert.equal(native.milestone,'M22');assert.equal(native.status,'captured');assert.equal(native.apiVersion,'1.2');
assert.equal(native.artifacts.nativeAddon,`sha256:${manifest.nativeAddonSha256}`);assert.equal(native.artifacts.companion,`sha256:${manifest.companionBundleSha256}`);
const connect=native.tools.find(t=>t.source==='sdk_custom_tool'&&t.operation==='bridge.connect'&&t.result.status==='connected');assert.ok(connect,'native SDK Connect must succeed');
assert.equal(connect.origin.taskId,native.initialTaskId);assert.ok(connect.origin.toolInvocationId);
const b=server.bindings.find(b=>b.bindingId===connect.result.connectionId);assert.ok(b);assert.equal(b.payload.binding.nativeConversationId,native.initialTaskId);
assert.equal(b.payload.binding.appInstanceId,[connect.origin.installationId,connect.origin.hostId,connect.origin.windowId].join('/'));assert.equal(b.payload.binding.workspaceId,connect.origin.workspaceId);
assert.equal(b.state,'detached');assert.ok(native.states.some(s=>s.state==='online'&&s.binding?.bindingId===b.bindingId));assert.ok(native.states.some(s=>s.state==='disconnected'));assert.ok(['disconnected','binding_invalidated'].includes(native.states.at(-1).state));
const nativeEvents=new Map(native.trace.map(e=>[e.eventId,e]));
for(const event of native.trace)assert.equal(validateProtocolMessage(event).valid,true,`invalid native event ${event.eventId}`);
for(const event of server.events){assert.equal(validateProtocolMessage(event).valid,true,`invalid server event ${event.eventId}`);if(nativeEvents.has(event.eventId))assert.equal(canonicalJson(event),canonicalJson(nativeEvents.get(event.eventId)));}
const events=server.events.filter(e=>e.sessionId===b.sessionId);
const output=turnId=>events.filter(e=>['output.item.created','output.item.replaced'].includes(e.type)&&e.payload.turnId===turnId&&e.payload.kind==='assistant_message').map(e=>e.payload.content.map(c=>c.text??'').join('')).join('\n');
const turns={};for(const key of ['first','continuity','allow','deny','question','stop']){
 const c=server.commands.find(c=>c.type==='turn.submit'&&c.payload.content.some(part=>part.text===fixture.prompts[key]));assert.ok(c,`missing graphical ${key} command`);turns[key]=c;
 const start=events.find(e=>e.type==='turn.started'&&e.payload.turnId===c.turnId);assert.ok(start);assert.match(start.payload.nativeTurnId,new RegExp(`^${native.initialTaskId}:`));assert.equal(start.payload.conversationRevision,c.payload.expectedConversationRevision+1);
 assert.ok(events.some(e=>e.type==='output.item.created'&&e.payload.turnId===c.turnId&&e.payload.kind==='user_message'&&e.payload.content.some(p=>p.text===fixture.prompts[key])));
 if(key!=='stop')assert.ok(events.some(e=>e.type==='turn.completed'&&e.payload.turnId===c.turnId));
}
const initialEnd=events.find(e=>e.type==='turn.completed'&&e.payload.turnId.startsWith('local:')&&Date.parse(e.createdAt)>=Date.parse(connect.observedAt));assert.ok(initialEnd);assert.ok(Date.parse(turns.first.createdAt)>Date.parse(initialEnd.createdAt));
assert.ok(output(turns.first.turnId).includes(fixture.marker+'-FIRST-OK'));assert.ok(output(turns.continuity.turnId).includes(fixture.marker+'-CONTINUITY-OK'));assert.ok(!fixture.prompts.continuity.includes(fixture.marker));
assert.ok(Date.parse(turns.continuity.createdAt)>Date.parse(events.find(e=>e.type==='turn.completed'&&e.payload.turnId===turns.first.turnId).createdAt));
const approvals=[];for(const key of ['allow','deny']){
 const e=events.find(e=>e.type==='approval.required'&&e.payload.turnId===turns[key].turnId);assert.ok(e,`missing ${key} native approval`);const r=e.payload;assert.equal(r.nativeConversationId,native.initialTaskId);assert.ok(r.nativeRequestId&&r.nativeTurnId);
 const digestInput=Object.fromEntries(['appId','appInstanceId','bindingId','sessionId','nativeConversationId','bindingRevision','leaseGeneration','turnId','nativeTurnId','requestId','nativeRequestId','requestRevision','action','requestedPermissions','availableDecisions'].filter(key=>r[key]!==undefined).map(key=>[key,r[key]]));
 assert.equal(r.actionDigest,await computeActionDigest(digestInput));
 const d=server.decisions.find(d=>d.requestId===r.requestId&&d.requestRevision===r.requestRevision);assert.ok(d);assert.equal(d.actionDigest,r.actionDigest);assert.equal(d.choiceId,key==='allow'?'allow_once':'deny');assert.equal(d.signatureVerified,true);assert.deepEqual(d.grantedPermissions,[]);
 const c=server.commands.find(c=>c.type==='approval.decide'&&c.payload.decisionId===d.decisionId);assert.ok(c);assert.equal(c.payload.actionDigest,r.actionDigest);assert.equal(c.assertionSha256,d.assertionSha256);
 assert.ok(events.some(e=>e.type==='approval.applied'&&e.payload.decisionId===d.decisionId));
 const resolution=native.trace.find(e=>e.type==='approval.resolved'&&e.payload.requestId===r.requestId&&e.payload.decisionId===d.decisionId);assert.ok(resolution);assert.equal(resolution.payload.state,key==='allow'?'applied':'denied');
 approvals.push({key,requestId:r.requestId,requestRevision:r.requestRevision,nativeRequestId:r.nativeRequestId,nativeTurnId:r.nativeTurnId,actionDigest:r.actionDigest,decisionId:d.decisionId,commandId:c.commandId,turnId:r.turnId,requiredEventId:e.eventId,receiptEventId:events.find(e=>e.type==='approval.applied'&&e.payload.decisionId===d.decisionId).eventId,resolvedEventId:resolution.eventId,resolution:resolution.payload.state});
 if(key==='allow')assert.ok(server.network.some(n=>n.method==='POST'&&n.path.endsWith('/lease/renew')&&Date.parse(n.observedAt)>Date.parse(e.createdAt)+20000&&Date.parse(n.observedAt)<Date.parse(d.recordedAt)),'listener must renew while approval remains pending');
}
for(const c of server.commands)assert.ok(server.acknowledgements.some(a=>a.command_id===c.commandId&&a.state==='applied'),`missing applied native receipt ${c.commandId}`);
assert.equal(server.network.filter(n=>n.method==='POST'&&n.path.endsWith('/decision-assertions/consume')&&n.statusCode===200).length,2);
assert.ok(output(turns.allow.turnId).includes(fixture.marker+'-ALLOW-DONE'));assert.ok(output(turns.deny.turnId).includes(fixture.marker+'-DENY-DONE'));
assert.equal(server.fileEffects.allowed,fixture.marker+'-ALLOWED');assert.equal(server.fileEffects.denied,null);
const q=events.find(e=>e.type==='input.required'&&e.payload.turnId===turns.question.turnId);assert.ok(q);assert.ok(q.payload.nativeTurnId);
const answer=server.commands.find(c=>c.type==='input.respond'&&c.payload.requestId===q.payload.requestId&&c.payload.requestRevision===q.payload.requestRevision);assert.equal(answer?.payload.answer,'blue');assert.ok(events.some(e=>e.type==='input.resolved'&&e.payload.requestId===q.payload.requestId&&e.payload.outcome==='answered'));assert.ok(output(turns.question.turnId).includes('blue')&&output(turns.question.turnId).includes(fixture.marker+'-QUESTION-DONE'));
const cancel=server.commands.find(c=>c.type==='turn.cancel'&&c.turnId===turns.stop.turnId);assert.ok(cancel);assert.ok(events.some(e=>e.type==='turn.cancelled'&&e.payload.turnId===cancel.turnId&&/abort|cancel/i.test(e.payload.evidence)));
const drop=server.network.find(n=>n.kind==='developer-sse-drop');assert.ok(drop);assert.ok(native.states.some(s=>s.state==='reconnecting'&&Date.parse(s.observedAt)>=Date.parse(drop.observedAt)));assert.ok(server.network.filter(n=>n.method==='GET'&&n.path.includes('/commands')&&Date.parse(n.observedAt)>Date.parse(drop.observedAt)).length>=2);assert.ok(Date.parse(turns.allow.createdAt)>Date.parse(drop.observedAt));
assert.ok(native.trace.some(e=>e.type==='output.item.created'&&e.payload.kind==='user_message'&&e.payload.content.some(c=>c.text===fixture.prompts.takeover)));assert.ok(native.trace.some(e=>e.type==='session.reconciliation_required'&&/local user prompt/.test(e.payload.reason)));
const proof={milestone:'M22',status:'passed',marker:fixture.marker,taskId:native.initialTaskId,bindingId:b.bindingId,sessionId:b.sessionId,turns:Object.fromEntries(Object.entries(turns).map(([key,c])=>{const start=events.find(e=>e.type==='turn.started'&&e.payload.turnId===c.turnId);const end=events.find(e=>['turn.completed','turn.cancelled'].includes(e.type)&&e.payload.turnId===c.turnId);return [key,{commandId:c.commandId,promptId:c.promptId,turnId:c.turnId,nativeTurnId:start.payload.nativeTurnId,startEventId:start.eventId,resultItemIds:[...new Set(events.filter(e=>['output.item.created','output.item.replaced'].includes(e.type)&&e.payload.turnId===c.turnId&&e.payload.kind==='assistant_message').map(e=>e.payload.itemId))],terminalEventId:end.eventId,terminal:end.type}]})),approvals,question:{requestId:q.payload.requestId,nativeTurnId:q.payload.nativeTurnId,commandId:answer.commandId},cancel:{commandId:cancel.commandId,turnId:cancel.turnId},checkedNativeEvents:native.trace.length,checkedServerEvents:server.events.length};
console.log(JSON.stringify(proof,null,2));
