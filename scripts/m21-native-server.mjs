/** Developer-only bounded loopback fixture. Real PostgreSQL/HTTP/SSE; synthetic identity provider, no LLM runtime. */
import {createServer} from 'node:http';
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {apiFixture} from '../tests/helpers/api-fixture.mjs';
const databaseUrl=process.env.M21_TEST_DATABASE_URL;
if(!databaseUrl)throw Error('Set M21_TEST_DATABASE_URL to the disposable loopback PostgreSQL service');
const evidenceDirectory=process.argv[2]??'evidence/M21';await mkdir(evidenceDirectory,{recursive:true});
const marker='M21-'+randomUUID().slice(0,8),attempts=new Map();let fixture,closed=false;const results=[];
process.on('SIGINT',()=>{closed=true;});process.on('SIGTERM',()=>{closed=true;});
const save=async(status,extra={})=>writeFile(`${evidenceDirectory}/server-live.json`,JSON.stringify({milestone:'M21',status,marker,identityProvider:'Synthetic disposable loopback identity; no live OIDC realm claimed',results,...extra},null,2)+'\n');
const identity=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  const state=req.method==='POST'?new URLSearchParams(await body(req)).get('state'):url.searchParams.get('state');
  const attempt=attempts.get(state);
  if(!attempt||attempt.expiresAt<Date.now()){res.writeHead(400).end('Expired test sign-in');return;}
  if(req.method==='GET'){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",'cache-control':'no-store'}).end(`<!doctype html><title>M21 disposable sign-in</title><style>body{font:20px system-ui;max-width:720px;margin:80px auto}button{font-size:20px;padding:12px}</style><h1>M21 disposable sign-in</h1><p>This test identity is limited to the local PostgreSQL acceptance fixture. No real account or password is used.</p><form method="post"><input type="hidden" name="state" value="${state}"><button>Continue as disposable test owner</button></form>`);return;
  }
  const callback=new URL(attempt.redirectUri);callback.searchParams.set('state',state);callback.searchParams.set('code',attempt.code);
  // A form-action 'self' policy also checks redirects. Use an explicit user
  // navigation for the already validated extension callback instead.
  const href=callback.toString().replaceAll('&','&amp;').replaceAll('"','&quot;');
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'",'cache-control':'no-store'}).end(`<!doctype html><title>M21 sign-in approved</title><style>body{font:20px system-ui;max-width:720px;margin:80px auto}a{display:inline-block;padding:12px}</style><h1>M21 sign-in approved</h1><p>Return to the isolated VS Code task to complete local pairing.</p><a href="${href}">Return to VS Code</a>`);
 }catch{res.writeHead(400).end('Test sign-in failed');}
});
await new Promise((resolve,reject)=>{identity.once('error',reject);identity.listen(0,'127.0.0.1',resolve);});
try{
 fixture=await apiFixture(databaseUrl,({provider})=>{
  provider.createAuthorizationRequest=async redirectUri=>{
   const uri=new URL(redirectUri);
   if(!(['vscode:','vscode-insiders:'].includes(uri.protocol)&&uri.host==='server-driven-chat.sdc-cline-bridge'&&uri.pathname==='/auth'))throw Error('Test callback is not the exact extension URI');
   const state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),codeVerifier=randomBytes(32).toString('base64url');
   attempts.set(state,{redirectUri,nonce,codeVerifier,code:randomBytes(32).toString('base64url'),expiresAt:Date.now()+300000});
   return {state,nonce,codeVerifier,authorizationUrl:`http://127.0.0.1:${identity.address().port}/authorize?state=${state}`};
  };
  provider.exchangeAuthorizationCode=async(code,redirectUri,state,nonce,verifier)=>{
   const attempt=attempts.get(state);attempts.delete(state);
   if(!attempt||attempt.code!==code||attempt.redirectUri!==redirectUri||attempt.nonce!==nonce||attempt.codeVerifier!==verifier||attempt.expiresAt<Date.now())throw Error('Invalid one-time test authorization');
   return {idToken:'owner',accessToken:'owner',expiresAt:Date.now()+3600000};
  };
  return {};
 });
 await writeFile(`${evidenceDirectory}/fixture.json`,JSON.stringify({serverOrigin:fixture.base,identityOrigin:`http://127.0.0.1:${identity.address().port}`,profileId:'default',schema:fixture.schema,marker,scope:'Disposable loopback native M21 acceptance; two harmless text prompts only'},null,2)+'\n');
 console.log(`M21 disposable API ready: ${fixture.base}; configure profile default graphically. Marker ${marker}.`);
 await save('awaiting-native-connect');
 let row;
 while(!closed){const found=await fixture.db.pool.query("SELECT session_id,binding_id,payload FROM bindings WHERE state='active' AND payload->'binding'->>'appId'='cline.vscode' ORDER BY created_at DESC LIMIT 1");if(found.rowCount){row=found.rows[0];break;}await delay(300);}
 if(!closed){
  const binding=row.payload.binding,revision=row.payload.conversationRevision;
  results.push({kind:'server-binding',binding,conversationRevision:revision});await save('awaiting-initiating-turn-end');
  await until(async()=>{const r=await fixture.db.pool.query("SELECT payload FROM events WHERE session_id=$1 AND payload->>'type'='turn.completed' AND payload->'payload'->>'turnId' LIKE 'local:%'",[binding.sessionId]);if(r.rowCount){results.push({kind:'initiating-turn-completed',event:r.rows.at(-1).payload});return true;}return false;});
  for(let index=0;index<2&&!closed;index++){
   const command={protocolVersion:'2.0',type:'turn.submit',commandId:randomUUID(),lane:'prompt',seq:index+1,sessionId:binding.sessionId,bindingRevision:binding.bindingRevision,leaseGeneration:binding.leaseGeneration,turnId:randomUUID(),promptId:randomUUID(),createdAt:new Date().toISOString(),payload:{content:[{type:'text',text:index===0?`M21 server instruction. Remember marker ${marker}. Reply exactly ${marker}-FIRST-OK. Do not use tools or change files.`:'M21 server follow-up. Recall the marker from the previous server instruction and reply with that marker followed by -CONTINUITY-OK. Do not use tools or change files.'}],delivery:'queue',expectedConversationRevision:revision+index}};
   const response=await fixture.request(`/v2/sessions/${binding.sessionId}/turns`,{command},'owner');if(response.status!==202)throw Error(`Prompt enqueue failed (${response.status})`);results.push({kind:'server-prompt',index,command,acceptedAt:new Date().toISOString()});await save('awaiting-server-output');
   await until(async()=>{const r=await fixture.db.pool.query("SELECT payload FROM events WHERE session_id=$1 AND payload->>'type'='turn.completed' AND payload->'payload'->>'turnId'=$2",[binding.sessionId,command.turnId]);return r.rowCount>0;});
   const events=await fixture.db.pool.query("SELECT payload FROM events WHERE session_id=$1 ORDER BY session_seq",[binding.sessionId]);results.push({kind:'server-turn-completed',index,turnId:command.turnId,events:events.rows.map(r=>r.payload).filter(e=>e.payload.turnId===command.turnId)});await save(index===1?'two-native-server-turns-completed':'first-native-server-turn-completed');
  }
  console.log('Both native server turns completed. Inspect outputs, verify repeat graphical Connect, disconnect and finish capture.');
  await until(async()=>{const r=await fixture.db.pool.query("SELECT state FROM bindings WHERE binding_id=$1",[binding.bindingId]);return r.rows[0]?.state==='detached';});
  results.push({kind:'server-disconnected',bindingId:binding.bindingId,observedAt:new Date().toISOString()});await save('passed');console.log('M21 native server fixture passed; waiting for cleanup signal.');
 }
 while(!closed)await delay(1000);
}catch(error){await save('failed',{failure:error.message});console.error(error.message);process.exitCode=1;}
finally{identity.closeAllConnections();await new Promise(resolve=>identity.close(resolve));await fixture?.close();}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function until(check){const end=Date.now()+240000;while(!closed&&Date.now()<end){if(await check())return;await delay(250);}if(!closed)throw Error('Timed out waiting for real native acceptance');}
async function body(req){let text='';for await(const bytes of req){text+=bytes;if(text.length>2048)throw Error('body too large');}return text;}
