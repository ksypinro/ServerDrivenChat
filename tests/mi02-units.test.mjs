import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { BridgeStore, BridgeStorageCapacity, BridgeStorageConflict, LockTimeoutError, acquireExclusiveLock, isLockHeld, tryExclusiveLock, trySharedLock } from '../bridge/dist/index.js';
import { MAX_DISPLAY_LABEL_LENGTH, UNSAFE_DISPLAY_LABEL_CHARACTERS, normalizeDisplayLabel } from '../protocol/dist/index.js';
import { ClineAppAdapter, clineDataDirectory, clineNativeScopeId, createClineBackendDriver } from '../adapters/cline/dist/index.js';
import { describeConnections } from '../extensions/vscode/dist/connect.mjs';
import { holdHostLiveness, isHostAlive, pruneHostLocks, recoverableRecords } from '../extensions/vscode-host/dist/recovery.js';
import { nativeFixture } from './helpers/m21-native.mjs';
import { delay } from './helpers/api-fixture.mjs';

const holderScript = new URL('./helpers/lock-holder.mjs', import.meta.url).pathname;
const locksModule = new URL('../bridge/dist/index.js', import.meta.url).pathname;
const recoveryModule = new URL('../extensions/vscode-host/dist/recovery.js', import.meta.url).pathname;
const input = (sessionId, laneSeq, lane = 'prompt', commandId = `${sessionId}-${lane}-${laneSeq}`) => ({ commandId, sessionId, deviceId: 'device', lane, laneSeq, payload: { type: 'turn.submit', commandId } });
async function folder(t) { const path = await mkdtemp(join(tmpdir(), 'mi02-')); t.after(() => rm(path, { recursive: true, force: true })); return path; }
/** A separate process holding one lock until killed. */
async function holder(t, modulePath, exportName, ...args) {
    const child = spawn(process.execPath, [holderScript, modulePath, exportName, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
    const exited = once(child, 'exit');
    t.after(() => { child.kill('SIGKILL'); });
    const [state] = await once(createInterface({ input: child.stdout }), 'line');
    return { state, kill: async () => { child.kill('SIGKILL'); await exited; } };
}

test('MI-02 a scoped inbox keeps other sessions as sequence receipts that never queue or fill capacity', async t => {
    const dir = await folder(t), path = join(dir, 'alpha.sqlite');
    const store = new BridgeStore({ path, sessionId: 'alpha', limits: { maxPendingPrompts: 1 } });
    assert.equal(store.sessionScope, 'alpha');
    for (const seq of [1, 2, 3]) assert.equal(store.acceptCommand(input('beta', seq)), 'receipt');
    assert.equal(store.acceptCommand(input('alpha', 4)), 'created');
    assert.equal(store.acceptCommand(input('beta', 2)), 'duplicate', 'a repeated delivery below the cursor is already accounted for');
    assert.equal(store.acceptCommand(input('beta', 6)), 'receipt', 'a later sequence waits above the gap');
    assert.equal(store.getCursor('device', 'prompt'), 4);
    assert.equal(store.acceptCommand(input('beta', 6)), 'duplicate');
    assert.throws(() => store.acceptCommand(input('gamma', 6, 'prompt', 'other-command')), BridgeStorageConflict);
    assert.equal(store.acceptCommand(input('beta', 5)), 'receipt');
    assert.equal(store.getCursor('device', 'prompt'), 6);
    assert.deepEqual(store.listQueuedCommands('device', 'prompt').map(command => command.commandId), ['alpha-prompt-4']);
    assert.throws(() => store.acceptCommand(input('alpha', 7)), BridgeStorageCapacity, 'only the inbox session consumes capacity');
    store.close();
    assert.throws(() => new BridgeStore({ path, sessionId: 'beta' }), /another session/);
    const reopened = new BridgeStore({ path });
    assert.equal(reopened.sessionScope, 'alpha', 'reopening without a scope keeps the recorded one');
    assert.equal(reopened.acceptCommand(input('beta', 7)), 'receipt');
    reopened.close();
    const sharedPath = join(dir, 'shared.sqlite'), shared = new BridgeStore({ path: sharedPath });
    assert.equal(shared.sessionScope, undefined);
    assert.equal(shared.acceptCommand(input('beta', 1)), 'created', 'an unscoped store still routes every session');
    shared.close();
    assert.throws(() => new BridgeStore({ path: sharedPath, sessionId: 'alpha' }), /other sessions/);
});

test('MI-02 a fresh inbox starts at registration watermarks and reports unresolved native attempts', async t => {
    const store = new BridgeStore({ path: join(await folder(t), 'inbox.sqlite'), sessionId: 'alpha' });
    store.initializeCursors('device', { prompt: 5, control: 2 });
    assert.deepEqual([store.getCursor('device', 'prompt'), store.getCursor('device', 'control')], [5, 2]);
    assert.equal(store.acceptCommand(input('alpha', 6)), 'created');
    assert.deepEqual(store.listQueuedCommands('device', 'prompt').map(command => command.laneSeq), [6], 'its first own command is immediately contiguous');
    store.initializeCursors('device', { prompt: 0, control: 0 });
    assert.equal(store.getCursor('device', 'prompt'), 6, 'an initialized lane never moves');
    assert.throws(() => store.initializeCursors('device', { prompt: -1, control: 0 }), TypeError);
    assert.equal(store.countUnresolvedAttempts(), 0);
    assert.equal(store.beginDispatch('alpha-prompt-6', 'attempt-6', { type: 'turn.submit' }), 'started');
    assert.equal(store.countUnresolvedAttempts('alpha'), 1);
    assert.equal(store.countUnresolvedAttempts('beta'), 0);
    store.finishDispatch('alpha-prompt-6', 'applied');
    assert.equal(store.countUnresolvedAttempts(), 0);
    store.close();
});

test('MI-02 cross-window locks exclude across processes and are released when a holder dies', async t => {
    const dir = await folder(t), exclusive = join(dir, 'exclusive.lock');
    const held = await holder(t, locksModule, 'tryExclusiveLock', exclusive);
    assert.equal(held.state, 'held');
    assert.equal(tryExclusiveLock(exclusive), undefined);
    assert.equal(trySharedLock(exclusive), undefined);
    assert.equal(isLockHeld(exclusive), true);
    await assert.rejects(acquireExclusiveLock(exclusive, { timeoutMs: 150, pollMs: 20 }), LockTimeoutError);
    const abort = new AbortController(), cancelled = acquireExclusiveLock(exclusive, { signal: abort.signal, pollMs: 20 });
    abort.abort();
    await assert.rejects(cancelled, /cancelled/);
    const waiting = acquireExclusiveLock(exclusive, { pollMs: 20 });
    await held.kill();
    (await waiting).release();
    assert.equal(isLockHeld(exclusive), false, 'the operating system released the killed holder\'s lock');
    const sharedPath = join(dir, 'shared.lock');
    const first = await holder(t, locksModule, 'trySharedLock', sharedPath), second = await holder(t, locksModule, 'trySharedLock', sharedPath);
    assert.deepEqual([first.state, second.state], ['held', 'held']);
    const mine = trySharedLock(sharedPath);
    assert.ok(mine, 'shared holders coexist');
    mine.release();
    let acquired = false;
    const writer = acquireExclusiveLock(sharedPath, { pollMs: 20 }).then(lock => { acquired = true; return lock; });
    await first.kill();
    await delay(150);
    assert.equal(acquired, false, 'an exclusive waiter proceeds only after the last shared holder leaves');
    await second.kill();
    (await writer).release();
    assert.equal(acquired, true);
});

test('MI-02 display labels are normalized into text the server accepts', () => {
    assert.equal(normalizeDisplayLabel('  Fix\tlogin\nflow  '), 'Fix login flow');
    assert.equal(normalizeDisplayLabel('spoof‮evil​'), 'spoof evil');
    assert.equal(normalizeDisplayLabel('\u0000\u0007 '), undefined);
    const emoji = normalizeDisplayLabel('😀'.repeat(100));
    assert.ok(emoji.length <= MAX_DISPLAY_LABEL_LENGTH);
    assert.ok(Array.from(emoji).every(character => character === '😀'), 'no surrogate pair is split');
    for (const sample of ['a\u0085b', 'x'.repeat(500), '⁦isolated⁩', 'tab\u000bvertical']) {
        const label = normalizeDisplayLabel(sample);
        assert.ok(label && !UNSAFE_DISPLAY_LABEL_CHARACTERS.test(label) && label.length <= MAX_DISPLAY_LABEL_LENGTH, sample);
    }
});

test('MI-02 the Cline native scope follows Cline data-directory rules and canonicalizes paths', async t => {
    assert.equal(clineDataDirectory({}, '/Users/someone'), '/Users/someone/.cline/data');
    assert.equal(clineDataDirectory({ CLINE_DIR: ' /opt/cline ' }, '/Users/someone'), '/opt/cline/data');
    assert.equal(clineDataDirectory({ CLINE_DIR: '/opt/cline', CLINE_DATA_DIR: '/srv/tasks' }, '/Users/someone'), '/srv/tasks');
    const dir = await folder(t), real = join(dir, 'data'), link = join(dir, 'link');
    await mkdir(real);
    await symlink(real, link);
    assert.equal(clineNativeScopeId('machine', link), clineNativeScopeId('machine', real));
    assert.notEqual(clineNativeScopeId('machine', real), clineNativeScopeId('other-machine', real));
    assert.notEqual(clineNativeScopeId('machine', real), clineNativeScopeId('machine', join(dir, 'missing')));
    assert.match(clineNativeScopeId('machine', real), /^cline-data:[a-f0-9]{64}$/);
    assert.throws(() => clineNativeScopeId('', real), TypeError);
});

test('MI-02 the Cline adapter and backend driver attach the native scope only when configured', async () => {
    const native = nativeFixture();
    const scoped = new ClineAppAdapter(native.api, { nativeScopeId: 'cline-data:test' });
    const bound = await scoped.attach(scoped.selection());
    assert.equal(bound.value.nativeScopeId, 'cline-data:test');
    await scoped.detach(bound.value);
    const plain = new ClineAppAdapter(native.api);
    const unscoped = await plain.attach(plain.selection());
    assert.equal('nativeScopeId' in unscoped.value, false);
    await plain.detach(unscoped.value);
    native.api.dispose();
    const fenced = nativeFixture({ callerToolFence: true });
    const driver = createClineBackendDriver(fenced.api, { nativeScopeId: 'cline-data:test' });
    const context = { installationId: 'installation', hostId: 'host', windowId: 'window', workspaceId: 'workspace', signal: new AbortController().signal, assertCurrent() {}, invalidate() {} };
    const [choice] = await driver.discover(context, context.signal);
    const adapter = await driver.createAdapter(context, choice);
    assert.equal((await adapter.attach(choice.selection)).value.nativeScopeId, 'cline-data:test');
    await driver.dispose();
    fenced.api.dispose();
});

test('MI-02 the connections list shows live bindings first with their labels', () => {
    const now = Date.parse('2026-11-05T10:00:00Z');
    const rows = [
        { sessionId: 'old', state: 'active', role: 'owner', binding: { bindingId: 'b-old', state: 'detached', payload: { binding: { nativeConversationId: 'task-old' } } } },
        { sessionId: 'live', state: 'active', role: 'owner', binding: { bindingId: 'b-live', state: 'active', leaseExpiresAt: '2026-11-05T10:01:00Z', payload: { display: { conversationLabel: 'Fix login', workspaceLabel: 'repo-x' } } } },
        { sessionId: 'expired', state: 'active', binding: { bindingId: 'b-expired', state: 'active', leaseExpiresAt: '2026-11-05T09:59:00Z', payload: {} } },
        { sessionId: 'unbound', state: 'active', binding: null }
    ];
    const items = describeConnections(rows, 'b-live', now);
    assert.deepEqual(items.map(item => item.label), ['$(circle-filled) Fix login', '$(circle-outline) Cline task task-old', '$(circle-outline) Session expired', '$(circle-outline) Session unbound']);
    assert.equal(items[0].description, 'repo-x · online · this window');
    assert.equal(items[1].description, 'offline');
    assert.equal(items[0].detail, 'Session live · owner');
    assert.equal(describeConnections(rows, undefined, now, 1).length, 1);
});

test('MI-02 both extensions negotiate optional registration fields and read server error codes', async t => {
    const server = createServer((request, response) => {
        if (request.url === '/v2/health') {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(JSON.stringify(request.headers.authorization === 'Bearer current' ? { version: 2, requestId: 'r', features: ['binding.nativeScope', 7] } : { version: 2, requestId: 'r' }));
            return;
        }
        response.writeHead(409, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { code: 'CONVERSATION_BOUND_ELSEWHERE', message: 'held by repo-x', requestId: 'r', retryable: false } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const profile = { id: 'p', name: 'p', origin: `http://127.0.0.1:${server.address().port}`, categories: ['prompts'], scope: 'simulation:scope' };
    for (const module of [await import('../extensions/vscode/dist/connect.mjs'), await import('../extensions/vscode-host/dist/connect.js')]) {
        assert.deepEqual([...await module.serverFeatures(profile, 'current')], ['binding.nativeScope']);
        assert.equal((await module.serverFeatures(profile, 'older')).size, 0, 'an older server advertises nothing, so nothing optional is sent');
        const error = await module.apiJson(profile, '/v2/devices/d/bindings', {}, 'current').catch(failure => failure);
        assert.ok(error instanceof module.ServerRequestError);
        assert.equal(error.code, 'CONVERSATION_BOUND_ELSEWHERE');
        assert.equal(error.detail, 'held by repo-x');
        assert.match(error.message, /^Server request failed \(409 CONVERSATION_BOUND_ELSEWHERE\)/);
    }
});

test('MI-02 the generic host recovers only its own records and those of exited windows', async t => {
    const dir = await folder(t);
    const own = await holdHostLiveness(dir, 'host-own');
    const other = await holder(t, recoveryModule, 'holdHostLiveness', dir, 'host-live');
    assert.equal(other.state, 'held');
    assert.equal(isHostAlive(dir, 'host-own'), true);
    assert.equal(isHostAlive(dir, 'host-live'), true);
    assert.equal(isHostAlive(dir, 'host-gone'), false);
    const records = [{ scope: 'own', hostId: 'host-own' }, { scope: 'live', hostId: 'host-live' }, { scope: 'gone', hostId: 'host-gone' }, { scope: 'legacy' }];
    const recoverable = () => recoverableRecords(records, 'host-own', hostId => isHostAlive(dir, hostId)).map(record => record.scope);
    assert.deepEqual(recoverable(), ['own', 'gone', 'legacy'], 'another live window\'s binding is never offered for detach');
    await other.kill();
    assert.deepEqual(recoverable(), ['own', 'live', 'gone', 'legacy']);
    pruneHostLocks(dir, ['host-live']);
    assert.equal(readdirSync(dir).length, 2, 'the live lock and the still-referenced exited lock remain');
    pruneHostLocks(dir, []);
    assert.equal(readdirSync(dir).length, 1);
    own.release();
});
