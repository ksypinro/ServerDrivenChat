#!/usr/bin/env node
// Read-only installed-contract validation; never loads a hook in Claude.
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";

const directory = resolve(process.argv[2] ?? "");
const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
if (manifest.version !== "2.1.296" || manifest.publisher.toLowerCase() !== "anthropic" || manifest.name !== "claude-code") {
    throw new Error("Requires official installed Claude Code 2.1.296");
}
const schemaBytes = readFileSync(join(directory, "claude-code-settings.schema.json"));
const schema = JSON.parse(schemaBytes);
const fragment = JSON.parse(readFileSync("extensions/claude-hook-evaluation/settings.fragment.json", "utf8"));
const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(schema);
if (!validate(fragment)) throw new Error(JSON.stringify(validate.errors));
const invalid = structuredClone(fragment);
invalid.hooks.UserPromptSubmit[0].hooks[0].onFailure = "not-a-native-value";
if (validate(invalid)) throw new Error("Installed schema did not reject invalid failure policy");
const executable = join(directory, "resources/native-binary/claude");
const version = execFileSync(executable, ["--version"], { encoding: "utf8", timeout: 10000 }).trim();
if (version !== "2.1.296 (Claude Code)") throw new Error("Bundled version mismatch");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = ["guard.py", "settings.fragment.json", "test_guard.py", "README.md"];
process.stdout.write(JSON.stringify({
    recordedAt: new Date().toISOString(), version,
    status: "exact-installed-schema-supported-native-behavior-unverified",
    runtimeSha256: sha256(readFileSync(executable)), schemaSha256: sha256(schemaBytes),
    fragmentAccepted: true, invalidFailurePolicyRejected: true,
    source: files.map((name) => ({ path: `extensions/claude-hook-evaluation/${name}`,
        sha256: sha256(readFileSync(`extensions/claude-hook-evaluation/${name}`)) })),
    limitations: ["Schema validation is not native execution or queue acceptance.",
        "No hook installed, setting changed, model run, or SDC access granted by this command."]
}, null, 2) + "\n");
