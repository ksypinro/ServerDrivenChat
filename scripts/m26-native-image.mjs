import { ownerToken } from './m26-human-auth.mjs';
/** Committed PNG acceptance across first-party and provider routes on a real Cline binding. */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const directory = process.argv[2] ?? 'evidence/M26';
const gateway = 'https://localhost:15943';
const marker = `M26-IMAGE-${randomUUID().slice(0, 8)}`;
const results = [];
let credentialId;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(path, body, token, key) {
    const response = await fetch(`${gateway}/api/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
            ...(key ? { 'idempotency-key': key } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(35_000)
    });
    const data = await response.json();
    if (!response.ok) throw Error(`${path}: HTTP ${response.status} ${JSON.stringify(data)}`);
    return data;
}

async function save(status, error) {
    await writeFile(`${directory}/image-native.json`, JSON.stringify({
        milestone: 'M26', status, marker, results, ...(error ? { error } : {}),
        scope: 'One checksummed committed PNG through FastAPI/TypeScript and installed Cline; genuine persistent local Keycloak PKCE/TLS identity; no bearer or image bytes retained'
    }, null, 2) + '\n');
}

async function settled(id, token) {
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
        const state = await request(`/generations/${id}`, undefined, token);
        if (state.result) return state;
        await pause(700);
    }
    throw Error('Native image generation did not settle within ten minutes');
}

try {
    const live = JSON.parse(await readFile(`${directory}/server-live.json`, 'utf8'));
    const binding = live.bindings?.find(item => item.state === 'active' && Date.parse(item.leaseExpiresAt) > Date.now());
    if (!binding) throw Error('No active consented Cline binding');
    const issued = await request('/credentials', {
        sessionId: binding.sessionId, scopes: ['view', 'prompt'],
        label: 'M26 disposable image/provider acceptance',
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString()
    }, ownerToken);
    const token = issued.credential;
    credentialId = issued.credentialId;
    results.push({ kind: 'binding', bindingId: binding.bindingId, sessionId: binding.sessionId });

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
    const sha256 = `sha256:${createHash('sha256').update(png).digest('hex')}`;
    const upload = await fetch(`${gateway}/api/v1/attachments`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png',
            'x-session-id': binding.sessionId, 'x-file-name': 'm26-disposable.png', 'x-content-sha256': sha256 },
        body: png, signal: AbortSignal.timeout(35_000)
    });
    const image = await upload.json();
    if (upload.status !== 202) throw Error(`PNG upload failed: ${JSON.stringify(image)}`);
    await request(`/attachments/${image.attachmentId}/commit`, { sha256 }, token);
    results.push({ kind: 'committed-image', attachmentId: image.attachmentId, sha256, sizeBytes: png.length });
    await save('running');

    const userText = suffix => `A disposable PNG is attached. Reply exactly ${marker}-${suffix}. No tools or file changes.`;
    const generation = await request('/generations', {
        model: 'sdc-default', contextMode: 'shared-task', instructions: 'Return only the requested text.',
        history: [{ role: 'user', content: userText('FIRSTPARTY'),
            images: [{ type: 'image', attachmentId: image.attachmentId, mimeType: 'image/png' }] }]
    }, token, `${marker}-firstparty`);
    const firstParty = await settled(generation.generationId, token);
    const operation = await request(`/operations/${generation.operationId}`, undefined, token);
    const receipt = await request(`/sessions/${binding.sessionId}/commands/${operation.commandId}`, undefined, token);
    results.push({ kind: 'first-party', generationId: generation.generationId, status: firstParty.result.status,
        text: firstParty.result.text, receiptState: receipt.state,
        stagedChecksumObserved: JSON.stringify(receipt.payload).includes(sha256) });
    if (firstParty.result.status !== 'completed' || !firstParty.result.text.includes(`${marker}-FIRSTPARTY`) ||
        receipt.state !== 'applied' || !JSON.stringify(receipt.payload).includes(sha256)) {
        throw Error('First-party native PNG staging or completion mismatch');
    }
    await save('running');

    const uri = `sdc-attachment://${image.attachmentId}?mime=image/png`;
    const common = { apiKey: token, maxRetries: 2, timeout: 600_000,
        defaultHeaders: { 'X-SDC-Context-Mode': 'shared-task' } };
    const openai = new OpenAI({ ...common, baseURL: `${gateway}/openai/v1` });
    const anthropic = new Anthropic({ ...common, baseURL: `${gateway}/anthropic` });
    const chat = await openai.chat.completions.create({ model: 'sdc-default', messages: [{ role: 'user', content: [
        { type: 'text', text: userText('CHAT') }, { type: 'image_url', image_url: { url: uri } }
    ] }] }, { headers: { 'Idempotency-Key': `${marker}-chat` } });
    const chatText = chat.choices[0]?.message?.content ?? '';
    results.push({ kind: 'openai-chat-image', id: chat.id, text: chatText, usage: chat.usage });
    if (!chatText.includes(`${marker}-CHAT`)) throw Error('OpenAI Chat native image mismatch');
    await save('running');

    const response = await openai.responses.create({ model: 'sdc-default', input: [{ role: 'user', content: [
        { type: 'input_text', text: userText('RESPONSES') }, { type: 'input_image', image_url: uri }
    ] }] }, { headers: { 'Idempotency-Key': `${marker}-responses` } });
    results.push({ kind: 'openai-responses-image', id: response.id, text: response.output_text, usage: response.usage });
    if (!response.output_text.includes(`${marker}-RESPONSES`)) throw Error('OpenAI Responses native image mismatch');
    await save('running');

    const message = await anthropic.messages.create({ model: 'sdc-default', max_tokens: 512, messages: [{ role: 'user', content: [
        { type: 'text', text: userText('ANTHROPIC') }, { type: 'image', source: { type: 'url', url: uri } }
    ] }] }, { headers: { 'Idempotency-Key': `${marker}-anthropic` } });
    const text = message.content.filter(item => item.type === 'text').map(item => item.text).join('');
    results.push({ kind: 'anthropic-image', id: message.id, text, usage: message.usage });
    if (!text.includes(`${marker}-ANTHROPIC`)) throw Error('Anthropic Messages native image mismatch');
    await save('passed');
    console.log('M26 committed PNG reached native Cline through first-party/OpenAI/Anthropic routes.');
} catch (error) {
    await save('failed', error.message);
    console.error(error);
    process.exitCode = 1;
} finally {
    if (credentialId) {
        try { await request(`/credentials/${credentialId}/revoke`, {}, ownerToken); }
        catch (error) { console.error('Disposable credential revocation failed:', error.message); process.exitCode = 1; }
    }
}
