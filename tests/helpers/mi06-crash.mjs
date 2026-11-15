import { BridgeStore } from '../../bridge/dist/index.js';
const [path,point]=process.argv.slice(2);
const store=new BridgeStore({path,sessionId:'s',fault:p=>{if(p===point)process.kill(process.pid,'SIGKILL');}});
store.applyCommandRecoveryCheckpoint({deviceId:'d',lane:'prompt',sessionId:'s',expectedCursor:0,archivedThrough:2,head:2});
