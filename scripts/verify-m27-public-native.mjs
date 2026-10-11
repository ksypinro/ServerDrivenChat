/** Developer-only acceptance client. Uses FastAPI HTTP; never executes a model or calls a private native API. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const directory=process.argv[2]??'evidence/M27/server-owned-run';
const gateway='http://127.0.0.1:59319';
const marker='M27-GATEWAY-'+randomUUID().slice(0,8),results=[];
let token='owner';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=Date.now()+900000;
async function call(path,body,key){const response=await fetch(gateway+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',...(key?{'idempotency-key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(35000)});const data=await response.json();if(!response.ok)throw Error(`${response.status}: ${JSON.stringify(data)}`);return data;}
async function finished(generation){while(Date.now()<until){const state=await call('/generations/'+generation.generationId);if(state.result)return state;await wait(500);}throw Error('Native gateway acceptance deadline exceeded');}
async function save(status,error){await writeFile(directory+'/gateway-native.json',JSON.stringify({milestone:'M27',status,marker,gateway,results,...(error?{error}:{}),scope:'Real FastAPI/TypeScript/native I/O; synthetic disposable identity; no client/vendor parity claim'},null,2)+'\n');}
try{
 await save('awaiting-approved-native-connection');
 let binding;
 while(Date.now()<until){
  let live;
  try{live=JSON.parse(await readFile(directory+'/server-live.json','utf8'));}
  catch(error){if(!(error instanceof SyntaxError))throw error;await wait(100);continue;}
  binding=live.bindings?.find(b=>b.state==='active');if(binding&&live.results.some(r=>r.kind==='public-context-result'))break;binding=undefined;await wait(1000);
 }
 if(!binding)throw Error('Approved graphical native connection did not become ready');
 const credential=await call('/credentials',{sessionId:binding.sessionId,scopes:['view','prompt'],label:'M27 gateway native acceptance',expiresAt:new Date(Date.now()+600000).toISOString()});token=credential.credential;
 const base={model:'sdc-default',instructions:'Follow the current request. No native tools, files, shell or network.',contextMode:'shared-task',history:[{role:'user',content:`Reply exactly ${marker}-HTTP-OK.`}]};
 const first=await call('/generations',base,marker+'-first');results.push({kind:'first-admission',generation:first});const done=await finished(first);results.push({kind:'first-result',generation:done});if(done.result.status!=='completed'||!done.result.text.includes(marker+'-HTTP-OK'))throw Error('Native gateway answer mismatch');
 const replay=await call('/generations',base,marker+'-first');if(replay.generationId!==first.generationId)throw Error('Native retry produced a replacement');results.push({kind:'original-retry',generationId:replay.generationId});
 const context=await call('/conversations/'+first.conversationId);const nextRequest={...base,conversationId:first.conversationId,history:[...context.history,{role:'user',content:'From the first user message in this API history, extract the marker M27-GATEWAY- followed by eight hexadecimal characters. Omit the -HTTP-OK suffix. Reply with that marker followed by -HISTORY-OK, and nothing else.'}]};
 const next=await call('/generations',nextRequest,marker+'-next');const nextDone=await finished(next);results.push({kind:'context-result',generation:nextDone});if(nextDone.result.status!=='completed'||!nextDone.result.text.includes(marker+'-HISTORY-OK'))throw Error('Native gateway context answer mismatch');
 // Restrictive scopes prove server-owned authority without widening native control.
 token='owner';await call('/credentials/'+credential.credentialId+'/revoke',{});token=credential.credential;
 const denied=await fetch(gateway+'/api/v1/generations/'+first.generationId,{headers:{authorization:'Bearer '+token}});if(denied.status!==401)throw Error('Revoked native caller key remained usable');results.push({kind:'key-revocation',status:denied.status});
 await save('passed');console.log('M27 real FastAPI/native text, context, original-key replay and revocation passed.');
}catch(error){await save('failed',error.message);console.error(error.message);process.exitCode=1;}
