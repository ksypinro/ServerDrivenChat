import assert from 'node:assert/strict';
import test from 'node:test';
import {ConversationService,estimateText,composeRequest,parseCallerReply,validateGenerationRequest} from '../server/dist/index.js';
import {apiFixture,event} from './helpers/api-fixture.mjs';
const url=process.env.M27_TEST_DATABASE_URL,skip=!url&&'requires disposable PostgreSQL';
const request=(extra={})=>({model:'sdc-default',sessionId:'session',history:[{role:'user',content:'Remember alpha'}],instructions:'Be brief',contextMode:'exclusive',tools:[],toolChoice:'auto',parallelTools:false,budget:{inputUnits:32768,outputUnits:8192,deadlineSeconds:600},background:false,...extra});
const tool={name:'lookup',schema:{type:'object',properties:{key:{type:'string'}},required:['key'],additionalProperties:false},strict:true};
async function ready(f){await f.bind('session');await f.db.pool.query("UPDATE bindings SET payload=$1::jsonb",[JSON.stringify({conversationRevision:0,capabilities:{submit:{status:'supported'},cancel:{status:'supported'}}})]);}
async function simulatedToolFence(f){await f.db.pool.query("UPDATE bindings SET payload=jsonb_set(payload,'{capabilityReport}', $1::jsonb)",[JSON.stringify({effectPolicies:{nativeToolsDenied:{status:'supported',reason:'SIMULATED exact turn denial'}}})]);}
async function emit(f,gen,type,payload){const n=(await f.db.readSnapshot('session')).watermark.sessionSeq+1;const e={...event('session','policy-'+n,n),type,payload:{turnId:(await f.db.pool.query('SELECT turn_id FROM public_operations WHERE operation_id=$1',[gen.generationId])).rows[0].turn_id,...payload}};await f.db.recordEvent({eventId:e.eventId,sessionId:'session',bridgeEpoch:e.bridgeEpoch,producerSeq:n,payload:e});}
async function answer(f,gen,text,revision=1,terminal=true){await emit(f,gen,'turn.started',{state:'running',conversationRevision:revision});await emit(f,gen,'output.item.created',{itemId:'a-'+gen.generationId,kind:'assistant_message',revision:1,source:'native_event',nativeCategory:'completion_result',partial:!terminal,content:[{type:'text',text}],observedAt:new Date().toISOString()});if(terminal){await emit(f,gen,'output.item.completed',{itemId:'a-'+gen.generationId,revision:1});await emit(f,gen,'turn.completed',{terminalEvidence:'SIMULATED backend completion'});}}

test('M27 estimator, Unicode quotas and caller-envelope validation never repair or invent calls',()=>{
 assert.equal(estimateText('😀é中a'),1);assert.equal(estimateText('😀é中ab'),2);
 const r=validateGenerationRequest(request({tools:[tool],toolChoice:'required'}));
 const valid=parseCallerReply('{"version":"sdc-tool-v1","text":"","calls":[{"name":"lookup","arguments":{"key":"x"}}]}',r,i=>'call-'+i);assert.equal(valid.calls[0].callId,'call-0');
 const parallelReply='{"version":"sdc-tool-v1","text":"","calls":[{"name":"lookup","arguments":{"key":"x"}},{"name":"lookup","arguments":{"key":"y"}}]}';
 assert.throws(()=>parseCallerReply(parallelReply,r,i=>'call-'+i),/Backend/);
 const parallelRequest=validateGenerationRequest(request({tools:[tool],toolChoice:'required',parallelTools:true}));
 assert.deepEqual(parseCallerReply(parallelReply,parallelRequest,i=>'call-'+i).calls.map(call=>call.callId),['call-0','call-1']);
 for(const text of ['```json\n{}\n```','{"version":"sdc-tool-v1","text":"none","calls":[]}','{"version":"sdc-tool-v1","text":"","calls":[{"name":"lookup","arguments":{"key":3}}]}','{"version":"sdc-tool-v1","text":"","calls":[{"name":"unknown","arguments":{}}]}'])assert.throws(()=>parseCallerReply(text,r,()=>''),/Backend/);
 assert.throws(()=>validateGenerationRequest(request({tools:[{...tool,schema:{type:'object',$ref:'https://bad.test/schema'}}]})),/References/);
 assert.throws(()=>validateGenerationRequest({...request(),temperature:0.1}),/unsupported/);
 assert.ok(composeRequest(r).text.includes('SDC_REQUEST_JSON='));
 assert.doesNotThrow(()=>validateGenerationRequest(request({tools:[{...tool,schema:{type:'object',properties:{pattern:{type:'string'}},additionalProperties:false}}]})));
 assert.throws(()=>validateGenerationRequest(request({tools:[{...tool,schema:{type:'object',properties:{key:{type:'string',pattern:'^(a+)+$'}}}}]})),/regular expressions/);
});

test('M27 server contexts persist across restart; retries, two callers, history edit and backend changes are fenced',{skip},async()=>{
 const f=await apiFixture(url);try{await ready(f);let s=new ConversationService(f.db,f.auth);const r=request();const [a,b]=await Promise.all([s.generate(f.owner,'same',r),s.generate(f.owner,'same',r)]);assert.equal(a.generationId,b.generationId);assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0)).length,1);
 await answer(f,a,'alpha');s=new ConversationService(f.db,f.auth);const done=await s.generation(f.owner,a.generationId);assert.equal(done.result.text,'alpha');assert.equal(done.result.usage.source,'estimated');assert.equal(done.result.usage.hiddenNativeContext,'unknown');
 const context=await s.conversation(f.owner,a.conversationId);assert.equal(context.version,1);assert.deepEqual(context.history,[...r.history,{role:'assistant',content:'alpha'}]);
 await assert.rejects(s.generate(f.owner,'other',request()),/independent API history/);
 await assert.rejects(s.generate(f.owner,'edit',request({conversationId:a.conversationId,history:[{role:'user',content:'edited'}]})),/rewind/);
 const nextReq=request({history:[...context.history,{role:'user',content:'Recall'}]});const next=await s.generate(f.owner,'next',nextReq);await answer(f,next,'alpha again',2);await s.generation(f.owner,next.generationId);
 assert.equal((await s.generate(f.owner,'same',r)).generationId,a.generationId);
 await f.db.pool.query("UPDATE bindings SET payload=jsonb_set(payload,'{conversationRevision}','3')");
 await assert.rejects(s.generate(f.owner,'native-edit',request({conversationId:a.conversationId,history:[...(await s.conversation(f.owner,a.conversationId)).history,{role:'user',content:'new'}]})),/outside/);
 const operator=await f.signIn('operator');await f.auth.setSessionRole(f.owner,'session',operator.userId,'operator');await assert.rejects(s.conversation(operator,a.conversationId),/does not exist/);
 assert.equal((await f.db.pool.query('SELECT count(*) FROM public_history_versions')).rows[0].count,'2');
 }finally{await f.close();}
});

test('M27 caller tool profile needs qualified permissions; stable calls/results are immutable and caller/native activity separate',{skip},async()=>{
 const f=await apiFixture(url);try{await ready(f);const r=request({tools:[tool],toolChoice:'required'});const unqualified=new ConversationService(f.db,f.auth);await assert.rejects(unqualified.generate(f.owner,'unsafe',r),/reviewed native/);assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0)).length,0);
 await simulatedToolFence(f);const s=new ConversationService(f.db,f.auth,[{bindingId:'b-session',evidence:'SIMULATED parser policy qualification, not native evidence'}]);const a=await s.generate(f.owner,'tools',r);
 assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0))[0].payload.payload.nativeToolPolicy,'deny');
 await answer(f,a,JSON.stringify({version:'sdc-tool-v1',text:'',calls:[{name:'lookup',arguments:{key:'alpha'}}]}));const result=await s.generation(f.owner,a.generationId);assert.equal(result.result.calls.length,1);const call=result.result.calls[0];
 const history=(await s.conversation(f.owner,a.conversationId)).history;
 await assert.rejects(s.generate(f.owner,'missing',request({conversationId:a.conversationId,history:[...history,{role:'user',content:'go'}]})),/Every pending/);
 await assert.rejects(s.generate(f.owner,'foreign',request({conversationId:a.conversationId,history:[...history,{role:'tool',callId:'foreign',content:'x'}]})),/foreign/);
 const nextReq=request({conversationId:a.conversationId,history:[...history,{role:'tool',callId:call.callId,content:'found alpha'}]});const next=await s.generate(f.owner,'result',nextReq);assert.equal((await s.generate(f.owner,'result',nextReq)).generationId,next.generationId);
 assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0))[1].payload.payload.nativeToolPolicy,'deny');
 await answer(f,next,'ack',2);await s.generation(f.owner,next.generationId);
 assert.equal((await f.db.pool.query('SELECT result FROM public_caller_tools')).rows[0].result,'found alpha');
 const newHistory=(await s.conversation(f.owner,a.conversationId)).history;
 await assert.rejects(s.generate(f.owner,'changed-result',request({conversationId:a.conversationId,history:[...newHistory,{role:'tool',callId:call.callId,content:'changed'}]})),/immutable/);
 }finally{await f.close();}
});

test('M30 caller proposals fail closed when the same native turn contains tool activity',{skip},async()=>{
 const f=await apiFixture(url);try{
  await ready(f);await simulatedToolFence(f);
  const s=new ConversationService(f.db,f.auth,[{bindingId:'b-session',evidence:'SIMULATED permission configuration only'}]);
  const generation=await s.generate(f.owner,'tool-activity',request({tools:[tool],toolChoice:'required'}));
  await emit(f,generation,'turn.started',{state:'running',conversationRevision:1});
  await emit(f,generation,'output.item.created',{itemId:'native-tool-'+generation.generationId,kind:'tool_activity',revision:1,
   source:'native_event',nativeCategory:'tool',partial:false,content:[{type:'text',text:'native write attempted'}],observedAt:new Date().toISOString()});
  await emit(f,generation,'output.item.completed',{itemId:'native-tool-'+generation.generationId,revision:1});
  await emit(f,generation,'output.item.created',{itemId:'assistant-'+generation.generationId,kind:'assistant_message',revision:1,
   source:'native_event',nativeCategory:'completion_result',partial:false,content:[{type:'text',text:JSON.stringify({version:'sdc-tool-v1',text:'',calls:[{name:'lookup',arguments:{key:'alpha'}}]})}],observedAt:new Date().toISOString()});
  await emit(f,generation,'output.item.completed',{itemId:'assistant-'+generation.generationId,revision:1});
  await emit(f,generation,'turn.completed',{terminalEvidence:'SIMULATED backend completion'});
  const completed=await s.generation(f.owner,generation.generationId);
  assert.equal(completed.result.status,'failed');
  assert.equal(completed.result.error.code,'NATIVE_TOOL_ACTIVITY');
  assert.deepEqual(completed.result.calls,[]);
  assert.equal((await f.db.pool.query('SELECT count(*) FROM public_caller_tools')).rows[0].count,'0');
 }finally{await f.close();}
});
test('M30 addressed caller-result continuation retains native tool denial and fails closed on native activity',{skip},async()=>{
 const f=await apiFixture(url);try{
  await ready(f);await simulatedToolFence(f);
  const s=new ConversationService(f.db,f.auth,[{bindingId:'b-session',evidence:'SIMULATED operator review'}]);
  const proposal=await s.generate(f.owner,'proposal',request({tools:[tool],toolChoice:'required'}));
  await answer(f,proposal,JSON.stringify({version:'sdc-tool-v1',text:'',calls:[{name:'lookup',arguments:{key:'alpha'}}]}));
  const proposed=await s.generation(f.owner,proposal.generationId);
  const history=(await s.conversation(f.owner,proposal.conversationId)).history;
  const continuation=await s.generate(f.owner,'addressed',request({conversationId:proposal.conversationId,
   history:[...history,{role:'tool',callId:proposed.result.calls[0].callId,content:'found alpha'}]}));
  assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0))[1].payload.payload.nativeToolPolicy,'deny');
  await emit(f,continuation,'turn.started',{state:'running',conversationRevision:2});
  await emit(f,continuation,'output.item.created',{itemId:'native-tool-'+continuation.generationId,kind:'tool_activity',revision:1,
   source:'native_event',nativeCategory:'tool',partial:false,content:[{type:'text',text:'native write attempted'}],observedAt:new Date().toISOString()});
  await emit(f,continuation,'output.item.completed',{itemId:'native-tool-'+continuation.generationId,revision:1});
  await emit(f,continuation,'output.item.created',{itemId:'assistant-'+continuation.generationId,kind:'assistant_message',revision:1,
   source:'native_event',nativeCategory:'completion_result',partial:false,content:[{type:'text',text:'unsafe continuation'}],observedAt:new Date().toISOString()});
  await emit(f,continuation,'output.item.completed',{itemId:'assistant-'+continuation.generationId,revision:1});
  await emit(f,continuation,'turn.completed',{terminalEvidence:'SIMULATED backend completion'});
  const result=await s.generation(f.owner,continuation.generationId);
  assert.equal(result.result.status,'failed');assert.equal(result.result.error.code,'NATIVE_TOOL_ACTIVITY');
  assert.equal((await s.conversation(f.owner,proposal.conversationId)).version,1);
 }finally{await f.close();}
});
test('M30 caller-tools-ready capability needs both operator policy and native denial evidence',{skip},async()=>{
 const f=await apiFixture(url,{publicApiToolBindings:[{bindingId:'b-session',evidence:'SIMULATED operator review'}]});try{
  await ready(f);
  const before=await f.request('/v2/public/sessions/session/capabilities',undefined,'owner');
  assert.equal(before.status,200);assert.equal((await before.json()).serverPolicy.callerToolsReady,false);
  await simulatedToolFence(f);
  const after=await f.request('/v2/public/sessions/session/capabilities',undefined,'owner');
  assert.equal(after.status,200);assert.equal((await after.json()).serverPolicy.callerToolsReady,true);
  await f.db.pool.query("UPDATE bindings SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE binding_id='b-session'");
  const expired=await f.request('/v2/public/sessions/session/capabilities',undefined,'owner');
  assert.equal(expired.status,200);assert.equal((await expired.json()).serverPolicy.callerToolsReady,false);
 }finally{await f.close();}
});

test('M27 quota settles public response, cancels once, preserves Unicode and holds native lane until actual settlement',{skip},async()=>{
 const f=await apiFixture(url);try{await ready(f);const s=new ConversationService(f.db,f.auth);const a=await s.generate(f.owner,'quota',request({background:true,budget:{inputUnits:32768,outputUnits:1,deadlineSeconds:600}}));await answer(f,a,'😀😀😀😀😀',1,false);
 const done=await s.generation(f.owner,a.generationId);assert.equal(done.result.status,'incomplete');assert.equal(done.backendStatus,'running');assert.equal(done.result.text,'😀😀😀😀');assert.equal(done.result.usage.outputUnits,1);assert.equal(done.result.usage.observedOutputUnits,2);
 await s.generation(f.owner,a.generationId);assert.equal((await f.db.readCommands(f.issued.deviceId,'control',0)).length,1);
 await assert.rejects(s.submit(f.owner,'session','lane-held',{model:'sdc-default',content:[{type:'text',text:'x'}],delivery:'queue'}),/outstanding/);
 await emit(f,a,'turn.cancelled',{evidence:'SIMULATED native cancelled'});const final=await s.generation(f.owner,a.generationId);assert.equal(final.backendStatus,'cancelled');assert.deepEqual(final.result,done.result);
 assert.equal((await s.submit(f.owner,'session','after-stop',{model:'sdc-default',content:[{type:'text',text:'x'}],delivery:'queue'})).status,'queued');
 }finally{await f.close();}
});

test('M27 background reconciliation survives disconnect; deadline commits without pretending queued native cancellation',{skip},async()=>{
 const f=await apiFixture(url);try{await ready(f);const s=new ConversationService(f.db,f.auth);const a=await s.generate(f.owner,'deadline',request({background:true}));await f.db.pool.query("UPDATE public_generations SET deadline_at=clock_timestamp()-interval '1 second'");await new ConversationService(f.db,f.auth).reconcile();const done=await s.generation(f.owner,a.generationId);assert.equal(done.result.outcome,'deadline');assert.equal(done.backendStatus,'queued');assert.equal((await f.db.readCommands(f.issued.deviceId,'control',0)).length,0);
 await answer(f,a,'late',1,false);await s.reconcile();assert.equal((await f.db.readCommands(f.issued.deviceId,'control',0)).length,1);assert.equal((await s.generation(f.owner,a.generationId)).result.outcome,'deadline');
 }finally{await f.close();}
});

test('M27 queued background cancellation is durable, permission withdrawal stops workers and unused rollback is guarded',{skip},async()=>{
 const f=await apiFixture(url);try{await ready(f);const s=new ConversationService(f.db,f.auth);const a=await s.generate(f.owner,'cancel-queued',request({background:true}));assert.equal((await s.cancel(f.owner,a.generationId)).backendStatus,'queued');assert.equal((await f.db.pool.query('SELECT cancellation_requested FROM public_generations')).rows[0].cancellation_requested,true);
 await answer(f,a,'waiting',1,false);await s.reconcile();assert.equal((await f.db.readCommands(f.issued.deviceId,'control',0)).length,1);
 const {readFile}=await import('node:fs/promises');const down=await readFile(new URL('../server/migrations/rollback/009_public_conversations.sql',import.meta.url),'utf8');await assert.rejects(f.db.transaction(c=>c.query(down)),/retained/);
 }finally{await f.close();}
});

test('M27 failure between native command and context commits rolls back admission; original key remains safely retryable',{skip},async()=>{
 const f=await apiFixture(url);try{await ready(f);const transaction=f.db.transaction.bind(f.db);let inject=true;
 f.db.transaction=work=>transaction(async client=>{
  const query=client.query.bind(client);
  client.query=(...args)=>{if(inject&&typeof args[0]==='string'&&args[0].startsWith('INSERT INTO public_generations')){inject=false;throw Error('SIMULATED context commit crash');}return query(...args);};
  try{return await work(client);}finally{client.query=query;}
 });
 const s=new ConversationService(f.db,f.auth);await assert.rejects(s.generate(f.owner,'crash',request()),/commit crash/);
 for(const table of ['commands','public_operations','public_conversations','public_generations'])assert.equal((await f.db.pool.query('SELECT count(*) FROM '+table)).rows[0].count,'0');
 const retry=await s.generate(f.owner,'crash',request());assert.equal(retry.status,'queued');assert.equal((await f.db.readCommands(f.issued.deviceId,'prompt',0)).length,1);
 }finally{await f.close();}
});

test('M27 revoked original caller key cannot be resurrected by durable server reconciliation',{skip},async()=>{
 const f=await apiFixture(url);try{await ready(f);const service=new ConversationService(f.db,f.auth);const issued=await service.issueCredential(f.owner,{sessionId:'session',scopes:['view','prompt'],label:'worker test',expiresAt:new Date(Date.now()+300000).toISOString()});const caller=await f.auth.authenticatePublicCredential(issued.credential);
 const generation=await service.generate(caller,'worker',request({background:true}));await service.revokeCredential(f.owner,issued.credentialId);
 await answer(f,generation,'late fixture');await service.reconcile();assert.equal((await f.db.pool.query('SELECT result FROM public_generations')).rows[0].result,null);
 await assert.rejects(f.auth.authenticateStoredPublicOperation(generation.generationId),/revoked/);await assert.rejects(service.generation(caller,generation.generationId),/permission denied/);
 }finally{await f.close();}
});
