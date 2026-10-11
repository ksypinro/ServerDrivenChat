/** Developer-only bounded loopback fixture. Real PostgreSQL/HTTP/SSE; synthetic identity provider, no LLM runtime. */
import {createServer} from 'node:http';
import {randomUUID,randomBytes,generateKeyPairSync,createHash,verify} from 'node:crypto';
import {writeFile,mkdir,readFile,rename} from 'node:fs/promises';
import {ApprovalEngine, ConversationService,AttachmentService} from '../server/dist/index.js';
import {apiFixture} from '../tests/helpers/api-fixture.mjs';
const databaseUrl=process.env.M27_TEST_DATABASE_URL;
if(!databaseUrl)throw Error('Set M27_TEST_DATABASE_URL to the disposable loopback PostgreSQL service');
const evidenceDirectory=process.argv[2]??'evidence/M27/server-owned-run';await mkdir(evidenceDirectory,{recursive:true});
const marker='M27-'+randomUUID().slice(0,8),attempts=new Map(), keys=generateKeyPairSync('ed25519');let fixture,closed=false,retainSchema=false;const results=[];
const disposableToolCandidates=[];
process.on('SIGINT',()=>{closed=true;});process.on('SIGTERM',()=>{closed=true;});
process.on('SIGUSR1',()=>{retainSchema=true;closed=true;});
const save=async(status,extra={})=>{await writeFile(`${evidenceDirectory}/server-live.json.tmp`,JSON.stringify({milestone:'M27',status,marker,identityProvider:'Synthetic disposable loopback identity; no live OIDC realm claimed',results,...extra},null,2)+'\n');await rename(`${evidenceDirectory}/server-live.json.tmp`,`${evidenceDirectory}/server-live.json`);};
const identity=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  const state=req.method==='POST'?new URLSearchParams(await body(req)).get('state'):url.searchParams.get('state');
  const attempt=attempts.get(state);
  if(!attempt||attempt.expiresAt<Date.now()){res.writeHead(400).end('Expired test sign-in');return;}
  if(req.method==='GET'){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",'cache-control':'no-store'}).end(`<!doctype html><title>M27 disposable sign-in</title><style>body{font:20px system-ui;max-width:720px;margin:80px auto}button{font-size:20px;padding:12px}</style><h1>M27 disposable sign-in</h1><p>This test identity is limited to the local PostgreSQL acceptance fixture. No real account or password is used.</p><form method="post"><input type="hidden" name="state" value="${state}"><button>Continue as disposable test owner</button></form>`);return;
  }
  const callback=new URL(attempt.redirectUri);callback.searchParams.set('state',state);callback.searchParams.set('code',attempt.code);
  // A form-action 'self' policy also checks redirects. Use an explicit user
  // navigation for the already validated extension callback instead.
  const href=callback.toString().replaceAll('&','&amp;').replaceAll('"','&quot;');
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'",'cache-control':'no-store'}).end(`<!doctype html><title>M27 sign-in approved</title><style>body{font:20px system-ui;max-width:720px;margin:80px auto}a{display:inline-block;padding:12px}</style><h1>M27 sign-in approved</h1><p>Return to the isolated VS Code task to complete local pairing.</p><a href="${href}">Return to VS Code</a>`);
 }catch{res.writeHead(400).end('Test sign-in failed');}
});
await new Promise((resolve,reject)=>{identity.once('error',reject);identity.listen(0,'127.0.0.1',resolve);});
try{
 fixture=await apiFixture(databaseUrl,({provider,database,authorization})=>{
  provider.createAuthorizationRequest=async redirectUri=>{
   const uri=new URL(redirectUri);
   if(!(uri.origin===fixture?.base&&uri.pathname==='/'&&!uri.search&&!uri.hash)&&!(['vscode:','vscode-insiders:'].includes(uri.protocol)&&uri.host==='server-driven-chat.sdc-cline-bridge'&&uri.pathname==='/auth'))throw Error('Test callback is not the exact extension URI');
   const state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),codeVerifier=randomBytes(32).toString('base64url');
   attempts.set(state,{redirectUri,nonce,codeVerifier,code:randomBytes(32).toString('base64url'),expiresAt:Date.now()+300000});
   return {state,nonce,codeVerifier,authorizationUrl:`http://127.0.0.1:${identity.address().port}/authorize?state=${state}`};
  };
  provider.exchangeAuthorizationCode=async(code,redirectUri,state,nonce,verifier)=>{
   const attempt=attempts.get(state);attempts.delete(state);
   if(!attempt||attempt.code!==code||attempt.redirectUri!==redirectUri||attempt.nonce!==nonce||attempt.codeVerifier!==verifier||attempt.expiresAt<Date.now())throw Error('Invalid one-time test authorization');
   return {idToken:'owner',accessToken:'owner',expiresAt:Date.now()+3600000};
  };
  return {fixturePort:Number(process.env.SDC_NATIVE_TEST_PORT ?? 0),approvalEngine:new ApprovalEngine(database,authorization,{privateKey:keys.privateKey}),decisionPublicKey:keys.publicKey,attachments:new AttachmentService(database,{rootDirectory:'/private/tmp/sdc-m27-native-attachments'}),publicApiToolBindings:disposableToolCandidates};
 },{schema:process.env.SDC_NATIVE_RECOVERY_SCHEMA});
 const prompts={
  first:`M27 server instruction. Remember marker ${marker}. Reply exactly ${marker}-FIRST-OK. Do not use tools or change files.`,
  continuity:'M27 server follow-up. Recall the marker from the previous server instruction and reply with that marker followed by -CONTINUITY-OK. Do not use tools or change files.',
  allow:`Use your native write_file tool to create /private/tmp/sdc-m19-vscode-probe/${marker}-allowed.txt containing exactly ${marker}-ALLOWED. Wait for native permission. Do not use shell, network or other file paths. Afterward reply ${marker}-ALLOW-DONE.`,
  deny:`Use your native write_file tool to create /private/tmp/sdc-m19-vscode-probe/${marker}-denied.txt containing exactly ${marker}-DENIED. Wait for native permission. If rejected, do not retry, do not use another tool, and reply ${marker}-DENY-DONE. No shell, network or other paths.`,
  question:`Use your native ask_question tool to ask "M27 ${marker}: choose a label" with options blue and green. Wait for the answer. Then reply with the answer followed by ${marker}-QUESTION-DONE. No other tools, shell, network or files.`,
  stop:`Use your native ask_question tool to ask "M27 ${marker}: wait for cancellation" with options wait and continue. Wait for its answer before doing anything else. Do not use other tools, files, shell, or network. This turn will be cancelled while blocked on that question.`,
  takeover:`Local takeover ${marker}. Reply exactly ${marker}-LOCAL-OK. No tools, shell, network or files.`
 };
 await writeFile(`${evidenceDirectory}/fixture.json`,JSON.stringify({serverOrigin:fixture.base,identityOrigin:`http://127.0.0.1:${identity.address().port}`,profileId:'default',schema:fixture.schema,marker,scope:'Disposable real native workflow; graphical server prompts and controls; two exact file actions, one allowed and one denied; blue clarification, addressed stop, bounded SSE drop and local takeover',prompts},null,2)+'\n');
 const nativeService=new ConversationService(fixture.db,fixture.auth); let publicRun,publicNext,acceptanceFailure;
 const network=[];let fault=false,firstIdleAt,previousSummary;
 fixture.server.on('request',(req,res)=>{
  const path=new URL(req.url,fixture.base).pathname;
  if(path.match(/^\/v2\/devices\/[^/]+\/(commands|lease\/renew|dispatch|decision-assertions\/consume)/)) {
   const entry={observedAt:new Date().toISOString(),method:req.method,path};network.push(entry);
   res.once('finish',()=>{entry.statusCode=res.statusCode;});
  }
 });
 console.log(`M27 real API/control UI ready: ${fixture.base}; configure default with prompts/questions/approvals/cancel graphically.`);
 await save('awaiting-native-connect');
 while(!closed){
  const rows=await fixture.db.pool.query("SELECT binding_id,session_id,state,payload,lease_expires_at FROM bindings WHERE payload->'binding'->>'appId'='cline.vscode' ORDER BY created_at");
  const bindings=rows.rows.map(r=>({bindingId:r.binding_id,sessionId:r.session_id,state:r.state,payload:r.payload,leaseExpiresAt:r.lease_expires_at}));
  const active=bindings.find(b=>b.state==='active' && new Date(b.leaseExpiresAt).getTime()>Date.now());
  if(process.env.SDC_M30_NATIVE_TOOL_CANDIDATE==='1' && active && !disposableToolCandidates.some(entry=>entry.bindingId===active.bindingId) && active.payload?.capabilityReport?.effectPolicies?.nativeToolsDenied?.status==='supported'){
   disposableToolCandidates.push({bindingId:active.bindingId,evidence:'Disposable M30 candidate under exact API 1.3 native-denial acceptance; not production qualification'});
   console.log(`M30 disposable caller-tool candidate enabled for exact binding ${active.bindingId}; native effect verification remains required.`);
  }
  if(active && !publicRun && !process.env.SDC_NATIVE_MANUAL_ACCEPTANCE){
   const issuedKey=await nativeService.issueCredential(fixture.owner,{sessionId:active.sessionId,scopes:['view','prompt','approve'],label:'M27 disposable native acceptance',expiresAt:new Date(Date.now()+900000).toISOString()});
   const principal=await fixture.auth.authenticatePublicCredential(issuedKey.credential);
   const request={model:'sdc-default',history:[{role:'user',content:`Remember marker ${marker}. Reply exactly ${marker}-API-OK. Do not use tools, files, shell or network.`}],instructions:'Follow the current caller request. Return only the requested text.',contextMode:'shared-task',tools:[],toolChoice:'auto',parallelTools:false,budget:{inputUnits:32768,outputUnits:1024,deadlineSeconds:300},background:true};
   const response=await fetch(fixture.base+'/v2/public/generations',{method:'POST',headers:{authorization:'Bearer '+issuedKey.credential,'content-type':'application/json','idempotency-key':marker+'-first'},body:JSON.stringify(request)});
   const generation=await response.json();
   if(response.status!==202)throw Error('Public native admission failed: '+JSON.stringify(generation));
   publicRun={principal,request,generation}; results.push({kind:'public-api-admission',status:response.status,generation});
  }
  if(publicRun && !publicNext){
   const generation=await nativeService.generation(publicRun.principal,publicRun.generation.generationId);
   if(generation.result){
    results.push({kind:'public-api-result',generation});
    if(generation.result.status!=='completed'||!generation.result.text.includes(marker+'-API-OK')){
     acceptanceFailure='Native API text response did not satisfy marker';
     publicNext={done:true};
     console.error(acceptanceFailure+'; keeping the approved connection available for diagnosis.');
    }else{
    const context=await nativeService.conversation(publicRun.principal,generation.conversationId);
    const next=await nativeService.generate(publicRun.principal,marker+'-next',{...publicRun.request,conversationId:generation.conversationId,history:[...context.history,{role:'user',content:'Recall the marker from the server history and return it followed by -CONTEXT-OK. No tools.'}]});
    publicNext={generation:next}; results.push({kind:'public-context-admission',generation:next});
    }
   }
  }
  if(publicNext && !publicNext.done){
   const generation=await nativeService.generation(publicRun.principal,publicNext.generation.generationId);
   if(generation.result){
    publicNext.done=true;
    if(generation.result.status!=='completed'||!generation.result.text.includes(marker+'-CONTEXT-OK')){
     acceptanceFailure='Native server context response did not satisfy marker';
     results.push({kind:'public-context-failed',generation});
     console.error(acceptanceFailure+'; keeping the approved connection available for diagnosis.');
    }else{results.push({kind:'public-context-result',generation});console.log('M27 real public API and server context I/O passed. Controls/authority acceptance remains.');}
   }
  }
  const sessions=bindings.map(r=>r.sessionId);
  const events=(await fixture.db.pool.query('SELECT payload FROM events WHERE session_id=ANY($1) ORDER BY created_at,session_seq',[sessions])).rows.map(r=>r.payload);
  const commands=(await fixture.db.pool.query('SELECT payload FROM commands WHERE session_id=ANY($1) ORDER BY created_at',[sessions])).rows.map(r=>{const c=r.payload;if(c.payload.assertion){const {assertion,...payload}=c.payload;return {...c,payload,assertionSha256:'sha256:'+createHash('sha256').update(assertion).digest('hex')};}return c;});
  const decisions=(await fixture.db.pool.query('SELECT payload FROM decisions WHERE session_id=ANY($1) ORDER BY created_at',[sessions])).rows.map(r=>{const {assertion,...publicData}=r.payload;const [,body,signature]=assertion.split('.');return {...publicData,assertionSha256:'sha256:'+createHash('sha256').update(assertion).digest('hex'),signatureVerified:verify(null,Buffer.from(body),keys.publicKey,Buffer.from(signature,'base64url'))};});
  const interactions=(await fixture.db.pool.query('SELECT request_id,request_revision,kind,state,payload FROM interactions WHERE session_id=ANY($1) ORDER BY created_at',[sessions])).rows;
  const acknowledgements=(await fixture.db.pool.query('SELECT c.command_id,a.state,a.payload FROM command_acknowledgements a JOIN commands c USING(device_id,lane,lane_seq) WHERE c.session_id=ANY($1)',[sessions])).rows;
  const text=events.filter(e=>['output.item.created','output.item.replaced'].includes(e.type)&&e.payload.kind==='assistant_message').map(e=>e.payload.content.map(c=>c.text??'').join('')).join('\n');
  if(!fault&&text.includes(marker+'-CONTINUITY-OK')){
   firstIdleAt??=Date.now();
   if(Date.now()-firstIdleAt>22000){network.push({kind:'developer-sse-drop',observedAt:new Date().toISOString(),scope:'Accepted server remains listening; terminate current loopback connections once'});fixture.server.closeAllConnections();fault=true;console.log('M27 bounded SSE drop completed; verify reconnect, then approval flow.');}
  }
  const effects={};for(const suffix of ['allowed','denied']){
   try{effects[suffix]=await readFile(`/private/tmp/sdc-m19-vscode-probe/${marker}-${suffix}.txt`,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;effects[suffix]=null;}
  }
  const summary=`bindings=${bindings.length}; commands=${commands.length}; decisions=${decisions.length}; pending=${interactions.filter(i=>i.state==='pending').length}; terminals=${events.filter(e=>['turn.completed','turn.cancelled'].includes(e.type)).length}; detached=${bindings.filter(b=>b.state==='detached').length}`;
  if(summary!==previousSummary){console.log(summary);previousSummary=summary;}
  await save(acceptanceFailure?'acceptance-failed-server-available':'recording-graphical-workflow',{...(acceptanceFailure?{failure:acceptanceFailure}:{}),bindings,commands,events,decisions,interactions,acknowledgements,network,fileEffects:effects,decisionPublicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString()});
  await delay(500);
 }
}catch(error){await save('failed',{failure:error.message});console.error(error.message);process.exitCode=1;}
finally{identity.closeAllConnections();await new Promise(resolve=>identity.close(resolve));await fixture?.close({retainSchema});}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function body(req){let text='';for await(const bytes of req){text+=bytes;if(text.length>2048)throw Error('body too large');}return text;}
