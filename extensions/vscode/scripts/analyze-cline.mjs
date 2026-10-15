// Read-only compatibility analyzer for applying the SDC native add-on to another Cline build.
// It compares the Cline internals that adapters/cline/src/native-*.ts relies on against a
// baseline taken from the accepted stock Cline 4.1.22 bundle. It never modifies, installs or
// executes the analyzed extension. A COMPATIBLE result is static evidence only; real native
// acceptance is still required before claiming support.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readZipEntries } from "./vsix.mjs";

export { readZipEntries };

/** Stock Cline 4.1.22 `dist/extension.js`, the bundle the accepted SDC patch was built from (evidence/M24/artifact-manifest.json). */
export const ACCEPTED_BASE_BUNDLE_SHA256 = "369bfc6bd01de72d26013ed6ebac2c7c9cb5a564bb8ff14679d6a1ba2ab76178";
export const PROFILE_SCHEMA = "sdc-cline-surface-v1";

/** Members used through PinnedController, PinnedInteractions and ConnectLifecycle in adapters/cline/src/native-*.ts. */
export const REQUIRED_METHODS = [
    "resolveContextMentions", "resetMessageTranslatorAndFence", "postStateToWebview",
    "getActiveSession", "setRunning", "fireAndForgetSend", "startNewSession",
    "appendAndEmit", "clearTurnOutcome", "getClineMessages", "getGlobalSettingsKey",
    "handleRequestToolApproval", "handleAskQuestion", "resolvePendingToolApproval", "resolvePendingAskQuestion", "clearPending"
];
/** Feature-detected by the add-on when present; absent in the 4.1.22 baseline. */
export const OPTIONAL_METHODS = ["denyPendingToolApproval"];
export const REVIEWED_SCHEMA = "sdc-cline-reviewed-changes-v1";
export const REQUIRED_PROPERTIES = [
    "sessions", "turnStateTracker", "messageTranslatorState", "interactions", "taskControl", "stateManager",
    "messageStateHandler", "currentPhase", "raiseCancelFence", "sdkHost", "anchorTs",
    "pendingAskResolve", "pendingToolApprovalResolve", "pendingToolApprovalMessage"
];
export const REQUIRED_LITERALS = [
    "clineMessagesChanged", "awaiting_followup", "resumable", "streaming", "user_feedback", "resume_task", "autoApprovalSettings"
];

const ANCHOR = /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{return\{startNewTask:async/g;
const PATCHED_MARKER = 'serverDrivenChat:require("./sdc-native.cjs")';
const KEYWORDS_BEFORE_REGEX = new Set(["return", "typeof", "case", "void", "in", "of", "delete", "throw", "new", "else", "do", "instanceof", "await", "yield"]);
const isIdent = character => character !== undefined && /[\w$]/.test(character);
const sha256 = value => createHash("sha256").update(value).digest("hex");

/** Index just past the string, template or regex literal starting at `start`. */
function skipLiteral(source, start) {
    const quote = source[start];
    if (quote === "`") {
        for (let index = start + 1; index < source.length; index++) {
            if (source[index] === "\\") { index++; continue; }
            if (source[index] === "`") return index + 1;
            if (source[index] === "$" && source[index + 1] === "{") index = scanBalanced(source, index + 1) - 1;
        }
    } else if (quote === "/") {
        let inClass = false;
        for (let index = start + 1; index < source.length; index++) {
            const character = source[index];
            if (character === "\\") { index++; continue; }
            if (character === "[") inClass = true;
            else if (character === "]") inClass = false;
            else if (character === "/" && !inClass) { index++; while (isIdent(source[index])) index++; return index; }
            else if (character === "\n") break;
        }
    } else {
        for (let index = start + 1; index < source.length; index++) {
            if (source[index] === "\\") { index++; continue; }
            if (source[index] === quote) return index + 1;
        }
    }
    throw new Error(`Unterminated literal at offset ${start}`);
}

function slashStartsRegex(source, index) {
    let previous = index - 1;
    while (previous >= 0 && /\s/.test(source[previous])) previous--;
    if (previous < 0) return true;
    const character = source[previous];
    if ("(,=:[!&|?{};+-*%<>~^".includes(character)) return true;
    if (!isIdent(character)) return false;
    let begin = previous;
    while (begin > 0 && isIdent(source[begin - 1])) begin--;
    return KEYWORDS_BEFORE_REGEX.has(source.slice(begin, previous + 1));
}

/** Index just past the bracket matching the `(`, `[` or `{` at `start`, skipping literals and comments. */
export function scanBalanced(source, start) {
    const open = source[start], close = { "(": ")", "[": "]", "{": "}" }[open];
    if (!close) throw new Error(`No bracket at offset ${start}`);
    let depth = 0;
    for (let index = start; index < source.length; index++) {
        const character = source[index];
        if (character === "\"" || character === "'" || character === "`") { index = skipLiteral(source, index) - 1; continue; }
        if (character === "/") {
            if (source[index + 1] === "/") { const end = source.indexOf("\n", index); index = end < 0 ? source.length : end; continue; }
            if (source[index + 1] === "*") { const end = source.indexOf("*/", index + 2); if (end < 0) break; index = end + 1; continue; }
            if (slashStartsRegex(source, index)) { index = skipLiteral(source, index) - 1; continue; }
            continue;
        }
        if (character === open) depth++;
        else if (character === close && --depth === 0) return index + 1;
    }
    throw new Error(`Unbalanced ${open} at offset ${start}`);
}

/** Replace minifier-generated short names so equal code in differently minified builds compares equal. */
export function normalizeCode(code) {
    return code.replace(/(?<![.\w$])[A-Za-z_$][\w$]{0,3}(?![\w$])/g, "_");
}

/** Normalized hashes of every `name(params){...}` definition (class/object methods and functions). */
export function methodDefinitions(source, name) {
    const hashes = [];
    for (let index = source.indexOf(`${name}(`); index >= 0; index = source.indexOf(`${name}(`, index + 1)) {
        const before = source[index - 1];
        if (isIdent(before) || before === ".") continue;
        let paramsEnd;
        try { paramsEnd = scanBalanced(source, index + name.length); } catch { continue; }
        if (source[paramsEnd] !== "{") continue;
        let bodyEnd;
        try { bodyEnd = scanBalanced(source, paramsEnd); } catch { continue; }
        hashes.push(sha256(normalizeCode(source.slice(index, bodyEnd))).slice(0, 16));
    }
    return hashes.sort();
}

function countOccurrences(source, needle) {
    let count = 0;
    for (let index = source.indexOf(needle); index >= 0; index = source.indexOf(needle, index + needle.length)) count++;
    return count;
}

/** Locate the public export factory where the SDC patch inserts its single line. */
export function findAnchor(source) {
    const matches = [...source.matchAll(ANCHOR)];
    const result = { matches: matches.length, alreadyPatched: source.includes(PATCHED_MARKER) };
    if (matches.length !== 1) return result;
    const [match] = matches, name = match[1];
    const bodyStart = match.index + match[0].indexOf("{");
    const body = source.slice(match.index, scanBalanced(source, bodyStart));
    const callSites = [...source.matchAll(new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}\\(([A-Za-z_$][\\w$]*)\\.controller\\)`, "g"))].length;
    return { ...result, name, parameter: match[2], offset: match.index, bodyHash: sha256(normalizeCode(body)).slice(0, 16), callSites,
        insertion: `function ${name}(${match[2]}){return{serverDrivenChat:require("./sdc-native.cjs").createPinnedClineApi(${match[2]}),startNewTask:async` };
}

/** Static surface profile of one Cline bundle. */
export function buildProfile(source, manifest = {}) {
    const anchor = findAnchor(source);
    return {
        schema: PROFILE_SCHEMA,
        source: { publisher: manifest.publisher, name: manifest.name, version: manifest.version, bundleSha256: sha256(source) },
        anchor: { matches: anchor.matches, bodyHash: anchor.bodyHash, callSites: anchor.callSites },
        methods: Object.fromEntries(REQUIRED_METHODS.map(name => [name, methodDefinitions(source, name)])),
        properties: Object.fromEntries(REQUIRED_PROPERTIES.map(name => [name, countOccurrences(source, `.${name}`)])),
        literals: Object.fromEntries(REQUIRED_LITERALS.map(name => [name, countOccurrences(source, `"${name}"`)]))
    };
}

/** Reviewed entry whose fingerprints exactly match a method's definitions, if any. */
function reviewedChange(reviewed, name, definitions) {
    return reviewed.methods?.[name]?.find(entry => JSON.stringify([...entry.definitions].sort()) === JSON.stringify(definitions));
}

/** Compare a target bundle with the accepted baseline profile and reviewed changes. Verdict: COMPATIBLE, REVIEW or INCOMPATIBLE. */
export function analyzeBundle(source, manifest, baseline, files = [], reviewed = { schema: REVIEWED_SCHEMA, methods: {} }) {
    if (baseline?.schema !== PROFILE_SCHEMA) throw new Error(`Baseline is not a ${PROFILE_SCHEMA} profile`);
    if (reviewed?.schema !== REVIEWED_SCHEMA) throw new Error(`Reviewed changes are not a ${REVIEWED_SCHEMA} file`);
    const blockers = [], reviews = [], notes = [];
    if (manifest.publisher !== "saoudrizwan" || manifest.name !== "claude-dev") blockers.push(`Extension identity is ${manifest.publisher}.${manifest.name}, not saoudrizwan.claude-dev`);
    if (manifest.main !== "./dist/extension.js") blockers.push(`Unexpected main entry ${manifest.main}`);
    const anchor = findAnchor(source);
    if (anchor.alreadyPatched) blockers.push("Bundle already contains the SDC native patch; analyze the stock package instead");
    else if (anchor.matches !== 1) blockers.push(`Expected exactly one public export factory, found ${anchor.matches}`);
    else {
        if (anchor.callSites !== 1) blockers.push(`Export factory ${anchor.name} is not called exactly once with the controller (found ${anchor.callSites})`);
        if (anchor.bodyHash !== baseline.anchor.bodyHash) reviews.push(`Public export factory ${anchor.name} differs from the baseline`);
    }
    if (files.includes("dist/sdc-native.cjs")) blockers.push("dist/sdc-native.cjs already exists in the package");
    const methods = {};
    for (const name of [...REQUIRED_METHODS, ...OPTIONAL_METHODS]) {
        const optional = OPTIONAL_METHODS.includes(name);
        const actual = methodDefinitions(source, name), expected = baseline.methods[name] ?? [];
        const entry = actual.length ? reviewedChange(reviewed, name, actual) : undefined;
        const status = !actual.length ? (optional ? "absent" : "missing") : JSON.stringify(actual) === JSON.stringify(expected) ? "identical" : entry ? "reviewed" : "changed";
        methods[name] = { status, definitions: actual.length, baselineDefinitions: expected.length, ...(entry ? { review: entry.review } : {}) };
        if (status === "missing") blockers.push(`Required method ${name} not found`);
        if (status === "changed") reviews.push(`Method ${name} differs from the baseline and has no matching review (${expected.length} → ${actual.length} definitions)`);
        if (status === "reviewed") notes.push(`Method ${name} differs from the baseline; matches the change reviewed since ${entry.since}`);
    }
    const properties = {};
    for (const name of REQUIRED_PROPERTIES) {
        const count = countOccurrences(source, `.${name}`), expected = baseline.properties[name] ?? 0;
        properties[name] = { count, baseline: expected };
        if (!count) blockers.push(`Required property ${name} not referenced`);
        else if (count !== expected) notes.push(`Property ${name} referenced ${count} times (baseline ${expected})`);
    }
    const literals = {};
    for (const name of REQUIRED_LITERALS) {
        const count = countOccurrences(source, `"${name}"`), expected = baseline.literals[name] ?? 0;
        literals[name] = { count, baseline: expected };
        if (!count) blockers.push(`Required string "${name}" not found`);
        else if (count !== expected) notes.push(`String "${name}" appears ${count} times (baseline ${expected})`);
    }
    const extraFiles = files.filter(file => file.startsWith("dist/") && file !== "dist/extension.js");
    if (extraFiles.length) notes.push(`Additional dist files not in the baseline review: ${extraFiles.join(", ")}`);
    const verdict = blockers.length ? "INCOMPATIBLE" : reviews.length ? "REVIEW" : "COMPATIBLE";
    return {
        verdict, target: { publisher: manifest.publisher, name: manifest.name, version: manifest.version, engines: manifest.engines?.vscode, bundleSha256: sha256(source) },
        baseline: baseline.source, anchor, methods, properties, literals, blockers, reviews, notes,
        limits: [
            "Static analysis only: matching code does not prove runtime behavior.",
            "Real native acceptance (prompt, reply, question, cancel, reload) is required before claiming support.",
            "Which Cline 4.1.x storage/session path is active at runtime cannot be determined statically."
        ]
    };
}

/** Load package.json, dist/extension.js and the file list from an installed directory or a .vsix file. */
export function loadPackage(path) {
    if (statSync(path).isDirectory()) {
        const dist = join(path, "dist");
        return { manifest: JSON.parse(readFileSync(join(path, "package.json"), "utf8")), source: readFileSync(join(dist, "extension.js"), "utf8"),
            files: existsSync(dist) ? readdirSync(dist).map(file => `dist/${file}`) : [] };
    }
    const { names, entries } = readZipEntries(readFileSync(path), ["extension/package.json", "extension/dist/extension.js"]);
    if (!entries.has("extension/package.json") || !entries.has("extension/dist/extension.js")) throw new Error("VSIX lacks extension/package.json or extension/dist/extension.js");
    return { manifest: JSON.parse(entries.get("extension/package.json").toString("utf8")), source: entries.get("extension/dist/extension.js").toString("utf8"),
        files: names.filter(name => name.startsWith("extension/dist/") && !name.endsWith("/")).map(name => name.slice("extension/".length)) };
}

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const DEFAULT_BASELINE = join(repoRoot, "extensions/vscode/compat/cline-4.1.22-surface.json");
export const DEFAULT_REVIEWED = join(repoRoot, "extensions/vscode/compat/cline-reviewed-changes.json");

/** Baseline profile from a JSON file, or built from a stock Cline directory/VSIX. */
export function loadBaseline(path = DEFAULT_BASELINE) {
    if (path.endsWith(".json")) return JSON.parse(readFileSync(path, "utf8"));
    const base = loadPackage(path);
    return buildProfile(base.source, base.manifest);
}

export function loadReviewed(path = DEFAULT_REVIEWED) {
    return JSON.parse(readFileSync(path, "utf8"));
}

/** The single Cline installation in the user's ordinary VS Code extensions directory. */
export function defaultTarget() {
    const root = join(homedir(), ".vscode/extensions");
    const found = existsSync(root) ? readdirSync(root).filter(name => /^saoudrizwan\.claude-dev-\d/.test(name)) : [];
    if (found.length !== 1) throw new Error(found.length ? `Several Cline installations found; pass one path: ${found.join(", ")}` : `No Cline installation found in ${root}; pass a path`);
    return join(root, found[0]);
}

function printReport(report, targetPath) {
    const line = (label, value) => console.log(`  ${label.padEnd(34)} ${value}`);
    console.log(`Cline compatibility analysis (read-only)\n`);
    line("Target", `${report.target.publisher}.${report.target.name} ${report.target.version}  (${targetPath})`);
    line("Target bundle SHA-256", report.target.bundleSha256);
    line("Baseline", `${report.baseline.version}  ${report.baseline.bundleSha256}`);
    line("VS Code engine", report.target.engines ?? "unspecified");
    console.log(`\nPatch anchor`);
    if (report.anchor.name) {
        line("Export factory", `${report.anchor.name}(${report.anchor.parameter}) at offset ${report.anchor.offset}`);
        line("Called with controller", `${report.anchor.callSites} time(s)`);
        line("Insertion", report.anchor.insertion);
    } else line("Export factory", `${report.anchor.matches} match(es)${report.anchor.alreadyPatched ? ", already patched" : ""}`);
    console.log(`\nMethods used by the add-on`);
    for (const [name, value] of Object.entries(report.methods)) line(name, `${value.status}${value.definitions !== value.baselineDefinitions ? ` (${value.baselineDefinitions} → ${value.definitions} definitions)` : ""}`);
    console.log(`\nRequired properties and strings`);
    for (const [name, value] of [...Object.entries(report.properties), ...Object.entries(report.literals).map(([key, item]) => [`"${key}"`, item])])
        line(name, value.count === value.baseline ? `present (${value.count})` : value.count ? `present (${value.count}, baseline ${value.baseline})` : "MISSING");
    for (const [title, items] of [["Blockers", report.blockers], ["Needs review", report.reviews], ["Notes", report.notes], ["Limits", report.limits]])
        if (items.length) { console.log(`\n${title}`); for (const item of items) console.log(`  - ${item}`); }
    console.log(`\nVerdict: ${report.verdict}`);
}

const USAGE = `Usage:
  node extensions/vscode/scripts/analyze-cline.mjs [<cline dir|.vsix>] [--baseline <profile.json|dir|.vsix>] [--reviewed <changes.json>] [--json]
  node extensions/vscode/scripts/analyze-cline.mjs --write-baseline <out.json> <stock Cline 4.1.22 dir|.vsix>
Without a target, the single Cline installation in ~/.vscode/extensions is analyzed.`;

function parseArguments(argv) {
    const options = { json: false, positional: [] };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--json") options.json = true;
        else if (arg === "--baseline" || arg === "--write-baseline" || arg === "--reviewed") {
            if (!argv[index + 1]) throw new Error(`${arg} needs a path\n${USAGE}`);
            options[{ "--baseline": "baseline", "--write-baseline": "writeBaseline", "--reviewed": "reviewed" }[arg]] = argv[++index];
        } else if (arg === "--help" || arg === "-h") options.help = true;
        else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}\n${USAGE}`);
        else options.positional.push(arg);
    }
    return options;
}

function main(argv) {
    const options = parseArguments(argv);
    if (options.help) { console.log(USAGE); return 0; }
    if (options.writeBaseline) {
        if (options.positional.length !== 1) throw new Error(USAGE);
        const { manifest, source } = loadPackage(resolve(options.positional[0]));
        if (sha256(source) !== ACCEPTED_BASE_BUNDLE_SHA256) throw new Error("Baseline must be the exact accepted stock Cline 4.1.22 bundle");
        writeFileSync(options.writeBaseline, JSON.stringify(buildProfile(source, manifest), null, 2) + "\n");
        console.log(`Wrote ${options.writeBaseline}`);
        return 0;
    }
    const baseline = loadBaseline(options.baseline ? resolve(options.baseline) : undefined);
    const reviewed = loadReviewed(options.reviewed ? resolve(options.reviewed) : undefined);
    const targetPath = options.positional[0] ? resolve(options.positional[0]) : defaultTarget();
    const { manifest, source, files } = loadPackage(targetPath);
    const report = analyzeBundle(source, manifest, baseline, files, reviewed);
    if (options.json) console.log(JSON.stringify({ ...report, targetPath: basename(targetPath) }, null, 2));
    else printReport(report, targetPath);
    return report.verdict === "COMPATIBLE" ? 0 : report.verdict === "REVIEW" ? 1 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { process.exitCode = main(process.argv.slice(2)); }
    catch (error) { console.error(`analyze-cline: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 3; }
}
