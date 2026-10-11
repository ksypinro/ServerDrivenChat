// Official SDK consumer; the test server explicitly supplies scripted native events.
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { readFile } from 'node:fs/promises';
assert.equal(JSON.parse(await readFile(new URL('../../node_modules/openai/package.json', import.meta.url), 'utf8')).version, '7.30.0');
const client = new OpenAI({ baseURL: process.env.SDC_GATEWAY_URL, apiKey: process.env.SDC_TEST_KEY,
    maxRetries: 2, defaultHeaders: { 'X-SDC-Context-Mode': 'shared-task' } });
assert.deepEqual((await client.models.list()).data.map(m => m.id), ['sdc-default']);
const chat = await client.chat.completions.create({ model: 'sdc-default', messages: [{ role: 'user', content: 'Node SDK' }] },
    { headers: { 'Idempotency-Key': 'node-chat' } });
assert.equal(chat.choices[0].message.content, 'NODE CHAT');
assert.equal(chat.choices[0].finish_reason, 'stop');
assert.equal(chat.usage.sdc.source, 'estimated');
const response = await client.responses.stream({ model: 'sdc-default', input: 'Node Responses' },
    { headers: { 'Idempotency-Key': 'node-responses' } }).finalResponse();
assert.equal(response.output_text, 'NODE RESPONSE');
assert.equal(response.status, 'completed');
assert.equal((await client.responses.retrieve(response.id)).id, response.id);
const stream = await client.chat.completions.create({ model: 'sdc-default', messages: [{ role: 'user', content: 'Node streaming' }],
    stream: true, stream_options: { include_usage: true } }, { headers: { 'Idempotency-Key': 'node-stream' } });
let text = '', finish, usage;
for await (const chunk of stream) {
    text += chunk.choices[0]?.delta.content ?? '';
    finish = chunk.choices[0]?.finish_reason ?? finish;
    usage = chunk.usage ?? usage;
}
assert.equal(text, 'NODE STREAM'); assert.equal(finish, 'stop'); assert.equal(usage.sdc.source, 'estimated');
console.log(JSON.stringify({ status: 'passed', sdk: 'openai@7.30.0', scope: 'Real gateway/server/database; scripted native events; no Cline/client acceptance claim' }));
