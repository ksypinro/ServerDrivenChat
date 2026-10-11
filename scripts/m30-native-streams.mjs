/** Official SDK streaming acceptance through FastAPI and a consented installed Cline task. */
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const directory = process.argv[2] ?? 'evidence/M30/native-run';
const gateway = 'http://127.0.0.1:59319';
const marker = `M30-STREAM-${randomUUID().slice(0, 8)}`;
const results = [];
let credentialId;

async function request(path, body, token = 'owner') {
    const response = await fetch(`${gateway}/api/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(35_000)
    });
    const data = await response.json();
    if (!response.ok) throw Error(`${path}: HTTP ${response.status} ${JSON.stringify(data)}`);
    return data;
}

async function save(status, error) {
    await writeFile(`${directory}/sdk-streams-native.json`, JSON.stringify({
        milestone: 'M30', status, marker, gateway,
        clientPins: { openaiNode: '7.30.0', anthropicNode: '0.132.1' },
        results, ...(error ? { error } : {}),
        scope: 'Installed Cline through FastAPI/TypeScript; synthetic disposable identity; no bearer retained'
    }, null, 2) + '\n');
}

try {
    const live = JSON.parse(await readFile(`${directory}/server-live.json`, 'utf8'));
    const binding = live.bindings?.find(item => item.state === 'active' && Date.parse(item.leaseExpiresAt) > Date.now());
    if (!binding) throw Error('No active consented Cline binding');
    results.push({ kind: 'binding', bindingId: binding.bindingId, sessionId: binding.sessionId });
    const issued = await request('/credentials', {
        sessionId: binding.sessionId, scopes: ['view', 'prompt'],
        label: 'M30 disposable official SDK streaming acceptance',
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString()
    });
    const credential = issued.credential;
    credentialId = issued.credentialId;
    const common = { apiKey: credential, maxRetries: 2, timeout: 600_000,
        defaultHeaders: { 'X-SDC-Context-Mode': 'shared-task' } };
    const openai = new OpenAI({ ...common, baseURL: `${gateway}/openai/v1` });
    const anthropic = new Anthropic({ ...common, baseURL: `${gateway}/anthropic` });

    const chat = await openai.chat.completions.create({
        model: 'sdc-default', stream: true, stream_options: { include_usage: true },
        messages: [{ role: 'user', content: `Reply exactly ${marker}-CHAT. No tools or file changes.` }]
    }, { headers: { 'Idempotency-Key': `${marker}-chat` } });
    let chatText = '', chatFinish, chatUsage;
    for await (const chunk of chat) {
        chatText += chunk.choices[0]?.delta?.content ?? '';
        chatFinish = chunk.choices[0]?.finish_reason ?? chatFinish;
        chatUsage = chunk.usage ?? chatUsage;
    }
    results.push({ kind: 'openai-chat-stream', text: chatText, finishReason: chatFinish, usage: chatUsage });
    if (!chatText.includes(`${marker}-CHAT`) || chatFinish !== 'stop' || chatUsage?.sdc?.source !== 'estimated') {
        throw Error('OpenAI Chat native stream did not produce the expected marker/terminal estimate');
    }

    const response = await openai.responses.stream({
        model: 'sdc-default', input: `Reply exactly ${marker}-RESPONSES. No tools or file changes.`
    }, { headers: { 'Idempotency-Key': `${marker}-responses` } }).finalResponse();
    const retrieved = await openai.responses.retrieve(response.id);
    results.push({ kind: 'openai-responses-stream', id: response.id, status: response.status,
        text: response.output_text, retrievedId: retrieved.id, usage: response.usage });
    if (!response.output_text.includes(`${marker}-RESPONSES`) || response.status !== 'completed' || retrieved.id !== response.id) {
        throw Error('OpenAI Responses native stream/retrieval mismatch');
    }

    const stream = anthropic.messages.stream({
        model: 'sdc-default', max_tokens: 512,
        messages: [{ role: 'user', content: `Reply exactly ${marker}-ANTHROPIC. No tools or file changes.` }]
    }, { headers: { 'Idempotency-Key': `${marker}-anthropic` } });
    const eventTypes = [];
    for await (const event of stream) eventTypes.push(event.type);
    const message = await stream.finalMessage();
    const text = message.content.filter(item => item.type === 'text').map(item => item.text).join('');
    results.push({ kind: 'anthropic-messages-stream', id: message.id, text, stopReason: message.stop_reason,
        usage: message.usage, eventTypes });
    if (!text.includes(`${marker}-ANTHROPIC`) || message.stop_reason !== 'end_turn' || !eventTypes.includes('content_block_delta')) {
        throw Error('Anthropic Messages native stream mismatch');
    }
    await save('passed');
    console.log('M30 official OpenAI/Anthropic Node native streams and Responses retrieval passed.');
} catch (error) {
    await save('failed', error.message);
    console.error(error);
    process.exitCode = 1;
} finally {
    if (credentialId) {
        try { await request(`/credentials/${credentialId}/revoke`, {}); }
        catch (error) { console.error('Disposable credential revocation failed:', error.message); process.exitCode = 1; }
    }
}
