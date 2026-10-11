/** Bounded public HTTP/native acceptance; a developer restarts the fixture after ready-for-restart. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
const directory=process.argv[2]??'evidence/M27/restart-media-run';
const gateway='http://127.0.0.1:59319/api/v1',deadline=Date.now()+900000,results=[];
const initial=JSON.parse(await readFile(directory+'/fixture.json','utf8'));
const marker='M27-RESTART-'+randomUUID().slice(0,8);
const skipRestart=process.env.SDC_NATIVE_SKIP_RESTART==='1',outputName=skipRestart?'native-image.json':'restart-media.json';
let token='owner',sessionId,credentialId;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function save(status,error){await writeFile(directory+'/'+outputName,JSON.stringify({milestone:'M27',status,marker,sessionId,results,...(error?{error}:{}),scope:skipRestart?'Real scoped public gateway/native PNG transfer and completion; synthetic identity':'Real scoped public gateway/native route, same durable schema and credential across server restart, committed PNG transfer and native echo; synthetic identity'},null,2)+'\n');}
async function call(path,body,key){const r=await fetch(gateway+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',...(key?{'idempotency-key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(35000)});const v=await r.json();if(!r.ok)throw Error(path+': '+r.status+': '+JSON.stringify(v));return v;}
async function until(check){while(Date.now()<deadline){const v=await check();if(v)return v;await pause(600);}throw Error('Bounded native restart/media deadline exceeded');}
async function finished(id){return until(async()=>{const v=await call('/generations/'+id);return v.result?v:null;});}
try{
 const sessions=await call('/sessions');sessionId=sessions.sessions.find(s=>s.state==='active'&&s.bindingId)?.sessionId;if(!sessionId)throw Error('No approved active binding');
 const issued=await call('/credentials',{sessionId,scopes:['view','prompt'],label:'M27 restart/media native acceptance',expiresAt:new Date(deadline).toISOString()});token=issued.credential;credentialId=issued.credentialId;
 const request={model:'sdc-default',contextMode:'shared-task',instructions:'No tools, shell, network or files. Return only requested text.',history:[{role:'user',content:'Reply exactly '+marker+'-OK.'}]};
 const admitted=await call('/generations',request,marker);const first=await finished(admitted.generationId);if(first.result.status!=='completed'||first.result.text!==marker+'-OK')throw Error('Pre-image native text failed: '+JSON.stringify(first));results.push({kind:skipRestart?'pre-image-text':'before-restart',generation:first});
 if(!skipRestart){
 await save('ready-for-restart');console.log('READY_FOR_RESTART: retain the schema and restart the same fixture directory/origin.');
 await until(async()=>{try{const current=JSON.parse(await readFile(directory+'/fixture.json','utf8'));return current.marker!==initial.marker;}catch(error){if(error instanceof SyntaxError)return null;throw error;}});
 const replay=await until(async()=>{try{return await call('/generations',request,marker);}catch(error){if(/502/.test(error.message))return null;throw error;}});
 if(replay.generationId!==first.generationId||JSON.stringify(replay.result)!==JSON.stringify(first.result))throw Error('Original-key restart replay changed work or committed result');
 results.push({kind:'after-restart-original-key',generation:replay});await save('testing-image');
 }
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');const sha256='sha256:'+createHash('sha256').update(png).digest('hex');
 const upload=await fetch(gateway+'/attachments',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'image/png','x-session-id':sessionId,'x-file-name':'m27-native-test.png','x-content-sha256':sha256},body:png});const image=await upload.json();if(upload.status!==202)throw Error('PNG upload failed: '+JSON.stringify(image));
 await call('/attachments/'+image.attachmentId+'/commit',{sha256});results.push({kind:'committed-image',attachmentId:image.attachmentId,sha256,sizeBytes:png.length});
 const imageRequest={...request,history:[{role:'user',content:'An attached disposable test PNG is part of this request. Reply exactly '+marker+'-IMAGE-OK. No tools.',images:[{type:'image',attachmentId:image.attachmentId,mimeType:'image/png'}]}]};
 const imageGen=await call('/generations',imageRequest,marker+'-image'),done=await finished(imageGen.generationId);const operation=await call('/operations/'+imageGen.operationId);const receipt=await call('/sessions/'+sessionId+'/commands/'+operation.commandId);results.push({kind:'native-image',generation:done,receipt});
 if(receipt.state!=='applied'||!JSON.stringify(receipt.payload).includes(sha256))throw Error('Native image echo lacks exact byte checksum');
 if(done.result.status!=='completed'||done.result.text!==marker+'-IMAGE-OK')throw Error('Actual native model image turn did not complete: '+JSON.stringify(done));
 token='owner';await call('/credentials/'+credentialId+'/revoke',{});
 await save('passed');console.log(skipRestart?'M27 exact PNG/native completion passed.':'M27 original-key/result replay after real server restart and exact PNG/native completion passed.');
}catch(error){await save('failed',error.message);console.error(error.message);process.exitCode=1;}
