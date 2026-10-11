import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: 'fixture', baseURL: process.argv[2], maxRetries: 0,
    defaultHeaders: { 'Idempotency-Key': 'node-sdk-original' } });
const models = await client.models.list();
assert.equal(models.data[0].id, 'sdc-default');
const count = await client.messages.countTokens({ model: 'sdc-default', messages: [{ role: 'user', content: 'hello' }] });
assert.equal(count.input_tokens, 3);
const message = await client.messages.create({ model: 'sdc-default', max_tokens: 32, messages: [{ role: 'user', content: 'hello' }] });
assert.equal(message.content[0].text, 'hello');
const stream = client.messages.stream({ model: 'sdc-default', max_tokens: 32, messages: [{ role: 'user', content: 'hello' }] },
    { headers: { 'Idempotency-Key': 'node-sdk-stream' } });
const events = [];
for await (const event of stream) events.push(event);
const final = await stream.finalMessage();
assert.equal(final.content[0].text, 'hello');
assert.equal(final.stop_reason, 'end_turn');
assert.ok(events.some(event => event.type === 'content_block_delta'));
console.log(JSON.stringify({ model: models.data[0].id, count: count.input_tokens, text: message.content[0].text, streamed: final.content[0].text }));
