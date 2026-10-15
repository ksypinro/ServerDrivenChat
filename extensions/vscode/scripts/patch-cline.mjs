// Build an SDC-patched Cline VSIX from a stock Cline package that the analyzer rates COMPATIBLE.
// It inserts one line into Cline's public export factory, adds the native add-on built from this
// repository, and writes a deterministic VSIX plus a record. It never installs or runs anything,
// and it never modifies the input package. The output is unqualified until native acceptance.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeBundle, defaultTarget, findAnchor, loadBaseline, loadReviewed } from "./analyze-cline.mjs";
import { readZipEntries, writeZip } from "./vsix.mjs";

/** Revision of the native add-on: 4 was the M30/M24 tool fence; 5 adds the Cline 4.1.23 approval-display fence. */
export const ADDON_REVISION = 5;
export const NATIVE_API_VERSION = "1.3";
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const escapeXml = text => text.replace(/[<>&"']/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" })[character]);
const CONTENT_TYPES = { ".css": "text/css", ".html": "text/html", ".js": "application/javascript", ".cjs": "application/javascript", ".mjs": "application/javascript",
    ".json": "application/json", ".md": "text/markdown", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".txt": "text/plain",
    ".vsixmanifest": "text/xml", ".woff": "font/woff", ".woff2": "font/woff2", ".map": "application/json", ".xml": "text/xml" };

/** Every file of a stock Cline package, keyed by package-relative path, plus its VSIX manifest when available. */
export function readClinePackage(path) {
    const files = new Map();
    let vsixManifest;
    if (statSync(path).isDirectory()) {
        const walk = directory => {
            for (const name of readdirSync(directory).sort()) {
                const full = join(directory, name), stat = lstatSync(full);
                if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link in Cline package: ${relative(path, full)}`);
                if (stat.isDirectory()) walk(full);
                else if (name !== ".DS_Store") files.set(relative(path, full).split("\\").join("/"), readFileSync(full));
            }
        };
        walk(path);
        // VS Code keeps the original package manifest as .vsixmanifest in an installed extension.
        vsixManifest = files.get(".vsixmanifest")?.toString("utf8");
        files.delete(".vsixmanifest");
    } else {
        const { entries } = readZipEntries(readFileSync(path));
        vsixManifest = entries.get("extension.vsixmanifest")?.toString("utf8");
        for (const [name, bytes] of entries) if (name.startsWith("extension/")) files.set(name.slice("extension/".length), bytes);
    }
    if (!files.has("package.json") || !files.has("dist/extension.js")) throw new Error("Not a Cline package: package.json or dist/extension.js missing");
    return { files, vsixManifest };
}

function packageManifestXml(template, manifest) {
    if (template) {
        const identity = /(<Identity\b[^>]*\bVersion=")[^"]*(")/;
        const display = /(<DisplayName>)[\s\S]*?(<\/DisplayName>)/;
        if (!identity.test(template) || !display.test(template)) throw new Error("Unrecognized VSIX manifest template");
        return template.replace(identity, `$1${escapeXml(manifest.version)}$2`).replace(display, `$1${escapeXml(manifest.displayName)}$2`);
    }
    return `<?xml version="1.0" encoding="utf-8"?>\n<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="${escapeXml(manifest.name)}" Version="${escapeXml(manifest.version)}" Publisher="${escapeXml(manifest.publisher)}"/><DisplayName>${escapeXml(manifest.displayName)}</DisplayName><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${escapeXml(manifest.engines?.vscode ?? "")}"/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>\n`;
}

function contentTypesXml(names) {
    const extensions = [...new Set(names.map(name => extname(name).toLowerCase()).filter(Boolean))].sort();
    const defaults = extensions.map(extension => `<Default Extension="${escapeXml(extension)}" ContentType="${CONTENT_TYPES[extension] ?? "application/octet-stream"}"/>`).join("");
    return `<?xml version="1.0" encoding="utf-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults}</Types>`;
}

/** Refuse an add-on bundle that is older than the source it is built from. */
export function assertAddonFresh(addonPath, sources) {
    if (!existsSync(addonPath)) throw new Error(`Native add-on not built: ${addonPath}. Run npm run build first.`);
    const built = statSync(addonPath).mtimeMs;
    const stale = sources.filter(source => existsSync(source) && statSync(source).mtimeMs > built);
    if (stale.length) throw new Error(`Native add-on is older than its sources (${stale.map(source => relative(repoRoot, source)).join(", ")}). Run npm run build first.`);
}

/** Build the patched package in memory and return the VSIX bytes and a record. Throws unless the analyzer verdict is COMPATIBLE. */
export function buildPatchedCline({ files, vsixManifest }, { addon, license, baseline = loadBaseline(), reviewed = loadReviewed() }) {
    const manifest = JSON.parse(files.get("package.json").toString("utf8"));
    delete manifest.__metadata;
    const source = files.get("dist/extension.js").toString("utf8");
    const distFiles = [...files.keys()].filter(name => name.startsWith("dist/") && !name.slice(5).includes("/"));
    const report = analyzeBundle(source, manifest, baseline, distFiles, reviewed);
    if (report.verdict !== "COMPATIBLE") {
        const reasons = [...report.blockers, ...report.reviews].map(reason => `  - ${reason}`).join("\n");
        const error = new Error(`Analyzer verdict is ${report.verdict}; refusing to patch ${manifest.publisher}.${manifest.name} ${manifest.version}:\n${reasons}`);
        error.report = report;
        throw error;
    }
    const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.version ?? "");
    if (!version) throw new Error(`Unsupported Cline version format ${manifest.version}`);
    if (!addon.toString("utf8").includes("createPinnedClineApi")) throw new Error("Native add-on does not export createPinnedClineApi");
    if (!license.startsWith("MIT License\n")) throw new Error("SDC patch license must be the project MIT license");

    const { anchor } = report;
    const original = `function ${anchor.name}(${anchor.parameter}){return{startNewTask:async`;
    if (source.slice(anchor.offset, anchor.offset + original.length) !== original) throw new Error("Patch anchor moved during analysis");
    const patched = source.slice(0, anchor.offset) + anchor.insertion + source.slice(anchor.offset + original.length);
    const check = findAnchor(patched);
    if (!check.alreadyPatched || check.matches !== 0 || patched.split("serverDrivenChat:require(").length !== 2) throw new Error("Patched bundle failed verification");

    const baseVersion = manifest.version;
    const patchedVersion = `${version[1]}.${version[2]}.${Number(version[3]) * 100 + ADDON_REVISION}`;
    const record = {
        schema: "sdc-patched-cline-v1",
        baseVersion, patchedVersion, revision: ADDON_REVISION, nativeApiVersion: NATIVE_API_VERSION,
        baseBundleSha256: report.target.bundleSha256, patchedBundleSha256: sha256(patched), nativeAddonSha256: sha256(addon),
        exportFactory: anchor.name,
        analyzer: { verdict: report.verdict, baselineVersion: report.baseline.version, reviewedMethods: Object.entries(report.methods).filter(([, value]) => value.status === "reviewed").map(([name]) => name) },
        supportedHost: "local VS Code desktop; remote extension hosts unsupported",
        acceptance: "Unqualified: static analysis and fixture tests only. Native acceptance is required before any support claim."
    };
    Object.assign(manifest, { version: patchedVersion, displayName: `Cline (SDC patch r${ADDON_REVISION} on ${baseVersion})` });
    manifest.sdcPatch = { baseVersion, revision: ADDON_REVISION, nativeApiVersion: NATIVE_API_VERSION, originalBundleSha256: record.baseBundleSha256,
        nativeAddonSha256: record.nativeAddonSha256, tool: "extensions/vscode/scripts/patch-cline.mjs", supportedHost: record.supportedHost, acceptance: record.acceptance };

    const output = new Map(files);
    output.set("package.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
    output.set("dist/extension.js", Buffer.from(patched));
    output.set("dist/sdc-native.cjs", addon);
    output.set("SDC-PATCH-LICENSE.txt", Buffer.from(license));
    const notices = source.lastIndexOf("/*! Bundled license information:");
    if (notices >= 0) output.set("CLINE-UPSTREAM-BUNDLED-NOTICES.txt", Buffer.from(source.slice(notices)));
    const names = [...output.keys()].sort();
    const entries = [
        ["extension.vsixmanifest", Buffer.from(packageManifestXml(vsixManifest, manifest))],
        ["[Content_Types].xml", Buffer.from(contentTypesXml(["extension.vsixmanifest", ...names]))],
        ...names.map(name => [`extension/${name}`, output.get(name)])
    ];
    const vsix = writeZip(entries);

    // Verify the archive as VS Code will read it.
    const { entries: written } = readZipEntries(vsix, ["extension/package.json", "extension/dist/extension.js", "extension/dist/sdc-native.cjs"]);
    if (JSON.parse(written.get("extension/package.json").toString("utf8")).version !== patchedVersion ||
        sha256(written.get("extension/dist/extension.js")) !== record.patchedBundleSha256 || sha256(written.get("extension/dist/sdc-native.cjs")) !== record.nativeAddonSha256)
        throw new Error("Written VSIX failed verification");
    return { vsix, record: { ...record, vsixSha256: sha256(vsix), files: names.length }, report };
}

const USAGE = `Usage:
  node extensions/vscode/scripts/patch-cline.mjs [<stock cline dir|.vsix>] [--out <dir>]
Without an input, the single Cline installation in ~/.vscode/extensions is used (read-only).
Writes cline-<version>-sdc-r${ADDON_REVISION}.vsix and .json to --out (default extensions/vscode/dist/patched-cline). Nothing is installed.`;

function main(argv) {
    const options = { positional: [] };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--help" || arg === "-h") { console.log(USAGE); return 0; }
        if (arg === "--out") { if (!argv[index + 1]) throw new Error(USAGE); options.out = argv[++index]; }
        else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}\n${USAGE}`);
        else options.positional.push(arg);
    }
    if (options.positional.length > 1) throw new Error(USAGE);
    const input = options.positional[0] ? resolve(options.positional[0]) : defaultTarget();
    const out = resolve(options.out ?? join(repoRoot, "extensions/vscode/dist/patched-cline"));
    const addonPath = join(repoRoot, "extensions/vscode/dist/sdc-native.cjs");
    const addonSources = [
        ...readdirSync(join(repoRoot, "adapters/cline/src")).filter(name => name.startsWith("native-") && name.endsWith(".ts")).map(name => join(repoRoot, "adapters/cline/src", name)),
        join(repoRoot, "extensions/vscode/src/native-entry.ts")
    ];
    assertAddonFresh(addonPath, addonSources);
    let built;
    try {
        built = buildPatchedCline(readClinePackage(input), { addon: readFileSync(addonPath), license: readFileSync(join(repoRoot, "LICENSE"), "utf8") });
    } catch (error) {
        if (error.report) { console.error(error.message); return 2; }
        throw error;
    }
    const { vsix, record } = built;
    const stem = `cline-${record.baseVersion}-sdc-r${ADDON_REVISION}`;
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `${stem}.vsix`), vsix);
    writeFileSync(join(out, `${stem}.json`), JSON.stringify({ ...record, input: basename(input) }, null, 2) + "\n");
    const line = (label, value) => console.log(`  ${label.padEnd(24)} ${value}`);
    console.log("Patched Cline package built (not installed)\n");
    line("Input", input);
    line("Base version", `${record.baseVersion}  (analyzer: ${record.analyzer.verdict}${record.analyzer.reviewedMethods.length ? `; reviewed: ${record.analyzer.reviewedMethods.join(", ")}` : ""})`);
    line("Patched version", record.patchedVersion);
    line("Export factory", record.exportFactory);
    line("Base bundle SHA-256", record.baseBundleSha256);
    line("Patched bundle SHA-256", record.patchedBundleSha256);
    line("Add-on SHA-256", record.nativeAddonSha256);
    line("VSIX", join(out, `${stem}.vsix`));
    line("VSIX SHA-256", record.vsixSha256);
    line("Record", join(out, `${stem}.json`));
    console.log(`\n${record.acceptance}`);
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { process.exitCode = main(process.argv.slice(2)); }
    catch (error) { console.error(`patch-cline: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 3; }
}
