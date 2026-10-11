/** Final retained native target media and one-hour idle/active qualification. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { ownerToken } from './m26-human-auth.mjs';
void ownerToken;
const rows=execFileSync('docker',['exec','sdc-local-postgres-1','psql','-U','sdc_app','-d','sdc','-Atc',"SELECT json_build_object('bindings',json_agg(json_build_object('bindingId',binding_id,'sessionId',session_id,'state',state,'leaseExpiresAt',lease_expires_at))) FROM bindings WHERE state='active'"],{encoding:'utf8'});
writeFileSync('evidence/M26/server-live.json',rows);
await import('./m26-native-jpeg.mjs');
if(process.exitCode)throw Error('JPEG qualification failed; soak not started');
await import('./m26-native-soak.mjs');
