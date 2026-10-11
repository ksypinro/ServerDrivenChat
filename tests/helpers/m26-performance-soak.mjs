/** M26 operator qualification: real HTTP/PostgreSQL/SQLite; native effects are simulated. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { BridgeRuntime, BridgeStore } from '../../bridge/dist/index.js';
import { FakeAppAdapter } from '../../adapters/fake/dist/index.js';
import { apiFixture, command, delay, waitFor } from './api-fixture.mjs';

const databaseUrl = process.env.M26_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'M26_TEST_DATABASE_URL must name the disposable test database');
const soak = process.argv.includes('--soak');
const destination = soak ? 'evidence/M26/soak.json' : 'evidence/M26/performance.json';
const report = { startedAt: new Date().toISOString(), status: 'running', native: 'SIMULATED',
    topology: 'Node 24 real node:http loopback + PostgreSQL 17 disposable schema + real BridgeRuntime/file-backed SQLite; fake native effect; separately sampled persistent HTTPS deployment',
    trials: [], samples: [], failures: [] };
const save = () => writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
const statistics = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { count: sorted.length, min: sorted[0], median: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1), values };
};
save();
const fixture = await apiFixture(databaseUrl, { pollMs: 25, heartbeatMs: 1000 });
const directory = mkdtempSync(join(tmpdir(), 'sdc-m26-'));
const store = new BridgeStore({ path: join(directory, 'bridge.sqlite') });
const sessionId = 'm26-performance';
const adapter = new FakeAppAdapter({ sessionId, now: () => new Date().toISOString() });
const binding = (await adapter.attach({ appId: 'fake.app', appInstanceId: 'fake-instance', conversationId: 'fake-conversation' })).value;
await fixture.bind(sessionId);
let delivered = 0;
let effectTime = 0;
let holdOutput = false;
let outputPosting = false;
adapter.cancel = async (_binding, _turnId, context) => {
    context.assertAuthority();
    effectTime = performance.now();
    delivered++;
    return { outcome: 'applied', evidence: 'SIMULATED effect, no model time' };
};
const runtime = new BridgeRuntime({ serverUrl: fixture.base, deviceId: fixture.issued.deviceId,
    credential: fixture.issued.credential, binding, adapter, store,
    fetch: async (url, init) => {
        if (holdOutput && new URL(url).pathname.endsWith('/events')) {
            outputPosting = true;
            return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Error('Injected output stall ended')), { once: true }));
        }
        return fetch(url, init);
    } });
let serial = 0;
async function control() {
    const id = `control-${++serial}`;
    const value = command(sessionId, id, 'control');
    const before = delivered;
    const start = performance.now();
    const response = await fixture.request(`/v2/sessions/${sessionId}/turns/${value.turnId}/controls`, { command: value }, 'owner');
    assert.equal(response.status, 202, await response.text());
    await waitFor(() => delivered === before + 1, 5000);
    return effectTime - start;
}
try {
    await runtime.start();
    await delay(150);
    if (!soak) {
        for (let trial = 1; trial <= 3; trial++) {
            const values = [];
            for (let n = 0; n < 60; n++) values.push(await control());
            const result = statistics(values);
            report.trials.push({ trial, measurement: 'user HTTP request start through real server durable admission/SSE/dispatch permit to guarded simulated adapter effect', milliseconds: result });
            save();
            assert.ok(result.p95 < 500, `Trial ${trial} p95 exceeded 500 ms`);
        }
        holdOutput = true;
        for (let seq = 1; seq <= 20; seq++) store.persistOutput({ eventId: `backlog-${seq}`, sessionId, eventSeq: seq, bridgeEpoch: 'backlog', payload: { text: 'x'.repeat(512 * 1024) } });
        await waitFor(() => outputPosting);
        const values = [];
        for (let n = 0; n < 60; n++) values.push(await control());
        report.backlog = { transcriptBytes: 10 * 1024 * 1024, events: 20, outputPost: 'injected indefinitely stalled fetch, control/lease/dispatch use real HTTP', remaining: store.countUnackedOutput(), milliseconds: statistics(values) };
        assert.equal(store.countUnackedOutput(), 20);
        assert.ok(report.backlog.milliseconds.p95 < 500, 'Backlog control p95 exceeded 500 ms');
    } else {
        const start = performance.now();
        while (performance.now() - start < 3600000) {
            const elapsedMs = performance.now() - start;
            const sample = { at: new Date().toISOString(), elapsedMs, phase: elapsedMs < 1800000 ? 'idle' : 'active', state: runtime.state, unackedOutput: store.countUnackedOutput(), rssBytes: process.memoryUsage().rss };
            try {
                sample.deployedHealthStatus = execFileSync('curl', ['--ipv4', '--fail', '--silent', '--show-error', '--max-time', '8', '-o', '/dev/null', '-w', '%{http_code}', 'https://localhost:15943/api/v1/health'], { encoding: 'utf8', timeout: 10000 });
                assert.equal(sample.deployedHealthStatus, '200');
                assert.equal(runtime.state, 'online');
                if (sample.phase === 'active') sample.controlLatencyMs = await control();
            } catch (error) { report.failures.push({ at: sample.at, reason: error.message }); }
            report.samples.push(sample);
            save();
            await delay(Math.min(30000, Math.max(0, 3600000 - (performance.now() - start))));
        }
        report.actualDurationMs = performance.now() - start;
        report.activeCommands = delivered;
        assert.ok(report.actualDurationMs >= 3600000);
        assert.equal(report.failures.length, 0);
        assert.ok(delivered >= 50);
    }
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.failures.push({ at: new Date().toISOString(), reason: error.message });
    process.exitCode = 1;
} finally {
    report.endedAt = new Date().toISOString();
    save();
    await runtime.stop();
    store.close();
    rmSync(directory, { recursive: true, force: true });
    await fixture.close();
}
console.log(JSON.stringify({ status: report.status, destination, failures: report.failures }));
