#!/usr/bin/env node
// Developer packaging only. No activation, credentials, native grant or model execution.
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createPublicKey, sign } from 'node:crypto';
import { canonicalJson } from '../protocol/dist/index.js';
import { clineBackendDescriptor } from '../adapters/cline/dist/index.js';
import { measureInstalledTree } from '../extensions/vscode-host/dist/artifacts.js';
import { measureMacEditor } from '../extensions/vscode-host/dist/runtime.js';
import { verifyBackendEnvelope } from '../extensions/vscode-host/dist/envelope.js';
import { evaluationKeys } from '../extensions/vscode-host/dist/trusted-keys.js';
const [hostDir, driverDir, nativeDir, appRoot, privateKeyPath, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: prepare-backend-evaluation.mjs HOST_DIR DRIVER_DIR NATIVE_DIR EDITOR_APP_ROOT PRIVATE_KEY OUTPUT_JSON');
const specs = [['host','server-driven-chat.sdc-backend-host','0.1.0',hostDir],['driver','server-driven-chat.sdc-cline-driver','0.1.0',driverDir],['native','saoudrizwan.claude-dev','4.1.2204',nativeDir]];
const artifacts=[];
for (const [role,id,version,directory] of specs) {
    const root=await realpath(directory), metadata=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
    if (`${metadata.publisher}.${metadata.name}`!==id || metadata.version!==version) throw new Error(`Unexpected ${role} manifest`);
    const measured=await measureInstalledTree(root); artifacts.push({role,id,version,sha256:measured.sha256});
}
artifacts.push(await measureMacEditor(await realpath(appRoot),'1.140.0'));
const now=Date.now();
const payload={format:'sdc-backend-envelope-v1',purpose:'evaluation',issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+24*3600000).toISOString(),serverOrigin:'https://localhost:15943',registration:{extensionId:'server-driven-chat.sdc-cline-driver',qualification:{
    qualificationId:'mb04-cline-local-evaluation-v1',descriptor:clineBackendDescriptor,inventory:{platform:`${process.platform}-${process.arch}`,nativeApiVersion:'1.3',artifacts},appVersion:'4.1.22+sdc-m30.1',evidenceRef:'evidence/MB04/EVALUATION.md',evidenceLevel:'evaluation',effectBoundary:'synchronous-fenced',operations:Object.fromEntries(['probe','attach','inspect','submit','subscribe','detach','respondInput','cancel'].map(op=>[op,{status:'supported',reason:'UNQUALIFIED EVALUATION: source-reviewed candidate operation; native acceptance pending',evidenceRef:'evidence/MB04/EVALUATION.md'}]))
}}};
const key=await readFile(resolve(privateKeyPath),'utf8');
if(createPublicKey(key).export({type:'spki',format:'pem'})!==evaluationKeys['mb04-local-evaluation']) throw new Error('Private key does not match compiled evaluation signer');
const encoded=JSON.stringify({keyId:'mb04-local-evaluation',payload,signature:sign(null,Buffer.from(canonicalJson(payload)),key).toString('base64')},null,2)+'\n';
verifyBackendEnvelope(encoded,evaluationKeys,now);
await writeFile(resolve(output),encoded,{mode:0o600});
process.stdout.write(JSON.stringify({path:resolve(output),status:'signed-evaluation-only',expiresAt:payload.expiresAt,artifacts},null,2)+'\n');
