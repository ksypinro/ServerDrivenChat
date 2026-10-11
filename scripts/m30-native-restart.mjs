/** Two-phase durable replay probe across a disposable TypeScript server restart. */
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';

const phase = process.argv[2];
const directory = process.argv[3] ?? 'evidence/M30/native-run';
if (!['prepare', 'verify'].includes(phase)) throw Error('Usage: node scripts/m30-native-restart.mjs prepare|verify [evidence-directory]');
const base = 'http://127.0.0.1:59319/api/v1';
const privatePath = '/private/tmp/sdc-m30-restart-secret.json';
const publicPath = `${directory}/restart-native.json`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function call(path, token, body, key) {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
            ...(key ? { 'idempotency-key': key } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(35_000) });
    return { status: response.status, value: await response.json() };
}
function good(reply, status, label) {
    if (![status].flat().includes(reply.status)) {
        const value = reply.value && typeof reply.value === 'object' ? { ...reply.value, credential: undefined } : reply.value;
        throw Error(`${label}: HTTP ${reply.status} ${JSON.stringify(value)}`);
    }
    return reply.value;
}
async function save(value) { await writeFile(publicPath, JSON.stringify(value, null, 2) + '\n'); }

if (phase === 'prepare') {
    const marker = `M30-RESTART-${randomUUID().slice(0, 8)}`;
    const publicEvidence = { milestone: 'M30', status: 'prepared', marker, results: [] };
    let issued;
    try {
        const live = JSON.parse(await readFile(`${directory}/server-live.json`, 'utf8'));
        const binding = live.bindings?.find(item => item.state === 'active' && Date.parse(item.leaseExpiresAt) > Date.now());
        if (!binding) throw Error('No active native binding before restart');
        issued = good(await call('/credentials', 'owner', { sessionId: binding.sessionId,
            scopes: ['view', 'prompt'], label: 'M30 disposable server restart replay',
            expiresAt: new Date(Date.now() + 45 * 60_000).toISOString() }), 201, 'issue credential');
        const body = { model: 'sdc-default', contextMode: 'shared-task',
            history: [{ role: 'user', content: `Reply exactly ${marker}-OK. No tools or files.` }],
            instructions: 'Return only the requested marker.' };
        const key = `${marker}-original`;
        const started = good(await call('/generations', issued.credential, body, key), [200, 202], 'admission');
        let done;
        for (let i = 0; i < 600; i++) {
            done = good(await call(`/generations/${started.generationId}`, issued.credential), 200, 'generation');
            if (done.result) break;
            await pause(500);
        }
        if (done?.result?.status !== 'completed' || !done.result.text.includes(`${marker}-OK`)) throw Error('Native preparation did not complete');
        const operation = good(await call(`/operations/${started.operationId}`, issued.credential), 200, 'operation');
        const before = JSON.parse(await readFile(`${directory}/server-live.json`, 'utf8'));
        const commandCount = before.commands?.filter(item => item.commandId === operation.commandId).length ?? 0;
        if (commandCount !== 1) throw Error(`Preparation observed ${commandCount} native command records`);
        publicEvidence.results.push({ kind: 'before-restart', bindingId: binding.bindingId,
            sessionId: binding.sessionId, generationId: started.generationId,
            operationId: started.operationId, commandId: operation.commandId, turnId: operation.turnId,
            commandCount, text: done.result.text });
        await writeFile(privatePath, JSON.stringify({ issued, body, key, started, operation, publicEvidence }), { mode: 0o600 });
        await save(publicEvidence);
        console.log('M30 restart probe prepared; restart the disposable TypeScript server with its exact recovery schema.');
    } catch (error) {
        publicEvidence.status = 'failed'; publicEvidence.error = error.message;
        await save(publicEvidence); console.error(error); process.exitCode = 1;
        if (issued) try { await call(`/credentials/${issued.credentialId}/revoke`, 'owner', {}); } catch {}
    }
} else {
    const state = JSON.parse(await readFile(privatePath, 'utf8'));
    const { issued, body, key, started, operation, publicEvidence } = state;
    try {
        const replay = good(await call('/generations', issued.credential, body, key), [200, 202], 'post-restart retry');
        if (replay.generationId !== started.generationId || replay.operationId !== started.operationId) throw Error('Restart retry changed operation identity');
        const changed = await call('/generations', issued.credential,
            { ...body, history: [{ role: 'user', content: 'Changed after server restart' }] }, key);
        if (changed.status !== 409) throw Error(`Post-restart changed-key conflict returned ${changed.status}`);
        const live = JSON.parse(await readFile(`${directory}/server-live.json`, 'utf8'));
        const commands = live.commands?.filter(item => item.commandId === operation.commandId) ?? [];
        if (commands.length !== 1) throw Error(`Restart replay observed ${commands.length} native command records`);
        publicEvidence.results.push({ kind: 'after-restart', generationId: replay.generationId,
            sameOperation: replay.operationId === started.operationId, changedPayloadStatus: changed.status,
            nativeCommandRecords: commands.length });
        publicEvidence.status = 'passed'; await save(publicEvidence);
        console.log('M30 same-key replay across TypeScript server restart passed.');
    } catch (error) {
        publicEvidence.status = 'failed'; publicEvidence.error = error.message;
        await save(publicEvidence); console.error(error); process.exitCode = 1;
    } finally {
        try { good(await call(`/credentials/${issued.credentialId}/revoke`, 'owner', {}), 200, 'credential revoke'); await unlink(privatePath); }
        catch (error) { console.error(error); process.exitCode = 1; }
    }
}
