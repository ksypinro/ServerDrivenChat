import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
test('M23 extension callback lifecycle rejects stale/duplicate origins and cleans up failed, aborted and disposed sign-ins',()=>{
 const result=spawnSync(process.execPath,[new URL('./auth-callback-check.mjs',import.meta.url).pathname],{encoding:'utf8',timeout:5000});assert.equal(result.status,0,result.stderr);const record=JSON.parse(result.stdout.trim());assert.equal(record.passed,true);assert.equal(record.checks.length,7);
});
