import { ownerToken } from './m26-human-auth.mjs';
/** Bounded M26 acceptance through real FastAPI and the installed Cline binding. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const directory=process.argv[2]??'evidence/M26';
const gateway='https://localhost:15943';
const marker='M26-'+randomUUID().slice(0,8);
const deadline=Date.now()+20*60_000;
const results=[];
let credential,credentialId;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function rest(path,body,key,token=ownerToken){
 const response=await fetch(gateway+'/api/v1'+path,{method:body===undefined?'GET':'POST',
  headers:{authorization:'Bearer '+token,'content-type':'application/json',...(key?{'idempotency-key':key}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(35_000)});
 const data=await response.json();
 if(!response.ok)throw Error(`REST ${path} returned ${response.status}: ${JSON.stringify(data)}`);
 return data;
}
async function save(status,error){await writeFile(directory+'/provider-native.json',JSON.stringify({milestone:'M26',status,marker,
 clientPins:{openaiNode:'7.30.0',anthropicNode:'0.132.1'},gateway,results,
 ...(error?{error}:{}),scope:'Disposable real Cline binding; genuine persistent local Keycloak PKCE/TLS identity; no credential or bearer value retained'},null,2)+'\n');}
async function binding(){
 while(Date.now()<deadline){
  try{const live=JSON.parse(await readFile(directory+'/server-live.json','utf8'));
   const active=live.bindings?.find(item=>item.state==='active'&&new Date(item.leaseExpiresAt).getTime()>Date.now());
   if(active)return active;
  }catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  await delay(1000);
 }
 throw Error('No consented active native binding appeared before deadline');
}
async function settled(generation){
 while(Date.now()<deadline){const value=await rest('/generations/'+generation.generationId,undefined,undefined,credential);
  if(value.result)return value;await delay(1000);}
 throw Error('Native generation did not settle before deadline');
}
try{
 await save('awaiting-native-binding');
 const active=await binding();results.push({kind:'binding',bindingId:active.bindingId,sessionId:active.sessionId});
 const issued=await rest('/credentials',{sessionId:active.sessionId,scopes:['view','prompt'],label:'M26 disposable provider/native acceptance',expiresAt:new Date(Date.now()+15*60_000).toISOString()});
 credential=issued.credential;credentialId=issued.credentialId;
 const body={model:'sdc-default',contextMode:'shared-task',history:[{role:'user',content:`Reply exactly ${marker}-REST-OK. No tools or file changes.`}],instructions:'Return only the requested marker.'};
 const first=await rest('/generations',body,marker+'-rest',credential);
 const completed=await settled(first);
 results.push({kind:'first-party',generationId:first.generationId,status:completed.result.status,text:completed.result.text});
 if(completed.result.status!=='completed'||!completed.result.text.includes(marker+'-REST-OK'))throw Error('First-party native text mismatch');
 const replay=await rest('/generations',body,marker+'-rest',credential);
 if(replay.generationId!==first.generationId)throw Error('Original-key retry changed generation identity');
 results.push({kind:'first-party-retry',sameGeneration:true});
 const openai=new OpenAI({apiKey:credential,baseURL:gateway+'/openai/v1',maxRetries:2,
  defaultHeaders:{'X-SDC-Context-Mode':'shared-task'}});
 const openaiModels=await openai.models.list();
 if(!openaiModels.data.some(item=>item.id==='sdc-default'))throw Error('OpenAI alias missing');
 const chat=await openai.chat.completions.create({model:'sdc-default',messages:[{role:'user',content:`Reply exactly ${marker}-CHAT-OK. No tools or file changes.`}]},
  {headers:{'Idempotency-Key':marker+'-chat'}});
 const chatText=chat.choices[0]?.message?.content??'';
 results.push({kind:'openai-chat',id:chat.id,text:chatText,usage:chat.usage});
 if(!chatText.includes(marker+'-CHAT-OK'))throw Error('OpenAI Chat native text mismatch');
 const anthropic=new Anthropic({apiKey:credential,baseURL:gateway+'/anthropic',maxRetries:2,
  defaultHeaders:{'X-SDC-Context-Mode':'shared-task'}});
 const anthropicModels=await anthropic.models.list();
 if(!anthropicModels.data.some(item=>item.id==='sdc-default'))throw Error('Anthropic alias missing');
 const count=await anthropic.messages.countTokens({model:'sdc-default',messages:[{role:'user',content:'Count this disposable text.'}]});
 const message=await anthropic.messages.create({model:'sdc-default',max_tokens:512,
  messages:[{role:'user',content:`Reply exactly ${marker}-ANTHROPIC-OK. No tools or file changes.`}]},
  {headers:{'Idempotency-Key':marker+'-anthropic'}});
 const messageText=message.content.filter(item=>item.type==='text').map(item=>item.text).join('');
 results.push({kind:'anthropic-message',id:message.id,text:messageText,usage:message.usage,inputCount:count.input_tokens});
 if(!messageText.includes(marker+'-ANTHROPIC-OK'))throw Error('Anthropic Messages native text mismatch');
 await save('passed');
 console.log('M26 first-party, OpenAI Node and Anthropic Node native text paths passed.');
}catch(error){await save('failed',error.message);console.error(error);process.exitCode=1;}
finally{if(credentialId){try{await rest('/credentials/'+credentialId+'/revoke',{});}catch(error){console.error('Disposable credential revocation failed:',error.message);process.exitCode=1;}}}
