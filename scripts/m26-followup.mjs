/** Interactive bounded native qualification, including frozen deployment recovery. */
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ownerToken, callOwner } from './m26-human-auth.mjs';
const base='https://localhost:15943';
const results=[];
const save=()=>writeFileSync('evidence/M26/native-fences.json',JSON.stringify({status:'running',results},null,2)+'\n');
async function active() {
    const rows=execFileSync('docker',['exec','sdc-local-postgres-1','psql','-U','sdc_app','-d','sdc','-Atc',"SELECT json_build_object('bindings',json_agg(json_build_object('bindingId',binding_id,'sessionId',session_id,'state',state,'leaseExpiresAt',lease_expires_at))) FROM bindings WHERE state='active'"],{encoding:'utf8'});
    writeFileSync('evidence/M26/server-live.json',rows);
    return JSON.parse(rows).bindings?.[0];
}
const existing=await callOwner('/api/v1/credentials',undefined,ownerToken);
const cleaned=[];
for(const item of existing.credentials.filter(x=>x.label.startsWith('M26')&&!x.revokedAt)) {
    await callOwner(`/api/v1/credentials/${item.credentialId}/revoke`,{},ownerToken);cleaned.push(item.credentialId);
}
writeFileSync('evidence/M26/recovered-cleanup.json',JSON.stringify({status:'passed',revokedIds:cleaned,scope:'Only M26-labeled operator test keys; no bearer/password saved'},null,2)+'\n');
let selected=await active();
let key;
async function issue() {
    selected=await active();assert.ok(selected,'Graphical reconnect required');
    if(key)await callOwner(`/api/v1/credentials/${key.credentialId}/revoke`,{},ownerToken);
    key=await callOwner('/api/v1/credentials',{sessionId:selected.sessionId,scopes:['view','prompt'],label:'M26 bounded fence/restart acceptance',expiresAt:new Date(Date.now()+3600000).toISOString()},ownerToken);
}
await issue();
const input=createInterface({input:process.stdin,output:process.stdout});
console.log('READY: commands check-fence, rebind, restart, negative, aider, firstparty, final, exit');
try {
    for await (const command of input) {
        if(command==='exit')break;
        if(command==='rebind') {await issue();results.push({kind:'graphically-reconnected',...selected});}
        else if(command==='check-fence') {
            const response=await fetch(`${base}/api/v1/sessions/${selected.sessionId}/prompts`,{method:'POST',headers:{authorization:`Bearer ${key.credential}`,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({model:'sdc-default',content:[{type:'text',text:'M26 STALE MUST NOT EXECUTE'}],delivery:'queue'})});
            const body=await response.json();assert.ok(response.status>=400&&response.status<500);results.push({kind:'stale-native-admission-refused',status:response.status,body});
        } else if(command==='restart') {
            const beganAt=new Date().toISOString();
            results.push({kind:'planned-server-gateway-restart-start',at:beganAt});save();
            execFileSync('docker',['restart','sdc-local-server-1','sdc-local-gateway-1'],{timeout:60000,stdio:'ignore'});
            const until=Date.now()+60000;
            while(Date.now()<until) {
                try {await callOwner(`/api/v1/sessions/${selected.sessionId}/snapshot`,undefined,key.credential);break;}catch{await new Promise(r=>setTimeout(r,500));}
            }
            const snapshot=await callOwner(`/api/v1/sessions/${selected.sessionId}/snapshot`,undefined,key.credential);
            results.push({kind:'credential-and-history-after-restart',startedAt:beganAt,endedAt:new Date().toISOString(),sessionId:selected.sessionId,watermark:snapshot.watermark});
        } else if(['negative','aider','firstparty','soak'].includes(command)) {
            await active();await import(`./m26-native-${command}.mjs`);
            assert.ok(!process.exitCode,`${command} failed; inspect retained evidence`);
        } else if(command==='final') {
            const response=await callOwner(`/api/v1/sessions/${selected.sessionId}/capabilities`,undefined,key.credential);
            assert.equal(response.capabilityReport.operations.resolveApproval.status,'unsupported');
            results.push({kind:'approvals-disabled-restored',bindingId:selected.bindingId});
            writeFileSync('evidence/M26/native-fences.json',JSON.stringify({status:'passed',results},null,2)+'\n');
            console.log('FINAL categories verified');continue;
        } else throw Error('Unrecognized bounded driver command');
        save();console.log('DONE',command);
    }
} finally {
    if(key)await callOwner(`/api/v1/credentials/${key.credentialId}/revoke`,{},ownerToken);
    input.close();
}
