#!/usr/bin/env node
// Developer-only exact-build validation. Never starts a Claude conversation.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { measureInstalledTree } from "../extensions/vscode-host/dist/artifacts.js";

const extension = process.argv[2];
if (!extension) throw new Error("Usage: node scripts/check-claude-mod-evaluation.mjs /path/to/installed/anthropic.claude-code-2.1.296-darwin-arm64");
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = resolve(extension);
const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
if (manifest.version !== "2.1.296" || manifest.publisher.toLowerCase() !== "anthropic" || manifest.name !== "claude-code") {
    throw new Error("Requires installed official Anthropic.claude-code 2.1.296");
}
const executable = join(directory, "resources/native-binary/claude");
function run(args) {
    return execFileSync(executable, args, { cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 4_194_304, stdio: ["ignore", "pipe", "pipe"] });
}
const version = run(["--version"]).trim();
if (version !== "2.1.296 (Claude Code)") throw new Error("Bundled runtime version differs from pinned extension");
const results = [];
for (const relative of ["extensions/claude-mod-evaluation", "tests/fixtures/claude-mod-fence"]) {
    const validation = JSON.parse(run(["plugin", "validate", "--strict", "--json", relative]));
    // Claude's test summary is written to stderr, so capture both bounded streams.
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(executable, ["plugin", "test", relative], {
        cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 4_194_304, stdio: ["ignore", "pipe", "pipe"]
    });
    if (result.error || result.status !== 0) throw new Error(`Mod tests failed: ${result.error?.message ?? result.stderr}`);
    results.push({ path: relative, measurement: await measureInstalledTree(join(root, relative)), validation,
        tests: { exitCode: result.status, stdout: result.stdout, stderr: result.stderr } });
}
process.stdout.write(JSON.stringify({
    recordedAt: new Date().toISOString(), status: "developer-fixtures-only-not-native-qualified",
    version, runtimeSha256: createHash("sha256").update(readFileSync(executable)).digest("hex"),
    installedExtension: await measureInstalledTree(directory), results,
    limitations: ["Core effects are stubbed; no live VS Code conversation was controlled.",
        "Successful diagnostic test confirms fail-open behavior; it does not qualify an execution fence.",
        "No authentication, plugin installation, network bridge, or model session is created."]
}, null, 2) + "\n");
