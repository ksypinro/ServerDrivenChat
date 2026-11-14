import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFile, access } from 'node:fs/promises';
import { readZipEntries } from '../extensions/vscode/scripts/vsix.mjs';
import { nativeFixture } from './helpers/m21-native.mjs';
const require = createRequire(import.meta.url);
const archive = new URL('../extensions/vscode/dist/mi04-candidate/cline-4.1.2206-mi04.1.vsix', import.meta.url);
let available = true;
try { await access(archive); } catch { available = false; }
// Real packaged bytes validate the pin. A simulated VS Code host checks activation only.
test('MI-04 the exact candidate activates Connect in the bundled companion', { skip: !available && 'requires prepared MI-04 candidate archive' }, async () => {
    const entries = readZipEntries(await readFile(archive)).entries;
    const manifest = JSON.parse(entries.get('extension/package.json'));
    const commands = new Map(), errors = [], subscriptions = [], native = nativeFixture();
    const disposable = () => ({ dispose() {} });
    const vscode = {
        StatusBarAlignment: { Left: 1 },
        workspace: { onDidChangeWorkspaceFolders: disposable },
        env: {},
        window: { createStatusBarItem: () => ({ show() {}, dispose() {} }), registerUriHandler: disposable, showErrorMessage: text => { errors.push(text); } },
        commands: { registerCommand: (name, handler) => { commands.set(name, handler); return disposable(); } },
        extensions: { getExtension: () => ({ packageJSON: manifest, extensionUri: { fsPath: '/virtual-cline' }, activate: async () => ({ serverDrivenChat: native.api }) }) },
        Uri: { joinPath: (base, path) => ({ fsPath: base.fsPath + '/' + path }) }
    };
    const module = { exports: {} };
    const nodeRequire = name => {
        if (name === 'vscode') return vscode;
        if (name === 'node:fs/promises') return { ...require(name), readFile: async path => {
            const key = typeof path === 'string' && path.startsWith('/virtual-cline/') ? 'extension/' + path.slice('/virtual-cline/'.length) : undefined;
            return key ? entries.get(key) : readFile(path);
        } };
        return require(name);
    };
    try {
        vm.runInNewContext(await readFile(new URL('../extensions/vscode/dist/extension.cjs', import.meta.url), 'utf8'), {
            require: nodeRequire, module, exports: module.exports, Buffer, process, console, setTimeout, clearTimeout, setInterval, clearInterval,
            AbortController, AbortSignal, URL, URLSearchParams, TextEncoder, TextDecoder, structuredClone
        }, { filename: 'mi04-companion.cjs' });
        await module.exports.activate({ subscriptions, globalState: { get: (_key, fallback) => fallback, setKeysForSync() {} }, secrets: {} });
        assert.deepEqual(errors, []);
        assert.equal(commands.has('sdcCline.connectServer'), true, 'reviewed revision 6 must register Connect after exact hash verification');
        assert.equal(commands.has('sdcCline.selectTask'), true);
    } finally {
        for (const item of subscriptions.reverse()) item.dispose?.();
        native.api.dispose();
    }
});
