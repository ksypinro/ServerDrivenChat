import assert from 'node:assert/strict';
import test from 'node:test';
import {createApiServer,PublicApiService} from '../server/dist/index.js';
import {apiFixture,command,event} from './helpers/api-fixture.mjs';

const url=process.env.M27_TEST_DATABASE_URL;
const skip=!url&&'requires disposable PostgreSQL';
async function ready(f,id='session') {
    await f.bind(id);
    await f.db.pool.query("UPDATE bindings SET payload=$2::jsonb WHERE session_id=$1",[id,JSON.stringify({conversationRevision:0,capabilities:Object.fromEntries(['submit','cancel','respondInput','resolveApproval','detach'].map(name=>[name,{status:'supported',reason:'SIMULATED native capability'}]))})]);
}
const prompt=(session='session')=>({model:`sdc.b-${session}`,content:[{type:'text',text:'M27 fixture prompt'}],delivery:'queue'});
async function post(f,path,body,token='owner',extra={}) {
    return fetch(f.base+'/v2/public'+path,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...extra},body:JSON.stringify(body)});
}
async function key(f,scopes=['view','prompt'],sessionId='session') {
    const r=await post(f,'/credentials',{sessionId,scopes,label:'disposable fixture',expiresAt:new Date(Date.now()+300000).toISOString()});
    assert.equal(r.status,201);return r.json();
}
async function output(f,op,{state='completed',partial=false}={}) {
    const records=[{type:'turn.started',payload:{turnId:op.turnId,state:'running',conversationRevision:1}},
        {type:'output.item.created',payload:{turnId:op.turnId,itemId:'assistant-'+op.turnId,kind:'assistant_message',revision:1,source:'native_event',partial,content:[{type:'text',text:'Observed fixture answer'}],observedAt:new Date().toISOString()}}];
    if (!partial) records.push({type:'output.item.completed',payload:{turnId:op.turnId,itemId:'assistant-'+op.turnId,revision:1}});
    records.push(state==='completed'?{type:'turn.completed',payload:{turnId:op.turnId,terminalEvidence:'SIMULATED fixture terminal evidence'}}:{type:'turn.state',payload:{turnId:op.turnId,state}});
    const head=(await f.db.readSnapshot('session')).watermark.sessionSeq;
    for (const [i,record] of records.entries()) {
        const payload={...event('session',`ev-${op.turnId}-${i}`,head+i+1),...record};
        await f.db.recordEvent({eventId:payload.eventId,sessionId:'session',bridgeEpoch:payload.bridgeEpoch,producerSeq:payload.producerSeq,payload});
    }
}

test('M27 PostgreSQL migration/restart, concurrent original-key retries, changed payload and all-ingress serialization',{skip},async()=>{
    const f=await apiFixture(url);try {
        await ready(f);const a=new PublicApiService(f.db,f.auth),b=new PublicApiService(f.db,f.auth);
        const users=await Promise.all(['owner','owner'].map(t=>f.auth.authenticateUserAccessToken({verifyAccessToken:async()=>({issuer:f.owner.issuer,subject:'owner'})},t)));
        const ops=await Promise.all([a.submit(users[0],'session','same',prompt()),b.submit(users[1],'session','same',prompt())]);
        assert.equal(ops[0].operationId,ops[1].operationId);
        assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0)).length,1);
        await assert.rejects(a.submit(users[0],'session','same',{...prompt(),content:[{type:'text',text:'changed'}]}),/changed content/);
        await assert.rejects(b.submit(users[1],'session','other',prompt()),/outstanding prompt/);
        const gui=await f.request('/v2/sessions/session/turns',{command:command('session','gui')},'owner');assert.equal(gui.status,409);
        await output(f,ops[0]);
        const restarted=new PublicApiService(f.db,f.auth);const result=await restarted.operation(users[0],ops[0].operationId);
        assert.equal(result.status,'completed');assert.equal(result.result.answer,'Observed fixture answer');assert.equal(result.result.items.length,1);
        const next=await restarted.submit(users[0],'session','next',prompt());assert.notEqual(next.operationId,result.operationId);
        const stored=await f.db.readCommands(f.issued.deviceId,'prompt',0);assert.equal(stored[1].payload.payload.expectedConversationRevision,1);
        // Retention keeps retry tombstones and does not authorize replacement work.
        await f.db.pool.query("UPDATE public_operations SET expires_at=clock_timestamp()-interval '1 second' WHERE operation_id=$1",[result.operationId]);
        await assert.rejects(restarted.submit(users[0],'session','same',prompt()),/expired tombstone/);
        await f.db.migrate();assert.equal((await f.db.pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count,'9');
    } finally {await f.close();}
});

test('M27 disposable fixture restart retains original credential, operation and native command identity',{skip},async()=>{
    let f=await apiFixture(url);
    try {
        await ready(f);
        const caller=await key(f);
        const submitted=await post(f,'/sessions/session/prompts',prompt(),caller.credential,{'idempotency-key':'restart-original'});
        assert.equal(submitted.status,202);
        const original=await submitted.json(),schema=f.schema;
        await f.close({retainSchema:true});
        f=await apiFixture(url,{}, {schema});
        const replay=await post(f,'/sessions/session/prompts',prompt(),caller.credential,{'idempotency-key':'restart-original'});
        assert.equal(replay.status,202);
        const retained=await replay.json();
        assert.equal(retained.operationId,original.operationId);
        assert.equal(retained.commandId,original.commandId);
        assert.equal((await f.db.pool.query('SELECT count(*) FROM commands WHERE command_id=$1',[original.commandId])).rows[0].count,'1');
        await assert.rejects(apiFixture(url,{}, {schema:'public'}),/exact disposable/);
    } finally {await f.close();}
});

test('M27 competing caller keys, session/result isolation, hash-at-rest, key revocation and scope fences',{skip},async()=>{
    const f=await apiFixture(url);try {
        await ready(f);await ready(f,'other');const first=await key(f), second=await key(f),view=await key(f,['view']);
        const stored=await f.db.pool.query('SELECT token_hash FROM public_credentials WHERE credential_id=$1',[first.credentialId]);assert.equal(stored.rows[0].token_hash.length,64);assert.notEqual(stored.rows[0].token_hash,first.credential);
        const responses=await Promise.all([first,second].map(k=>post(f,'/sessions/session/prompts',prompt(),k.credential,{'idempotency-key':'call'})));
        assert.deepEqual(responses.map(r=>r.status).sort(),[202,409]);
        const winner=responses.findIndex(r=>r.status===202),op=await responses[winner].json(), winningKey=[first,second][winner],losingKey=[first,second][1-winner];
        assert.equal((await f.request('/v2/public/operations/'+op.operationId,undefined,losingKey.credential)).status,404);
        assert.equal((await post(f,'/sessions/other/prompts',prompt('other'),winningKey.credential,{'idempotency-key':'isolate'})).status,403);
        assert.equal((await post(f,'/sessions/session/prompts',prompt(),view.credential,{'idempotency-key':'view'})).status,403);
        assert.equal((await post(f,'/credentials',{sessionId:'session',scopes:['administer'],label:'escalate',expiresAt:new Date(Date.now()+100000).toISOString()},winningKey.credential)).status,403);
        const revoked=await post(f,'/credentials/'+winningKey.credentialId+'/revoke',{});assert.equal(revoked.status,200);
        assert.equal((await f.request('/v2/public/operations/'+op.operationId,undefined,winningKey.credential)).status,401);
        const permit=await f.request('/v2/devices/'+f.issued.deviceId+'/dispatch',{sessionId:'session',bindingRevision:1,leaseGeneration:1,commandId:op.commandId});assert.equal(permit.status,403);
        const oldCompanion=await f.request('/v2/devices/'+f.issued.deviceId+'/dispatch',{sessionId:'session',bindingRevision:1,leaseGeneration:1});assert.equal(oldCompanion.status,409);
    } finally {await f.close();}
});

test('M27 fast completion waiter rechecks durable state; rejected/uncertain acks settle without turn.started',{skip},async()=>{
    const f=await apiFixture(url);try {
        await ready(f);const waiting=post(f,'/sessions/session/prompts',prompt(),'owner',{'idempotency-key':'fast',prefer:'wait=2'});
        let op;for(let i=0;i<50;i++){const rows=await f.db.pool.query('SELECT operation_id FROM public_operations');if(rows.rowCount){const svc=new PublicApiService(f.db,f.auth);op=await svc.operation(f.owner,rows.rows[0].operation_id);break;}await new Promise(r=>setTimeout(r,10));}
        assert.ok(op);await output(f,op);const reply=await waiting;assert.equal(reply.status,200);assert.equal((await reply.json()).status,'completed');
        const reject=await post(f,'/sessions/session/prompts',prompt(),'owner',{'idempotency-key':'rejected'});const rejected=await reject.json();
        const c=(await f.db.readCommands(f.issued.deviceId,'prompt',0)).find(c=>c.commandId===rejected.commandId);
        await f.db.recordCommandAck({deviceId:c.deviceId,lane:c.lane,laneSeq:c.laneSeq,state:'rejected',payload:{sessionId:'session',details:'SIMULATED native rejection'}});
        assert.equal((await new PublicApiService(f.db,f.auth).operation(f.owner,rejected.operationId)).status,'rejected');
        const uncertainResponse=await post(f,'/sessions/session/prompts',prompt(),'owner',{'idempotency-key':'uncertain'});const uncertain=await uncertainResponse.json();
        const cmd=(await f.db.readCommands(f.issued.deviceId,'prompt',0)).find(c=>c.commandId===uncertain.commandId);
        await f.db.recordCommandAck({deviceId:cmd.deviceId,lane:cmd.lane,laneSeq:cmd.laneSeq,state:'reconciliation_required',payload:{sessionId:'session',details:'SIMULATED uncertain effect'}});
        assert.equal((await new PublicApiService(f.db,f.auth).operation(f.owner,uncertain.operationId)).status,'reconciliation_required');
        assert.equal((await post(f,'/sessions/session/prompts',prompt(),'owner',{'idempotency-key':'blind-retry'})).status,409);
    } finally {await f.close();}
});

test('M27 unsupported options rejected before admission; control retries preserve IDs and recorded/applied distinction',{skip},async()=>{
    const f=await apiFixture(url);try {
        await ready(f);
        for (const extra of [{max_tokens:20},{tools:[]},{system:'privileged'},{content:[{type:'file',attachmentId:'file',mimeType:'text/plain',filename:'x'}]}]) {
            const response=await post(f,'/sessions/session/prompts',{...prompt(),...extra},'owner',{'idempotency-key':'no-dispatch'});assert.equal(response.status,422);
        }
        assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0)).length,0);
        await assert.rejects(new PublicApiService(f.db,f.auth).submit(f.owner,"session","service-gate",{...prompt(),tools:[]}),/unsupported fields/);
        const control={type:'session.disable',commandId:'disable-once',reason:'fixture disable'};
        const responses=await Promise.all([post(f,'/sessions/session/controls',control),post(f,'/sessions/session/controls',control)]);
        for(const response of responses){assert.equal(response.status,202);const body=await response.json();assert.equal(body.nativeApplied,false);}
        assert.equal((await f.db.readCommands(f.issued.deviceId,'control',0)).length,1);
        assert.equal((await post(f,'/sessions/session/controls',{...control,reason:'changed'})).status,409);
        assert.equal((await post(f,'/sessions/session/controls',{type:'turn.cancel',commandId:'no-turn',turnId:'unknown'})).status,409);
        const profile=await f.request('/v2/public/capabilities',undefined,'owner');assert.equal((await profile.json()).profile.providerReady,false);
    } finally {await f.close();}
});

test('M27 existing GUI work blocks public admission, partial output never becomes a completed answer, and role withdrawal fences results',{skip},async()=>{
    const f=await apiFixture(url);try {
        await ready(f);const gui=command('session','first-gui');assert.equal((await f.request('/v2/sessions/session/turns',{command:gui},'owner')).status,202);
        assert.equal((await post(f,'/sessions/session/prompts',prompt(),'owner',{'idempotency-key':'public'})).status,409);
        const saved=(await f.db.readCommands(f.issued.deviceId,'prompt',0))[0];
        await f.db.recordCommandAck({deviceId:saved.deviceId,lane:'prompt',laneSeq:saved.laneSeq,state:'rejected',payload:{sessionId:'session'}});
        const response=await post(f,'/sessions/session/prompts',prompt(),'owner',{'idempotency-key':'public'});assert.equal(response.status,202);const op=await response.json();
        await output(f,op,{state:'waiting_for_approval',partial:true});const svc=new PublicApiService(f.db,f.auth),result=await svc.operation(f.owner,op.operationId);
        assert.equal(result.status,'waiting_for_approval');assert.equal(result.result.answer,null);assert.equal(result.result.items.length,0);assert.equal(result.result.partialItems.length,1);
        const operator=await f.signIn('operator');await f.auth.setSessionRole(f.owner,'session',operator.userId,'operator');
        const other=await f.request('/v2/public/operations/'+op.operationId,undefined,'operator');assert.equal(other.status,404);
        await f.auth.revokeSessionRole(f.owner,'session',operator.userId);
        assert.equal((await f.request('/v2/public/sessions/session/snapshot',undefined,'operator')).status,403);
    } finally {await f.close();}
});

test('M27 unused migration rollback is reversible and used ledgers refuse destructive rollback',{skip},async()=>{
    const {readFile}=await import('node:fs/promises');const down=await readFile(new URL('../server/migrations/rollback/008_public_operations.sql',import.meta.url),'utf8');
    const f=await apiFixture(url);try {
        const down9=await readFile(new URL('../server/migrations/rollback/009_public_conversations.sql',import.meta.url),'utf8');
        await f.db.transaction(client=>client.query(down9));
        await f.db.transaction(client=>client.query(down));assert.equal((await f.db.pool.query("SELECT to_regclass('public_operations') AS table")).rows[0].table,null);
        await f.db.migrate();await ready(f);await key(f);
        await assert.rejects(f.db.transaction(client=>client.query(down)),/rollback refuses/);
        assert.equal((await f.db.pool.query('SELECT count(*) FROM public_credentials')).rows[0].count,'1');
    } finally {await f.close();}
});

test('M27 authentication withdrawal interrupts prompt waits without creating replacement work',{skip},async()=>{
    const f=await apiFixture(url);try {
        await ready(f);const caller=await key(f);const waiting=post(f,'/sessions/session/prompts',prompt(),caller.credential,{'idempotency-key':'wait-revoke',prefer:'wait=2'});
        for(let i=0;i<50;i++){if((await f.db.pool.query('SELECT 1 FROM public_operations')).rowCount)break;await new Promise(r=>setTimeout(r,10));}
        await post(f,'/credentials/'+caller.credentialId+'/revoke',{});
        assert.ok([401,403].includes((await waiting).status),"Revocation may be observed during authentication or the final authorization recheck");
        assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0)).length,1);
    } finally {await f.close();}
});


test('M27 public addressed question/cancel and signed approval preserve exact request identities',{skip},async()=>{
    const {generateKeyPairSync}=await import('node:crypto');
    const {computeActionDigest}=await import('../protocol/dist/index.js');
    const {ApprovalEngine,verifyDecisionAssertion}=await import('../server/dist/index.js');
    const {privateKey,publicKey}=generateKeyPairSync('ed25519');
    const f=await apiFixture(url,options=>({approvalEngine:new ApprovalEngine(options.database,options.authorization,{privateKey}),decisionPublicKey:publicKey}));try {
        await ready(f);const caller=await key(f,['view','prompt','approve']);
        const submitted=await post(f,'/sessions/session/prompts',prompt(),caller.credential,{'idempotency-key':'controls'});const op=await submitted.json();
        const emit=async(type,payload)=>{const seq=(await f.db.readSnapshot('session')).watermark.sessionSeq+1;const e={...event('session','control-ev-'+seq,seq),type,payload};await f.db.recordEvent({eventId:e.eventId,sessionId:'session',bridgeEpoch:e.bridgeEpoch,producerSeq:seq,payload:e});};
        await emit('turn.started',{turnId:op.turnId,state:'running',conversationRevision:1});
        await emit('input.required',{turnId:op.turnId,requestId:'question',requestRevision:1,question:'Fixture color?',schema:{type:'string'},expiresAt:new Date(Date.now()+100000).toISOString()});
        const answer={type:'input.respond',commandId:'answer-one',turnId:op.turnId,requestId:'question',requestRevision:1,answer:'blue'};
        assert.equal((await post(f,'/sessions/session/controls',answer,caller.credential)).status,202);
        assert.equal((await post(f,'/sessions/session/controls',answer,caller.credential)).status,202);
        assert.equal((await post(f,'/sessions/session/controls',{...answer,commandId:'wrong-answer',turnId:'other-turn'},caller.credential)).status,409);
        assert.equal((await post(f,'/sessions/session/controls',{type:'turn.cancel',commandId:'cancel-one',turnId:op.turnId,reason:'fixture'},caller.credential)).status,202);
        const request={requestId:'approval',requestRevision:1,kind:'action_approval',appId:'fake.app',appInstanceId:'SIMULATED',bindingId:'b-session',sessionId:'session',nativeConversationId:'SIMULATED',bindingRevision:1,leaseGeneration:1,turnId:op.turnId,
            action:{tool:'write_file',arguments:{path:'/disposable/fixture.txt'}},requestedPermissions:[],availableDecisions:[{id:'deny',effect:'deny',scope:'action'}],evidence:{source:'native_event',complete:true},expiresAt:new Date(Date.now()+100000).toISOString()};
        const {kind,evidence,expiresAt,...digestInput}=request;request.actionDigest=await computeActionDigest(digestInput);
        await emit('approval.required',request);
        const decision={decisionId:'deny-one',requestRevision:1,actionDigest:request.actionDigest,choiceId:'deny',grantedPermissions:[],policyRevision:'fixture-policy',expiresAt:request.expiresAt};
        const response=await post(f,'/sessions/session/approvals/approval/decisions',decision,caller.credential);assert.equal(response.status,202);const stored=await response.json();assert.equal(stored.state,'decision_recorded');
        assert.equal(verifyDecisionAssertion(stored.assertion,publicKey,f.issued.deviceId).reviewerId,f.owner.userId);
        assert.equal((await post(f,'/sessions/session/approvals/approval/decisions',decision,caller.credential)).status,202);
        assert.equal((await post(f,'/sessions/session/approvals/approval/decisions',{...decision,actionDigest:'sha256:'+'0'.repeat(64)},caller.credential)).status,409);
        const pending=await f.request('/v2/public/sessions/session/commands/'+stored.commandId,undefined,caller.credential);assert.equal((await pending.json()).state,null);
        const authority=await f.db.pool.query('SELECT credential_id FROM public_command_authority WHERE command_id=$1',[stored.commandId]);assert.equal(authority.rows[0].credential_id,caller.credentialId);
    } finally {await f.close();}
});

test('M27 scoped PNG transfer checks bytes/ownership before prompt admission and exposes truthful staging status',{skip},async()=>{
    const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
    const {createHash}=await import('node:crypto');const {AttachmentService}=await import('../server/dist/index.js');const dir=await mkdtemp(join(tmpdir(),'m27-images-'));
    const f=await apiFixture(url,options=>({attachments:new AttachmentService(options.database,{rootDirectory:dir})}));try {
        await ready(f);await ready(f,'other');const caller=await key(f);
        const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');const sha256='sha256:'+createHash('sha256').update(png).digest('hex');
        const upload=await fetch(f.base+'/v2/public/attachments',{method:'POST',headers:{authorization:'Bearer '+caller.credential,'content-type':'image/png','x-session-id':'session','x-file-name':'fixture.png','x-content-sha256':sha256},body:png});assert.equal(upload.status,202);const attachment=await upload.json();
        const body={...prompt(),content:[{type:'text',text:'fixture image'},{type:'image',attachmentId:attachment.attachmentId,mimeType:'image/png'}]};
        assert.equal((await post(f,'/sessions/session/prompts',body,caller.credential,{'idempotency-key':'image'})).status,422);
        assert.equal((await post(f,'/attachments/'+attachment.attachmentId+'/commit',{sha256},caller.credential)).status,200);
        const read=await f.request('/v2/public/attachments/'+attachment.attachmentId,undefined,caller.credential);assert.deepEqual(Buffer.from(await read.arrayBuffer()),png);
        assert.equal((await post(f,'/sessions/other/prompts',{...body,model:'sdc.b-other'},'owner',{'idempotency-key':'cross-image'})).status,422);
        const op=await post(f,'/sessions/session/prompts',body,caller.credential,{'idempotency-key':'image'});assert.equal(op.status,202);assert.equal((await op.json()).status,'queued');
    } finally {await f.close();await rm(dir,{recursive:true,force:true});}
});


test('M27 caller keys cannot follow a replacement binding; an offline original operation stays observable',{skip},async()=>{
    const f=await apiFixture(url);try {
        await ready(f);const caller=await key(f);const r=await post(f,'/sessions/session/prompts',prompt(),caller.credential,{'idempotency-key':'binding-key'});const op=await r.json();
        await f.db.pool.query("UPDATE bindings SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE session_id='session'");
        const offline=await f.request('/v2/public/operations/'+op.operationId,undefined,caller.credential);assert.equal(offline.status,200);assert.equal((await offline.json()).status,'reconciliation_required');
        await f.db.pool.query("UPDATE bindings SET state='detached' WHERE session_id='session'");
        await f.db.putBinding({bindingId:'replacement',sessionId:'session',deviceId:f.issued.deviceId,bindingRevision:2,leaseGeneration:2,state:'active',payload:{conversationRevision:0,capabilities:{submit:{status:'supported'}}}});
        assert.equal((await f.request('/v2/public/sessions/session/snapshot',undefined,caller.credential)).status,403);
        assert.equal((await post(f,'/sessions/session/prompts',{...prompt(),model:'sdc.replacement'},caller.credential,{'idempotency-key':'follow-other-task'})).status,403);
        assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0)).length,1);
    } finally {await f.close();}
});


test('M27 terminal result watermark excludes later revisions and another turn output',{skip},async()=>{
    const f=await apiFixture(url);try {
        await ready(f);const service=new PublicApiService(f.db,f.auth);const op=await service.submit(f.owner,'session','terminal-freeze',prompt());await output(f,op);
        const original=await service.operation(f.owner,op.operationId),seq=original.watermark+1;
        const payload={...event('session','late-replacement',seq),type:'output.item.replaced',payload:{turnId:op.turnId,itemId:'assistant-'+op.turnId,kind:'assistant_message',revision:2,source:'native_event',partial:false,content:[{type:'text',text:'late replacement must not mutate result'}],observedAt:new Date().toISOString()}};
        await f.db.recordEvent({eventId:payload.eventId,sessionId:'session',bridgeEpoch:payload.bridgeEpoch,producerSeq:seq,payload});
        assert.deepEqual(await service.operation(f.owner,op.operationId),original);
    } finally {await f.close();}
});

test('M27 public dispatch uses binding-before-session locks and credential expiry bounds the native permit',{skip},async()=>{
    const f=await apiFixture(url);try {
        await ready(f);const caller=await key(f);const r=await post(f,'/sessions/session/prompts',prompt(),caller.credential,{'idempotency-key':'permit'});const op=await r.json();
        const until=new Date(Date.now()+6000).toISOString();await f.db.pool.query('UPDATE public_credentials SET expires_at=$2 WHERE credential_id=$1',[caller.credentialId,until]);
        const client=await f.db.pool.connect();await client.query('BEGIN');
        await client.query("SELECT binding_id FROM bindings WHERE session_id='session' FOR NO KEY UPDATE");
        const abort=new AbortController();const pending=fetch(f.base+'/v2/devices/'+f.issued.deviceId+'/dispatch',{method:'POST',headers:{authorization:'Bearer '+f.issued.credential,'content-type':'application/json'},body:JSON.stringify({sessionId:'session',bindingRevision:1,leaseGeneration:1,commandId:op.commandId}),signal:abort.signal});
        try {
            await new Promise(r=>setTimeout(r,25));
            await client.query("UPDATE sessions SET state=state WHERE session_id='session'");await client.query('COMMIT');
            const response=await pending;assert.equal(response.status,200);const reader=response.body.getReader();const frame=Buffer.from((await reader.read()).value).toString();
            const permit=JSON.parse(frame.split('data: ')[1].split('\n')[0]);assert.equal(permit.leaseExpiresAt,until);
        } finally {abort.abort();await client.query('ROLLBACK');client.release();}
    } finally {await f.close();}
});


test('M27 multiworker rate buckets reject normal floods without spending control capacity',{skip},async()=>{
    const f=await apiFixture(url);try {
        await ready(f);const caller=await key(f,['view','prompt','administer']);
        await f.db.pool.query("INSERT INTO public_request_buckets(principal_id,window_start,requests) VALUES($1,clock_timestamp(),120)",['key:'+caller.credentialId+':normal']);
        assert.equal((await f.request('/v2/public/identity',undefined,caller.credential)).status,429);
        assert.equal((await post(f,'/sessions/session/controls',{type:'session.disable',commandId:'rate-disable',reason:'fixture'},caller.credential)).status,202);
        await f.db.pool.query("UPDATE public_request_buckets SET window_start=clock_timestamp()-interval '61 seconds' WHERE principal_id=$1",['key:'+caller.credentialId+':normal']);
        assert.equal((await f.request('/v2/public/identity',undefined,caller.credential)).status,200);
    } finally {await f.close();}
});

test('M27 credential issuance acquires binding before session and survives concurrent event admission',{skip},async()=>{
    const f=await apiFixture(url);let client;try {
        await ready(f);client=await f.db.pool.connect();await client.query('BEGIN');
        await client.query("SELECT binding_id FROM bindings WHERE session_id='session' FOR NO KEY UPDATE");
        const pending=key(f);
        let waiting=false;
        for(let i=0;i<100;i++) {
            const activity=await f.db.pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT b.binding_id FROM bindings b JOIN devices d USING(device_id) WHERE b.session_id=%'");
            if(activity.rowCount){waiting=true;break;}await new Promise(r=>setTimeout(r,10));
        }
        assert.ok(waiting,'credential request must wait on binding authority before locking session');
        await client.query("SET LOCAL lock_timeout='1s'");await client.query("UPDATE sessions SET state=state WHERE session_id='session'");
        await client.query('COMMIT');assert.ok((await pending).credentialId);
    } finally {if(client){await client.query('ROLLBACK');client.release();}await f.close();}
});
