#!/usr/bin/env python3
"""Read-only documentation, schema and accepted VSIX audit; no private state."""
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def anchors(path):
    counts = {}
    result = set()
    for heading in re.findall(r"^#{1,6}\s+(.+?)\s*#*\s*$", path.read_text(), re.M):
        heading = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", heading)
        slug = re.sub(r"[^\w\-\s]", "", heading.lower()).replace(" ", "-")
        count = counts.get(slug, 0)
        result.add(slug + (f"-{count}" if count else ""))
        counts[slug] = count + 1
    return result


def main():
    guides = sorted((ROOT / "docs/guide").rglob("*.md"))
    documents = guides + [ROOT / "evidence/M25/README.md"]
    errors = []
    local_links = 0
    for path in documents:
        content = path.read_text()
        for target in re.findall(r"(?<!!)\[[^]\n]+\]\(([^)]+)\)", content):
            target = target.strip().strip("<>")
            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc:
                continue
            destination = (path.parent / unquote(parsed.path)).resolve() if parsed.path else path
            local_links += 1
            if not destination.exists():
                errors.append(f"{path.relative_to(ROOT)}: missing {target}")
            elif parsed.fragment and destination.suffix == ".md" and unquote(parsed.fragment) not in anchors(destination):
                errors.append(f"{path.relative_to(ROOT)}: missing anchor {target}")
    schema = json.loads((ROOT / "api-gateway/openapi.json").read_text())
    deployed = json.loads((ROOT / "evidence/M25/deployed-openapi.json").read_text())
    if schema != deployed:
        errors.append("Deployed OpenAPI differs from checked-in schema")
    manifest = json.loads((ROOT / "evidence/M24/artifact-manifest.json").read_text())
    package_path = ROOT / "extensions/vscode/dist/m24-release-candidate"
    artifact_checks = []
    for entry in manifest["artifacts"]:
        artifact = package_path / entry["file"]
        actual = hashlib.sha256(artifact.read_bytes()).hexdigest()
        if actual != entry["sha256"]:
            errors.append(f"Changed accepted artifact: {entry['file']}")
        artifact_checks.append({"file": entry["file"], "sha256": actual, "matchesManifest": actual == entry["sha256"]})
    companion = next(package_path / item["file"] for item in manifest["artifacts"] if item["file"].startswith("sdc-cline-bridge-"))
    with zipfile.ZipFile(companion) as archive:
        package = json.loads(archive.read("extension/package.json"))
    titles = {command["title"] for command in package["contributes"]["commands"]}
    user = (ROOT / "docs/guide/user-guide.md").read_text()
    documented = sorted(set(re.findall(r"\*\*(Cline Bridge: [^*]+)\*\*", user)))
    for title in documented:
        if title not in titles:
            errors.append(f"User guide command absent from signed companion: {title}")
    if re.search(r"^```(?:sh|bash|shell|javascript|python|js)\b", user, re.M):
        errors.append("Beginner product guide contains a terminal/programming step")
    for path in (ROOT / "docs/guide/examples").glob("*.mjs"):
        if re.search(r"sdc_api_[A-Za-z0-9_-]{12,}", path.read_text()):
            errors.append(f"Credential literal in {path.name}")
    result = {"status": "failed" if errors else "passed", "guideFiles": len(guides), "localLinksChecked": local_links,
              "deployedOpenApiMatches": schema == deployed, "openApiPaths": len(schema["paths"]),
              "documentedCommandTitles": documented, "companionVersion": package["version"],
              "beginnerProductTerminalSteps": 0, "acceptedArtifacts": artifact_checks, "errors": errors}
    print(json.dumps(result, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
