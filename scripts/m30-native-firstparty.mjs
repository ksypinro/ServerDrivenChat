/** Bounded first-party REST/SSE and native-control acceptance for the disposable M30 task. */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const directory = process.argv[2] ?? 'evidence/M30/native-run';
const gateway = 'http://127.0.0.1:59319/api/v1';
const marker = `M30-FIRSTPARTY-${randomUUID().slice(0, 8)}`;
const deadline = Date.now() + 30 * 60_000;
const results = [];
let token = 'owner', credentialId, sessionId;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function call(path, body, key, expected) {
    const response = await fetch(gateway + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
            ...(key ? { 'idempotency-key': key } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(35_000)
    });
    const data = await response.json();
    if (expected ? ![].concat(expected).includes(response.status) : !response.ok) {
        throw Error(`${path}: HTTP ${response.status} ${JSON.stringify(data)}`);
    }
    return data;
}

async function save(status, error) {
    await writeFile(`${directory}/firstparty-native.json`, JSON.stringify({
        milestone: 'M30', status, sessionId, marker, results,
        ...(error ? { error } : {}),
        scope: 'First-party REST/SSE, installed Cline controls and exact disposable file effects; synthetic identity; no bearer retained'
    }, null, 2) + '\n');
}

async function until(check) {
    while (Date.now() < deadline) {
        const value = await check();
        if (value) return value;
        await pause(600);
    }
    throw Error('M30 first-party native deadline exceeded');
}

async function submit(label, text) {
    const operation = await call(`/sessions/${sessionId}/prompts`, {
        model: 'sdc-default', content: [{ type: 'text', text }], delivery: 'queue'
    }, `${marker}-${label}`);
    results.push({ kind: `${label}-admission`, operation });
    await save('running');
    return operation;
}

async function finish(operation) {
    return until(async () => {
        const value = await call(`/operations/${operation.operationId}`);
        if (['rejected', 'failed', 'reconciliation_required'].includes(value.status)) {
            throw Error(`Native turn failed: ${JSON.stringify(value)}`);
        }
        return ['completed', 'cancelled'].includes(value.status) ? value : null;
    });
}

async function interaction(operation, kind) {
    return until(async () => {
        const snapshot = await call(`/sessions/${sessionId}/snapshot`);
        return snapshot.interactions.find(item => item.state === 'pending' && item.kind === kind &&
            item.payload.turnId === operation.turnId)?.payload;
    });
}

async function receipt(commandId) {
    return until(async () => {
        const value = await call(`/sessions/${sessionId}/commands/${commandId}`);
        if (['rejected', 'reconciliation_required'].includes(value.state)) throw Error(`Control rejected: ${JSON.stringify(value)}`);
        return value.state === 'applied' ? value : null;
    });
}

async function replay(after, expectedTurnId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
        const response = await fetch(`${gateway}/sessions/${sessionId}/events`, {
            headers: { authorization: `Bearer ${token}`, 'last-event-id': String(after) }, signal: controller.signal
        });
        if (response.status !== 200) throw Error(`SSE replay returned ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', lastId = after;
        while (true) {
            const { done, value } = await reader.read();
            if (done) throw Error('SSE replay ended before native terminal event');
            buffer += decoder.decode(value, { stream: true });
            while (buffer.includes('\n\n')) {
                const index = buffer.indexOf('\n\n');
                const frame = buffer.slice(0, index);
                buffer = buffer.slice(index + 2);
                const id = /^id: ([0-9]+)$/m.exec(frame);
                const data = /^data: (.+)$/m.exec(frame);
                if (!id || !data) continue;
                const sequence = Number(id[1]);
                if (sequence !== lastId + 1) throw Error(`SSE cursor gap after ${lastId}`);
                lastId = sequence;
                const event = JSON.parse(data[1]);
                if (event.payload?.type === 'turn.completed' && event.payload.payload?.turnId === expectedTurnId) {
                    await reader.cancel();
                    return { from: after, through: lastId, terminalType: event.payload.type, turnId: expectedTurnId };
                }
            }
        }
    } finally { clearTimeout(timer); controller.abort(); }
}

try {
    const live = JSON.parse(await readFile(`${directory}/server-live.json`, 'utf8'));
    const binding = live.bindings?.find(item => item.state === 'active' && Date.parse(item.leaseExpiresAt) > Date.now());
    if (!binding) throw Error('No active consented Cline binding');
    sessionId = binding.sessionId;
    const issued = await call('/credentials', { sessionId, scopes: ['view', 'prompt', 'approve'],
        label: 'M30 disposable first-party/native acceptance', expiresAt: new Date(deadline).toISOString() });
    credentialId = issued.credentialId;
    token = issued.credential;
    const sessions = await call('/sessions');
    if (!JSON.stringify(sessions).includes(sessionId)) throw Error('Bound session absent from authorized discovery');
    const capabilities = await call(`/sessions/${sessionId}/capabilities`);
    const initial = await call(`/sessions/${sessionId}/snapshot`);
    results.push({ kind: 'discovery', bindingId: binding.bindingId,
        watermark: initial.watermark, callerToolsReady: capabilities.serverPolicy?.callerToolsReady ?? false });
    await save('running');

    const echo = await submit('echo', `Reply exactly ${marker}-ECHO. No tools or file changes.`);
    const echoDone = await finish(echo);
    const transcript = await call(`/sessions/${sessionId}/transcript`);
    const stream = await replay(initial.watermark.sessionSeq, echo.turnId);
    results.push({ kind: 'echo-terminal', operation: echoDone, transcriptRevision: transcript.revision, stream });
    await save('running');

    const question = await submit('question', `Use your native ask_question tool to ask "${marker}: choose green" with options green and blue. Wait for the answer. Reply ${marker}-QUESTION-DONE after the answer. No other tools or files.`);
    const pending = await interaction(question, 'input');
    const answer = { type: 'input.respond', commandId: randomUUID(), turnId: question.turnId,
        requestId: pending.requestId, requestRevision: pending.requestRevision, answer: 'green' };
    const recorded = await call(`/sessions/${sessionId}/controls`, answer);
    if (recorded.nativeApplied !== false) throw Error('Recorded answer claimed native effect');
    results.push({ kind: 'question', requestId: pending.requestId, receipt: await receipt(answer.commandId), operation: await finish(question) });
    await save('running');

    for (const [label, choice] of [['allow', 'allow_once'], ['deny', 'deny']]) {
        const path = `/private/tmp/sdc-m19-vscode-probe/${marker}-${label}.txt`;
        const desired = `${marker}-${label.toUpperCase()}`;
        const prompt = `Use your native write_file tool to create ${path} containing exactly ${desired}. Wait for native permission. If denied, do not retry or use another tool. Then reply ${marker}-${label.toUpperCase()}-DONE. No shell, network or other paths.`;
        const operation = await submit(label, prompt);
        const approval = await interaction(operation, 'approval');
        if (!JSON.stringify(approval.action).includes(path)) throw Error('Native approval did not address the disposable file');
        const decision = { decisionId: randomUUID(), requestRevision: approval.requestRevision,
            actionDigest: approval.actionDigest, choiceId: choice, grantedPermissions: [],
            policyRevision: 'm30-disposable-acceptance',
            expiresAt: new Date(Math.min(Date.parse(approval.expiresAt), Date.now() + 120_000)).toISOString() };
        const submitted = await call(`/sessions/${sessionId}/approvals/${encodeURIComponent(approval.requestId)}/decisions`, decision);
        const command = await receipt(submitted.commandId);
        const terminal = await finish(operation);
        let content = null;
        try { content = await readFile(path, 'utf8'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (choice === 'allow_once' ? content !== desired : content !== null) throw Error('Native allow/deny file effect mismatch');
        results.push({ kind: `${label}-effect`, requestId: approval.requestId,
            assertionSha256: submitted.assertion ? `sha256:${createHash('sha256').update(submitted.assertion).digest('hex')}` : undefined,
            receipt: command, operation: terminal, content });
        await save('running');
    }

    const stop = await submit('cancel', `Use your native ask_question tool to ask "${marker}: wait for cancellation" with options wait and continue. Wait for its answer. No other tools or files.`);
    const waiting = await interaction(stop, 'input');
    const cancellation = { type: 'turn.cancel', commandId: randomUUID(), turnId: stop.turnId,
        reason: 'M30 disposable native cancellation acceptance' };
    const cancellationRecorded = await call(`/sessions/${sessionId}/controls`, cancellation);
    if (cancellationRecorded.nativeApplied !== false) throw Error('Recorded cancellation claimed native effect');
    const cancelled = await finish(stop);
    if (cancelled.status !== 'cancelled') throw Error('Native turn did not cancel');
    results.push({ kind: 'cancel', pendingRequestId: waiting.requestId, receipt: await receipt(cancellation.commandId), operation: cancelled });

    token = 'owner';
    await call(`/credentials/${credentialId}/revoke`, {});
    token = issued.credential;
    await call(`/sessions/${sessionId}/snapshot`, undefined, undefined, 401);
    results.push({ kind: 'revocation', status: 401 });
    credentialId = undefined;
    await save('passed');
    console.log('M30 first-party native REST/SSE, question, allow/deny, cancellation and revocation passed.');
} catch (error) {
    await save('failed', error.message);
    console.error(error);
    process.exitCode = 1;
} finally {
    if (credentialId) {
        token = 'owner';
        try { await call(`/credentials/${credentialId}/revoke`, {}); }
        catch (error) { console.error('Disposable credential revocation failed:', error.message); process.exitCode = 1; }
    }
}
