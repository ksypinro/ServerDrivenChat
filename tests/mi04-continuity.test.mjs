import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { apiFixture, command, event } from './helpers/api-fixture.mjs';

const url = process.env.MI04_TEST_DATABASE_URL;
const skip = !url && 'requires disposable PostgreSQL';
const binding = () => ({ appId: 'test.mi04', appInstanceId: randomUUID(), workspaceId: 'same-workspace',
    conversationId: 'task', nativeConversationId: 'task', nativeScopeId: 'mi04-scope',
    bindingId: randomUUID(), sessionId: randomUUID(), bindingRevision: 1, leaseGeneration: 1, capabilitiesRevision: 'test' });
const register = (f, b, extra = {}) => f.request(`/v2/devices/${f.issued.deviceId}/bindings`, { binding: b, conversationRevision: 0, continuity: true, ...extra });
const detach = (f, b) => f.request(`/v2/devices/${f.issued.deviceId}/bindings/${b.bindingId}/detach`, {});

for (const changedCategory of ['api_req_started', 'api_req_failed', 'user_feedback']) test('MI-04 reindexed request metadata is reconciled only inside an anchored status-only gap: ' + changedCategory, async () => {
    const { ClineAppAdapter } = await import('../adapters/cline/dist/index.js');
    const { canonicalJson } = await import('../protocol/dist/index.js');
    const { createHash } = await import('node:crypto');
    const { nativeFixture } = await import('./helpers/m21-native.mjs');
    const native = nativeFixture(), messages = native.controller.task.messageStateHandler;
    messages.messages = [
        { ts: 100, type: 'say', say: 'task', text: 'INITIAL', partial: false },
        { ts: 101, type: 'say', say: 'api_req_started', text: '{}', partial: false },
        { ts: 102, type: 'say', say: changedCategory, text: 'OLD-METADATA', partial: false },
        { ts: 103, type: 'say', say: 'reasoning', text: 'EXACT-NEXT-ANCHOR', partial: false },
        { ts: 104, type: 'say', say: 'completion_result', text: 'ANSWER', partial: false }
    ];
    let adapter = new ClineAppAdapter(native.api);
    try {
        const first = (await adapter.attach(adapter.selection())).value;
        const items = adapter.nativeSnapshot(first).messages.map(message => {
            const kind = message.category === 'task' || message.category === 'user_feedback' ? 'user_message' : message.category === 'completion_result' ? 'assistant_message' : 'tool_activity';
            return { itemId: first.bindingId + ':' + message.id, turnId: 'turn', revision: 1, partial: false, kind, nativeCategory: message.category,
                digest: createHash('sha256').update(canonicalJson({ kind, content: [{ type: 'text', text: message.text }], partial: false, nativeCategory: message.category })).digest('hex') };
        });
        await adapter.detach(first);
        messages.messages.splice(1, 1); // Reopened history drops the SDK's synthetic request placeholder.
        messages.messages.forEach((message, i) => { message.ts = i + 1; if (message.say === 'completion_result') message.say = 'text'; });
        messages.messages[1].text = 'UPDATED-METADATA';
        adapter = new ClineAppAdapter(native.api);
        const next = (await adapter.attach(adapter.selection())).value;
        const adopt = () => adapter.adoptRegistration(next, { ...next, sessionId: first.sessionId, bindingRevision: 2 }, { bindingIds: [first.bindingId], items });
        if (changedCategory === 'user_feedback') {
            assert.throws(adopt, /prefix changed/);
        } else {
            const adopted = adopt(), stream = adapter.subscribe(adopted, []);
            try {
                const emitted = (await stream.next()).value;
                assert.equal(emitted.type, 'output.item.replaced');
                assert.equal(emitted.payload.itemId, first.bindingId + ':102');
                assert.equal(emitted.payload.revision, 2);
                assert.equal(emitted.payload.content[0].text, 'UPDATED-METADATA');
                assert.equal(emitted.payload.nativeCategory, changedCategory);
            } finally { await stream.return(); }
        }
    } finally { native.api.dispose(); }
});

test('MI-04 refuses changed transcript prefixes with bounded diagnostics that contain no native text', async () => {
    const { ClineAppAdapter, ClineHistoryReconciliationError } = await import('../adapters/cline/dist/index.js');
    const { canonicalJson } = await import('../protocol/dist/index.js');
    const { createHash } = await import('node:crypto');
    const { nativeFixture } = await import('./helpers/m21-native.mjs');
    const native = nativeFixture(); native.complete('RETAINED-ANSWER-SECRET');
    let adapter = new ClineAppAdapter(native.api);
    try {
        const first = (await adapter.attach(adapter.selection())).value;
        const items = adapter.nativeSnapshot(first).messages.map((message, i) => {
            const kind = i === 0 ? 'user_message' : 'assistant_message';
            return { itemId: first.bindingId + ':' + message.id, turnId: 'turn', revision: 1, partial: message.partial, kind, nativeCategory: message.category,
                digest: createHash('sha256').update(canonicalJson({ kind, content: [{ type: 'text', text: message.text }], partial: message.partial, nativeCategory: message.category })).digest('hex') };
        });
        await adapter.detach(first);
        native.controller.task.messageStateHandler.messages[0].ts = 2;
        native.controller.task.messageStateHandler.messages.splice(1, 0, { ts: 3, type: 'say', say: 'api_req_started', text: 'UNSEEN-STATUS-SECRET', partial: false });
        adapter = new ClineAppAdapter(native.api);
        const next = (await adapter.attach(adapter.selection())).value;
        assert.throws(() => adapter.adoptRegistration(next, { ...next, sessionId: 'retained-session', bindingRevision: 2 }, { bindingIds: [first.bindingId], items }), error => {
            assert.ok(error instanceof ClineHistoryReconciliationError, error.message);
            assert.equal(error.diagnostic.mismatchIndex, 1); assert.equal(error.diagnostic.nativeCount, 3);
            assert.equal(error.diagnostic.retainedCount, 2);
            assert.doesNotMatch(JSON.stringify(error.diagnostic), /SECRET|Connect to my server/);
            return true;
        });
    } finally { native.api.dispose(); }
});

test('MI-04 registration adoption rebuilds initial events and refuses native identity changes or late rebinding', async () => {
    const { ClineAppAdapter } = await import('../adapters/cline/dist/index.js');
    const { nativeFixture } = await import('./helpers/m21-native.mjs');
    const native = nativeFixture(); const adapter = new ClineAppAdapter(native.api);
    try {
        const initial = (await adapter.attach(adapter.selection())).value;
        assert.throws(() => adapter.adoptRegistration(initial, { ...initial, bindingId: 'different' }));
        assert.throws(() => adapter.adoptRegistration(initial, { ...initial, leaseGeneration: 2 }));
        const next = adapter.adoptRegistration(initial, { ...initial, sessionId: 'stable-session', bindingRevision: 2 });
        const stream = adapter.subscribe(next, []);
        const first = (await stream.next()).value;
        assert.equal(first.sessionId, 'stable-session'); assert.equal(first.bindingRevision, 2);
        assert.throws(() => adapter.adoptRegistration(next, { ...next, bindingRevision: 3 }));
        await stream.return(); await adapter.detach(next);
    } finally { native.api.dispose(); }
});

test('MI-04 companion reconnects the same task and delivers only on the new authority', { skip }, async () => {
    const { ConnectManager } = await import('../extensions/vscode/dist/connect.mjs');
    const { nativeFixture } = await import('./helpers/m21-native.mjs');
    const { waitFor } = await import('./helpers/api-fixture.mjs');
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const directory = await mkdtemp(join(tmpdir(), 'mi04-connect-'));
    const f = await apiFixture(url), native = nativeFixture({ nativeScopeId: 'mi04-native-context' });
    const profile = { id: 'default', name: 'test', origin: f.base, categories: ['prompts'] };
    let confirmations = 0;
    const manager = new ConnectManager(native.api, { profile: async () => profile, confirm: async () => { confirmations++; return true; }, pair: async () => f.issued,
        storePath: async (_p, _d, b) => join(directory, b.bindingId + '.sqlite'), changed() {} });
    native.api.connect.register(request => manager.handle(request), () => ['default']);
    try {
        const tools = await native.start();
        const connect = () => tools[0].execute({ serverProfileId: 'default' }, { sessionId: 'native-task', toolCallId: randomUUID() });
        assert.equal((await connect()).status, 'connected');
        const first = manager.current.binding;
        native.complete('INITIAL');
        await waitFor(async () => (await f.db.pool.query("SELECT 1 FROM events WHERE session_id=$1 AND payload->'payload'->'content'->0->>'text'='INITIAL'", [first.sessionId])).rowCount > 0);
        await manager.disconnect();
        native.controller.task.messageStateHandler.messages[0].text = 'Task content changed while disconnected';
        native.complete('OFFLINE-OUTPUT');
        assert.equal((await connect()).status, 'connected');
        const next = manager.current.binding;
        assert.equal(next.nativeScopeId, 'mi04-native-context');
        assert.equal(next.sessionId, first.sessionId); assert.equal(next.bindingRevision, 2);
        assert.equal(confirmations, 2, 'each reconnection needs local consent');
        const current = command(next.sessionId, 'after-reconnect'); current.bindingRevision = 2;
        current.payload.expectedConversationRevision = 1;
        assert.equal((await f.request(`/v2/sessions/${next.sessionId}/turns`, { command: current }, 'owner')).status, 202);
        await waitFor(() => native.sent.length === 1);
        assert.equal(native.sent[0].text, 'after-reconnect');
        native.complete('RECONNECTED');
        await waitFor(async () => (await f.db.pool.query("SELECT 1 FROM events WHERE session_id=$1 AND payload->>'bindingRevision'='2'", [next.sessionId])).rowCount > 0);
        const originals = await f.db.pool.query("SELECT count(*) FROM events WHERE session_id=$1 AND payload->>'type'='output.item.created' AND payload->'payload'->>'nativeCategory'='task'", [next.sessionId]);
        assert.equal(originals.rows[0].count, '1', 'reconnect must not import the initial task again');
        const offline = await f.db.pool.query("SELECT count(*) FROM events WHERE session_id=$1 AND payload->'payload'->'content'->0->>'text'='OFFLINE-OUTPUT'", [next.sessionId]);
        assert.equal(offline.rows[0].count, '1', 'offline output is retained once');
        const edited = await f.db.pool.query("SELECT payload FROM events WHERE session_id=$1 AND payload->>'type'='output.item.replaced' AND payload->'payload'->>'nativeCategory'='task'", [next.sessionId]);
        assert.equal(edited.rowCount, 1);
        assert.equal(edited.rows[0].payload.payload.itemId, first.bindingId + ':1');
        assert.equal(edited.rows[0].payload.payload.revision, 2);
    } finally { await manager.disconnect(); native.api.dispose(); await f.close(); await rm(directory, { recursive: true, force: true }); }
});

for (const [preserveFirst, repeatStatus] of [[false, false], [true, false], [true, true]]) test('MI-04 native resumption ID reindexing preserves ordered item identity, including repeated content; preserve first=' + preserveFirst + '; repeated status=' + repeatStatus, { skip }, async () => {
    const { ConnectManager } = await import('../extensions/vscode/dist/connect.mjs');
    const { nativeFixture } = await import('./helpers/m21-native.mjs');
    const { waitFor } = await import('./helpers/api-fixture.mjs');
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
    const f = await apiFixture(url), native = nativeFixture({ nativeScopeId: 'mi04-reindexed' });
    const directory = await mkdtemp(join(tmpdir(), 'mi04-reindexed-'));
    const messages = native.controller.task.messageStateHandler;
    messages.messages[0].ts = 1000;
    messages.add({ ts: 1, type: 'say', say: 'api_req_started', text: '{}' });
    if (repeatStatus) messages.add({ ts: 20, type: 'say', say: 'api_req_started', text: '{}' });
    native.complete('SAME'); native.complete('SAME');
    const manager = new ConnectManager(native.api, { profile: async () => ({ id: 'default', name: 'test', origin: f.base, categories: ['prompts'] }), confirm: async () => true, pair: async () => f.issued,
        storePath: async (_p, _d, b) => join(directory, b.bindingId + '.sqlite'), changed() {} });
    native.api.connect.register(request => manager.handle(request), () => ['default']);
    try {
        const tools = await native.start();
        const connect = () => tools[0].execute({ serverProfileId: 'default' }, { sessionId: 'native-task', toolCallId: randomUUID() });
        assert.equal((await connect()).status, 'connected'); const first = manager.current.binding;
        await waitFor(async () => Number((await f.db.pool.query("SELECT count(*) FROM events WHERE session_id=$1 AND payload->>'type'='output.item.created'", [first.sessionId])).rows[0].count) === (repeatStatus ? 5 : 4));
        await manager.disconnect();
        messages.messages.forEach((message, i) => { if (!preserveFirst || i > 0) message.ts = i + 1; });
        native.complete('SAME'); // An identical new offline tail is a third message, not a duplicate baseline.
        assert.equal((await connect()).status, 'connected'); const next = manager.current.binding;
        assert.equal(next.sessionId, first.sessionId);
        const turn = command(next.sessionId, 'after-reindex'); turn.bindingRevision = next.bindingRevision; turn.payload.expectedConversationRevision = 1;
        assert.equal((await f.request(`/v2/sessions/${next.sessionId}/turns`, { command: turn }, 'owner')).status, 202);
        await waitFor(() => native.sent.length === 1);
        await waitFor(async () => (await f.db.pool.query("SELECT 1 FROM events WHERE session_id=$1 AND payload->'payload'->'content'->0->>'text'='after-reindex'", [next.sessionId])).rowCount > 0);
        const originals = await f.db.pool.query("SELECT payload FROM events WHERE session_id=$1 AND payload->>'type' IN ('output.item.created','output.item.replaced') AND payload->'payload'->>'nativeCategory'='task'", [first.sessionId]);
        assert.equal(originals.rowCount, 1); assert.equal(originals.rows[0].payload.payload.itemId, first.bindingId + ':1000');
        const repeated = await f.db.pool.query("SELECT count(*) FROM events WHERE session_id=$1 AND payload->'payload'->'content'->0->>'text'='SAME'", [first.sessionId]);
        assert.equal(repeated.rows[0].count, '3', 'identical separate messages and new offline tails remain separate, with no reimport');
    } finally { await manager.disconnect(); native.api.dispose(); await f.close(); await rm(directory, { recursive: true, force: true }); }
});

test('MI-04 reopened SDK completion answers keep identity when Cline relabels them as text and drops transient status items', { skip }, async () => {
    const { ConnectManager } = await import('../extensions/vscode/dist/connect.mjs');
    const { nativeFixture } = await import('./helpers/m21-native.mjs');
    const { waitFor } = await import('./helpers/api-fixture.mjs');
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
    const f = await apiFixture(url), native = nativeFixture({ nativeScopeId: 'mi04-reopened-completion' });
    const directory = await mkdtemp(join(tmpdir(), 'mi04-completion-'));
    const messages = native.controller.task.messageStateHandler;
    messages.messages[0].ts = 1000;
    messages.add({ ts: 1, type: 'say', say: 'api_req_started', text: '{}' });
    messages.add({ ts: 2, type: 'say', say: 'reasoning', text: 'First reasoning' });
    native.complete('SAME'); messages.messages.at(-1).say = 'completion_result';
    messages.add({ ts: 3, type: 'say', say: 'api_req_started', text: '{"tokensIn":1}' });
    messages.add({ ts: 4, type: 'say', say: 'user_feedback', text: 'SECOND-REQUEST' });
    messages.add({ ts: 5, type: 'say', say: 'api_req_started', text: '{}' });
    native.complete('SECOND-ANSWER'); messages.messages.at(-1).say = 'completion_result';
    messages.add({ ts: 6, type: 'say', say: 'api_req_started', text: '{"tokensIn":2}' });
    const initialCount = messages.messages.length;
    const manager = new ConnectManager(native.api, { profile: async () => ({ id: 'default', name: 'test', origin: f.base, categories: ['prompts'] }), confirm: async () => true, pair: async () => f.issued,
        storePath: async (_p, _d, b) => join(directory, b.bindingId + '.sqlite'), changed() {} });
    native.api.connect.register(request => manager.handle(request), () => ['default']);
    try {
        const tools = await native.start();
        const connect = () => tools[0].execute({ serverProfileId: 'default' }, { sessionId: 'native-task', toolCallId: randomUUID() });
        assert.equal((await connect()).status, 'connected'); const first = manager.current.binding;
        await waitFor(async () => Number((await f.db.pool.query("SELECT count(*) FROM events WHERE session_id=$1 AND payload->>'type'='output.item.created'", [first.sessionId])).rows[0].count) === initialCount);
        await manager.disconnect();
        messages.messages = messages.messages.filter(message => !(message.say === 'api_req_started' && message.text === '{}'));
        messages.messages.forEach((message, i) => { message.ts = i + 1; if (message.say === 'completion_result') message.say = 'text'; });
        native.complete('SAME'); // Identical new offline answer remains a separate item.
        assert.equal((await connect()).status, 'connected'); const next = manager.current.binding;
        assert.equal(next.sessionId, first.sessionId); assert.equal(next.bindingRevision, 2);
        const turn = command(next.sessionId, 'after-category-replay'); turn.bindingRevision = next.bindingRevision;
        turn.payload.expectedConversationRevision = manager.current.adapter.nativeSnapshot(next).conversationRevision;
        assert.equal((await f.request(`/v2/sessions/${next.sessionId}/turns`, { command: turn }, 'owner')).status, 202);
        await waitFor(() => native.sent.length === 1);
        const rows = await f.db.pool.query("SELECT payload->'payload' AS item FROM events WHERE session_id=$1 AND payload->>'type' IN ('output.item.created','output.item.replaced')", [first.sessionId]);
        const text = value => rows.rows.filter(row => row.item.content[0].text === value);
        assert.equal(text('Connect to my server and follow its instructions.').length, 1);
        assert.equal(text('SECOND-ANSWER').length, 1, 'relabelled retained answer is not reimported or replaced');
        assert.equal(text('SECOND-ANSWER')[0].item.nativeCategory, 'completion_result', 'observed original category is retained');
        assert.equal(text('SAME').length, 2, 'new identical offline tail is distinct from the retained answer');
    } finally { await manager.disconnect(); native.api.dispose(); await f.close(); await rm(directory, { recursive: true, force: true }); }
});

test('MI-04 continuity preserves history, freezes old keys, fences old commands and renews the latest revision', { skip }, async () => {
    const f = await apiFixture(url);
    try {
        const first = binding();
        assert.equal((await register(f, first)).status, 201);
        const keyResponse = await f.request('/v2/public/credentials', { sessionId: first.sessionId, scopes: ['view', 'prompt'], label: 'MI04 test', expiresAt: new Date(Date.now() + 300000).toISOString() }, 'owner');
        assert.equal(keyResponse.status, 201, await keyResponse.clone().text());
        const key = await keyResponse.json();
        await f.db.recordEvent({ eventId: 'history', sessionId: first.sessionId, bridgeEpoch: 'epoch-1', producerSeq: 1, payload: event(first.sessionId, 'history') });
        assert.equal((await f.request(`/v2/sessions/${first.sessionId}/turns`, { command: command(first.sessionId, 'queued-before-reconnect') }, 'owner')).status, 202);
        assert.equal((await detach(f, first)).status, 200);
        const proposed = binding();
        const response = await register(f, proposed);
        assert.equal(response.status, 201, await response.clone().text());
        const next = (await response.json()).binding;
        assert.equal(next.sessionId, first.sessionId); assert.equal(next.bindingRevision, 2);
        assert.equal(next.bindingId, proposed.bindingId);
        const retry = await register(f, proposed);
        assert.equal(retry.status, 201); assert.deepEqual((await retry.json()).binding, next);
        assert.equal((await f.db.readSnapshot(first.sessionId)).events.length, 1);
        const renew = revision => f.request(`/v2/devices/${f.issued.deviceId}/lease/renew`, { sessionId: first.sessionId, bindingRevision: revision, leaseGeneration: 1 });
        assert.equal((await renew(1)).status, 409);
        assert.equal((await (await renew(2)).json()).status, 'renewed');
        assert.equal((await f.request(`/v2/public/sessions/${first.sessionId}/snapshot`, undefined, key.credential)).status, 403);
        const replacementResponse = await f.request('/v2/public/credentials', { sessionId: next.sessionId, scopes: ['view', 'prompt'], label: 'MI04 replacement', expiresAt: new Date(Date.now() + 300000).toISOString() }, 'owner');
        assert.equal(replacementResponse.status, 201);
        const replacement = await replacementResponse.json();
        assert.equal((await f.request(`/v2/public/sessions/${next.sessionId}/snapshot`, undefined, replacement.credential)).status, 200);
        const oldPrompt = await fetch(`${f.base}/v2/public/sessions/${next.sessionId}/prompts`, { method: 'POST', headers: { authorization: `Bearer ${key.credential}`, 'content-type': 'application/json', 'idempotency-key': 'old-key' }, body: JSON.stringify({ model: 'sdc-default', content: [{ type: 'text', text: 'must refuse' }], delivery: 'queue' }) });
        assert.equal(oldPrompt.status, 403);
        assert.equal((await f.request(`/v2/sessions/${first.sessionId}/turns`, { command: command(first.sessionId, 'stale') }, 'owner')).status, 409);
        const abort = new AbortController();
        try {
            const stream = await fetch(`${f.base}/v2/devices/${f.issued.deviceId}/commands?lane=prompt&after=0`, { headers: { authorization: `Bearer ${f.issued.credential}` }, signal: abort.signal });
            assert.equal(stream.status, 200);
            const reader = stream.body.getReader(); let text = '';
            while (!text.includes('command.skipped')) { const part = await reader.read(); assert.equal(part.done, false); text += new TextDecoder().decode(part.value); }
            assert.match(text, /obsolete_binding/);
        } finally { abort.abort(); }
        assert.equal((await f.db.pool.query('SELECT count(*) FROM sessions')).rows[0].count, '1');
    } finally { await f.close(); }
});

test('MI-04 a live holder requires takeover and concurrent reconnects admit one revision', { skip }, async () => {
    const f = await apiFixture(url);
    try {
        const first = binding(); assert.equal((await register(f, first)).status, 201);
        assert.equal((await register(f, { ...binding(), sessionId: first.sessionId, conversationId: 'different-task', nativeConversationId: 'different-task' })).status, 409);
        assert.equal((await register(f, binding())).status, 409);
        const moved = await register(f, binding(), { takeover: true });
        assert.equal(moved.status, 201); const second = (await moved.json()).binding;
        assert.equal(second.sessionId, first.sessionId); assert.equal(second.bindingRevision, 2);
        await detach(f, second);
        const responses = await Promise.all([register(f, binding()), register(f, binding())]);
        assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
        const latest = (await responses.find(r => r.status === 201).json()).binding;
        const latestRequest = (await f.db.pool.query('SELECT payload FROM bindings WHERE binding_id=$1', [latest.bindingId])).rows[0].payload.registrationRequest;
        assert.equal(latest.bindingRevision, 3);
        assert.equal((await f.db.pool.query("SELECT count(*) FROM bindings WHERE state='active'")).rows[0].count, '1');
        const invalid = binding(); delete invalid.nativeScopeId;
        assert.equal((await register(f, invalid)).status, 400);
        await f.db.pool.query("UPDATE sessions SET state='disabled' WHERE session_id=$1", [first.sessionId]);
        assert.equal((await register(f, latestRequest)).status, 409, 'a retry cannot reopen disabled session authority');
        assert.notEqual((await register(f, binding(), { takeover: true })).status, 201);
    } finally { await f.close(); }
});

test('MI-04 workspace overlap uses live authorized identities and ignores labels', { skip }, async () => {
    const f = await apiFixture(url);
    try {
        const first = binding(), second = { ...binding(), conversationId: 'other', nativeConversationId: 'other' };
        assert.equal((await register(f, first, { display: { workspaceLabel: 'different-label' } })).status, 201);
        assert.equal((await register(f, second)).status, 201);
        const list = async token => (await (await f.request('/v2/sessions', undefined, token)).json()).sessions;
        assert.equal((await list('owner')).filter(s => s.workspaceOverlap).length, 2);
        await f.signIn('stranger'); assert.deepEqual(await list('stranger'), []);
        await detach(f, second);
        assert.equal((await list('owner')).filter(s => s.workspaceOverlap).length, 0);
    } finally { await f.close(); }
});
