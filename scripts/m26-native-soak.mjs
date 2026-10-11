/** One real hour: 30 min idle native lease, then 30 min real native text activity. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { ownerToken, callOwner } from './m26-human-auth.mjs';
const origin='https://localhost:15943';
const binding=JSON.parse(await readFile('evidence/M26/server-live.json','utf8')).bindings[0];
const key=await callOwner('/api/v1/credentials',{sessionId:binding.sessionId,scopes:['view','prompt'],label:'M26 one-hour real native soak',expiresAt:new Date(Date.now()+75*60000).toISOString()},ownerToken);
const report={status:'running',startedAt:new Date().toISOString(),binding,samples:[],turns:[],failures:[],topology:'Verified HTTPS Nginx -> pinned FastAPI -> real TypeScript/PostgreSQL -> real isolated VS Code/Cline 4.1.2204/API1.3 and companion0.7.3; genuine Keycloak PKCE; one retained binding; serial marker turns; no tools/files; default lease60s/renew20s; first30min idle then30min active one turn/90s'};
const save=()=>writeFile('evidence/M26/real-native-soak.json',JSON.stringify(report,null,2)+'\n');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const start=performance.now();
let nextTurn=1800000;
let serial=0;
async function request(path,body,identity) {
    const response=await fetch(origin+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${key.credential}`,'content-type':'application/json',...(identity?{'idempotency-key':identity}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(35000)});
    assert.ok(response.ok,`${path}: HTTP ${response.status}`);return response.json();
}
try {
    while(performance.now()-start<3600000) {
        const elapsedMs=performance.now()-start;
        const sample={at:new Date().toISOString(),elapsedMs,phase:elapsedMs<1800000?'idle':'active'};
        try {
            const snapshot=await request(`/sessions/${binding.sessionId}/snapshot`);
            sample.watermark=snapshot.watermark;
            const capabilities=await request(`/sessions/${binding.sessionId}/capabilities`);
            assert.equal(capabilities.bindingId,binding.bindingId);
            sample.bindingId=capabilities.bindingId;
            if(elapsedMs>=nextTurn) {
                const marker=`M26-SOAK-${++serial}`;
                const began=performance.now();
                const op=await request(`/sessions/${binding.sessionId}/prompts`,{model:'sdc-default',content:[{type:'text',text:`Do not use tools or read/change files. Reply exactly ${marker}.`}],delivery:'queue'},randomUUID());
                const turn={marker,operationId:op.operationId,gatewayAdmissionMs:performance.now()-began};
                const deadline=performance.now()+120000;
                let done;
                while(performance.now()<deadline) {
                    done=await request(`/operations/${op.operationId}`);
                    if(['completed','failed','rejected','cancelled','reconciliation_required'].includes(done.status))break;
                    await pause(500);
                }
                assert.equal(done.status,'completed');
                assert.ok(JSON.stringify(done.result.answer).includes(marker));
                assert.ok(done.result.toolActivity.every(item=>item.nativeCategory!=='tool'));
                turn.nativeCompletionMs=performance.now()-began;turn.commandState=done.commandState;turn.watermark=done.watermark;
                report.turns.push(turn);nextTurn+=90000;
            }
        } catch(error) {report.failures.push({at:sample.at,reason:error.message});}
        report.samples.push(sample);await save();
        await pause(Math.min(30000,Math.max(0,3600000-(performance.now()-start))));
    }
    report.actualDurationMs=performance.now()-start;
    assert.ok(report.actualDurationMs>=3600000);
    assert.equal(report.failures.length,0);
    assert.ok(report.turns.length>=19);
    report.status='passed';
} catch(error) {report.status='failed';report.failures.push({at:new Date().toISOString(),reason:error.message});process.exitCode=1;}
finally {
    await callOwner(`/api/v1/credentials/${key.credentialId}/revoke`,{},ownerToken);
    const denied=await fetch(origin+'/api/v1/identity',{headers:{authorization:`Bearer ${key.credential}`}});
    assert.equal(denied.status,401);report.credentialCleanup='revoked and rejected401';
    report.endedAt=new Date().toISOString();await save();
}
console.log('Real native one-hour soak',report.status);
