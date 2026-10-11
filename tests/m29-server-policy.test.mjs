import assert from 'node:assert/strict';
import test from 'node:test';
import { ConversationService, composeRequest, estimateText, validateGenerationRequest } from '../server/dist/index.js';
import { apiFixture, event } from './helpers/api-fixture.mjs';

const url = process.env.M27_TEST_DATABASE_URL;
const skip = !url && 'requires disposable PostgreSQL';
const request = (extra = {}) => ({ model: 'sdc-default', sessionId: 'session', history: [{ role: 'user', content: 'Remember alpha' }], instructions: 'Be brief', contextMode: 'exclusive', tools: [], toolChoice: 'auto', parallelTools: false, budget: { inputUnits: 32768, outputUnits: 8192, deadlineSeconds: 600 }, background: false, ...extra });
const tool = { name: 'lookup', schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'], additionalProperties: false }, strict: true };

async function ready(f) {
    await f.bind('session');
    await f.db.pool.query("UPDATE bindings SET payload=$1::jsonb", [JSON.stringify({ conversationRevision: 0, capabilities: { submit: { status: 'supported' }, cancel: { status: 'supported' } },
        capabilityReport: { effectPolicies: { nativeToolsDenied: { status: 'supported', reason: 'SIMULATED M29 tool-denial fixture' } } } })]);
}

async function emit(f, generation, type, payload) {
    const sequence = (await f.db.readSnapshot('session')).watermark.sessionSeq + 1;
    const operation = await f.db.pool.query('SELECT turn_id FROM public_operations WHERE operation_id=$1', [generation.generationId]);
    const value = { ...event('session', 'm29-' + sequence, sequence), type, payload: { turnId: operation.rows[0].turn_id, ...payload } };
    await f.db.recordEvent({ eventId: value.eventId, sessionId: 'session', bridgeEpoch: value.bridgeEpoch, producerSeq: sequence, payload: value });
}

async function answer(f, generation, text, revision) {
    await emit(f, generation, 'turn.started', { state: 'running', conversationRevision: revision });
    await emit(f, generation, 'output.item.created', { itemId: 'm29-' + generation.generationId, kind: 'assistant_message', revision: 1, source: 'native_event', nativeCategory: 'completion_result', partial: false, content: [{ type: 'text', text }], observedAt: new Date().toISOString() });
    await emit(f, generation, 'output.item.completed', { itemId: 'm29-' + generation.generationId, revision: 1 });
    await emit(f, generation, 'turn.completed', { terminalEvidence: 'SIMULATED M29 policy fixture' });
}

test('M29 counting uses generation composition and leaves domain tables unchanged', { skip }, async () => {
    const f = await apiFixture(url);
    try {
        await ready(f);
        const before = await f.db.pool.query('SELECT (SELECT count(*) FROM public_generations) AS generations,(SELECT count(*) FROM public_conversations) AS conversations,(SELECT count(*) FROM public_caller_tools) AS calls');
        const value = request({ history: [{ role: 'user', content: '😀é中a' }] });
        const count = await new ConversationService(f.db, f.auth).countInput(f.owner, value);
        const response = await f.request('/v2/public/input-counts', value, 'owner');
        assert.equal(response.status, 200);
        assert.equal((await response.json()).inputUnits, count.inputUnits);
        assert.equal(count.inputUnits, composeRequest(validateGenerationRequest(value)).inputUnits);
        assert.equal(estimateText('😀é中a'), 1);
        assert.equal(count.source, 'estimated');
        assert.equal(count.estimator, 'sdc-text-v1');
        assert.equal(count.admissionChecked, false);
        assert.equal(count.hiddenNativeContext, 'unknown');
        assert.equal(count.withinInputBudget, true);
        const attachmentId = '12345678-1234-1234-1234-123456789abc';
        const metadata = { attachmentId, sessionId: 'session', ownerUserId: f.owner.userId, mimeType: 'image/png', state: 'committed', retentionExpiresAt: new Date(Date.now() + 60000).toISOString() };
        await f.db.pool.query('INSERT INTO attachment_metadata(attachment_id,session_id,state,payload) VALUES($1,$2,$3,$4::jsonb)', [attachmentId, 'session', 'committed', JSON.stringify(metadata)]);
        const withImage = request({ history: [{ role: 'user', content: 'look', images: [{ type: 'image', attachmentId, mimeType: 'image/png' }] }] });
        assert.equal((await new ConversationService(f.db, f.auth).countInput(f.owner, withImage)).imageAllowanceUnits, 1024);
        await f.db.pool.query("UPDATE attachment_metadata SET payload=jsonb_set(payload,'{ownerUserId}',to_jsonb('foreign-owner'::text)) WHERE attachment_id=$1", [attachmentId]);
        await assert.rejects(new ConversationService(f.db, f.auth).countInput(f.owner, withImage), /committed attachment/);
        await assert.rejects(new ConversationService(f.db, f.auth).generate(f.owner, 'foreign-image', withImage), /committed attachment/);
        assert.equal((await f.db.readCommands(f.issued.deviceId, 'prompt', 0)).length, 0);
        const after = await f.db.pool.query('SELECT (SELECT count(*) FROM public_generations) AS generations,(SELECT count(*) FROM public_conversations) AS conversations,(SELECT count(*) FROM public_caller_tools) AS calls');
        assert.deepEqual(after.rows, before.rows);
        assert.throws(() => validateGenerationRequest(request({ history: [{ role: 'assistant', content: 'x', resultStatus: 'error' }] })), /tool results/);
    } finally { await f.close(); }
});

test('M29 caller tool error results are durable, status-sensitive and preserve old success records', { skip }, async () => {
    const f = await apiFixture(url);
    try {
        await ready(f);
        const service = new ConversationService(f.db, f.auth, [{ bindingId: 'b-session', evidence: 'SIMULATED qualification fixture' }]);
        const first = await service.generate(f.owner, 'm29-tool-first', request({ tools: [tool], toolChoice: 'required' }));
        await answer(f, first, JSON.stringify({ version: 'sdc-tool-v1', text: '', calls: [{ name: 'lookup', arguments: { key: 'beta' } }] }), 1);
        const firstDone = await service.generation(f.owner, first.generationId);
        const call = firstDone.result.calls[0];
        const prior = (await service.conversation(f.owner, first.conversationId)).history;
        const failedInput = request({ conversationId: first.conversationId, history: [...prior, { role: 'tool', callId: call.callId, content: 'not found', resultStatus: 'error' }] });
        const continuation = await service.generate(f.owner, 'm29-tool-error', failedInput);
        assert.equal((await service.generate(f.owner, 'm29-tool-error', failedInput)).generationId, continuation.generationId);
        await assert.rejects(service.generate(f.owner, 'm29-tool-error', request({ conversationId: first.conversationId, history: [...prior, { role: 'tool', callId: call.callId, content: 'not found' }] })), /changed content/);
        const ledger = (await f.db.pool.query('SELECT result FROM public_caller_tools WHERE call_id=$1', [call.callId])).rows[0].result;
        assert.deepEqual(ledger, { content: 'not found', status: 'error' });
        assert.equal((await f.db.readCommands(f.issued.deviceId, 'prompt', 0)).length, 2);
    } finally { await f.close(); }
});
