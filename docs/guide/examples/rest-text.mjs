// Small first-party documentation consumer; never a model executor or permission grant.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const mode = process.argv[2];
assert.ok(['snapshot', 'prompt', 'operation'].includes(mode), 'Choose snapshot, prompt or operation');
const origin = new URL(process.env.SDC_ORIGIN ?? 'https://localhost:15943');
assert.equal(origin.href, origin.origin + '/');
assert.equal(origin.username + origin.password, '');
assert.ok(origin.protocol === 'https:' || (origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)));
const keyPath = process.env.SDC_KEY_FILE;
assert.ok(keyPath, 'Set SDC_KEY_FILE');
assert.equal((await stat(keyPath)).mode & 0o077, 0);
const credential = (await readFile(keyPath, 'utf8')).trim();
assert.ok(credential.startsWith('sdc_api_'));
const sessionId = process.env.SDC_SESSION;
assert.match(sessionId ?? '', /^[A-Za-z0-9._:-]{1,256}$/);
const requestKey = process.env.SDC_REQUEST_KEY;
async function call(path, body) {
    const response = await fetch(origin.origin + '/api/v1' + path, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { authorization: `Bearer ${credential}`, ...(body === undefined ? {} : {
            'content-type': 'application/json', 'Idempotency-Key': requestKey, Prefer: 'wait=30' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(35_000)
    });
    const data = await response.json();
    if (!response.ok) {
        console.error(JSON.stringify({ status: response.status, code: data.error?.code ?? null }));
        process.exitCode = 1;
        return;
    }
    return data;
}
try {
    if (mode === 'snapshot') {
        const data = await call(`/sessions/${sessionId}/snapshot`);
        if (data) console.log(JSON.stringify({ sessionId: data.session.sessionId, watermark: data.watermark,
            bindingStates: data.bindings.map(binding => binding.state), events: data.events.length }, null, 2));
    } else {
        let data;
        if (mode === 'prompt') {
            assert.match(requestKey ?? '', /^[A-Za-z0-9._:-]{1,128}$/);
            data = await call(`/sessions/${sessionId}/prompts`, { model: 'sdc-default', delivery: 'queue',
                content: [{ type: 'text', text: 'Do not use tools or read/change files. Reply exactly M25-REST.' }] });
        } else {
            assert.match(process.env.SDC_OPERATION ?? '', /^[A-Za-z0-9._:-]{1,256}$/);
            data = await call(`/operations/${process.env.SDC_OPERATION}`);
        }
        if (data) console.log(JSON.stringify({ operationId: data.operationId, commandId: data.commandId,
            status: data.status, commandState: data.commandState, answer: data.result.answer,
            terminalEvidence: data.terminalEvidence, watermark: data.watermark }, null, 2));
    }
} catch {
    console.error('No verified result. A timeout does not cancel accepted work. Retain the original key/body and operation ID.');
    process.exitCode = 1;
}
