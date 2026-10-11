// Documentation API consumer: the existing consented Cline task executes the model.
// Run from the repository after its locked developer dependency installation.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const mode = process.argv[2];
assert.ok(['chat', 'responses', 'anthropic'].includes(mode), 'Choose chat, responses or anthropic');
const origin = new URL(process.env.SDC_ORIGIN ?? 'https://localhost:15943');
assert.equal(origin.href, origin.origin + '/', 'SDC_ORIGIN must be an origin without extra path/query/credentials');
assert.ok(origin.protocol === 'https:' || (origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)));
assert.equal(origin.username + origin.password, '');
const keyPath = process.env.SDC_KEY_FILE;
assert.ok(keyPath, 'Set SDC_KEY_FILE to an owner-issued scoped credential file');
assert.equal((await stat(keyPath)).mode & 0o077, 0, 'Credential file must not be accessible to other users');
const credential = (await readFile(keyPath, 'utf8')).trim();
assert.ok(credential.startsWith('sdc_api_'), 'Use an SDC scoped credential, not a vendor API key');
const requestKey = process.env.SDC_REQUEST_KEY;
assert.match(requestKey ?? '', /^[A-Za-z0-9._:-]{1,128}$/, 'Set and retain one SDC_REQUEST_KEY per intended submission');
const expected = { chat: 'M25-OPENAI-CHAT', responses: 'M25-OPENAI-RESPONSES', anthropic: 'M25-ANTHROPIC' }[mode];
const text = `Do not use tools or read/change files. Reply exactly ${expected}.`;
const options = { headers: { 'Idempotency-Key': requestKey } };
const defaults = { 'X-SDC-Context-Mode': 'shared-task' };
try {
    let answer;
    let responseId;
    let usage;
    if (mode === 'anthropic') {
        const client = new Anthropic({ apiKey: credential, baseURL: origin.origin + '/anthropic',
            maxRetries: 0, timeout: 120_000, defaultHeaders: defaults });
        const result = await client.messages.create({ model: 'sdc-default', max_tokens: 128,
            messages: [{ role: 'user', content: text }] }, options);
        answer = result.content.filter(block => block.type === 'text').map(block => block.text).join('');
        responseId = result.id; usage = result.usage;
    } else {
        const client = new OpenAI({ apiKey: credential, baseURL: origin.origin + '/openai/v1',
            maxRetries: 0, timeout: 120_000, defaultHeaders: defaults });
        if (mode === 'chat') {
            const result = await client.chat.completions.create({ model: 'sdc-default',
                messages: [{ role: 'user', content: text }] }, options);
            answer = result.choices[0].message.content; responseId = result.id; usage = result.usage;
        } else {
            const result = await client.responses.create({ model: 'sdc-default', input: text }, options);
            answer = result.output_text; responseId = result.id; usage = result.usage;
        }
    }
    assert.equal(answer?.trim(), expected);
    console.log(JSON.stringify({ profile: mode, responseId, text: answer, usage,
        usageMeaning: 'server estimate; not native generated-token or billing measurement' }, null, 2));
} catch (error) {
    // Do not serialize SDK request objects, headers or credentials into a support log.
    console.error(JSON.stringify({ status: error.status ?? null, code: error.code ?? null,
        result: 'Not verified. Preserve the original key/body; inspect the original operation/response before retrying.' }));
    process.exitCode = 1;
}
