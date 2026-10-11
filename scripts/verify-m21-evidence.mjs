import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateProtocolMessage,canonicalJson} from '../protocol/dist/index.js';
const native=JSON.parse(await readFile(process.argv[2]??'evidence/M21/live-vscode.json','utf8'));
const server=JSON.parse(await readFile('evidence/M21/server-live.json','utf8'));
const manifest=JSON.parse(await readFile('evidence/M21/artifact-manifest.json','utf8'));
assert.equal(native.milestone,'M21');assert.equal(native.status,'captured');assert.equal(native.apiVersion,'1.2');assert.equal(server.status,'passed');
assert.equal(native.artifacts.patch.revision,3);assert.equal(native.artifacts.nativeAddon,'sha256:'+manifest.nativeAddonSha256);assert.equal(native.artifacts.companion,'sha256:'+manifest.companionBundleSha256);
const connect=native.tools.find(t=>t.operation==='bridge.connect'&&t.result.status==='connected');assert.ok(connect);assert.equal(connect.source,'sdk_custom_tool');assert.equal(connect.serverProfileId,'default');assert.equal(connect.origin.taskId,native.initialTaskId);assert.ok(connect.origin.toolInvocationId);
const bound=server.results.find(r=>r.kind==='server-binding').binding;assert.equal(connect.result.connectionId,bound.bindingId);assert.equal(bound.nativeConversationId,connect.origin.taskId);assert.equal(bound.workspaceId,connect.origin.workspaceId);assert.equal(bound.appInstanceId,`${connect.origin.installationId}/${connect.origin.hostId}/${connect.origin.windowId}`);
for(const event of native.trace)assert.equal(validateProtocolMessage(event).valid,true,JSON.stringify(event));
const initiating=server.results.find(r=>r.kind==='initiating-turn-completed');assert.ok(initiating);assert.ok(native.trace.some(e=>e.eventId===initiating.event.eventId));assert.ok(Date.parse(initiating.event.createdAt)>Date.parse(connect.observedAt));
assert.ok(native.trace.some(e=>e.type==='output.item.created'&&e.payload.turnId===initiating.event.payload.turnId&&e.payload.kind==='user_message'&&JSON.stringify(e.payload.content).includes('Connect to my server and follow its instructions')));
const prompts=server.results.filter(r=>r.kind==='server-prompt');assert.equal(prompts.length,2);assert.ok(Date.parse(prompts[0].acceptedAt)>Date.parse(initiating.event.createdAt));assert.ok(!JSON.stringify(prompts[1].command).includes(server.marker));
for(const [index,prompt] of prompts.entries()){
 assert.equal(prompt.command.sessionId,bound.sessionId);const completed=server.results.find(r=>r.kind==='server-turn-completed'&&r.index===index);assert.ok(completed);
 assert.equal(validateProtocolMessage(prompt.command).valid,true);
 for(const event of completed.events){assert.equal(validateProtocolMessage(event).valid,true);assert.equal(event.sessionId,bound.sessionId);assert.ok(native.trace.some(e=>e.eventId===event.eventId&&canonicalJson(e)===canonicalJson(event)),'server observation must match the native event');}
 const terminal=completed.events.find(e=>e.type==='turn.completed');assert.ok(terminal);assert.ok(Date.parse(terminal.createdAt)>Date.parse(prompt.acceptedAt));
 if(index===1){const first=server.results.find(r=>r.kind==='server-turn-completed'&&r.index===0).events.find(e=>e.type==='turn.completed');assert.ok(Date.parse(prompt.acceptedAt)>Date.parse(first.createdAt));}
 assert.ok(native.trace.some(e=>e.type==='turn.completed'&&e.payload.turnId===prompt.command.turnId));
 const output=native.trace.filter(e=>e.type.startsWith('output.item.')&&e.payload.turnId===prompt.command.turnId).map(e=>JSON.stringify(e.payload.content)).join('\n');assert.ok(output.includes(`${server.marker}-${index===0?'FIRST':'CONTINUITY'}-OK`));
 const input=native.trace.find(e=>e.type==='output.item.created'&&e.payload.turnId===prompt.command.turnId&&e.payload.kind==='user_message');assert.ok(input);assert.match(JSON.stringify(input.payload.content),index===0?/M21 server instruction/:/M21 server follow-up/);
}
assert.ok(native.states.some(s=>s.state==='online'&&s.binding.bindingId===bound.bindingId));assert.equal(native.states.at(-1).state,'disconnected');assert.ok(server.results.some(r=>r.kind==='server-disconnected'&&r.bindingId===bound.bindingId));
console.log('M21 live evidence: trusted native Connect, handshake, initiating turn end, two later same-task server turns, continuity and disconnect verified');
