// Disposable real HTTP/PostgreSQL fixture. It never attaches to or executes Cline.
import {createInterface} from 'node:readline';
import {apiFixture,event} from './api-fixture.mjs';
const f=await apiFixture(process.env.M27_TEST_DATABASE_URL);
await f.bind('session');
await f.db.pool.query("UPDATE bindings SET payload=$2::jsonb WHERE session_id=$1",['session',JSON.stringify({conversationRevision:0,capabilities:Object.fromEntries(['submit','cancel','respondInput','detach'].map(name=>[name,{status:'supported',reason:'SIMULATED gateway fixture capability'}]))})]);
let closed=false;
const close=async()=>{if(closed)return;closed=true;await f.close();process.exit(0);};
process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
const lines=createInterface({input:process.stdin});
lines.on('close',()=>void close());
lines.on('line',line=>{void (async()=>{
    const request=JSON.parse(line);
    if(request.action==='complete') {
        const op=(await f.db.pool.query('SELECT turn_id FROM public_operations WHERE operation_id=$1',[request.operationId])).rows[0];
        const head=(await f.db.readSnapshot('session')).watermark.sessionSeq;
        const records=[{type:'turn.started',payload:{turnId:op.turn_id,state:'running',conversationRevision:1}},
            {type:'output.item.created',payload:{turnId:op.turn_id,itemId:'fixture-answer',kind:'assistant_message',revision:1,source:'native_event',partial:false,nativeCategory:'completion_result',content:[{type:'text',text:'SIMULATED gateway fixture answer'}],observedAt:new Date().toISOString()}},
            {type:'output.item.completed',payload:{turnId:op.turn_id,itemId:'fixture-answer',revision:1}},
            {type:'turn.completed',payload:{turnId:op.turn_id,terminalEvidence:'SIMULATED native fixture completion'}}];
        for(const [i,record] of records.entries()) {const e={...event('session',`fixture-${head+i+1}`,head+i+1),...record};await f.db.recordEvent({eventId:e.eventId,sessionId:'session',bridgeEpoch:e.bridgeEpoch,producerSeq:e.producerSeq,payload:e});}
    }
    process.stdout.write(JSON.stringify({action:request.action,ok:true})+'\n');
})().catch(()=>{process.stdout.write(JSON.stringify({ok:false})+'\n');});});
process.stdout.write(JSON.stringify({baseUrl:f.base,fixture:'synthetic identity and native events; real HTTP/PostgreSQL'})+'\n');
