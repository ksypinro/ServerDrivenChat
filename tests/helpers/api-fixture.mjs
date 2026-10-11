import {randomUUID,createHash} from 'node:crypto';
import {ServerDatabase,AuthorizationService,createApiServer} from '../../server/dist/index.js';
export async function apiFixture(url,options={},recovery={}) {
 const schema=recovery.schema??`repair_${randomUUID().replaceAll('-','')}`;
 if(!/^repair_[0-9a-f]{32}$/.test(schema))throw Error('Fixture recovery requires an exact disposable repair schema');
 const admin=new ServerDatabase({poolConfig:{connectionString:url,max:2}});
 if(recovery.schema){const existing=await admin.pool.query('SELECT 1 FROM information_schema.schemata WHERE schema_name=$1',[schema]);if(!existing.rowCount){await admin.close();throw Error('Disposable fixture recovery schema does not exist');}}
 else await admin.pool.query(`CREATE SCHEMA ${schema}`);
 const db=new ServerDatabase({poolConfig:{connectionString:url,max:24,options:`-c search_path=${schema}`}});
 let server;
 try {
  await db.migrate();const tokens=new Map();const issuer='https://identity.repair.test';
  const provider={verifyIdToken:async token=>({kind:'user',issuer,subject:token,userId:`oidc-${createHash('sha256').update(`${issuer}\u0000${token}`).digest('hex')}`,email:`${token}@repair.test`}),verifyAccessToken:async token=>{if(!tokens.has(token))throw Error('expired token');return {issuer,subject:tokens.get(token)};}};
  const auth=new AuthorizationService(db);
  const signIn=async(name)=>{tokens.set(name,name);return auth.completeOidcSignIn(provider,name,'nonce');};
  const owner=await signIn('owner');
  const pairing=await auth.startPairing(owner,'disposable repair fixture');await auth.confirmPairingOnServer(owner,pairing.pairingCode);
  const issued=await auth.confirmPairingLocally(pairing.pairingId,pairing.localConfirmationSecret,true);
  const extendedOptions=typeof options==='function'?await options({database:db,authorization:auth,provider}):options;
  server=createApiServer({database:db,authorization:auth,provider,pollMs:25,heartbeatMs:100,...extendedOptions});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(extendedOptions.fixturePort ?? 0,'127.0.0.1',resolve);});
  const base=`http://127.0.0.1:${server.address().port}`;
  const bind=async(sessionId)=>{await db.putSession({sessionId,ownerUserId:owner.userId});await db.putBinding({bindingId:`b-${sessionId}`,sessionId,deviceId:issued.deviceId,bindingRevision:1,leaseGeneration:1,state:'active',payload:{}});};
  const request=(path,body,token=issued.credential)=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const close=async({retainSchema=false}={})=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();if(!retainSchema)await admin.pool.query(`DROP SCHEMA ${schema} CASCADE`);await admin.close();};
  return {schema,db,auth,owner,signIn,tokens,issued,server,base,bind,request,close,extendedOptions};
 }catch(error){server?.closeAllConnections();server?.close();await db.close();if(!recovery.schema)await admin.pool.query(`DROP SCHEMA ${schema} CASCADE`);await admin.close();throw error;}
}
export function command(sessionId,id,lane='prompt',type=lane==='prompt'?'turn.submit':'turn.cancel',payload) {
 return {protocolVersion:'2.0',type,sessionId,commandId:id,lane,seq:1,bindingRevision:1,leaseGeneration:1,createdAt:new Date().toISOString(),turnId:`turn-${id}`,...(type==='turn.submit'?{promptId:`prompt-${id}`} : {}),payload:payload??(type==='turn.submit'?{content:[{type:'text',text:id}],delivery:'queue',expectedConversationRevision:0}:{reason:'cancel'})};
}
export function event(sessionId,id,seq=1,generation=1){return {protocolVersion:'2.0',type:'turn.completed',sessionId,eventId:id,bridgeEpoch:'epoch-1',producerSeq:seq,bindingRevision:1,leaseGeneration:generation,createdAt:new Date().toISOString(),payload:{turnId:'turn',terminalEvidence:'SIMULATED'}};}
export async function waitFor(predicate,timeout=5000){const until=Date.now()+timeout;while(Date.now()<until){if(await predicate())return;await new Promise(r=>setTimeout(r,10));}assertTimeout();}
function assertTimeout(){throw Error('Timed out waiting for acceptance condition');}
export const delay=ms=>new Promise(r=>setTimeout(r,ms));
