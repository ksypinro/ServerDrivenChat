#!/usr/bin/env node
// Developer-only read-only inventory. This output is not a qualification record.
import { measureInstalledTree } from '../extensions/vscode-host/dist/artifacts.js';
const directories = process.argv.slice(2);
if (!directories.length) {
    process.stderr.write('Usage: node scripts/measure-backend-artifacts.mjs /absolute/extension/directory [...]\n');
    process.exitCode = 2;
} else {
    const measured = [];
    for (const directory of directories) measured.push({ directory, ...await measureInstalledTree(directory) });
    process.stdout.write(JSON.stringify({ status: 'inventory-only-not-qualified', measured }, null, 2) + '\n');
}
