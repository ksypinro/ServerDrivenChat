/** Real Cline API 1.3 caller-tool ownership check on the disposable M30 binding. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';

const directory = process.argv[2] ?? 'evidence/M30/native-tool-run';
await mkdir(directory, { recursive: true });
const base = 'http://127.0.0.1:59319/api/v1';
const marker = `M30-TOOLS-${randomUUID().slice(0, 8)}`;
const deadline = Date.now() + 30 * 60_000;
const evidence = { milestone: 'M30', status: 'running', marker, results: [] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let issued;
async function call(path, token, body, key, expected) {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
            ...(key ? { 'idempotency-key': key } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(35_000) });
    const value = await response.json();
    if (expected ? ![].concat(expected).includes(response.status) : !response.ok) {
        const safe = value && typeof value === 'object' ? { ...value, credential: undefined } : value;
        throw Error(`${path}: HTTP ${response.status} ${JSON.stringify(safe)}`);
    }
    return { status: response.status, value };
}
async function save(error) {
    await writeFile(`${directory}/native-tool-denial.json`, JSON.stringify({ ...evidence, ...(error ? { error } : {}) }, null, 2) + '\n');
}
async function until(check) {
    while (Date.now() < deadline) { const value = await check(); if (value) return value; await pause(2_000); }
    throw Error('M30 native caller-tool deadline exceeded');
}
async function completed(id, credential) {
    return until(async () => {
        const generation = (await call(`/generations/${id}`, credential)).value;
        return generation.result ? generation : null;
    });
}
const tool = { name: 'echo_marker', description: 'Caller-owned local marker write for disposable M30 acceptance',
    schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false }, strict: true };

try {
    const binding = await until(async () => {
        const live = JSON.parse(await readFile(`${directory}/server-live.json`, 'utf8'));
        return live.bindings?.find(item => item.state === 'active' && Date.parse(item.leaseExpiresAt) > Date.now() &&
            item.payload?.capabilityReport?.effectPolicies?.nativeToolsDenied?.status === 'supported');
    });
    const caps = (await call(`/sessions/${binding.sessionId}/capabilities`, 'owner')).value;
    if (!caps.serverPolicy?.callerToolsReady || caps.bindingId !== binding.bindingId) throw Error('Exact candidate binding is not qualified in disposable server policy');
    evidence.results.push({ kind: 'candidate-binding', bindingId: binding.bindingId, sessionId: binding.sessionId,
        nativePolicy: caps.capabilityReport.effectPolicies.nativeToolsDenied, callerToolsReady: true });
    issued = (await call('/credentials', 'owner', { sessionId: binding.sessionId, scopes: ['view', 'prompt'],
        label: 'M30 disposable native caller-tool ownership', expiresAt: new Date(deadline).toISOString() }, undefined, 201)).value;
    const token = issued.credential;
    const body = { model: 'sdc-default', contextMode: 'shared-task',
        instructions: 'Return only a valid sdc-tool-v1 JSON object. Do not use Cline tools.',
        history: [{ role: 'user', content: `Propose the caller function echo_marker with value ${marker}. Return exactly {"version":"sdc-tool-v1","text":"","calls":[{"name":"echo_marker","arguments":{"value":"${marker}"}}]} and no Markdown. Do not perform native file, shell or network actions.` }],
        tools: [tool], toolChoice: 'required', parallelTools: false };
    const started = (await call('/generations', token, body, `${marker}-proposal`, [200, 202])).value;
    const first = await completed(started.generationId, token);
    if (first.result.status !== 'completed' || first.result.outcome !== 'caller_tools' || first.result.calls.length !== 1 ||
        first.result.calls[0].name !== 'echo_marker' || first.result.calls[0].arguments.value !== marker) throw Error(`Native caller proposal failed: ${JSON.stringify(first.result)}`);
    const firstOperation = (await call(`/operations/${started.operationId}`, token)).value;
    const nativeTools = firstOperation.result.toolActivity.filter(item => item.nativeCategory === 'tool');
    if (nativeTools.length) throw Error('Native Cline tool activity appeared in the caller proposal turn');
    const callId = first.result.calls[0].callId;
    evidence.results.push({ kind: 'proposal', generationId: first.generationId, callId,
        nativeToolEvents: nativeTools.length, arguments: first.result.calls[0].arguments });
    await save();

    // The caller, rather than Cline, owns this one exact local effect.
    const file = `/private/tmp/sdc-m19-vscode-probe/${marker}.txt`;
    const payload = `${marker}-CALLER-WRITTEN`;
    await writeFile(file, payload, { flag: 'wx' });
    const sha256 = `sha256:${createHash('sha256').update(await readFile(file)).digest('hex')}`;
    evidence.results.push({ kind: 'caller-effect', file, sha256 });
    const canonical = (await call(`/conversations/${first.conversationId}`, token)).value;
    const next = { model: 'sdc-default', contextMode: 'shared-task', conversationId: first.conversationId,
        instructions: `Reply exactly ${marker}-RESULT-OK. No native tools.`,
        history: [...canonical.history, { role: 'tool', callId, content: payload }], tools: [], toolChoice: 'auto' };
    const foreign = await call('/generations', token, { ...next, history: [...canonical.history, { role: 'tool', callId: 'call_foreign', content: payload }] }, `${marker}-foreign`, 409);
    const duplicate = await call('/generations', token, { ...next, history: [...canonical.history, { role: 'tool', callId, content: payload }, { role: 'tool', callId, content: payload }] }, `${marker}-duplicate`, 409);
    evidence.results.push({ kind: 'ledger-fences', foreignStatus: foreign.status, duplicateStatus: duplicate.status });
    const continued = (await call('/generations', token, next, `${marker}-result`, [200, 202])).value;
    const done = await completed(continued.generationId, token);
    if (done.result.status !== 'completed' || !done.result.text.includes(`${marker}-RESULT-OK`)) throw Error('Addressed caller result did not complete');
    const committed = (await call(`/conversations/${first.conversationId}`, token)).value;
    if (!committed.history.some(message => message.role === 'tool' && message.callId === callId && message.content === payload)) throw Error('Caller result absent from server history');
    evidence.results.push({ kind: 'addressed-result', generationId: done.generationId, text: done.result.text, historyVersion: committed.version });

    const errorMarker = `${marker}-ERROR`;
    const errorBody = { ...body, history: [{ role: 'user', content: `Propose echo_marker with value ${errorMarker}. Reply exactly {"version":"sdc-tool-v1","text":"","calls":[{"name":"echo_marker","arguments":{"value":"${errorMarker}"}}]}. No Cline tools or files.` }] };
    const errorStart = (await call('/generations', token, errorBody, `${marker}-error-proposal`, [200, 202])).value;
    const errorProposal = await completed(errorStart.generationId, token);
    if (errorProposal.result.status !== 'completed' || errorProposal.result.calls.length !== 1 || errorProposal.result.calls[0].arguments.value !== errorMarker) throw Error('Native error-result proposal failed');
    const errorHistory = (await call(`/conversations/${errorProposal.conversationId}`, token)).value.history;
    const errorNext = { model: 'sdc-default', contextMode: 'shared-task', conversationId: errorProposal.conversationId,
        instructions: `The caller function returned an error. Reply exactly ${errorMarker}-ACK. No native tools.`,
        history: [...errorHistory, { role: 'tool', callId: errorProposal.result.calls[0].callId, content: 'deliberate caller error', resultStatus: 'error' }], tools: [] };
    const errorContinuation = (await call('/generations', token, errorNext, `${marker}-error-result`, [200, 202])).value;
    const errorDone = await completed(errorContinuation.generationId, token);
    if (errorDone.result.status !== 'completed' || !errorDone.result.text.includes(`${errorMarker}-ACK`)) throw Error('Addressed error result did not complete');
    evidence.results.push({ kind: 'addressed-error-result', generationId: errorDone.generationId, text: errorDone.result.text });
    await save();

    const deniedPath = `/private/tmp/sdc-m19-vscode-probe/${marker}-native-denied.txt`;
    const deniedBody = { ...body, toolChoice: 'auto',
        instructions: `Attempt one native write_file call to create ${deniedPath} with ${marker}-NATIVE-DENIED. Do not use shell or network tools, and do not retry a denied action. If the native call is denied, return one sdc-tool-v1 JSON object with empty calls and text "${marker}-DENIED".`,
        history: [{ role: 'user', content: `Use your native write_file tool once to create ${deniedPath} containing ${marker}-NATIVE-DENIED. Do not call echo_marker. If the write is denied, stop and report ${marker}-DENIED without another native tool.` }] };
    const deniedStart = (await call('/generations', token, deniedBody, `${marker}-native-denial`, [200, 202])).value;
    const deniedDone = await completed(deniedStart.generationId, token);
    const attemptedFile = await stat(deniedPath).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    if (attemptedFile) throw Error('Native tool-denial candidate allowed the forbidden file effect');
    const deniedOperation = (await call(`/operations/${deniedStart.operationId}`, token)).value;
    const nativeAttempts = deniedOperation.result.toolActivity.filter(item => item.nativeCategory === 'tool');
    if (!nativeAttempts.length) throw Error('Native write challenge made no observable tool attempt; denial is unproved');
    if (deniedDone.result.status !== 'failed' || deniedDone.result.error?.code !== 'NATIVE_TOOL_ACTIVITY' || deniedDone.result.calls?.length)
        throw Error('Native tool attempt was not failed closed before caller-call publication');
    evidence.results.push({ kind: 'native-write-denied', generationId: deniedDone.generationId,
        status: deniedDone.result.status, errorCode: deniedDone.result.error?.code ?? null,
        observedNativeToolEvents: nativeAttempts.length,
        fileAbsent: true });
    evidence.status = 'passed'; await save();
    console.log('M30 real native caller-tool proposal, caller effect and addressed result passed.');
} catch (error) {
    evidence.status = 'failed'; await save(error.message); console.error(error); process.exitCode = 1;
} finally {
    if (issued) {
        try { await call(`/credentials/${issued.credentialId}/revoke`, 'owner', {}, undefined, 200); }
        catch (error) { console.error(error); process.exitCode = 1; }
    }
}
