import assert from "node:assert/strict";
import test from "node:test";
import { TranscriptProjector } from "../protocol/dist/index.js";

const envelope=(type,payload,seq)=>({protocolVersion:"2.0",type,eventId:`evt-${seq}`,sessionId:"session-projection",bindingRevision:1,leaseGeneration:1,bridgeEpoch:"epoch-1",producerSeq:seq,createdAt:"2026-10-06T00:00:00Z",payload});
const item=(revision,text,partial=true,source="native_event")=>({itemId:"item-1",turnId:"turn-1",kind:"assistant_message",revision,source,partial,content:[{type:"text",text}],observedAt:"2026-10-06T00:00:00Z"});
const request={requestId:"approval-1",requestRevision:1,kind:"action_approval",appId:"fake.app",appInstanceId:"fake-1",bindingId:"binding-1",sessionId:"session-projection",nativeConversationId:"native-1",bindingRevision:1,leaseGeneration:1,turnId:"turn-1",action:{tool:"file.write",arguments:{}},requestedPermissions:[],availableDecisions:[{id:"allow_once",effect:"allow",scope:"action"}],actionDigest:`sha256:${"a".repeat(64)}`,evidence:{source:"native_event",complete:true},expiresAt:"2026-10-06T00:01:00Z"};

test("M12 replay is ordered/idempotent and completion never appends final text twice",()=>{
  const projector=new TranscriptProjector("session-projection");
  const created=envelope("output.item.created",item(1,"hello "),1);
  const delta=envelope("output.item.delta",{itemId:"item-1",turnId:"turn-1",baseRevision:1,revision:2,source:"native_event",textDelta:"world",observedAt:"2026-10-06T00:00:01Z"},2);
  const completed=envelope("output.item.completed",{itemId:"item-1",turnId:"turn-1",revision:2},3);
  assert.equal(projector.ingest({sessionSeq:2,event:delta}).needsRepair,true);
  assert.equal(projector.ingest({sessionSeq:1,event:created}).applied,2);
  assert.equal(projector.ingest({sessionSeq:2,event:delta}).duplicate,true);
  projector.ingest({sessionSeq:3,event:completed});
  projector.ingest({sessionSeq:4,event:envelope("turn.completed",{turnId:"turn-1",terminalEvidence:"native terminal event"},4)});
  const state=projector.snapshot();
  assert.equal(state.items.length,1);
  assert.equal(state.items[0].content[0].text,"hello world");
  assert.equal(state.items[0].completed,true);
  assert.equal(state.completion["turn-1"],"verified");
  assert.equal(state.watermark,4);
  assert.equal(state.needsRepair,false);
});

test("M12 replacements, wrong-base repair, snapshots and partial/unknown evidence are explicit",()=>{
  const projector=new TranscriptProjector("session-projection");
  projector.ingest({sessionSeq:1,event:envelope("output.item.created",item(1,"draft",true,"screen_observation"),1)});
  projector.ingest({sessionSeq:2,event:envelope("output.item.replaced",item(3,"edited answer",false),2)});
  const bad=envelope("output.item.delta",{itemId:"item-1",turnId:"turn-1",baseRevision:1,revision:2,source:"native_event",textDelta:"duplicate",observedAt:"2026-10-06T00:00:02Z"},3);
  const result=projector.ingest({sessionSeq:3,event:bad});
  assert.equal(result.needsRepair,true);
  assert.equal(projector.snapshot().items[0].content[0].text,"edited answer");
  assert.equal(projector.snapshot().items[0].evidence,"observed");
  const repair=new TranscriptProjector("session-projection");
  repair.installSnapshot({...projector.snapshot(),watermark:3,needsRepair:false,repairAfter:null});
  assert.equal(repair.snapshot().needsRepair,false);
  assert.equal(repair.snapshot().items[0].content[0].text,"edited answer");
});

test("M12 self-contained approvals surface immediately through a transcript gap",()=>{
  const projector=new TranscriptProjector("session-projection");
  const approval=envelope("approval.required",request,7);
  const result=projector.ingest({sessionSeq:7,event:approval});
  assert.equal(result.needsRepair,true);
  assert.equal(projector.snapshot().pendingApprovals[0].requestId,"approval-1");
  assert.equal(projector.snapshot().repairAfter,0);
  projector.ingest({sessionSeq:1,event:envelope("turn.started",{turnId:"turn-1",state:"running"},1)});
  assert.equal(projector.snapshot().pendingApprovals.length,1);
  assert.equal(projector.snapshot().needsRepair,true);
});
