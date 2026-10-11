"""Regenerate the maintained source diff from an inspected Cline 4.1.22 checkout.

This tool reads sources only. Packaging independently verifies the exact vendor
bundle fingerprint; a source diff is not proof that an upstream build passed.
"""
from pathlib import Path
import difflib
import sys
import re

root = Path(__file__).resolve().parents[3]
upstream = Path(sys.argv[1])
prefix = "apps/vscode/src/exports/"
parts = []

def add(name, before, after):
    parts.extend(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
        fromfile=f"a/{prefix}{name}" if before else "/dev/null", tofile=f"b/{prefix}{name}"))

before = (upstream / prefix / "index.ts").read_text()
needle = "\tconst api: ClineAPI = {\n"
assert before.count(needle) == 1
add("index.ts", before, 'import { createPinnedClineApi } from "./sdc-native-entry"\n' +
    before.replace(needle, needle + "\t\tserverDrivenChat: createPinnedClineApi(sidebarController),\n"))
before = (upstream / prefix / "cline.d.ts").read_text()
needle = "export interface ClineAPI {\n"
assert before.count(needle) == 1
add("cline.d.ts", before, 'import type { NativeBridgeApi } from "./sdc-native-api"\n' +
    before.replace(needle, needle + "\t/** Explicitly versioned maintained API; stock Cline does not expose this. */\n\tserverDrivenChat?: NativeBridgeApi\n"))
contracts = (root / "protocol/src/contracts.ts").read_text()
connect_types = "\n".join(re.search(r"export interface " + name + r" \{[^}]*\}", contracts).group(0) for name in ["TrustedConnectContext", "ConnectToolResult"]) + "\n"
add("sdc-connect-contract.ts", "", connect_types)

for name, source in [
    ("sdc-native-connect.ts", "adapters/cline/src/native-connect.ts"),
    ("sdc-native-controls.ts", "adapters/cline/src/native-controls.ts"),
    ("sdc-native-api.ts", "adapters/cline/src/native-api.ts"),
    ("sdc-native-patch.ts", "adapters/cline/src/native-patch.ts"),
    ("sdc-native-entry.ts", "extensions/vscode/src/native-entry.ts"),
]:
    text = (root / source).read_text().replace('"./native-api.js"', '"./sdc-native-api"')
    text = text.replace('"../../../adapters/cline/src/native-patch.js"', '"./sdc-native-patch"')
    text = text.replace('"../../../adapters/cline/src/native-api.js"', '"./sdc-native-api"')
    text = text.replace('"./native-controls.js"', '"./sdc-native-controls"')
    text = text.replace('"./native-connect.js"', '"./sdc-native-connect"')
    text = text.replace('"@server-driven-chat/protocol"', '"./sdc-connect-contract"')
    add(name, "", text)
(root / "extensions/vscode/patches/cline-v4.1.22-sdc-m21.3.patch").write_text("".join(parts))
