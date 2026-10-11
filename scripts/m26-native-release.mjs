/** Sequential real-native API consumers; the existing Cline app executes every model turn. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { ownerToken } from './m26-human-auth.mjs';
void ownerToken;
async function binding() {
    const rows = execFileSync('docker', ['exec', 'sdc-local-postgres-1', 'psql', '-U', 'sdc_app', '-d', 'sdc', '-Atc', "SELECT json_build_object('bindings',json_agg(json_build_object('bindingId',binding_id,'sessionId',session_id,'state',state,'leaseExpiresAt',lease_expires_at))) FROM bindings WHERE state='active'"], { encoding: 'utf8' });
    writeFileSync('evidence/M26/server-live.json', rows);
}
for (const check of ['provider', 'streams', 'image', 'aider', 'negative', 'firstparty']) {
    await binding();
    console.log('Starting real native', check);
    await import(`./m26-native-${check}.mjs`);
    if (process.exitCode) throw Error(`M26 ${check} failed; further native dispatch stopped`);
}
