import {fork} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {apiFixture,command,waitFor} from './api-fixture.mjs';
export async function processFixture(url){
 const f=await apiFixture(url),dir=await mkdtemp(join(tmpdir(),'mi06-matrix-')),windows=[];let generation=0;
 for(const s of ['alpha','beta','ghost'])await f.bind(s);
 async function start(sessionId,options={}){const config={serverUrl:f.base,deviceId:f.issued.deviceId,credential:f.issued.credential,sessionId,appInstanceId:sessionId,storePath:join(dir,sessionId+'.sqlite'),second:sessionId==='beta',epoch:`matrix-${sessionId}-${generation++}`,...options};const child=fork(new URL('./mi06-window.mjs',import.meta.url),[JSON.stringify(config)],{stdio:['ignore','ignore','inherit','ipc']});const messages=[];child.on('message',m=>messages.push(m));const w={child,messages,config};windows.push(w);await waitFor(()=>messages.some(m=>m.type==='binding'));await f.db.pool.query('UPDATE bindings SET binding_id=$1 WHERE session_id=$2',[messages.find(m=>m.type==='binding').binding.bindingId,sessionId]);child.send('start');await waitFor(()=>messages.some(m=>m.type==='started'));return w;}
 async function stop(w){if(!w.child.connected)return;const exited=new Promise(r=>w.child.once('exit',r));w.child.send('stop');let timer;try{await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>{w.child.kill('SIGKILL');reject(Error('Bridge shutdown timed out'));},3000);})]);}finally{clearTimeout(timer);}}
 async function submit(session,id){const c=command(session,id);const r=await f.request(`/v2/sessions/${session}/turns`,{command:c},'owner');if(r.status!==202)throw Error(`Admission ${r.status}: ${await r.text()}`);await waitFor(async()=>{const a=await f.db.pool.query('SELECT state FROM command_acknowledgements a JOIN commands c USING(device_id,lane,lane_seq) WHERE c.command_id=$1',[id]);return a.rows[0]?.state==='applied'&&(await f.db.readEvents(session,0)).some(e=>e.payload.type==='turn.completed'&&e.payload.payload.turnId===c.turnId);},10000);return c;}
 const compact=(lane='prompt')=>f.db.compactCommandLane({deviceId:f.issued.deviceId,lane,minAgeSeconds:0,keepLast:0,batchSize:100,now:new Date(Date.now()+1000)});
 async function close(){for(const w of windows)await stop(w);await f.close();await rm(dir,{recursive:true,force:true});}
 return {f,dir,windows,start,stop,submit,compact,close};
}
