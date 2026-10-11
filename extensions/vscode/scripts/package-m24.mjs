// Repackage only the exact M30-accepted native fingerprints; this creates an unsigned M24 release candidate.
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(await readFile(join(repo, "evidence/M30/artifact-manifest.json"), "utf8"));
if (manifest.status !== "disposable-native-accepted" || manifest.patchedVersion !== "4.1.2204" || manifest.apiVersion !== "1.3" || manifest.companionVersion !== "0.7.0") {
    throw new Error("M24 packaging requires the exact M30 accepted Cline/API/companion manifest");
}

const sourceCline = join(root, "dist/cline-4.1.22-sdc-m30.1");
const sourceCompanion = join(root, "dist/sdc-cline-bridge-m30");
const sourcePackage = JSON.parse(await readFile(join(sourceCline, "package.json"), "utf8"));
const acceptedCompanionPackage = JSON.parse(await readFile(join(sourceCompanion, "package.json"), "utf8"));
const releaseCompanionPackage = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const clineBundleHash = hash(await readFile(join(sourceCline, "dist/extension.js")));
const nativeHash = hash(await readFile(join(sourceCline, "dist/sdc-native.cjs")));
const acceptedCompanionHash = hash(await readFile(join(sourceCompanion, "dist/extension.cjs")));
const companionHash = hash(await readFile(join(root, "dist/extension.cjs")));
if (sourcePackage.publisher !== "saoudrizwan" || sourcePackage.name !== "claude-dev" || sourcePackage.version !== "4.1.2204" ||
    sourcePackage.sdcPatch?.baseVersion !== "4.1.22" || sourcePackage.sdcPatch?.originalBundleSha256 !== manifest.originalBundleSha256 ||
    clineBundleHash !== manifest.patchedBundleSha256 || nativeHash !== manifest.nativeAddonSha256 || acceptedCompanionHash !== manifest.companionBundleSha256 ||
    acceptedCompanionPackage.publisher !== "server-driven-chat" || acceptedCompanionPackage.name !== "sdc-cline-bridge" || acceptedCompanionPackage.version !== "0.7.0" ||
    releaseCompanionPackage.publisher !== "server-driven-chat" || releaseCompanionPackage.version !== "0.7.3") {
    throw new Error("Source package bundle fingerprints differ from the M30 native acceptance manifest");
}

const output = join(root, "dist/m24-release-candidate");
await rm(output, { recursive: true, force: true });
const clineStage = join(output, "cline");
const companionStage = join(output, "companion");
await mkdir(output, { recursive: true });
await cp(sourceCline, clineStage, { recursive: true });
await cp(sourceCompanion, companionStage, { recursive: true });
await cp(join(root, "dist/extension.cjs"), join(companionStage, "dist/extension.cjs"));

const packagedCline = JSON.parse(await readFile(join(clineStage, "package.json"), "utf8"));
packagedCline.displayName = "Cline (Server-Driven Chat maintained build)";
packagedCline.sdcPatch = { ...packagedCline.sdcPatch, releaseCandidate: "M24", acceptance: "exact M30 fingerprint; M24 clean installation and lifecycle acceptance pending" };
delete packagedCline.sdcPatch.candidateMilestone;
await writeFile(join(clineStage, "package.json"), JSON.stringify(packagedCline, null, 2) + "\n");

const upstreamBundle = await readFile(join(clineStage, "dist/extension.js"), "utf8");
const upstreamNoticeOffset = upstreamBundle.lastIndexOf("/*! Bundled license information:");
if (upstreamNoticeOffset < 0) throw new Error("Accepted upstream Cline bundled notices are missing");
const upstreamNotices = upstreamBundle.slice(upstreamNoticeOffset);
await writeFile(join(clineStage, "CLINE-UPSTREAM-BUNDLED-NOTICES.txt"), upstreamNotices);

const projectLicense = await readFile(join(repo, "LICENSE"), "utf8");
if (!projectLicense.startsWith("MIT License\n")) throw new Error("M24 companion distribution requires the adopted MIT project license");
const packagedCompanion = JSON.parse(await readFile(join(companionStage, "package.json"), "utf8"));
packagedCompanion.version = releaseCompanionPackage.version;
packagedCompanion.contributes = releaseCompanionPackage.contributes;
packagedCompanion.license = "MIT";
await writeFile(join(companionStage, "package.json"), JSON.stringify(packagedCompanion, null, 2) + "\n");
await writeFile(join(companionStage, "LICENSE"), projectLicense);
await writeFile(join(clineStage, "SDC-PATCH-LICENSE.txt"), projectLicense);

const companionReadme = "# Server-Driven Chat — Cline bridge\n\nM24 unsigned release candidate paired with maintained Cline 4.1.2204, native API 1.3, companion 0.7.3 and VS Code 1.140.0 on macOS arm64. The M30-accepted native API and task-control boundary are unchanged. Companion 0.7.3 adds graphical revoke/forget cleanup and uses the fixed, loopback-only OIDC callback already allowlisted by the local deployment so macOS cannot route the result to a different VS Code installation or window. Install both VSIX packages in a separate macOS user account, or an operator-provisioned VS Code instance with separate user-data and extension directories. Profiles alone do not isolate extension binaries. The maintained Cline VSIX retains Cline's original extension identifier; keep the stock Cline installation physically separate.\n";
await writeFile(join(companionStage, "README.md"), companionReadme);

// Preserve notices for neutral SDK dependencies bundled into the accepted companion/native add-on.
// This does not replace the separate upstream Cline transitive-notice review or project license decision.
const dependencyNotices = [];
for (const name of ["ajv", "fast-deep-equal", "fast-uri", "json-schema-traverse"]) {
    const directory = join(repo, "node_modules", name);
    const metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    const licenseText = await readFile(join(directory, "LICENSE"), "utf8");
    dependencyNotices.push({ name, version: metadata.version, license: metadata.license, licenseSha256: hash(licenseText), text: licenseText });
}
const notices = "# Bundled neutral SDK dependency notices\n\nServerDrivenChat-owned code is MIT licensed. Upstream Cline keeps its original Apache-2.0 license; its existing bundled notices are preserved and separately included. These notices cover the neutral SDK dependencies in the accepted native add-on and companion.\n\n" +
    dependencyNotices.map(({ name, version, license, text }) => `## ${name} ${version} (${license})\n\n${text.trim()}\n`).join("\n");
for (const directory of [clineStage, companionStage]) await writeFile(join(directory, "THIRD_PARTY_NOTICES.md"), notices);

const zipScript = `
import json,pathlib,sys,xml.sax.saxutils,zipfile
source=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2]); data=json.loads((source/'package.json').read_text())
esc=xml.sax.saxutils.escape
identity=''.join(esc(str(data[key])) for key in ('name','version','publisher'))
name=esc(data['name']); publisher=esc(data['publisher']); version=esc(data['version']); title=esc(data['displayName'])
dependencies=','.join(data.get('extensionDependencies',[]))
manifest=f'''<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="{name}" Version="{version}" Publisher="{publisher}" TargetPlatform="darwin-arm64"/><DisplayName>{title}</DisplayName><Description xml:space="preserve">M24 unsigned release candidate; exact native fingerprint inherited from M30 acceptance.</Description><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.101.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="{esc(dependencies)}"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>'''
types='<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="xml" ContentType="text/xml"/></Types>'
def write_entry(z,name,content):
 info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED
 info.create_system=3; info.external_attr=0o100644<<16
 z.writestr(info,content)
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 write_entry(z,'extension.vsixmanifest',manifest); write_entry(z,'[Content_Types].xml',types)
 for f in sorted(source.rglob('*')):
  if f.is_file() and f.name!='.DS_Store': write_entry(z,'extension/'+f.relative_to(source).as_posix(),f.read_bytes())
with zipfile.ZipFile(target) as z:
 assert z.testzip() is None
 assert json.loads(z.read('extension/package.json'))['version']==data['version']
`;

const artifacts = [];
for (const [directory, file] of [[clineStage, "cline-4.1.22-sdc-m24.1.vsix"], [companionStage, "sdc-cline-bridge-0.7.3-m24.4.vsix"]]) {
    const path = join(output, file);
    const result = spawnSync("python3", ["-c", zipScript, directory, path], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || "VSIX packaging failed");
    artifacts.push({ file, sha256: hash(await readFile(path)) });
}

const release = {
    milestone: "M24",
    status: "unsigned-release-candidate-needs-live-acceptance",
    supportTarget: { vscode: "1.140.0", platform: "macOS arm64", cline: "4.1.2204", nativeApi: "1.3", companion: "0.7.3" },
    installationBoundary: "Separate macOS account or separately provisioned VS Code user-data and extension directories required. Profiles alone do not isolate extension binaries; maintained Cline retains the stock extension ID.",
    upstream: { version: sourcePackage.sdcPatch.baseVersion, commit: sourcePackage.sdcPatch.baseCommit, originalBundleSha256: manifest.originalBundleSha256 },
    native: { patchedBundleSha256: clineBundleHash, nativeAddonSha256: nativeHash, acceptedCompanionBundleSha256: acceptedCompanionHash, companionBundleSha256: companionHash, acceptedBy: manifest.nativeAcceptance,
        companionRepair: "0.7.3 adds graphical device revocation and selected-profile secret/inbox cleanup; receives OIDC on the fixed loopback-only callback in the initiating extension host; native API 1.3 and the maintained Cline bundles are unchanged" },
    artifacts,
    license: { cline: { spdx: sourcePackage.license ?? "unreported", file: "LICENSE.txt", sha256: hash(await readFile(join(clineStage, "LICENSE.txt"))) },
        companion: { spdx: "MIT", file: "LICENSE", sha256: hash(projectLicense) },
        sdcPatch: { spdx: "MIT", file: "SDC-PATCH-LICENSE.txt", sha256: hash(projectLicense) } },
    thirdPartyNotices: dependencyNotices.map(({ text: _text, ...metadata }) => metadata),
    upstreamNoticeReview: { state: "Original upstream bundled notices preserved and reviewed; no upstream relicensing", file: "CLINE-UPSTREAM-BUNDLED-NOTICES.txt", sha256: hash(upstreamNotices) },
    signing: "unsigned; awaiting operator-selected signing identity",
    publication: "not performed",
    notes: ["Package metadata is M24-specific; VSIX hashes differ from M30 disposable packages.", "Companion 0.7.3 requires fresh affected OIDC and graphical lifecycle acceptance before M24 completion."]
};
await mkdir(join(repo, "evidence/M24"), { recursive: true });
await writeFile(join(repo, "evidence/M24/artifact-manifest.json"), JSON.stringify(release, null, 2) + "\n");
console.log(JSON.stringify(release, null, 2));
