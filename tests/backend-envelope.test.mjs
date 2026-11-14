import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { canonicalJson } from '../protocol/dist/index.js';
import { verifyBackendEnvelope } from '../extensions/vscode-host/dist/envelope.js';
import { backendFixture } from './helpers/backend-driver.mjs';
const now = Date.parse('2026-10-12T00:00:00Z');
function fixture() {
    const {privateKey, publicKey} = generateKeyPairSync('ed25519');
    const qualification = backendFixture().qualification; qualification.evidenceLevel = 'evaluation';
    qualification.inventory.artifacts.push({role:'runtime',id:'microsoft.vscode',version:'1.140.0',sha256:'f'.repeat(64)});
    const payload = {format:'sdc-backend-envelope-v1',purpose:'evaluation',issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString(),serverOrigin:'https://localhost:15943',registration:{extensionId:'example.driver',qualification}};
    const keys = {test:publicKey.export({type:'spki',format:'pem'})};
    const encode = () => JSON.stringify({keyId:'test',payload,signature:sign(null,Buffer.from(canonicalJson(payload)),privateKey).toString('base64')});
    return {payload,keys,encode};
}
test('MB-04 detached envelope verifies exact signed inventory without claiming native acceptance', () => {
    const f=fixture(), result=verifyBackendEnvelope(f.encode(),f.keys,now);
    assert.equal(result.purpose,'evaluation'); assert.equal(result.registration.qualification.evidenceLevel,'evaluation');
});
test('MB-04 envelope rejects tampering, unknown keys, expiration, remote origins and missing runtime', () => {
    const f=fixture(), encoded=JSON.parse(f.encode()); encoded.payload.serverOrigin='https://localhost:15944';
    assert.throws(()=>verifyBackendEnvelope(JSON.stringify(encoded),f.keys,now),/signature/);
    assert.throws(()=>verifyBackendEnvelope(f.encode(),{},now),/Untrusted/);
    assert.throws(()=>verifyBackendEnvelope(f.encode(),f.keys,now+3600000),/expired/);
    for(const mutate of [p=>p.serverOrigin='https://example.com',p=>p.purpose='native',p=>p.registration.qualification.inventory.artifacts.pop(),p=>p.expiresAt=new Date(now+8*86400000).toISOString()]) {
        const next=fixture(); mutate(next.payload); assert.throws(()=>verifyBackendEnvelope(next.encode(),next.keys,now));
    }
});
