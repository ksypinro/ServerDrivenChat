/** Bounded retry, credential isolation and competing-ingress probe on the real M30 binding. */
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const directory = process.argv[2] ?? 'evidence/M30/native-run';
const base = 'http://127.0.0.1:59319/api/v1';
const marker = `M30-FAILURES-${randomUUID().slice(0, 8)}`;
const evidence = { milestone: 'M30', status: 'running', marker, results: [] };
const credentials = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(path, token, body, key) {
    const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
            ...(key ? { 'idempotency-key': key } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(35_000)
    });
    return { status: response.status, value: await response.json() };
}
function expect(result, status, label) {
    if (!([].concat(status).includes(result.status))) {
        const value = result.value && typeof result.value === 'object' ? { ...result.value, credential: undefined } : result.value;
        throw Error(`${label}: HTTP ${result.status} ${JSON.stringify(value)}`);
    }
    return result.value;
}
async function save() {
    await writeFile(`${directory}/failures-native.json`, JSON.stringify(evidence, null, 2) + '\n');
}
async function complete(id, token) {
    for (let i = 0; i < 600; i++) {
        const response = await request(`/generations/${id}`, token);
        const value = expect(response, 200, 'generation retrieval');
        if (value.result) return value;
        await pause(500);
    }
    throw Error(`Native generation ${id} did not settle`);
}
const body = text => ({ model: 'sdc-default', contextMode: 'shared-task',
    history: [{ role: 'user', content: `Reply exactly ${text}. No tools, files, shell or network.` }],
    instructions: 'Return only the requested marker.' });

try {
    const live = JSON.parse(await readFile(`${directory}/server-live.json`, 'utf8'));
    const binding = live.bindings?.find(item => item.state === 'active' && Date.parse(item.leaseExpiresAt) > Date.now());
    if (!binding) throw Error('No active consented Cline binding');
    evidence.results.push({ kind: 'binding', bindingId: binding.bindingId, sessionId: binding.sessionId });
    for (const label of ['alpha', 'beta']) {
        const issued = expect(await request('/credentials', 'owner', { sessionId: binding.sessionId,
            scopes: ['view', 'prompt'], label: `M30 ${label} disposable isolation`,
            expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() }), 201, 'credential issue');
        credentials.push({ label, ...issued });
    }
    const [alpha, beta] = credentials;
    const firstBody = body(`${marker}-FIRST`);
    const firstKey = `${marker}-first`;
    const first = expect(await request('/generations', alpha.credential, firstBody, firstKey), [200, 202], 'first admission');
    evidence.results.push({ kind: 'admission', generationId: first.generationId, operationId: first.operationId });
    // Losing this HTTP reply after a committed admission has the same server-side state as a lost wire reply.
    const replay = expect(await request('/generations', alpha.credential, firstBody, firstKey), [200, 202], 'same-key retry');
    if (replay.generationId !== first.generationId || replay.operationId !== first.operationId) throw Error('Same-key retry duplicated native work');
    const conflict = await request('/generations', alpha.credential, body(`${marker}-CHANGED`), firstKey);
    if (conflict.status !== 409) throw Error(`Changed-payload retry returned ${conflict.status}`);
    const foreign = await request(`/generations/${first.generationId}`, beta.credential);
    if (foreign.status !== 404) throw Error(`Another credential read private generation: ${foreign.status}`);
    evidence.results.push({ kind: 'retry-and-isolation', sameGeneration: true, changedPayloadStatus: conflict.status,
        foreignCredentialStatus: foreign.status });
    await save();
    const terminal = await complete(first.generationId, alpha.credential);
    if (terminal.result.status !== 'completed' || !terminal.result.text.includes(`${marker}-FIRST`)) throw Error('First native generation failed');
    evidence.results.push({ kind: 'first-terminal', generationId: first.generationId,
        status: terminal.result.status, text: terminal.result.text });

    // Two principals contest the same native lane. Exactly one can be admitted while one is outstanding.
    const contenders = [alpha, beta].map((client, index) => ({ client,
        key: `${marker}-contender-${index}`, request: body(`${marker}-CONTENDER-${index}`) }));
    const replies = await Promise.all(contenders.map(async contender =>
        request('/generations', contender.client.credential, contender.request, contender.key)));
    const admitted = replies.map((reply, index) => ({ reply, index })).filter(item => [200, 202].includes(item.reply.status));
    const blocked = replies.map((reply, index) => ({ reply, index })).filter(item => item.reply.status === 409);
    if (admitted.length !== 1 || blocked.length !== 1) throw Error(`Concurrent ingress did not serialize: ${replies.map(r => r.status)}`);
    evidence.results.push({ kind: 'concurrent-ingress', statuses: replies.map(reply => reply.status),
        admittedGenerationId: admitted[0].reply.value.generationId, blockedCode: blocked[0].reply.value.code ?? null });
    const winner = await complete(admitted[0].reply.value.generationId, contenders[admitted[0].index].client.credential);
    if (winner.result.status !== 'completed' || !winner.result.text.includes(`${marker}-CONTENDER-${admitted[0].index}`)) throw Error('Winning concurrent native turn failed');
    const loser = contenders[blocked[0].index];
    const later = expect(await request('/generations', loser.client.credential, loser.request, loser.key), [200, 202], 'blocked contender retry after settlement');
    const laterDone = await complete(later.generationId, loser.client.credential);
    if (laterDone.result.status !== 'completed' || !laterDone.result.text.includes(`${marker}-CONTENDER-${blocked[0].index}`)) throw Error('Later native retry failed');
    evidence.results.push({ kind: 'later-admission', generationId: later.generationId,
        status: laterDone.result.status, text: laterDone.result.text });
    evidence.status = 'passed';
    await save();
    console.log('M30 native retry, credential isolation and concurrent ingress passed.');
} catch (error) {
    evidence.status = 'failed'; evidence.error = error.message;
    await save(); console.error(error); process.exitCode = 1;
} finally {
    for (const issued of credentials) {
        try { expect(await request(`/credentials/${issued.credentialId}/revoke`, 'owner', {}), 200, 'credential revoke'); }
        catch (error) { console.error(error); process.exitCode = 1; }
    }
}
