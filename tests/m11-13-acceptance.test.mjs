import assert from "node:assert/strict";
import test from "node:test";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalEngine, AttachmentService, StorageConflictError, StorageNotFoundError, stageCommittedAttachment, verifyDecisionAssertion } from "../server/dist/index.js";
import { BridgeStore, createApprovalDecisionHandler } from "../bridge/dist/index.js";
import { FakeAppAdapter } from "../adapters/fake/dist/index.js";
import { computeActionDigest } from "../protocol/dist/index.js";
import { apiFixture } from "./helpers/api-fixture.mjs";

const databaseUrl=process.env.M11_TEST_DATABASE_URL;
if(!databaseUrl) {
  test("M11/M13 PostgreSQL acceptance (set M11_TEST_DATABASE_URL)",{skip:"requires the disposable PostgreSQL 17 test database"},()=>{});
} else {
  test("M11 approval contention, authority, assertion consumption, lifecycle and grant expiry",async()=>{
    const {privateKey,publicKey}=generateKeyPairSync("ed25519");
    const fixture=await apiFixture(databaseUrl,{decisionPublicKey:publicKey});
    const suffix=randomUUID(); const sessionId=`m11-${suffix}`; let bound;
    try {
      await fixture.bind(sessionId);
      const bindingResult=await fixture.db.pool.query("SELECT binding_id,device_id FROM bindings WHERE session_id=$1",[sessionId]);
      bound={bindingId:bindingResult.rows[0].binding_id,deviceId:bindingResult.rows[0].device_id};
      let producerSeq=0;
      const recordEvent=async(type,payload,id)=>{
        producerSeq++;
        await fixture.db.recordEvent({eventId:id,sessionId,bridgeEpoch:"m11-epoch",producerSeq,payload:{protocolVersion:"2.0",type,eventId:id,sessionId,bindingRevision:1,leaseGeneration:1,bridgeEpoch:"m11-epoch",producerSeq,createdAt:new Date().toISOString(),payload}});
      };
      const expiresAt=new Date(Date.now()+120_000).toISOString();
      const grant={resource:"filesystem",operation:"write",scope:{path:"/workspace/reviewed.txt"}};
      async function request(requestId,scope="action") {
        const value={requestId,requestRevision:1,kind:"action_approval",appId:"fake.app",appInstanceId:"fake-instance",bindingId:bound.bindingId,
          sessionId,nativeConversationId:"native-conversation",bindingRevision:1,leaseGeneration:1,turnId:`turn-${requestId}`,
          action:{tool:"file.write",arguments:{path:"/workspace/reviewed.txt"}},requestedPermissions:[grant],
          availableDecisions:[{id:"allow_once",effect:"allow",scope},{id:"deny_once",effect:"deny",scope:"action"}],
          actionDigest:"",evidence:{source:"native_event",complete:true},expiresAt};
        value.actionDigest=await computeActionDigest({appId:value.appId,appInstanceId:value.appInstanceId,bindingId:value.bindingId,sessionId:value.sessionId,nativeConversationId:value.nativeConversationId,bindingRevision:1,leaseGeneration:1,turnId:value.turnId,requestId,requestRevision:1,action:value.action,requestedPermissions:value.requestedPermissions,availableDecisions:value.availableDecisions});
        await recordEvent("approval.required",value,`event-${requestId}`);
        return value;
      }
      const engine=new ApprovalEngine(fixture.db,fixture.auth,{privateKey});
      const approval=await request(`approval-${suffix}`);
      const makeDecision=decisionId=>({sessionId,deviceId:bound.deviceId,decisionId,requestId:approval.requestId,requestRevision:1,actionDigest:approval.actionDigest,choiceId:"allow_once",grantedPermissions:[grant],policyRevision:"policy-test-1",expiresAt});
      const outcomes=await Promise.allSettled([engine.decide(fixture.owner,makeDecision(`winner-a-${suffix}`)),engine.decide(fixture.owner,makeDecision(`winner-b-${suffix}`))]);
      assert.equal(outcomes.filter(item=>item.status==="fulfilled").length,1);
      assert.equal(outcomes.filter(item=>item.status==="rejected").length,1);
      const recorded=outcomes.find(item=>item.status==="fulfilled").value;
      assert.equal(recorded.state,"decision_recorded");
      assert.equal(recorded.disposition,"recorded");
      assert.equal((await engine.decide(fixture.owner,makeDecision(recorded.decisionId))).disposition,"identical");
      const command=await fixture.db.pool.query("SELECT payload FROM commands WHERE command_id=$1",[recorded.commandId]);
      assert.equal(command.rows[0].payload.type,"approval.decide");
      assert.equal(command.rows[0].payload.lane,"control");
      assert.equal(recorded.grants[0].state,"pending");
      const device=await fixture.auth.authenticateDevice(fixture.issued.credential);
      const bridgeDirectory=await mkdtemp(join(tmpdir(),"sdc-m11-bridge-"));
      const bridgeStore=new BridgeStore({path:join(bridgeDirectory,"bridge.sqlite")});
      try {
        bridgeStore.acceptCommand({commandId:recorded.commandId,sessionId,deviceId:bound.deviceId,lane:"control",laneSeq:recorded.laneSeq,payload:command.rows[0].payload});
        const binding={appId:"fake.app",appInstanceId:"fake-instance",conversationId:"conversation",nativeConversationId:"native-conversation",bindingId:bound.bindingId,sessionId,bindingRevision:1,leaseGeneration:1,capabilitiesRevision:"test"};
        let applyCount=0;
        const nativeAdapter={inspect:async()=>({outcome:"accepted",value:{pendingApprovals:[approval]}}),resolveApproval:async(_binding,review,proposal,context)=>{context.assertAuthority();applyCount++;assert.equal(review.actionDigest,approval.actionDigest);assert.equal(proposal.choiceId,"allow_once");return {outcome:"applied",evidence:"simulated request-specific acceptance"};}};
        const handler=createApprovalDecisionHandler({serverUrl:fixture.base,deviceId:bound.deviceId,credential:fixture.issued.credential,binding,store:bridgeStore,adapter:nativeAdapter,publicKey});
        const context={signal:new AbortController().signal,assertAuthority(){}};
        const permitAbort=new AbortController();
        const permit=await fetch(`${fixture.base}/v2/devices/${bound.deviceId}/dispatch`,{method:"POST",headers:{authorization:`Bearer ${fixture.issued.credential}`,"content-type":"application/json"},body:JSON.stringify({sessionId,bindingRevision:1,leaseGeneration:1}),signal:permitAbort.signal});
        assert.equal(permit.status,200);await permit.body.getReader().read();
        bridgeStore.beginDispatch(recorded.commandId,`dispatch:${recorded.commandId}`,command.rows[0].payload);
        let applied;try { applied=await handler(binding,command.rows[0].payload,context); } finally { permitAbort.abort(); }
        assert.equal(applied.outcome,"applied",applied.reason);
        assert.equal(applyCount,1);
        assert.equal(bridgeStore.getDispatchState(recorded.commandId),"applying","approval lookup must not run startup recovery on a live dispatch");
        bridgeStore.finishDispatch(recorded.commandId,"applied");
        const replay=await handler(binding,command.rows[0].payload,context);
        assert.equal(replay.outcome,"applied","a durable completed receipt is returned without repeating native approval");
        assert.equal(applyCount,1);

        const uncertainRequest=await request(`uncertain-${suffix}`);
        const uncertainInput={...makeDecision(`uncertain-decision-${suffix}`),requestId:uncertainRequest.requestId,actionDigest:uncertainRequest.actionDigest};
        const uncertain=await engine.decide(fixture.owner,uncertainInput);
        const uncertainCommand=await fixture.db.pool.query("SELECT payload FROM commands WHERE command_id=$1",[uncertain.commandId]);
        bridgeStore.acceptCommand({commandId:uncertain.commandId,sessionId,deviceId:bound.deviceId,lane:"control",laneSeq:uncertain.laneSeq,payload:uncertainCommand.rows[0].payload});
        let uncertainApplyCount=0;
        const uncertainAdapter={inspect:async()=>({outcome:"accepted",value:{pendingApprovals:[uncertainRequest]}}),resolveApproval:async()=>{uncertainApplyCount++;return {outcome:"unknown",reason:"simulated response may have reached native UI"};}};
        const uncertainHandler=createApprovalDecisionHandler({serverUrl:"https://server.invalid",deviceId:bound.deviceId,credential:fixture.issued.credential,binding,store:bridgeStore,adapter:uncertainAdapter,publicKey,consumeAssertion:async token=>verifyDecisionAssertion(token,publicKey,bound.deviceId)});
        assert.equal((await uncertainHandler(binding,uncertainCommand.rows[0].payload,context)).outcome,"unknown");
        assert.equal(bridgeStore.recoverAfterRestart(sessionId).attempts.find(item=>item.attemptId===`approval:${uncertain.decisionId}`).state,"reconciliation_required");
        assert.equal((await uncertainHandler(binding,uncertainCommand.rows[0].payload,context)).outcome,"unknown");
        assert.equal(uncertainApplyCount,1,"uncertain native side effects are never retried");
      } finally { bridgeStore.close(); await rm(bridgeDirectory,{recursive:true,force:true}); }
      const claims=verifyDecisionAssertion(command.rows[0].payload.payload.assertion,publicKey,device.deviceId);
      assert.equal(claims.actionDigest,approval.actionDigest);
      await assert.rejects(fixture.auth.consumeDecisionAssertion(command.rows[0].payload.payload.assertion,publicKey,device),StorageConflictError);
      const audit=await fixture.db.pool.query("SELECT action FROM audit_records WHERE session_id=$1",[sessionId]);
      assert.ok(audit.rows.some(row=>row.action==="approval.decision_recorded"));

      await recordEvent("approval.applied",{requestId:approval.requestId,requestRevision:1,decisionId:recorded.decisionId,evidence:"simulated native application evidence"},`applied-${suffix}`);
      let ledger=await fixture.db.pool.query("SELECT state,payload FROM grants WHERE decision_id=$1",[recorded.decisionId]);
      assert.equal(ledger.rows[0].state,"active");
      assert.equal(ledger.rows[0].payload.nativeEnforcement,"confirmed_by_adapter");
      await recordEvent("turn.completed",{turnId:approval.turnId,terminalEvidence:"simulated terminal evidence"},`complete-${suffix}`);
      ledger=await fixture.db.pool.query("SELECT state FROM grants WHERE decision_id=$1",[recorded.decisionId]);
      assert.equal(ledger.rows[0].state,"expired","action/turn grant closes when its turn ends");

      const sessionWide=await request(`session-scope-${suffix}`,"session");
      await assert.rejects(engine.decide(fixture.owner,{...makeDecision(`wide-${suffix}`),requestId:sessionWide.requestId,actionDigest:sessionWide.actionDigest}),/Session-wide and persistent/);
      const deniedRequest=await request(`denied-${suffix}`);
      const denied=await engine.decide(fixture.owner,{...makeDecision(`denied-decision-${suffix}`),requestId:deniedRequest.requestId,actionDigest:deniedRequest.actionDigest,choiceId:"deny_once",grantedPermissions:[]});
      await fixture.db.recordCommandAck({deviceId:bound.deviceId,lane:"control",laneSeq:denied.laneSeq,state:"applied",payload:{sessionId}});
      const deniedState=await fixture.db.pool.query("SELECT state FROM interactions WHERE session_id=$1 AND request_id=$2",[sessionId,deniedRequest.requestId]);
      const deniedGrants=await fixture.db.pool.query("SELECT grant_id FROM grants WHERE decision_id=$1",[denied.decisionId]);
      assert.equal(deniedState.rows[0].state,"denied");
      assert.equal(deniedGrants.rowCount,0);
      const resolved=await request(`resolved-${suffix}`);
      await recordEvent("approval.resolved",{requestId:resolved.requestId,requestRevision:1,state:"resolved_elsewhere"},`resolved-event-${suffix}`);
      await assert.rejects(engine.decide(fixture.owner,makeDecision(`stale-${suffix}`)),/no longer pending/);
      const pending=`unauthorized-${suffix}`; const pendingRequest=await request(pending);
      const operator=await fixture.signIn(`operator-${suffix}`); await fixture.auth.setSessionRole(fixture.owner,sessionId,operator.userId,"operator");
      await assert.rejects(engine.decide(operator,{...makeDecision(`operator-${suffix}`),requestId:pendingRequest.requestId,actionDigest:pendingRequest.actionDigest}),/permission denied/);
      await fixture.db.expireApprovalRecords(sessionId,new Date(Date.now()+121_000));
      const expired=await fixture.db.pool.query("SELECT state FROM interactions WHERE session_id=$1 AND request_id=$2",[sessionId,sessionWide.requestId]);
      assert.equal(expired.rows[0].state,"expired");
    } finally { await fixture.close(); }
  });

  test("M12 HTTP snapshot is a consistent replay projection with session and lane watermarks",async()=>{
    const fixture=await apiFixture(databaseUrl);
    const suffix=randomUUID(); const sessionId=`m12-${suffix}`;
    try {
      await fixture.bind(sessionId);
      const created={itemId:"item-1",turnId:"turn-1",kind:"assistant_message",revision:1,source:"native_event",partial:true,content:[{type:"text",text:"snapshot text"}],observedAt:new Date().toISOString()};
      const first={protocolVersion:"2.0",type:"output.item.created",eventId:`created-${suffix}`,sessionId,bindingRevision:1,leaseGeneration:1,bridgeEpoch:"m12-epoch",producerSeq:1,createdAt:new Date().toISOString(),payload:created};
      const second={protocolVersion:"2.0",type:"output.item.completed",eventId:`done-${suffix}`,sessionId,bindingRevision:1,leaseGeneration:1,bridgeEpoch:"m12-epoch",producerSeq:2,createdAt:new Date().toISOString(),payload:{itemId:"item-1",turnId:"turn-1",revision:1}};
      await fixture.db.recordEvent({eventId:first.eventId,sessionId,bridgeEpoch:first.bridgeEpoch,producerSeq:1,payload:first});
      await fixture.db.recordEvent({eventId:second.eventId,sessionId,bridgeEpoch:second.bridgeEpoch,producerSeq:2,payload:second});
      const response=await fixture.request(`/v2/sessions/${sessionId}/snapshot`,undefined,"owner");
      assert.equal(response.status,200);
      const snapshot=await response.json();
      assert.equal(snapshot.cursors.sessionSeq,2);
      assert.equal(snapshot.watermark.sessionSeq,2);
      assert.equal(typeof snapshot.cursors.prompt,"number");
      assert.equal(typeof snapshot.cursors.control,"number");
      assert.equal(snapshot.projection.watermark,2);
      assert.equal(snapshot.projection.items[0].content[0].text,"snapshot text");
      assert.equal(snapshot.projection.items[0].completed,true);
    } finally { await fixture.close(); }
  });

  test("M13 authorized bytes commit, integrity, ownership, expiry and exact fake-adapter staging",async()=>{
    let clock=Date.now();
    const directory=await mkdtemp(join(tmpdir(),"sdc-m13-"));
    let service;
    const fixture=await apiFixture(databaseUrl,({database})=>{
      service=new AttachmentService(database,{rootDirectory:directory,maxBytes:64,retentionSeconds:60,uploadTtlSeconds:60,now:()=>clock});
      return {attachments:service};
    });
    const suffix=randomUUID(); const sessionId=`m13-${suffix}`;
    try {
      await fixture.bind(sessionId);
      const bytes=Buffer.from("exact committed bytes\n");
      const sha256=`sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      const uploaded=await fetch(`${fixture.base}/v2/attachments`,{method:"POST",headers:{authorization:"Bearer owner","x-session-id":sessionId,"x-file-name":"review.txt","x-content-sha256":sha256,"content-type":"text/plain"},body:bytes});
      assert.equal(uploaded.status,202);
      const pending=await uploaded.json();
      const commit=await fixture.request(`/v2/attachments/${pending.attachmentId}/commit`,{sha256},"owner");
      assert.equal(commit.status,200);
      assert.equal((await commit.json()).state,"committed");
      const downloaded=await fixture.request(`/v2/attachments/${pending.attachmentId}`,undefined,"owner");
      assert.equal(downloaded.status,200);
      assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
      assert.equal(downloaded.headers.get("x-attachment-sha256"),sha256);
      await assert.rejects(service.readCommitted(pending.attachmentId,"another-user"),StorageNotFoundError);

      const adapter=new FakeAppAdapter({sessionId});
      const attached=await adapter.attach({appId:"fake.app",appInstanceId:"fake-instance",conversationId:"fake-conversation"});
      assert.equal(attached.outcome,"accepted");
      const staged=await stageCommittedAttachment(service,adapter,attached.value,fixture.owner.userId,pending.attachmentId,{signal:new AbortController().signal,assertAuthority(){}});
      assert.equal(staged.outcome,"staged");
      assert.deepEqual(Buffer.from(adapter.readStagedAttachment(staged.receiptId)),bytes);
      const durableReceipt=await fixture.db.pool.query("SELECT sha256,size_bytes,mime_type FROM attachment_staging_receipts WHERE receipt_id=$1",[staged.receiptId]);
      assert.equal(durableReceipt.rows[0].sha256,sha256);
      assert.equal(Number(durableReceipt.rows[0].size_bytes),bytes.byteLength);

      const corrupt=await service.createUpload({sessionId,ownerUserId:fixture.owner.userId,mimeType:"text/plain",filename:"bad.txt",sizeBytes:bytes.byteLength,sha256:`sha256:${"0".repeat(64)}`});
      await assert.rejects(service.receive(corrupt.attachmentId,fixture.owner.userId,(async function*(){yield bytes;})()),/checksum/);
      await assert.rejects(service.createUpload({sessionId,ownerUserId:fixture.owner.userId,mimeType:"application/x-unsupported",filename:"x.bin",sizeBytes:1,sha256}),/MIME/);
      await assert.rejects(service.createUpload({sessionId,ownerUserId:fixture.owner.userId,mimeType:"text/plain",filename:"large.txt",sizeBytes:65,sha256}),/exceeds/);
      const interrupted=await service.createUpload({sessionId,ownerUserId:fixture.owner.userId,mimeType:"text/plain",filename:"interrupted.txt",sizeBytes:bytes.byteLength,sha256});
      await assert.rejects(service.receive(interrupted.attachmentId,fixture.owner.userId,(async function*(){yield bytes.subarray(0,2);throw new Error("simulated disconnect");})()),/disconnect/);
      clock+=61_000;
      const cleanup=await service.cleanup(clock);
      assert.ok(cleanup.uploadsExpired>=2);
      assert.equal((await service.metadata(interrupted.attachmentId)).state,"expired");
      assert.equal(cleanup.contentsDeleted,1);
      await assert.rejects(service.readCommitted(pending.attachmentId,fixture.owner.userId),StorageNotFoundError);
    } finally { await fixture.close(); await rm(directory,{recursive:true,force:true}); }
  });
}
