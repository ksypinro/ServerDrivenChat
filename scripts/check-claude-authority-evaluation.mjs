#!/usr/bin/env node
// Read-only exact-build schema validation. This never loads a hook or Mod.
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";

const extensionDirectory = resolve(process.argv[2] ?? "");
const manifest = JSON.parse(readFileSync(join(extensionDirectory, "package.json"), "utf8"));
if (manifest.version !== "2.1.296" || manifest.publisher.toLowerCase() !== "anthropic" || manifest.name !== "claude-code") {
    throw new Error("Requires official installed Claude Code 2.1.296");
}
const schemaBytes = readFileSync(join(extensionDirectory, "claude-code-settings.schema.json"));
const schema = JSON.parse(schemaBytes);
const fragmentBytes = readFileSync("extensions/claude-authority-evaluation/settings.fragment.json");
const fragment = JSON.parse(fragmentBytes);
const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(schema);
if (!validate(fragment)) throw new Error(JSON.stringify(validate.errors));
const invalid = structuredClone(fragment);
invalid.hooks.UserPromptSubmit[0].hooks[0].onFailure = "not-a-native-value";
if (validate(invalid)) throw new Error("Installed schema did not reject invalid failure policy");

const executable = join(extensionDirectory, "resources/native-binary/claude");
const version = execFileSync(executable, ["--version"], { encoding: "utf8", timeout: 10000 }).trim();
if (version !== "2.1.296 (Claude Code)") throw new Error("Bundled version mismatch");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = [
    "authority_guard.py", "statectl.py", "slow_hook.py", "settings.fragment.json",
    "test_authority_guard.py", "README.md",
];
process.stdout.write(JSON.stringify({
    recordedAt: new Date().toISOString(),
    version,
    status: "exact-installed-schema-supported-native-authority-fence-unverified",
    runtimeSha256: sha256(readFileSync(executable)),
    schemaSha256: sha256(schemaBytes),
    fragmentAccepted: true,
    invalidFailurePolicyRejected: true,
    source: files.map((name) => ({
        path: `extensions/claude-authority-evaluation/${name}`,
        sha256: sha256(readFileSync(`extensions/claude-authority-evaluation/${name}`)),
    })),
    limitations: [
        "Installed-schema validation is not native behavior or an execution-time fence.",
        "This command does not install or load a hook or Mod, modify Claude settings, submit a prompt, or grant SDC access.",
    ],
}, null, 2) + "\n");
