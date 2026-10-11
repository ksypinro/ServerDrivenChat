/** Pre-dispatch profile refusal and scoped authority on the retained real deployed binding. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { ownerToken, callOwner } from './m26-human-auth.mjs';
const base = 'https://localhost:15943';
const active = JSON.parse(await readFile('evidence/M26/server-live.json','utf8')).bindings[0];
const results = [];
const issued = await callOwner('/api/v1/credentials', { sessionId: active.sessionId, scopes: ['view','prompt'], label:'M26 bounded preflight checks', expiresAt:new Date(Date.now()+600000).toISOString() }, ownerToken);
async function request(path, body, token=issued.credential) {
    const response = await fetch(base+path, { method:body===undefined?'GET':'POST', headers:{authorization:`Bearer ${token}`, 'content-type':'application/json', 'idempotency-key':randomUUID()}, ...(body===undefined?{}:{body:JSON.stringify(body)}) });
    return {status:response.status, body:await response.json()};
}
try {
    const before = await request(`/api/v1/sessions/${active.sessionId}/snapshot`);
    const caps = await request(`/api/v1/sessions/${active.sessionId}/capabilities`);
    results.push({kind:'binding-policy',callerToolsReady:caps.body.serverPolicy?.callerToolsReady});
    assert.equal(caps.body.serverPolicy?.callerToolsReady,false);
    const tool = await request('/openai/v1/chat/completions',{model:'sdc-default',messages:[{role:'user',content:'Call echo.'}], tools:[{type:'function',function:{name:'echo',parameters:{type:'object',properties:{},additionalProperties:false}}}]});
    assert.ok(tool.status>=400&&tool.status<500);
    results.push({kind:'caller-tools-withheld',...tool});
    const unsupported = await request('/openai/v1/chat/completions',{model:'sdc-default',messages:[{role:'user',content:'Hello'}],temperature:0.1});
    assert.ok(unsupported.status>=400&&unsupported.status<500);
    results.push({kind:'unsupported-option',...unsupported});
    const after = await request(`/api/v1/sessions/${active.sessionId}/snapshot`);
    assert.equal(after.body.watermark.prompt,before.body.watermark.prompt);
    results.push({kind:'no-native-send',promptCursorBefore:before.body.watermark.prompt,promptCursorAfter:after.body.watermark.prompt});
    const viewer = await callOwner('/api/v1/credentials', {sessionId:active.sessionId, scopes:['view'],label:'M26 view-only refusal',expiresAt:new Date(Date.now()+600000).toISOString()}, ownerToken);
    try {
        const refusal=await request(`/api/v1/sessions/${active.sessionId}/prompts`,{model:'sdc-default',content:[{type:'text',text:'M26 must not dispatch'}],delivery:'queue'},viewer.credential);
        assert.equal(refusal.status,403);results.push({kind:'view-only-prompt-refused',status:refusal.status});
    } finally {await callOwner(`/api/v1/credentials/${viewer.credentialId}/revoke`,{},ownerToken);}
    await writeFile('evidence/M26/native-negative.json',JSON.stringify({status:'passed',results},null,2)+'\n');
} finally {await callOwner(`/api/v1/credentials/${issued.credentialId}/revoke`,{},ownerToken);}
