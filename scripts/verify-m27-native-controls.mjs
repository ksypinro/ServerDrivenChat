/** Developer-only bounded public HTTP checks against the graphically consented disposable task. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
const directory=process.argv[2]??'evidence/M27/reconnect-repair-run';
const gateway='http://127.0.0.1:59319/api/v1';
const deadline=Date.now()+900000,results=[];
const fixture=JSON.parse(await readFile(directory+'/fixture.json','utf8'));
let token='owner',sessionId;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function call(path,body,key,expected){
 const response=await fetch(gateway+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',...(key?{'idempotency-key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(35000)});
 const data=await response.json();
 if(expected?![].concat(expected).includes(response.status):!response.ok)throw Error(`${path}: ${response.status}: ${JSON.stringify(data)}`);
 return data;
}
async function save(status,error){await writeFile(directory+'/native-controls.json',JSON.stringify({milestone:'M27',status,sessionId,marker:fixture.marker,results,...(error?{error}:{}),scope:'Actual public gateway/native requests, acknowledgements, terminal events and exact disposable effects; synthetic identity'},null,2)+'\n');}
async function until(check){while(Date.now()<deadline){const value=await check();if(value)return value;await pause(600);}throw Error('Bounded native control deadline exceeded');}
async function submit(label,text){const op=await call('/sessions/'+sessionId+'/prompts',{model:'sdc-default',content:[{type:'text',text}],delivery:'queue'},fixture.marker+'-'+label);results.push({kind:label+'-admission',operation:op});await save('running');return op;}
async function finish(op){return until(async()=>{const current=await call('/operations/'+op.operationId);if(['rejected','failed','reconciliation_required'].includes(current.status))throw Error('Native turn failed: '+JSON.stringify(current));return ['completed','cancelled'].includes(current.status)?current:null;});}
async function interaction(op,kind){return until(async()=>{const snapshot=await call('/sessions/'+sessionId+'/snapshot');const row=snapshot.interactions.find(i=>i.state==='pending'&&i.kind===kind&&i.payload.turnId===op.turnId);return row?.payload;});}
async function receipt(commandId){return until(async()=>{const value=await call('/sessions/'+sessionId+'/commands/'+commandId);if(value.state==='rejected'||value.state==='reconciliation_required')throw Error('Native control rejected: '+JSON.stringify(value));return value.state==='applied'?value:null;});}
try{
 let live;await until(async()=>{try{live=JSON.parse(await readFile(directory+'/server-live.json','utf8'));}catch(error){if(error instanceof SyntaxError)return null;throw error;}return live.bindings.find(b=>b.state==='active');});
 sessionId=live.bindings.find(b=>b.state==='active').sessionId;
 const issued=await call('/credentials',{sessionId,scopes:['view','prompt','approve'],label:'M27 bounded native control acceptance',expiresAt:new Date(deadline).toISOString()});token=issued.credential;
 const question=await submit('question',fixture.prompts.question);
 const input=await interaction(question,'input');results.push({kind:'question-observed',request:input});
 const answer={type:'input.respond',commandId:randomUUID(),turnId:question.turnId,requestId:input.requestId,requestRevision:input.requestRevision,answer:'blue'};
 await call('/sessions/'+sessionId+'/controls',{...answer,commandId:randomUUID(),requestRevision:input.requestRevision+1},null,409);
 const recorded=await call('/sessions/'+sessionId+'/controls',answer);
 if(recorded.nativeApplied!==false)throw Error('Recording claimed native application');
 await call('/sessions/'+sessionId+'/controls',answer);
 results.push({kind:'question-applied',receipt:await receipt(answer.commandId),operation:await finish(question)});
 await save('running');
 for(const [label,choice] of [['allowed','allow_once'],['denied','deny']]){
  const path=`/private/tmp/sdc-m19-vscode-probe/${fixture.marker}-${label}.txt`;
  const text=`M27 bounded ${label} check. Call your native editor with exactly ${JSON.stringify({path,new_text:fixture.marker+'-'+label.toUpperCase()})}. Wait for native permission. If denied, do not retry or use another tool. Reply ${fixture.marker}-${label.toUpperCase()}-DONE. No shell, network, other paths or tools.`;
  const op=await submit(label,text),request=await interaction(op,'approval');
  if(!JSON.stringify(request.action).includes(path))throw Error('Native action did not address the approved disposable file');
  const decision={decisionId:randomUUID(),requestRevision:request.requestRevision,actionDigest:request.actionDigest,choiceId:choice,grantedPermissions:[],policyRevision:'m27-disposable-acceptance',expiresAt:new Date(Math.min(Date.parse(request.expiresAt),Date.now()+120000)).toISOString()};
  await call('/sessions/'+sessionId+'/approvals/'+encodeURIComponent(request.requestId)+'/decisions',{...decision,actionDigest:'sha256:'+'0'.repeat(64)},null,[400,409]);
  const response=await call('/sessions/'+sessionId+'/approvals/'+encodeURIComponent(request.requestId)+'/decisions',decision);
  const duplicate=await call('/sessions/'+sessionId+'/approvals/'+encodeURIComponent(request.requestId)+'/decisions',decision);
  if(response.commandId!==duplicate.commandId)throw Error('Approval retry created replacement');
  const ack=await receipt(response.commandId),done=await finish(op);
  let effect=null;try{effect=await readFile(path,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(choice==='allow_once'?effect!==fixture.marker+'-ALLOWED':effect!==null)throw Error('Native effect violated exact allow/deny');
  results.push({kind:label+'-verified',request,decision:{...decision,assertionSha256:response.assertion?'sha256:'+createHash('sha256').update(response.assertion).digest('hex'):undefined},receipt:ack,operation:done,effect});
  await save('running');
 }
 const stop=await submit('cancel',fixture.prompts.stop),pending=await interaction(stop,'input');
 const cancel={type:'turn.cancel',commandId:randomUUID(),turnId:stop.turnId,reason:'Approved bounded M27 native cancellation'};
 const recordedCancel=await call('/sessions/'+sessionId+'/controls',cancel);if(recordedCancel.nativeApplied!==false)throw Error('Recorded cancel claimed native application');
 await call('/sessions/'+sessionId+'/controls',cancel);
 const done=await finish(stop);if(done.status!=='cancelled')throw Error('Native turn did not emit cancellation');
 results.push({kind:'cancel-verified',pending,receipt:await receipt(cancel.commandId),operation:done});
 await call('/sessions/'+sessionId+'/controls',{type:'input.respond',commandId:randomUUID(),turnId:stop.turnId,requestId:pending.requestId,requestRevision:pending.requestRevision,answer:'continue'},null,409);
 await save('passed');console.log('M27 native question, exact allow/deny effects, stale identities, original control retries and addressed cancellation passed.');
}catch(error){await save('failed',error.message);console.error(error.message);process.exitCode=1;}
