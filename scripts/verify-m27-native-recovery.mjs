/** Developer-only checks; each GUI checkpoint is performed in the already consented disposable task. */
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const directory = process.argv[2] ?? 'evidence/M27/restart-media-run';
const gateway = 'http://127.0.0.1:59319/api/v1';
const milestone = process.env.SDC_NATIVE_RECOVERY_MILESTONE === 'M30' ? 'M30' : 'M27';
const previous = process.env.SDC_NATIVE_RECOVERY_CONTINUE === '1'
    ? JSON.parse(await readFile(directory + '/native-recovery.json', 'utf8')) : null;
if (previous && !previous.results.some(r => r.kind === 'local-answer-stale-rejected')) throw Error('No verified local-resolution checkpoint to continue');
const marker = previous?.marker ?? `${milestone}-RECOVERY-` + randomUUID().slice(0, 8);
const deadline = Date.now() + 1_800_000, results = previous?.results ?? [];
const completed = new Set(results.map(result => result.kind));
let sessionId, token = 'owner', credentialId;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function save(status, error) {
    await writeFile(directory + '/native-recovery.json', JSON.stringify({ milestone, status, marker,
        results, ...(error ? { error } : {}), scope: 'Real scoped gateway/native pending question, local resolution, disconnect and reload fences; synthetic identity' }, null, 2) + '\n');
}
async function call(path, body, expected, key = marker + path) {
    const response = await fetch(gateway + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', 'idempotency-key': key },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(35000) });
    const data = await response.json();
    if (expected ? !expected.includes(response.status) : !response.ok) throw Error(path + ': ' + response.status + ': ' + JSON.stringify(data));
    return { status: response.status, data };
}
async function until(check) {
    while (Date.now() < deadline) { const value = await check(); if (value) return value; await pause(1000); }
    throw Error('Bounded native recovery deadline exceeded');
}
async function live() { return JSON.parse(await readFile(directory + '/server-live.json', 'utf8')); }
async function active(excluded) {
    const binding = await until(async () => (await live()).bindings.find(b => b.state === 'active' && b.bindingId !== excluded));
    sessionId = binding.sessionId; token = 'owner';
    const issued = (await call('/credentials', { sessionId, scopes: ['view', 'prompt'], label: marker,
        expiresAt: new Date(deadline).toISOString() })).data;
    token = issued.credential; credentialId = issued.credentialId;
    return binding;
}
async function pending(label) {
    const op = (await call('/sessions/' + sessionId + '/prompts', { model: 'sdc-default', delivery: 'queue',
        content: [{ type: 'text', text: `Use your native ask_question tool to ask "${marker}: ${label}" with options blue and green. Wait for the answer. Then reply exactly ${marker}-${label}-DONE. No other tools, files, shell or network.` }] }, undefined, marker + '-' + label)).data;
    const request = await until(async () => {
        const snapshot = (await call('/sessions/' + sessionId + '/snapshot')).data;
        const row = snapshot.interactions.find(i => i.state === 'pending' && i.kind === 'input' && i.payload.turnId === op.turnId);
        return row?.payload;
    });
    const checkpoint = { kind: label + '-pending', binding: (await live()).bindings.find(b => b.sessionId === sessionId), operation: op, request };
    results.push(checkpoint); await save(label + '-gui-required');
    console.log('GUI_CHECKPOINT ' + label + ': ' + JSON.stringify({ marker, sessionId, requestId: request.requestId }));
    return checkpoint;
}
async function stale(checkpoint) {
    const scopedToken = token;
    token = 'owner';
    const before = (await live()).commands.length;
    try {
        const response = await call('/sessions/' + checkpoint.binding.sessionId + '/controls', { type: 'input.respond', commandId: randomUUID(),
            turnId: checkpoint.operation.turnId, requestId: checkpoint.request.requestId,
            requestRevision: checkpoint.request.requestRevision, answer: 'blue' }, [403, 409]);
        await pause(1100);
        const snapshot = await live();
        if (snapshot.commands.length !== before) throw Error('Stale request created a native command');
        results.push({ kind: checkpoint.kind.replace('-pending', '-stale-rejected'), response,
            commandsBefore: before, commandsAfter: snapshot.commands.length });
        await save('running');
    } finally { token = scopedToken; }
}
try {
    let binding = await active();
    if (!previous) {
    const local = await pending('local-answer');
    await until(async () => {
        const row = (await live()).interactions.find(i => i.request_id === local.request.requestId);
        return row && row.state !== 'pending';
    });
    await stale(local);
    await until(async () => ['completed', 'cancelled', 'failed', 'rejected'].includes(
        (await call('/operations/' + local.operation.operationId)).data.status));
    token = 'owner'; await call('/credentials/' + credentialId + '/revoke', {});
    binding = (await live()).bindings.find(b => b.bindingId === binding.bindingId);
    if (binding.state !== 'active') binding = await active(binding.bindingId);
    else {
        const issued = (await call('/credentials', { sessionId, scopes: ['view', 'prompt'], label: marker + '-next', expiresAt: new Date(deadline).toISOString() })).data;
        token = issued.credential; credentialId = issued.credentialId;
    }
    }
    for (const label of ['disconnect', 'reload']) {
        if (completed.has(label + '-stale-rejected')) continue;
        const checkpoint = await pending(label);
        const ended = await until(async () => {
            const b = (await live()).bindings.find(b => b.bindingId === checkpoint.binding.bindingId);
            return b && (b.state !== 'active' || Date.parse(b.leaseExpiresAt) <= Date.now()) ? b : null;
        });
        results.push({ kind: label + '-binding-fenced', binding: ended, observedAt: new Date().toISOString() });
        await stale(checkpoint);
        token = 'owner'; await call('/credentials/' + credentialId + '/revoke', {});
        if (label === 'disconnect') {
            console.log('GUI_CHECKPOINT reconnect-after-disconnect: answer the old question locally, then reconnect the ready task.');
            await save('reconnect-after-disconnect-gui-required');
            binding = await active(checkpoint.binding.bindingId);
        }
    }
    await save('passed');
    console.log(`${milestone} pending native local-resolution/disconnect/reload fences passed.`);
} catch (error) { await save('failed', error.message); console.error(error.message); process.exitCode = 1; }
