import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { ADAPTER_OPERATIONS } from '../protocol/dist/index.js';
import { parseBackendDescriptor, parseBackendInventory, parseBackendQualification, qualifyBackendCapabilities, effectiveBackendCapabilities, hasQualifiedTextControl } from '../adapters/core/dist/index.js';
import { backendFixture } from './helpers/backend-driver.mjs';

const qualify = f => qualifyBackendCapabilities(f.descriptor, f.inventory, f.report, f.qualification, true);

test('MB-02 published descriptor schema agrees with strict parser on contract fixtures', async () => {
    const schema = JSON.parse(await readFile(new URL('../adapters/core/schemas/backend-driver-v1.schema.json', import.meta.url), 'utf8'));
    const validate = new Ajv2020({ strict: true }).compile(schema);
    const descriptor = backendFixture().descriptor;
    for (const value of [descriptor, { ...descriptor, contractVersion: '2.0' }, { ...descriptor, extensionIds: [] }, { ...descriptor, extensionIds: ['bad'] }, { ...descriptor, displayName: ' ' }, { ...descriptor, hiddenGrant: true }, { ...descriptor, driverVersion: '^1.0' }]) {
        let parsed = true; try { parseBackendDescriptor(value); } catch { parsed = false; }
        assert.equal(validate(value), parsed);
    }
});

test('MB-02 qualification requires external evidence and exact installed identities', () => {
    const f = backendFixture();
    assert.equal(hasQualifiedTextControl(qualify(f)), true);
    assert.equal(hasQualifiedTextControl(qualifyBackendCapabilities(f.descriptor, f.inventory, f.report)), false);
    assert.equal(hasQualifiedTextControl(qualifyBackendCapabilities(f.descriptor, f.inventory, f.report, f.qualification)), false, 'simulation is refused in the default native mode');
    for (const change of [
        g => { g.inventory.artifacts[0].sha256 = 'f'.repeat(64); },
        g => { g.inventory.artifacts[0].version = '2.0'; },
        g => { g.inventory.nativeApiVersion = '2.0'; },
        g => { g.inventory.platform = 'linux-x64'; },
        g => { g.descriptor.extensionIds = ['other.native']; },
        g => { g.report.appVersion = '2.0'; },
        g => { g.report.adapterVersion = '2.0'; },
        g => { g.report.appId = 'other.app'; },
        g => { g.report.platform = 'other'; }
    ]) {
        const changed = structuredClone(f); change(changed);
        assert.equal(hasQualifiedTextControl(qualify(changed)), false);
        assert.equal(qualify(changed).effectPolicies, undefined);
    }
});

test('MB-02 text-only qualification keeps optional operations unavailable and omits tool policy', () => {
    const f = backendFixture();
    for (const op of ['resolveApproval', 'respondInput', 'cancel', 'stageAttachment', 'revoke']) delete f.qualification.operations[op];
    delete f.qualification.nativeToolsDenied;
    const result = qualify(f);
    assert.equal(hasQualifiedTextControl(result), true);
    assert.equal(result.operations.resolveApproval.status, 'unverified');
    assert.equal(result.effectPolicies, undefined);
    f.report.operations.submit = { status: 'unsupported', reason: 'native unavailable' };
    assert.equal(hasQualifiedTextControl(qualify(f)), false);
});

test('MB-02 unverified queue fencing prevents every native mutation', () => {
    const f = backendFixture(); f.qualification.effectBoundary = 'unverified';
    const result = qualify(f);
    for (const op of ['submit', 'respondInput', 'resolveApproval', 'cancel', 'revoke', 'stageAttachment']) assert.equal(result.operations[op].status, 'unverified');
    assert.equal(result.operations.inspect.status, 'supported');
    assert.equal(result.effectPolicies, undefined);
});

test('MB-02 native limits cannot exceed or silently reinterpret the qualified subset', () => {
    const f = backendFixture();
    f.qualification.operations.stageAttachment.limits = { maxBytes: 1024 };
    f.report.operations.stageAttachment.limits = { maxBytes: 2048 };
    assert.equal(qualify(f).operations.stageAttachment.status, 'unverified');
    f.report.operations.stageAttachment.limits = { maxBytes: 1024 };
    assert.equal(qualify(f).operations.stageAttachment.status, 'supported');
});

test('MB-02 effective capabilities intersect policy and local consent without mutating evidence', () => {
    const f = backendFixture(), qualified = qualify(f);
    const policy = { serverOperations: ADAPTER_OPERATIONS.filter(x => x !== 'cancel'), localOperations: ADAPTER_OPERATIONS.filter(x => x !== 'resolveApproval'), live: true };
    const result = effectiveBackendCapabilities(qualified, policy);
    assert.equal(result.operations.submit.status, 'supported');
    assert.equal(result.operations.cancel.status, 'unsupported');
    assert.equal(result.operations.resolveApproval.status, 'unsupported');
    assert.equal(qualified.operations.cancel.status, 'supported');
    assert.equal(hasQualifiedTextControl(effectiveBackendCapabilities(qualified, { ...policy, live: false, reason: 'lease expired' })), false);
});

test('MB-02 parsers reject unknown versions, fields, wildcards, duplicate artifacts and missing evidence', () => {
    const f = backendFixture();
    assert.throws(() => parseBackendDescriptor({ ...f.descriptor, contractVersion: '2.0' }));
    assert.throws(() => parseBackendDescriptor({ ...f.descriptor, remote: true }));
    assert.throws(() => parseBackendDescriptor({ ...f.descriptor, driverVersion: '^1.0' }));
    assert.throws(() => parseBackendDescriptor({ ...f.descriptor, extensionIds: ['*'] }));
    assert.throws(() => parseBackendInventory({ ...f.inventory, artifacts: f.inventory.artifacts.slice(1) }));
    assert.throws(() => parseBackendInventory({ ...f.inventory, artifacts: [...f.inventory.artifacts, f.inventory.artifacts[0]] }));
    const q = structuredClone(f.qualification); delete q.operations.submit.evidenceRef;
    assert.throws(() => parseBackendQualification(q));
    const q2 = structuredClone(f.qualification); q2.operations.executeAnything = q2.operations.probe;
    assert.throws(() => parseBackendQualification(q2));
    const copy = parseBackendDescriptor(f.descriptor); copy.extensionIds.push('other.native');
    assert.equal(f.descriptor.extensionIds.length, 1);
    const reversed = structuredClone(f); reversed.inventory.artifacts.reverse();
    assert.equal(hasQualifiedTextControl(qualify(reversed)), true, 'artifact order has no semantic meaning');
});

test('MB-04 evaluation plans never qualify production or simulation hosts', () => {
    const f = backendFixture(); f.qualification.evidenceLevel = 'evaluation';
    for (const mode of [false, true]) assert.equal(hasQualifiedTextControl(qualifyBackendCapabilities(f.descriptor, f.inventory, f.report, f.qualification, mode)), false);
    const planned = qualifyBackendCapabilities(f.descriptor, f.inventory, f.report, f.qualification, 'evaluation');
    assert.equal(hasQualifiedTextControl(planned), true);
    assert.match(planned.operations.submit.reason, /UNQUALIFIED EVALUATION/);
    f.qualification.evidenceLevel = 'simulation';
    assert.equal(hasQualifiedTextControl(qualifyBackendCapabilities(f.descriptor, f.inventory, f.report, f.qualification, 'evaluation')), false);
});
