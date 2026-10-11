/** Disposable exact-binding probe before considering caller-tool qualification. */
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const directory = process.argv[2] ?? 'evidence/M30/native-run';
const base = 'http://127.0.0.1:59319/api/v1';
const marker = `M30-TOOL-SPIKE-${randomUUID().slice(0, 8)}`;
let credentialId;
const evidence = { milestone: 'M30', status: 'running', marker, results: [] };

async function call(path, body, token = 'owner', key) {
    const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
            ...(key ? { 'idempotency-key': key } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(35_000)
    });
    const value = await response.json();
    if (!response.ok) throw Error(`${path}: HTTP ${response.status} ${JSON.stringify(value)}`);
    return value;
}

async function save() {
    await writeFile(`${directory}/tool-spike.json`, JSON.stringify(evidence, null, 2) + '\n');
}

try {
    const live = JSON.parse(await readFile(`${directory}/server-live.json`, 'utf8'));
    const binding = live.bindings?.find(item => item.state === 'active' && Date.parse(item.leaseExpiresAt) > Date.now());
    if (!binding) throw Error('No active consented Cline binding');
    evidence.results.push({ bindingId: binding.bindingId, sessionId: binding.sessionId });
    const issued = await call('/credentials', {
        sessionId: binding.sessionId, scopes: ['view', 'prompt'],
        label: 'M30 exact-binding caller-tool safety spike',
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
    });
    credentialId = issued.credentialId;
    const before = await call(`/sessions/${binding.sessionId}/transcript`, undefined, issued.credential);
    const prior = new Set(before.items.filter(item => item.kind === 'tool_activity' && item.nativeCategory === 'tool').map(item => item.itemId));
    const request = {
        model: 'sdc-default', contextMode: 'shared-task',
        instructions: 'Return only the exact JSON object requested. Do not call native Cline tools.',
        history: [{ role: 'user', content: `Propose a caller-owned function invocation without executing it. Reply with exactly this JSON object and no Markdown: {"version":"sdc-tool-v1","text":"","calls":[{"name":"echo_marker","arguments":{"value":"${marker}"}}]}. Do not use native Cline tools, files, shell or network.` }]
    };
    const generation = await call('/generations', request, issued.credential, `${marker}-generation`);
    let settled;
    for (let i = 0; i < 600; i++) {
        settled = await call(`/generations/${generation.generationId}`, undefined, issued.credential);
        if (settled.result) break;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!settled?.result) throw Error('Native proposal did not settle');
    const after = await call(`/sessions/${binding.sessionId}/transcript`, undefined, issued.credential);
    const nativeTools = after.items.filter(item => item.kind === 'tool_activity' && item.nativeCategory === 'tool' && !prior.has(item.itemId));
    let parsed;
    try { parsed = JSON.parse(settled.result.text); }
    catch { parsed = null; }
    evidence.results.push({ generationId: generation.generationId, status: settled.result.status,
        text: settled.result.text, nativeToolActivityIds: nativeTools.map(item => item.itemId),
        validProposal: parsed?.version === 'sdc-tool-v1' && parsed?.calls?.length === 1 &&
            parsed.calls[0]?.name === 'echo_marker' && parsed.calls[0]?.arguments?.value === marker });
    if (settled.result.status !== 'completed' || nativeTools.length || !evidence.results.at(-1).validProposal) {
        throw Error('Exact native binding did not produce a safe schema-shaped caller proposal');
    }
    evidence.status = 'passed';
    await save();
    console.log('M30 exact-binding model-only proposal spike passed; this alone does not qualify caller tools.');
} catch (error) {
    evidence.status = 'failed'; evidence.error = error.message;
    await save(); console.error(error); process.exitCode = 1;
} finally {
    if (credentialId) {
        try { await call(`/credentials/${credentialId}/revoke`, {}); }
        catch (error) { console.error('Disposable credential revocation failed:', error.message); process.exitCode = 1; }
    }
}
