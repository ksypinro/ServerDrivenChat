import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('M24 local provisioning retains keys and credentials on retry and rejects unknown partial state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sdc-m24-provision-'));
    const state = join(directory, 'state');
    const run = () => spawnSync('python3', ['deploy/m24/provision-local.py', '--state', state], { encoding: 'utf8', timeout: 15000 });
    try {
        let result = run();
        assert.equal(result.status, 0, result.stderr);
        const names = ['decision.pem', 'signing/release-ed25519.pem', 'tls/ca-key.pem', 'server.env', 'login.json'];
        const original = await Promise.all(names.map(name => readFile(join(state,name))));
        assert.match(original[3].toString(), /SDC_OIDC_REDIRECT_URIS=.*;https:\/\/localhost:15943\//);
        const realm = JSON.parse(await readFile(join(state,'realm/sdc-realm.json'), 'utf8'));
        assert.ok(realm.clients[0].redirectUris.includes('https://localhost:15943/'));
        const launcherBundle = join(state, 'ServerDrivenChat VS Code.app');
        const launcherExecutable = join(launcherBundle, 'Contents', 'MacOS', 'launch');
        const launcherInfo = await readFile(join(launcherBundle, 'Contents', 'Info.plist'), 'utf8');
        const launcherSource = await readFile(join(launcherBundle, 'Contents', 'Resources', 'launch.c'), 'utf8').catch(() => readFile(launcherExecutable, 'utf8'));
        assert.match(launcherInfo, /<key>CFBundleExecutable<\/key><string>launch<\/string>/);
        if (process.platform === 'darwin') {
            assert.match(launcherSource, /Library\/Application Support\/ServerDrivenChat\/M24\/vscode-user/);
            assert.match(launcherSource, /NODE_EXTRA_CA_CERTS/);
            assert.match(launcherSource, /tls\/ca\.pem/);
        }
        else assert.match(launcherSource, /--user-data-dir.*vscode-user/);
        assert.ok((await stat(launcherExecutable)).mode & 0o111);
        if (process.platform === 'darwin') {
            const file = spawnSync('file', [launcherExecutable], { encoding: 'utf8' });
            assert.match(file.stdout, /Mach-O/);
            const signature = spawnSync('codesign', ['--verify', '--deep', '--strict', launcherBundle], { encoding: 'utf8' });
            assert.equal(signature.status, 0, signature.stderr);
        }
        assert.equal((await stat(state)).mode & 0o777, 0o700);
        assert.equal((await stat(join(state,'login.json'))).mode & 0o777, 0o600);
        result = run();
        assert.equal(result.status, 0, result.stderr);
        result = spawnSync('python3', ['deploy/m24/provision-local.py', '--state', state, '--refresh-vscode-launcher'], { encoding: 'utf8', timeout: 15000 });
        assert.equal(result.status, 0, result.stderr);
        for (let i=0; i<names.length; i++) assert.deepEqual(await readFile(join(state,names[i])), original[i]);
        await rm(state, { recursive:true });
        await import('node:fs/promises').then(fs => fs.mkdir(state));
        await writeFile(join(state, 'unknown'), 'partial deployment');
        assert.notEqual(run().status, 0);
        assert.equal((await readFile(join(state,'unknown'),'utf8')), 'partial deployment');
    } finally { await rm(directory, { recursive:true, force:true }); }
});
