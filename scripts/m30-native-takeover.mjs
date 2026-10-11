/** Developer-only real Cline local-takeover check on the consented disposable task. */
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const directory = process.argv[2] ?? 'evidence/M30/native-tool-run';
const gateway = 'http://127.0.0.1:59319/api/v1';
const marker = `M30-TAKEOVER-${randomUUID().slice(0, 8)}`;
const deadline = Date.now() + 900_000;
const output = `${directory}/native-takeover.json`;
const results = [];
let token = 'owner';

async function save(status, error) {
    await writeFile(output, JSON.stringify({ milestone: 'M30', status, marker, results,
        ...(error ? { error } : {}), scope: 'Real disposable Cline local prompt invalidation and server admission fence' }, null, 2) + '\n');
}
async function call(path, body, expected, key) {
    const response = await fetch(gateway + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
            ...(key ? { 'idempotency-key': key } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(35_000) });
    const data = await response.json();
    if (expected ? !expected.includes(response.status) : !response.ok) throw Error(`${path}: ${response.status}: ${JSON.stringify(data)}`);
    return { status: response.status, data };
}
const live = async () => JSON.parse(await readFile(`${directory}/server-live.json`, 'utf8'));
async function until(check) {
    while (Date.now() < deadline) {
        const value = await check();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw Error('Bounded native takeover deadline exceeded');
}

try {
    const before = await until(async () => {
        const snapshot = await live();
        const binding = snapshot.bindings.findLast(row => row.state === 'active' && Date.parse(row.leaseExpiresAt) > Date.now());
        return binding ? { snapshot, binding } : null;
    });
    const issued = (await call('/credentials', { sessionId: before.binding.sessionId, scopes: ['view', 'prompt'],
        label: marker, expiresAt: new Date(deadline).toISOString() })).data;
    token = issued.credential;
    results.push({ kind: 'binding-ready', bindingId: before.binding.bindingId, sessionId: before.binding.sessionId,
        commandCount: before.snapshot.commands.length });
    await save('local-prompt-gui-required');
    console.log(`GUI_CHECKPOINT local-takeover: send exactly "${marker}. Reply ${marker}-DONE only. No tools or file changes." in the bound Cline task.`);
    const detached = await until(async () => {
        const snapshot = await live();
        const binding = snapshot.bindings.find(row => row.bindingId === before.binding.bindingId);
        return binding?.state === 'detached' ? { snapshot, binding } : null;
    });
    results.push({ kind: 'binding-detached', bindingId: detached.binding.bindingId,
        localOutputObserved: detached.snapshot.events.some(event => event.type === 'output.item.created' &&
            event.payload?.kind === 'user_message' && event.payload?.content?.some(block => block.text?.includes(marker))),
        reconciliationObserved: detached.snapshot.events.some(event => event.type === 'session.reconciliation_required' &&
            /local user prompt/i.test(event.payload?.reason ?? '')) });
    const blocked = await call(`/sessions/${before.binding.sessionId}/prompts`, { model: 'sdc-default', delivery: 'queue',
        content: [{ type: 'text', text: `${marker}-REMOTE-SHOULD-NOT-DISPATCH` }] }, [403, 409, 422], `${marker}-stale`);
    const after = await live();
    if (after.commands.length !== before.snapshot.commands.length) throw Error('Stale post-takeover prompt created a native command');
    results.push({ kind: 'stale-prompt-rejected', response: blocked, commandCount: after.commands.length });
    token = 'owner';
    await call(`/credentials/${issued.credentialId}/revoke`, {});
    await save('passed');
    console.log('M30 real native local-takeover admission fence passed.');
} catch (error) {
    await save('failed', error.message);
    console.error(error.message);
    process.exitCode = 1;
}
