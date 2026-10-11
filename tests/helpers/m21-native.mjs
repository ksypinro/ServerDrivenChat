import {EventEmitter} from 'node:events';
import {createClineTaskBridge} from '../../adapters/cline/dist/index.js';
export function nativeFixture(){
 let config,ts=10;const sent=[];const messages=new EventEmitter();messages.messages=[{ts:1,type:'say',say:'task',text:'Connect to my server and follow its instructions.'}];messages.getClineMessages=()=>structuredClone(messages.messages);messages.add=message=>{messages.messages.push(message);messages.emit('clineMessagesChanged');};
 const controller={task:{taskId:'native-task',messageStateHandler:messages},sessions:{startNewSession:async input=>{config=input.config;return {sessionId:input.config.sessionId};},getActiveSession:()=>session,setRunning:running=>{session.isRunning=running;},fireAndForgetSend:(host,id,text)=>{sent.push({host,id,text});controller.sessions.setRunning(true);}},turnStateTracker:{currentPhase:'streaming',set(phase){this.currentPhase=phase;}},messages:{appendAndEmit:list=>list.forEach(message=>messages.add(message))},messageTranslatorState:{clearTurnOutcome(){}},resolveContextMentions:async text=>text,resetMessageTranslatorAndFence(){},postStateToWebview:async()=>{},dispose:async()=>{}};
 const session={sessionId:'native-task',isRunning:true,sdkHost:{}};
 const api=createClineTaskBridge(controller,{installationId:'installation',hostId:'host',windowId:'window',workspaceId:()=> 'workspace',onWorkspaceChanged:()=>({dispose(){}}),remote:false,connect:true});
 const start=async()=>{await controller.sessions.startNewSession({config:{sessionId:'native-task'}});return config.extraTools;};
 const complete=(text='native output')=>{messages.add({ts:++ts,type:'say',say:'text',text,partial:false});session.isRunning=false;controller.turnStateTracker.set('completed');};
 return {api,start,sent,complete,controller};
}
