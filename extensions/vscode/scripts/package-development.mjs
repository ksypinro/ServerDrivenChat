import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const companion = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (companion.version !== "0.3.0") throw new Error("The M21 generator is frozen at companion 0.3.0. Use package-m22.mjs for M22; refusing to overwrite historical artifacts.");
const installed = process.argv[2] ?? "/Users/samin/.vscode/extensions/saoudrizwan.claude-dev-4.1.22";
const expected = "369bfc6bd01de72d26013ed6ebac2c7c9cb5a564bb8ff14679d6a1ba2ab76178";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
const original = await readFile(join(installed, "dist/extension.js"));
if (manifest.publisher !== "saoudrizwan" || manifest.name !== "claude-dev" || manifest.version !== "4.1.22" || hash(original) !== expected) throw new Error("Unrecognized Cline package. Refusing to patch a different version or bundle.");
const needle = "function b4u(t){return{startNewTask:async";
const source = original.toString("utf8");
if (source.split(needle).length !== 2) throw new Error("Pinned public export function mismatch");
const addon = await readFile(join(root, "dist/sdc-native.cjs"));
const clineDirectory = join(root, "dist/cline-4.1.22-sdc-m21.3");
await rm(clineDirectory, { recursive: true, force: true });
await cp(installed, clineDirectory, { recursive: true });
const patched = source.replace(needle, 'function b4u(t){return{serverDrivenChat:require("./sdc-native.cjs").createPinnedClineApi(t),startNewTask:async');
await writeFile(join(clineDirectory, "dist/extension.js"), patched);
await writeFile(join(clineDirectory, "dist/sdc-native.cjs"), addon);
manifest.displayName = "Cline (SDC M21 development patch)";
manifest.version = "4.1.2203";
manifest.sdcPatch = { baseVersion: "4.1.22", baseCommit: "f58bc118bdeef1bd2813cd08e00d98bdcda96475", revision: 3,
    originalBundleSha256: expected, nativeAddonSha256: hash(addon), supportedHost: "local VS Code; Antigravity 3.83.0 and remote hosts unsupported" };
await writeFile(join(clineDirectory, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
const companionDirectory = join(root, "dist/sdc-cline-bridge-m21");
await rm(companionDirectory, { recursive: true, force: true }); await mkdir(join(companionDirectory, "dist"), { recursive: true });
companion.name = "sdc-cline-bridge";
for (const key of ["dependencies", "devDependencies", "scripts", "exports", "type", "private"]) delete companion[key];
await writeFile(join(companionDirectory, "package.json"), JSON.stringify(companion, null, 2) + "\n");
await cp(join(root, "dist/extension.cjs"), join(companionDirectory, "dist/extension.cjs"));
await writeFile(join(companionDirectory, "README.md"), "# Server-Driven Chat Cline bridge\n\nM21 development build. Select an existing local Cline task explicitly. Trusted-origin Connect/pairing and the extension-owned listener are implemented; native addressed approvals/questions/cancellation are supported; grant narrowing/persistence/revocation are unsupported.\n");
const zipScript = `
import pathlib,sys,zipfile,xml.sax.saxutils,json
source=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2]); manifest=json.loads((source/'package.json').read_text())
escape=xml.sax.saxutils.escape
name=escape(manifest['name']); publisher=escape(manifest['publisher']); version=escape(manifest['version']); title=escape(manifest['displayName'])
xml=f'''<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="{name}" Version="{version}" Publisher="{publisher}" TargetPlatform="darwin-arm64"/><DisplayName>{title}</DisplayName><Description xml:space="preserve">M21 development build for explicit existing Cline task binding</Description><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.101.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="{','.join(manifest.get('extensionDependencies',[]))}"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>'''
types='<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="xml" ContentType="text/xml"/></Types>'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('extension.vsixmanifest',xml); archive.writestr('[Content_Types].xml',types)
    for file in source.rglob('*'):
        if file.is_file() and file.name!='.DS_Store': archive.write(file, 'extension/'+file.relative_to(source).as_posix())
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert json.loads(archive.read('extension/package.json'))['version']==manifest['version']
`;
const packages = [];
for (const [directory, name] of [[clineDirectory, "cline-4.1.22-sdc-m21.3.vsix"], [companionDirectory, "sdc-cline-bridge-0.3.0.vsix"]]) {
    const path = join(root, "dist", name);
    const result = spawnSync("python3", ["-c", zipScript, directory, path], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr);
    packages.push({ path, sha256: hash(await readFile(path)) });
}
const record = { baseVersion: "4.1.22", patchedVersion: "4.1.2203", apiVersion: "1.2", companionVersion: companion.version,
    companionExtensionId: `${companion.publisher}.${companion.name}`, companionBundleSha256: hash(await readFile(join(companionDirectory, "dist/extension.cjs"))),
    sourcePatchSha256: hash(await readFile(join(root, "patches/cline-v4.1.22-sdc-m21.3.patch"))),
    originalBundleSha256: expected, patchedBundleSha256: hash(patched), nativeAddonSha256: hash(addon),
    packages, installedExtensionModified: false, signing: "Unsigned development artifacts; M24 distribution gates remain open", compatibility: "Local VS Code only; Antigravity 3.83.0 and remote hosts unsupported" };
await writeFile(join(root, "../../evidence/M21/artifact-manifest.json"), JSON.stringify(record, null, 2) + "\n");
console.log(JSON.stringify(record, null, 2));
