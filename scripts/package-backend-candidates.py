#!/usr/bin/env python3
"""Deterministic unsigned MB-04 review packages; no installation or qualification."""
import hashlib
import json
from pathlib import Path
import xml.sax.saxutils as xml
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "extensions/vscode-host/dist/mb04-candidate"
PACKAGES = [
    ("extensions/vscode-host", "sdc-backend-host"),
    ("extensions/vscode-drivers/cline", "sdc-cline-driver"),
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def archive(package_path, package_name):
    source = ROOT / package_path
    manifest = json.loads((source / "package.json").read_text())
    manifest["name"] = package_name
    manifest["license"] = "MIT"
    for key in ["dependencies", "devDependencies", "scripts", "exports", "type", "private"]:
        manifest.pop(key, None)
    files = {
        "package.json": (json.dumps(manifest, indent=2) + "\n").encode(),
        "dist/extension.cjs": (source / "dist/extension.cjs").read_bytes(),
        "README.md": (source / "README.md").read_bytes(),
        "LICENSE": (ROOT / "LICENSE").read_bytes(),
    }
    notices = ["# Bundled dependency notices\n"]
    for dependency in ["ajv", "fast-deep-equal", "fast-uri", "json-schema-traverse", "require-from-string"]:
        directory = ROOT / "node_modules" / dependency
        metadata = json.loads((directory / "package.json").read_text())
        license_file = next((directory / name for name in ["LICENSE", "LICENSE.md", "LICENSE.txt", "license"] if (directory / name).is_file()), None)
        if license_file is None:
            raise RuntimeError(f"Missing license: {dependency}")
        notices.append(f"## {dependency} {metadata['version']}\n\n{license_file.read_text()}\n")
    files["THIRD_PARTY_NOTICES.md"] = "\n".join(notices).encode()
    dependencies = xml.escape(",".join(manifest.get("extensionDependencies", [])), {'"': '&quot;'})
    title = xml.escape(manifest["displayName"])
    version = manifest["version"]
    vsix = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="{package_name}" Version="{version}" Publisher="server-driven-chat" TargetPlatform="darwin-arm64"/><DisplayName>{title}</DisplayName><Description xml:space="preserve">MB-04 unsigned review candidate. Native qualification and installation pending.</Description><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.101.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="{dependencies}"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>'''
    types = '''<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="xml" ContentType="text/xml"/><Override PartName="/extension/LICENSE" ContentType="text/plain"/></Types>'''
    target = OUTPUT / f"{package_name}-{version}-darwin-arm64.vsix"
    entries = {"extension.vsixmanifest": vsix.encode(), "[Content_Types].xml": types.encode(), **{f"extension/{name}": data for name, data in files.items()}}
    with zipfile.ZipFile(target, "w") as bundle:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, data)
    return {"extensionId": f"server-driven-chat.{package_name}", "version": version,
            "path": str(target.relative_to(ROOT)), "sha256": sha(target.read_bytes()),
            "files": {name: sha(data) for name, data in sorted(files.items())}}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    result = {"milestone": "MB-04", "status": "unsigned-review-only", "nativeQualified": False,
              "installation": "not-assessed-by-packaging", "productionCatalog": "empty", "packages": [archive(*package) for package in PACKAGES]}
    output = ROOT / "evidence/MB04/artifact-manifest.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"manifest": str(output), "packages": [p["path"] for p in result["packages"]]}))


if __name__ == "__main__":
    main()
