import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { acquireSharedLock } from '../bridge/dist/index.js';
import { ConnectManager } from '../extensions/vscode/dist/connect.mjs';
import { apiFixture, command, waitFor } from './helpers/api-fixture.mjs';
import { nativeFixture } from './helpers/m21-native.mjs';

const url = process.env.MI02_TEST_DATABASE_URL;
const skip = !url && 'requires disposable PostgreSQL';
const windowScript = new URL('./helpers/mi02-window.mjs', import.meta.url).pathname;

async function folder(t) { const path = await mkdtemp(join(tmpdir(), 'mi02-windows-')); t.after(() => rm(path, { recursive: true, force: true })); return path; }
/** One simulated VS Code window: its own Cline fixture and companion connection manager, sharing the installation's paired device. */
function openWindow(f, directory, name, options = {}) {
    const task = options.task ?? `task-${name}`;
    const native = nativeFixture({ taskId: task, hostId: `host-${name}`, windowId: `window-${name}` });
    const manager = new ConnectManager(native.api, {
        profile: async id => id === 'default' ? { id: 'default', name: 'mi02', origin: f.base, categories: ['prompts'] } : undefined,
        confirm: async () => true,
        pair: async () => ({ ...f.issued }),
        nativeScopeId: () => 'cline-data:mi02-test',
        display: title => ({ workspaceLabel: `repo-${name}`, ...(title ? { conversationLabel: title } : {}) }),
        confirmTakeover: options.confirmTakeover,
        storePath: async (_profile, _device, binding) => join(directory, `binding-${binding.sessionId}.sqlite`),
        holdInbox: async path => { const lock = await acquireSharedLock(join(dirname(path), 'in-use.lock'), { timeoutMs: 2000 }); return () => lock.release(); },
        removeInbox: async path => { for (const suffix of ['', '-wal', '-shm']) await rm(path + suffix, { force: true }); },
        changed: () => {}
    });
    native.api.connect.register(request => manager.handle(request), () => ['default']);
    let calls = 0;
    return { native, manager,
        connect: async () => { const tools = await native.start(); return tools[0].execute({ serverProfileId: 'default' }, { sessionId: task, toolCallId: `connect-${name}-${++calls}` }); },
        close: async () => { await manager.disconnect(); native.api.dispose(); } };
}
async function push(f, sessionId, id, expectedConversationRevision = 1, bindingRevision = 1) {
    const response = await f.request(`/v2/sessions/${sessionId}/turns`, { command: { protocolVersion: '2.0', type: 'turn.submit', commandId: id, lane: 'prompt', seq: 1, sessionId, bindingRevision, leaseGeneration: 1,
        turnId: `turn-${id}`, promptId: `prompt-${id}`, createdAt: new Date().toISOString(), payload: { content: [{ type: 'text', text: id }], delivery: 'queue', expectedConversationRevision } } }, 'owner');
    return response.status;
}
function inboxSessions(path) {
    const db = new DatabaseSync(path);
    try { return db.prepare('SELECT DISTINCT session_id FROM inbox_commands ORDER BY session_id').all().map(row => row.session_id); } finally { db.close(); }
}
const bindingState = async (f, bindingId) => (await f.db.pool.query('SELECT state FROM bindings WHERE binding_id=$1', [bindingId])).rows[0]?.state;

test('MI-02 two windows on one device connect different tasks at once and each receives only its own prompts', { skip }, async t => {
    const f = await apiFixture(url), directory = await folder(t);
    const a = openWindow(f, directory, 'a'), b = openWindow(f, directory, 'b');
    try {
        assert.equal((await a.connect()).status, 'connected');
        assert.equal((await b.connect()).status, 'connected');
        const first = a.manager.current.binding, second = b.manager.current.binding;
        assert.equal(first.nativeScopeId, 'cline-data:mi02-test');
        a.native.complete('CONNECTED');
        b.native.complete('CONNECTED');
        assert.equal(await push(f, first.sessionId, 'for-a'), 202);
        assert.equal(await push(f, second.sessionId, 'for-b'), 202);
        await waitFor(() => a.native.sent.length === 1 && b.native.sent.length === 1, 10000);
        assert.deepEqual([a.native.sent[0].text, b.native.sent[0].text], ['for-a', 'for-b']);
        assert.deepEqual(inboxSessions(join(directory, `binding-${first.sessionId}.sqlite`)), [first.sessionId], 'each inbox retains only its own session');
        assert.deepEqual(inboxSessions(join(directory, `binding-${second.sessionId}.sqlite`)), [second.sessionId]);
        const listed = (await (await f.request('/v2/sessions', undefined, 'owner')).json()).sessions.filter(item => [first.sessionId, second.sessionId].includes(item.sessionId));
        assert.deepEqual(listed.map(item => item.binding.payload.display.workspaceLabel).sort(), ['repo-a', 'repo-b']);
        // A clean disconnect removes only that window's inbox; the other window keeps working.
        await a.manager.disconnect();
        assert.equal(existsSync(join(directory, `binding-${first.sessionId}.sqlite`)), false);
        b.native.complete('FIRST-OK');
        assert.equal(await push(f, second.sessionId, 'for-b-again', 2), 202);
        await waitFor(() => b.native.sent.length === 2, 10000);
        assert.equal(b.manager.state, 'online');
    } finally { await a.close(); await b.close(); await f.close(); }
});

test('MI-02 a second window cannot take a held task without local consent, and consent moves it', { skip }, async t => {
    const f = await apiFixture(url), directory = await folder(t), holders = [], answers = [];
    const a = openWindow(f, directory, 'a', { task: 'shared-task' });
    const c = openWindow(f, directory, 'c', { task: 'shared-task', confirmTakeover: async (_profile, _origin, holder) => { holders.push(holder); return answers.shift() ?? false; } });
    try {
        assert.equal((await a.connect()).status, 'connected');
        const held = a.manager.current.binding;
        answers.push(false);
        const refused = await c.connect();
        assert.equal(refused.status, 'rejected');
        assert.match(refused.displayMessage, /another window/);
        assert.match(holders[0], /repo-a/, 'the owner sees which window holds the task');
        assert.equal(await bindingState(f, held.bindingId), 'active');
        answers.push(true);
        assert.equal((await c.connect()).status, 'connected');
        const moved = c.manager.current.binding;
        assert.equal(await bindingState(f, held.bindingId), 'detached');
        assert.equal(await push(f, held.sessionId, 'to-old-window'), 409);
        c.native.complete('CONNECTED');
        assert.equal(await push(f, moved.sessionId, 'to-new-window', 1, moved.bindingRevision), 202);
        await waitFor(() => c.native.sent.length === 1, 10000);
        assert.equal(a.native.sent.length, 0);
    } finally { await a.close(); await c.close(); await f.close(); }
});

test('MI-02 a server that advertises no features receives no native scope or labels', { skip }, async t => {
    const f = await apiFixture(url), directory = await folder(t), original = globalThis.fetch;
    globalThis.fetch = async (resource, init) => {
        const response = await original(resource, init);
        if (new URL(resource).pathname !== '/v2/health') return response;
        const { features: _features, ...older } = await response.json();
        return Response.json(older);
    };
    const a = openWindow(f, directory, 'a');
    try {
        assert.equal((await a.connect()).status, 'connected');
        const binding = a.manager.current.binding;
        assert.equal('nativeScopeId' in binding, false);
        const stored = (await f.db.pool.query('SELECT payload,native_conversation_key FROM bindings WHERE binding_id=$1', [binding.bindingId])).rows[0];
        assert.equal(stored.payload.display, undefined);
        assert.equal(stored.native_conversation_key, null);
    } finally { globalThis.fetch = original; await a.close(); await f.close(); }
});

test('MI-02 two window processes on one device keep only their own session in inboxes that start at the registration watermark', { skip }, async t => {
    const f = await apiFixture(url), directory = await folder(t), windows = [];
    try {
        // Earlier device-lane traffic that new inboxes start after.
        await f.bind('earlier');
        for (const id of ['earlier-1', 'earlier-2', 'earlier-3']) await f.db.recordCommand({ commandId: id, sessionId: 'earlier', deviceId: f.issued.deviceId, lane: 'prompt', payload: command('earlier', id) });
        await f.db.pool.query("UPDATE bindings SET state='detached',lease_expires_at=NULL WHERE session_id='earlier'");
        for (const sessionId of ['alpha', 'beta']) {
            await f.bind(sessionId);
            const config = { serverUrl: f.base, deviceId: f.issued.deviceId, credential: f.issued.credential, sessionId, appInstanceId: `window-${sessionId}`, storePath: join(directory, `${sessionId}.sqlite`), watermarks: { prompt: 3, control: 0 } };
            const child = spawn(process.execPath, [windowScript, JSON.stringify(config)], { stdio: ['ignore', 'pipe', 'inherit'] });
            t.after(() => { child.kill('SIGKILL'); });
            windows.push({ sessionId, config, child, lines: createInterface({ input: child.stdout })[Symbol.asyncIterator]() });
        }
        for (const window of windows) assert.equal(JSON.parse((await window.lines.next()).value).state, 'online');
        for (const n of [1, 2]) for (const { sessionId } of windows) assert.equal((await f.request(`/v2/sessions/${sessionId}/turns`, { command: command(sessionId, `${sessionId}-${n}`) }, 'owner')).status, 202);
        await waitFor(async () => {
            for (const { sessionId } of windows) if ((await f.db.readEvents(sessionId, 0)).filter(event => event.payload.type === 'turn.completed').length < 2) return false;
            return true;
        }, 15000);
        for (const window of windows) {
            window.child.kill('SIGTERM');
            const summary = JSON.parse((await window.lines.next()).value);
            assert.equal(summary.prompt, 7, 'the other window\'s prompts are accounted for as sequence receipts');
            const db = new DatabaseSync(window.config.storePath);
            try {
                assert.deepEqual(db.prepare('SELECT session_id,count(*) AS count FROM inbox_commands GROUP BY session_id').all().map(row => [row.session_id, Number(row.count)]), [[window.sessionId, 2]]);
                assert.equal(Number(db.prepare('SELECT count(*) AS count FROM foreign_receipts').get().count), 0, 'receipts below the cursor are pruned');
            } finally { db.close(); }
        }
    } finally { await f.close(); }
});
