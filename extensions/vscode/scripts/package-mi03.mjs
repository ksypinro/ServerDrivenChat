// MI-03 candidate pair: the project-signed M24 maintained Cline package byte for byte, plus companion 0.8.0
// from this source tree. The native API and Cline bundles do not change; only the companion is repackaged.
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const signed = JSON.parse(await readFile(join(repo, "evidence/M24/artifact-manifest.json"), "utf8"));
if (signed.status !== "project-signed-local-accepted" || signed.supportTarget.cline !== "4.1.2204" || signed.supportTarget.nativeApi !== "1.3" || signed.supportTarget.companion !== "0.7.3")
    throw new Error("MI-03 packaging requires the project-signed M24 Cline 4.1.2204/API 1.3 release manifest");
const source = join(root, "dist/m24-release-candidate");
const clineFile = "cline-4.1.22-sdc-m24.1.vsix";
const clineSha256 = hash(await readFile(join(source, clineFile)));
if (clineSha256 !== signed.artifacts.find((artifact) => artifact.file === clineFile)?.sha256) throw new Error("Preserved maintained Cline package differs from the signed M24 manifest");
const release = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (release.version !== "0.8.0") throw new Error("MI-03 packaging requires companion source version 0.8.0");

const output = join(root, "dist/mi03-candidate");
const companionStage = join(output, "companion");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(source, clineFile), join(output, clineFile));
await cp(join(source, "companion"), companionStage, { recursive: true });
await cp(join(root, "dist/extension.cjs"), join(companionStage, "dist/extension.cjs"));
const packaged = JSON.parse(await readFile(join(companionStage, "package.json"), "utf8"));
if (packaged.publisher !== "server-driven-chat" || packaged.name !== "sdc-cline-bridge") throw new Error("Staged companion identity changed");
packaged.version = release.version;
packaged.contributes = release.contributes;
await writeFile(join(companionStage, "package.json"), JSON.stringify(packaged, null, 2) + "\n");
await writeFile(join(companionStage, "README.md"), "# Server-Driven Chat — Cline bridge\n\nMI-03 unsigned multi-window candidate paired with the unchanged maintained Cline 4.1.2204, native API 1.3, on isolated VS Code 1.140.0 for macOS arm64. Adds per-window inboxes, cross-window sign-in and cleanup coordination, one live binding per Cline task with consent-gated takeover, display labels and a read-only connections list. It needs a server that advertises the MI-01 features on `/v2/health`; with an older server it sends none of the new fields. Not accepted until MI-03 live acceptance passes.\n");

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
const companionFile = "sdc-cline-bridge-0.8.0-mi03.1.vsix";
const result = spawnSync("python3", ["-I", "-c", zipScript, companionStage, join(output, companionFile)], { encoding: "utf8" });
if (result.status !== 0) throw new Error(result.stderr || "VSIX packaging failed");
const candidate = {
    milestone: "MI-03",
    status: "unsigned-candidate-needs-live-multi-window-acceptance",
    supportTarget: { vscode: "1.140.0", platform: "macOS arm64", cline: "4.1.2204", nativeApi: "1.3", companion: "0.8.0" },
    artifacts: [
        { file: clineFile, sha256: clineSha256, reuse: "byte-identical to the project-signed M24 package; native API and bundles unchanged" },
        { file: companionFile, sha256: hash(await readFile(join(output, companionFile))), companionBundleSha256: hash(await readFile(join(companionStage, "dist/extension.cjs"))) }
    ],
    serverRequirement: "Server source with MI-01 migration 010 and /v2/health features; the running M24/M26 deployment image predates it",
    signing: "unsigned; sign only after review", publication: "not performed"
};
await mkdir(join(repo, "evidence/MI03"), { recursive: true });
await writeFile(join(repo, "evidence/MI03/artifact-manifest.json"), JSON.stringify(candidate, null, 2) + "\n");
console.log(JSON.stringify(candidate, null, 2));
