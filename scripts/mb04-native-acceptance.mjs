/** Developer acceptance consumer. Uses public APIs and a user-completed PKCE login. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { ownerToken, callOwner } from './mb04-human-auth.mjs';

const origin = 'https://localhost:15943';
const taskId = '1791641555978_71d6l';
const marker = `MB04-${randomUUID().slice(0, 8)}`;
const lifecycle = process.argv.includes('--lifecycle');
const results = [];
let sessionId, credentialId, token = ownerToken;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(path, body, key, expected) {
    const response = await fetch(origin + '/api/v1' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
            ...(key ? { 'idempotency-key': key } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(35_000)
    });
    const data = await response.json();
    if (expected) assert.ok([].concat(expected).includes(response.status), `${path}: HTTP ${response.status}`);
    else assert.ok(response.ok, `${path}: HTTP ${response.status}`);
    return data;
}
async function save(status, error) {
    await writeFile(lifecycle ? 'evidence/MB04/post-reinstall-native.json' : 'evidence/MB04/native-acceptance.json', JSON.stringify({ milestone: 'MB-04', status,
        taskId, sessionId, marker, results, ...(error ? { error } : {}),
        scope: 'Signed unqualified evaluation; existing PluginLab IDE task; real local TLS/Keycloak/public API; no saved bearer',
        unsupported: ['approvals', 'media', 'caller tools', 'Codex', 'Claude'] }, null, 2) + '\n');
}
async function until(check) {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) { const value = await check(); if (value) return value; await pause(500); }
    throw Error('Native acceptance observation timed out');
}
async function submit(label, text) {
    return request(`/sessions/${sessionId}/prompts`, { model: 'sdc-default',
        content: [{ type: 'text', text }], delivery: 'queue' }, `${marker}-${label}`);
}
async function finish(operation) {
    return until(async () => {
        const value = await request(`/operations/${operation.operationId}`);
        if (['failed', 'rejected', 'reconciliation_required'].includes(value.status)) { results.push({ kind: 'failed-operation', operation: value }); throw Error(`Native operation ${value.status}`); };
        return ['completed', 'cancelled'].includes(value.status) ? value : undefined;
    });
}
async function interaction(operation) {
    return until(async () => (await request(`/sessions/${sessionId}/snapshot`)).interactions.find(
        item => item.state === 'pending' && item.kind === 'input' && item.payload.turnId === operation.turnId)?.payload);
}
try {
    const sessions = await callOwner('/v2/sessions', undefined, ownerToken);
    const matches = sessions.sessions.filter(item => item.binding?.state === 'active' &&
        Date.parse(item.binding.leaseExpiresAt) > Date.now() && item.binding.payload.binding.conversationId === taskId);
    assert.equal(matches.length, 1, 'Exactly one live approved task binding required');
    sessionId = matches[0].sessionId;
    results.push({ kind: 'binding', binding: matches[0].binding });
    const issued = await request('/credentials', { sessionId, scopes: ['view', 'prompt', 'approve'],
        label: 'MB04 bounded evaluation', expiresAt: new Date(Date.now() + 20 * 60_000).toISOString() });
    token = issued.credential; credentialId = issued.credentialId;
    const capabilities = await request(`/sessions/${sessionId}/capabilities`);
    assert.equal(capabilities.serverPolicy?.callerToolsReady ?? false, false);
    results.push({ kind: 'capabilities', capabilities });
    await save('running');
    const before = await request(`/sessions/${sessionId}/snapshot`);
    await request(`/sessions/${sessionId}/approvals/missing/decisions`, { decisionId: randomUUID(), requestRevision: 1, actionDigest: 'sha256:' + '0'.repeat(64), choiceId: 'allow_once', grantedPermissions: [], policyRevision: 'evaluation', expiresAt: new Date(Date.now() + 60000).toISOString() }, undefined, 422);
    const after = await request(`/sessions/${sessionId}/snapshot`);
    assert.equal(after.watermark.prompt, before.watermark.prompt);
    results.push({ kind: 'approval-refused', promptCursorUnchanged: true });
    const echo = await submit('echo', `Reply exactly ${marker}-ECHO. Do not use tools or read/change files.`);
    const echoDone = await finish(echo);
    assert.ok(JSON.stringify(echoDone.result.answer).includes(`${marker}-ECHO`));
    results.push({ kind: 'text', operation: echoDone }); await save('running');
    if (lifecycle) {
        await save('local-takeover-required');
        console.log(`GUI_CHECKPOINT send local no-tools prompt: ${marker}-LOCAL-TAKEOVER`);
        await until(async () => {
            const current = await callOwner('/v2/sessions', undefined, ownerToken);
            return current.sessions.find(item => item.sessionId === sessionId)?.binding?.state === 'detached';
        });
        const refusal = await request(`/sessions/${sessionId}/prompts`, { model: 'sdc-default',
            content: [{ type: 'text', text: `${marker}-MUST-NOT-DISPATCH` }], delivery: 'queue' }, `${marker}-stale`, [403, 409, 422]);
        results.push({ kind: 'local-takeover-detached-and-stale-prompt-refused', refusal });
        await save('passed'); console.log('MB04 reinstall roundtrip and local takeover fence passed.');
    } else {
    const question = await submit('question', `Use your native ask_question tool to ask "${marker}: choose green" with options green and blue. Wait for the answer. Reply ${marker}-QUESTION-DONE after the answer. No other tools or files.`);
    const pending = await interaction(question);
    const answer = { type: 'input.respond', commandId: randomUUID(), turnId: question.turnId,
        requestId: pending.requestId, requestRevision: pending.requestRevision, answer: 'green' };
    await request(`/sessions/${sessionId}/controls`, answer);
    const answered = await finish(question);
    assert.ok(JSON.stringify(answered.result.answer).includes(`${marker}-QUESTION-DONE`));
    results.push({ kind: 'question', requestId: pending.requestId, operation: answered }); await save('running');
    const openai = new OpenAI({ apiKey: token, baseURL: origin + '/openai/v1', maxRetries: 0,
        defaultHeaders: { 'X-SDC-Context-Mode': 'shared-task' } });
    const chat = await openai.chat.completions.create({ model: 'sdc-default', messages: [
        { role: 'user', content: `Reply exactly ${marker}-CHAT. No tools or files.` }] },
        { headers: { 'Idempotency-Key': `${marker}-chat` } });
    assert.ok(chat.choices[0].message.content.includes(`${marker}-CHAT`));
    results.push({ kind: 'openai-chat', id: chat.id, text: chat.choices[0].message.content }); await save('running');
    const response = await openai.responses.create({ model: 'sdc-default', input: `Reply exactly ${marker}-RESPONSES. No tools or files.` },
        { headers: { 'Idempotency-Key': `${marker}-responses` } });
    assert.ok(response.output_text.includes(`${marker}-RESPONSES`));
    results.push({ kind: 'openai-responses', id: response.id, text: response.output_text }); await save('running');
    const anthropic = new Anthropic({ apiKey: token, baseURL: origin + '/anthropic', maxRetries: 0,
        defaultHeaders: { 'X-SDC-Context-Mode': 'shared-task' } });
    const message = await anthropic.messages.create({ model: 'sdc-default', max_tokens: 512,
        messages: [{ role: 'user', content: `Reply exactly ${marker}-ANTHROPIC. No tools or files.` }] },
        { headers: { 'Idempotency-Key': `${marker}-anthropic` } });
    const text = message.content.filter(item => item.type === 'text').map(item => item.text).join('');
    assert.ok(text.includes(`${marker}-ANTHROPIC`));
    results.push({ kind: 'anthropic', id: message.id, text });
    const stop = await submit('cancel', `Use your native ask_question tool to ask "${marker}: wait for cancellation" with options wait and continue. Wait for its answer. No other tools or files.`);
    await interaction(stop);
    await request(`/sessions/${sessionId}/controls`, { type: 'turn.cancel', commandId: randomUUID(),
        turnId: stop.turnId, reason: 'MB04 bounded cancellation acceptance' });
    const cancelled = await finish(stop); assert.equal(cancelled.status, 'cancelled');
    results.push({ kind: 'cancel', operation: cancelled }); await save('running');
    await save('passed'); console.log('MB04 bounded native controls and provider text acceptance passed.');
    }
} catch (error) { await save('failed', error.message); console.error(error.message); process.exitCode = 1; }
finally {
    if (credentialId) await callOwner(`/api/v1/credentials/${credentialId}/revoke`, {}, ownerToken);
}
