import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BridgeRuntime, BridgeStore } from "../bridge/dist/index.js";
import { FakeAppAdapter } from "../adapters/fake/dist/index.js";

test("M13 bridge verifies committed bytes, persists the fake adapter receipt, then submits",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"m13-bridge-stage-"));
  const content=Buffer.from("committed fake attachment\n");
  const sha256=`sha256:${createHash("sha256").update(content).digest("hex")}`;
  const adapter=new FakeAppAdapter({script:[{type:"complete",text:"used the attachment"}]});
  const attached=await adapter.attach({appId:"fake.app",appInstanceId:"fake-instance",conversationId:"fake-conversation"});
  const binding=attached.value; const deviceId=randomUUID(); const store=new BridgeStore({path:join(directory,"bridge.sqlite")});
  const streams=new Map(); const ack=[]; const events=[]; const receipts=[]; const commands=new Map();
  let runtime;
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,"http://127.0.0.1");
    if(req.headers.authorization!=="Bearer m13-test-device"){res.writeHead(401).end();return;}
    if(req.method==="POST"&&url.pathname.endsWith("/lease/renew")) {
      const now=new Date(); res.writeHead(200,{"content-type":"application/json"}).end(JSON.stringify({status:"renewed",leaseExpiresAt:new Date(now.getTime()+60_000).toISOString(),serverTime:now.toISOString(),bindingRevision:1,leaseGeneration:1})); return;
    }
    if(req.method==="POST"&&url.pathname.endsWith("/dispatch")) {
      const now=new Date(); res.writeHead(200,{"content-type":"text/event-stream"});
      res.write(`event: dispatch.permit\ndata: ${JSON.stringify({sessionId:binding.sessionId,serverTime:now.toISOString(),leaseExpiresAt:new Date(now.getTime()+60_000).toISOString(),bindingRevision:1,leaseGeneration:1})}\n\n`); return;
    }
    if(req.method==="GET"&&url.pathname.endsWith("/commands")) {
      const lane=url.searchParams.get("lane"); res.writeHead(200,{"content-type":"text/event-stream"}); streams.set(lane,res);
      if(commands.has(lane)) sendCommand(res,commands.get(lane)); res.on("close",()=>{if(streams.get(lane)===res)streams.delete(lane);}); return;
    }
    if(req.method==="GET"&&url.pathname==="/v2/attachments/attachment-m13") {
      res.writeHead(200,{"content-type":"text/plain","content-length":String(content.length),"x-attachment-sha256":sha256,"x-attachment-filename":"exact.txt","cache-control":"private, no-store"}).end(content); return;
    }
    if(req.method==="POST"&&url.pathname.endsWith("/staging-receipts")) { receipts.push(await body(req)); res.writeHead(202).end("{}"); return; }
    if(req.method==="POST"&&url.pathname.endsWith("/acks")) { ack.push(await body(req)); res.writeHead(202).end("{}"); return; }
    if(req.method==="POST"&&url.pathname.endsWith("/events")) { events.push((await body(req)).event); res.writeHead(202).end("{}"); return; }
    res.writeHead(404).end();
  });
  try {
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
    runtime=new BridgeRuntime({serverUrl:`http://127.0.0.1:${server.address().port}`,deviceId,credential:"m13-test-device",binding,store,adapter,reconnectBaseMs:5,reconnectCapMs:20,leaseRenewIntervalMs:500,random:()=>0});
    await runtime.start();
    await waitFor(()=>streams.has("prompt")&&streams.has("control"));
    const commandId="m13-turn-command";
    const command={commandId,sessionId:binding.sessionId,deviceId,lane:"prompt",laneSeq:1,payload:{protocolVersion:"2.0",type:"turn.submit",commandId,lane:"prompt",seq:1,sessionId:binding.sessionId,bindingRevision:1,leaseGeneration:1,createdAt:new Date().toISOString(),turnId:"m13-turn",promptId:"m13-prompt",payload:{content:[{type:"text",text:"Use this file"},{type:"file",attachmentId:"attachment-m13",mimeType:"text/plain",filename:"exact.txt"}],delivery:"queue",expectedConversationRevision:0}}};
    commands.set("prompt",command); sendCommand(streams.get("prompt"),command);
    await waitFor(()=>receipts.length===1&&ack.some(item=>item.lane==="prompt"&&item.state==="applied")&&events.some(event=>event.type==="turn.completed"));
    assert.deepEqual(Buffer.from(adapter.readStagedAttachment(receipts[0].receiptId)),content);
    assert.equal(receipts[0].sha256,sha256);
    assert.equal(receipts[0].sizeBytes,content.length);
    assert.equal(receipts[0].adapterId,"server-driven-chat.fake");
    assert.ok(events.some(event=>event.type==="turn.started"),"the turn starts after verified staging receipt persistence");
  } finally {
    await runtime?.stop(); server.closeAllConnections(); if(server.listening) await new Promise(resolve=>server.close(resolve));
    store.close(); rmSync(directory,{recursive:true,force:true});
  }
});

function sendCommand(response,record){response.write(`id: ${record.laneSeq}\nevent: command\ndata: ${JSON.stringify(record)}\n\n`);}
async function body(req){let text="";for await(const chunk of req)text+=chunk;return JSON.parse(text);}
async function waitFor(predicate,timeout=5000){const until=Date.now()+timeout;while(Date.now()<until){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail("Timed out waiting for staging runtime");}
