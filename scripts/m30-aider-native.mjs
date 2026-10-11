/** Named Aider 0.86.2 two-turn coding acceptance on the disposable real Cline binding. */
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = process.argv[2] ?? 'evidence/M30/native-run';
const gateway = 'http://127.0.0.1:59319';
const project = '/private/tmp/sdc-m19-vscode-probe';
const entry = resolve('tests/clients/aider/sdc_aider.py');
const settings = resolve('tests/clients/aider/model-settings.yml');
const config = resolve('tests/clients/aider/empty-config.yml');
const python = resolve('tests/clients/aider/.venv/bin/python');
const marker = `M30-AIDER-${randomUUID().slice(0, 8)}`;
const results = [];
let credentialId;

async function request(path, body, token = 'owner') {
    const response = await fetch(`${gateway}/api/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(35_000)
    });
    const data = await response.json();
    if (!response.ok) throw Error(`${path}: HTTP ${response.status} ${JSON.stringify(data)}`);
    return data;
}

async function save(status, error) {
    await writeFile(`${directory}/aider-native.json`, JSON.stringify({
        milestone: 'M30', status, marker, client: 'Aider 0.86.2 with pinned SDC entry point', results,
        ...(error ? { error } : {}),
        scope: 'Two coding edits per provider profile through FastAPI/TypeScript/installed Cline; Aider owns local file application; no bearer retained'
    }, null, 2) + '\n');
}

function runAider(args, environment) {
    return new Promise((resolveRun, reject) => {
        const child = spawn(python, [entry, ...args], {
            cwd: project,
            env: { ...process.env, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', ...environment },
            timeout: 15 * 60_000,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let output = '';
        const collect = chunk => { output = (output + chunk.toString()).slice(-120_000); };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        child.once('error', reject);
        child.once('close', (code, signal) => {
            const redacted = output.replace(/sdc_api_[A-Za-z0-9_-]+/g, '<redacted-credential>');
            resolveRun({ code, signal, outputTail: redacted.slice(-5000) });
        });
    });
}

try {
    const live = JSON.parse(await readFile(`${directory}/server-live.json`, 'utf8'));
    const binding = live.bindings?.find(item => item.state === 'active' && Date.parse(item.leaseExpiresAt) > Date.now());
    if (!binding) throw Error('No active consented Cline binding');
    const issued = await request('/credentials', {
        sessionId: binding.sessionId, scopes: ['view', 'prompt'],
        label: 'M30 disposable Aider coding-client acceptance',
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString()
    });
    credentialId = issued.credentialId;
    results.push({ kind: 'binding', bindingId: binding.bindingId, sessionId: binding.sessionId });
    await save('running');

    for (const profile of [
        { name: 'openai-chat', model: 'openai/sdc-default', variable: 'OPENAI_API_KEY',
            baseArgs: ['--openai-api-base', `${gateway}/openai/v1`] },
        { name: 'anthropic-messages', model: 'anthropic/sdc-default', variable: 'ANTHROPIC_API_KEY',
            baseArgs: [], extraEnvironment: { ANTHROPIC_API_BASE: `${gateway}/anthropic` } }
    ]) {
        const filename = `${marker}-${profile.name}.py`;
        const file = `${project}/${filename}`;
        const history = `${project}/.${marker}-${profile.name}.history.md`;
        const inputHistory = `${project}/.${marker}-${profile.name}.input.history`;
        await writeFile(file, 'def greeting():\n    return "original"\n');
        const common = [
            '--model', profile.model, '--model-settings-file', settings,
            '--edit-format', 'whole', '--no-git', '--no-stream', '--no-auto-commits',
            '--no-auto-lint', '--no-suggest-shell-commands', '--no-check-update',
            '--no-analytics', '--no-notifications', '--yes-always',
            '--config', config, '--env-file', '/dev/null',
            '--chat-history-file', history, '--input-history-file', inputHistory,
            ...profile.baseArgs, filename
        ];
        const environment = { [profile.variable]: issued.credential, ...profile.extraEnvironment };
        for (const turn of [1, 2]) {
            const desired = `${marker}-${profile.name}-TURN${turn}`;
            const before = await request(`/sessions/${binding.sessionId}/transcript`, undefined, issued.credential);
            const priorToolIds = new Set(before.items.filter(item => item.kind === 'tool_activity' && item.nativeCategory === 'tool').map(item => item.itemId));
            const args = [...common,
                ...(turn === 2 ? ['--restore-chat-history'] : []),
                '--message', `Return an Aider whole-file edit for ${filename} so greeting() returns exactly the string ${desired}. Do not call native Cline tools or directly modify files; Aider will apply the returned edit. Do not run shell commands or change any other file.`
            ];
            const run = await runAider(args, environment);
            const content = await readFile(file, 'utf8');
            const sha256 = `sha256:${createHash('sha256').update(content).digest('hex')}`;
            const after = await request(`/sessions/${binding.sessionId}/transcript`, undefined, issued.credential);
            const nativeToolActivityIds = after.items.filter(item => item.kind === 'tool_activity' && item.nativeCategory === 'tool' && !priorToolIds.has(item.itemId)).map(item => item.itemId);
            results.push({ kind: `${profile.name}-turn-${turn}`, exitCode: run.code, signal: run.signal,
                file: filename, sha256, expectedTextPresent: content.includes(desired),
                nativeToolActivityIds, outputTail: run.outputTail });
            await save('running');
            if (nativeToolActivityIds.length) throw Error(`${profile.name} coding turn ${turn} used native Cline tools; client effect ownership is unqualified`);
            if (run.code !== 0 || !content.includes(desired)) throw Error(`${profile.name} coding turn ${turn} did not apply the expected local edit`);
        }
    }
    await save('passed');
    console.log('M30 named Aider native-backed two-turn edits passed for both provider text profiles.');
} catch (error) {
    await save('failed', error.message);
    console.error(error);
    process.exitCode = 1;
} finally {
    if (credentialId) {
        try { await request(`/credentials/${credentialId}/revoke`, {}); }
        catch (error) { console.error('Disposable credential revocation failed:', error.message); process.exitCode = 1; }
    }
}
