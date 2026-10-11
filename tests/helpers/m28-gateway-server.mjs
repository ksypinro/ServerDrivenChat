// Real HTTP/PostgreSQL, synthetic identity and scripted native events ONLY; no native app/model executor.
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { apiFixture, event } from './api-fixture.mjs';
import { PublicApiService } from '../../server/dist/index.js';
const f = await apiFixture(process.env.M27_TEST_DATABASE_URL, {
    publicApiToolBindings: [{ bindingId: 'b-session', evidence: 'SIMULATED M28 scripted native fixture; never native qualification' }]
});
await f.bind('session');
await f.db.pool.query("UPDATE bindings SET lease_expires_at=clock_timestamp()+interval '1 hour',payload=$2::jsonb WHERE session_id=$1", ['session', JSON.stringify({ conversationRevision: 0,
    capabilities: Object.fromEntries(['submit', 'cancel', 'respondInput', 'detach'].map(name => [name, { status: 'supported', reason: 'SIMULATED M28 fixture capability' }])),
    capabilityReport: { effectPolicies: { nativeToolsDenied: { status: 'supported', reason: 'SIMULATED M28 fixture; no real native protection claimed' } } } })]);
const service = new PublicApiService(f.db, f.auth);
const issued = await service.issueCredential(f.owner, { sessionId: 'session', scopes: ['view', 'prompt'], label: 'M28 synthetic SDK fixture', expiresAt: new Date(Date.now() + 3600000).toISOString() });
const scripted = [], started = new Map(), cancelled = new Set();
let revision = 0, closed = false;
async function emit(records) {
    const head = (await f.db.readSnapshot('session')).watermark.sessionSeq;
    for (const [i, record] of records.entries()) {
        const e = { ...event('session', randomUUID(), head + i + 1), ...record };
        await f.db.recordEvent({ eventId: e.eventId, sessionId: 'session', bridgeEpoch: e.bridgeEpoch, producerSeq: e.producerSeq, payload: e });
    }
}
async function tick() {
    const operations = (await f.db.pool.query('SELECT operation_id,command_id,turn_id FROM public_operations ORDER BY created_at')).rows;
    for (const op of operations) {
        if (started.has(op.command_id)) continue;
        const script = scripted.shift() ?? { hold: true };
        started.set(op.command_id, script);
        await emit([{ type: 'turn.started', payload: { turnId: op.turn_id, state: 'running', conversationRevision: ++revision } }]);
        if (script.hold) continue;
        if (script.fail) { await emit([{ type: 'turn.failed', payload: { turnId: op.turn_id, error: { code: 'APP_UNAVAILABLE', message: 'SIMULATED backend failure', retryable: false } } }]); continue; }
        const itemId = 'fixture-' + op.operation_id;
        const text = script.text ?? 'SIMULATED M28 answer';
        await emit([
            { type: 'output.item.created', payload: { turnId: op.turn_id, itemId, kind: 'assistant_message', revision: 1, source: 'native_event', partial: true,
                nativeCategory: 'text', content: [{ type: 'text', text: script.mutableText ?? text }], observedAt: new Date().toISOString() } },
            { type: 'output.item.replaced', payload: { turnId: op.turn_id, itemId, kind: 'assistant_message', revision: 2, source: 'native_event', partial: false,
                nativeCategory: 'completion_result', content: [{ type: 'text', text }], observedAt: new Date().toISOString() } },
            { type: 'output.item.completed', payload: { turnId: op.turn_id, itemId, revision: 2 } },
            { type: 'turn.completed', payload: { turnId: op.turn_id, terminalEvidence: 'SIMULATED M28 scripted completion' } }
        ]);
    }
    const controls = (await f.db.pool.query("SELECT payload FROM commands WHERE lane='control'")).rows;
    for (const { payload: c } of controls) if (c.type === 'turn.cancel' && !cancelled.has(c.commandId)) {
        cancelled.add(c.commandId);
        await emit([{ type: 'turn.cancelled', payload: { turnId: c.turnId, evidence: 'SIMULATED M28 addressed cancellation' } }]);
    }
}
const loop = (async () => { while (!closed) { await tick(); await new Promise(resolve => setTimeout(resolve, 30)); } })();
async function close() { if (closed) return; closed = true; await loop; await f.close(); }
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
const lines = createInterface({ input: process.stdin });
let handling = Promise.resolve();
lines.on('line', line => {
    handling = handling.then(async () => {
        const request = JSON.parse(line);
        if (request.action === 'next') scripted.push(request.response);
        if (request.action === 'expire') {
            if (!/^[0-9a-f-]{36}$/.test(request.generationId)) throw Error('Invalid fixture generation ID');
            await f.db.pool.query("UPDATE public_operations SET expires_at=clock_timestamp()-interval '1 second' WHERE operation_id=$1", [request.generationId]);
        }
        const counts = (await f.db.pool.query('SELECT (SELECT count(*) FROM commands)::integer AS commands,(SELECT count(*) FROM public_generations)::integer AS generations')).rows[0];
        process.stdout.write(JSON.stringify({ ok: true, ...counts }) + '\n');
    }).catch(error => { process.stdout.write(JSON.stringify({ ok: false, error: error.message }) + '\n'); });
});
lines.on('close', () => void handling.then(close));
process.stdout.write(JSON.stringify({ baseUrl: f.base, credential: issued.credential, fixture: 'SIMULATED native; real HTTP/PostgreSQL' }) + '\n');
