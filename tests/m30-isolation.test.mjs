import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { apiFixture } from './helpers/api-fixture.mjs';

const url = process.env.M30_TEST_DATABASE_URL;
const skip = !url && 'requires disposable PostgreSQL';

test('M30 two independent active bindings isolate owners, caller keys, commands and concurrent admission', { skip }, async () => {
    const fixture = await apiFixture(url);
    try {
        await fixture.bind('primary');
        const secondary = await fixture.signIn('secondary');
        const pairing = await fixture.auth.startPairing(secondary, 'M30 disposable second binding');
        await fixture.auth.confirmPairingOnServer(secondary, pairing.pairingCode);
        const secondDevice = await fixture.auth.confirmPairingLocally(pairing.pairingId, pairing.localConfirmationSecret, true);
        await fixture.db.putSession({ sessionId: 'secondary', ownerUserId: secondary.userId });
        await fixture.db.putBinding({ bindingId: 'b-secondary', sessionId: 'secondary', deviceId: secondDevice.deviceId,
            bindingRevision: 1, leaseGeneration: 1, state: 'active', payload: {} });
        for (const sessionId of ['primary', 'secondary']) {
            await fixture.db.pool.query('UPDATE bindings SET payload=$2::jsonb WHERE session_id=$1',
                [sessionId, JSON.stringify({ conversationRevision: 0,
                    capabilities: { submit: { status: 'supported', reason: 'SIMULATED independent binding' } } })]);
        }
        const request = (path, token, body, key) => fetch(fixture.base + '/v2/public' + path, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
                ...(key ? { 'idempotency-key': key } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const expiresAt = new Date(Date.now() + 300_000).toISOString();
        const primaryKeyResponse = await request('/credentials', 'owner',
            { sessionId: 'primary', scopes: ['view', 'prompt'], label: 'M30 primary', expiresAt });
        const secondaryKeyResponse = await request('/credentials', 'secondary',
            { sessionId: 'secondary', scopes: ['view', 'prompt'], label: 'M30 secondary', expiresAt });
        assert.equal(primaryKeyResponse.status, 201);
        assert.equal(secondaryKeyResponse.status, 201);
        const primaryKey = (await primaryKeyResponse.json()).credential;
        const secondaryKey = (await secondaryKeyResponse.json()).credential;
        const body = text => ({ model: 'sdc-default', delivery: 'queue', content: [{ type: 'text', text }] });
        const [first, second] = await Promise.all([
            request('/sessions/primary/prompts', primaryKey, body('primary request'), 'same-client-key'),
            request('/sessions/secondary/prompts', secondaryKey, body('secondary request'), 'same-client-key')
        ]);
        assert.equal(first.status, 202, await first.clone().text());
        assert.equal(second.status, 202, await second.clone().text());
        const firstOperation = await first.json(), secondOperation = await second.json();
        assert.notEqual(firstOperation.operationId, secondOperation.operationId);
        assert.equal((await fixture.db.readCommands(fixture.issued.deviceId, 'prompt', 0)).length, 1);
        assert.equal((await fixture.db.readCommands(secondDevice.deviceId, 'prompt', 0)).length, 1);
        assert.equal((await request('/sessions/secondary/snapshot', primaryKey)).status, 403);
        assert.equal((await request('/sessions/primary/snapshot', secondaryKey)).status, 403);
        assert.equal((await request('/operations/' + secondOperation.operationId, primaryKey)).status, 404);
        assert.equal((await request('/operations/' + firstOperation.operationId, secondaryKey)).status, 404);
        assert.equal((await request('/sessions/secondary/prompts', primaryKey, body('cross task'), 'cross')).status, 403);
        assert.equal((await request('/sessions/primary/prompts', secondaryKey, body('cross task'), 'cross')).status, 403);
        assert.equal((await fixture.db.readCommands(fixture.issued.deviceId, 'prompt', 0)).length, 1);
        assert.equal((await fixture.db.readCommands(secondDevice.deviceId, 'prompt', 0)).length, 1);
    } finally {
        await fixture.close();
    }
});

test('M30 first-party and provider ingress serialize on one binding while a control remains admissible', { skip }, async () => {
    const fixture = await apiFixture(url);
    try {
        await fixture.bind('shared');
        await fixture.db.pool.query('UPDATE bindings SET payload=$1::jsonb',
            [JSON.stringify({ conversationRevision: 0, capabilities: {
                submit: { status: 'supported', reason: 'SIMULATED ingress binding' },
                detach: { status: 'supported', reason: 'SIMULATED control binding' }
            } })]);
        const headers = key => ({ authorization: 'Bearer owner', 'content-type': 'application/json', 'idempotency-key': key });
        const firstParty = fetch(fixture.base + '/v2/public/sessions/shared/prompts', { method: 'POST',
            headers: headers('m30-first-party'), body: JSON.stringify({ model: 'sdc-default', delivery: 'queue',
                content: [{ type: 'text', text: 'first-party prompt' }] }) });
        const provider = fetch(fixture.base + '/v2/public/generations', { method: 'POST',
            headers: headers('m30-provider'), body: JSON.stringify({ model: 'sdc-default', sessionId: 'shared',
                history: [{ role: 'user', content: 'provider prompt' }], instructions: '', contextMode: 'exclusive',
                tools: [], toolChoice: 'auto', parallelTools: false,
                budget: { inputUnits: 32768, outputUnits: 8192, deadlineSeconds: 600 }, background: false }) });
        const responses = await Promise.all([firstParty, provider]);
        assert.deepEqual(responses.map(response => response.status).sort(), [202, 409]);
        assert.equal((await fixture.db.readCommands(fixture.issued.deviceId, 'prompt', 0)).length, 1);
        const control = await fixture.request('/v2/public/sessions/shared/controls',
            { type: 'session.disable', commandId: randomUUID(), reason: 'M30 disposable capacity check' }, 'owner');
        assert.equal(control.status, 202, await control.clone().text());
        assert.equal((await fixture.db.readCommands(fixture.issued.deviceId, 'control', 0)).length, 1);
    } finally {
        await fixture.close();
    }
});
