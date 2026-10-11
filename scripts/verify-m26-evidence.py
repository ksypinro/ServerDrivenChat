#!/usr/bin/env python3
"""Read-only final gate audit. No credentials, model calls, or service mutation."""
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'evidence/M26'
errors = []


def require(condition, message):
    if not condition:
        errors.append(message)


def load(name):
    path = EVIDENCE / name
    if not path.exists():
        errors.append(f'Missing required evidence: {name}')
        return {}
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


frozen = load('frozen-candidate.json')
for entry in frozen.get('sourceFiles', []):
    require(digest(ROOT / entry['path']) == entry['sha256'], f'Frozen product changed: {entry["path"]}')
for entry in frozen.get('artifacts', []):
    require(digest(ROOT / 'extensions/vscode/dist/m24-release-candidate' / entry['file']) == entry['sha256'],
            f'Frozen archive changed: {entry["file"]}')
extensions = Path.home() / 'Library/Application Support/ServerDrivenChat/M24/vscode-extensions'
for entry in frozen.get('installed', []):
    path = extensions / entry.get('relativePath', f'{entry.get("id")}-{entry.get("version")}/package.json')
    require(digest(path) == entry.get('sha256', entry.get('manifestSha256')), f'Installed file changed: {path.name}')
native_paths = {
    'patchedBundleSha256': 'saoudrizwan.claude-dev-4.1.2204/dist/extension.js',
    'nativeAddonSha256': 'saoudrizwan.claude-dev-4.1.2204/dist/sdc-native.cjs',
    'companionBundleSha256': 'server-driven-chat.sdc-cline-bridge-0.7.3/dist/extension.cjs'
}
for key, path in native_paths.items():
    require(digest(extensions / path) == frozen['nativeFingerprints'][key], f'Installed native fingerprint mismatch: {key}')
for entry in frozen.get('deployedImages', []):
    actual = subprocess.check_output(['docker', 'inspect', '--format', '{{.Image}}', entry['container']], text=True).strip()
    require(actual == entry['imageId'], f'Deployed image changed: {entry["container"]}')

required = ['provider-native.json', 'sdk-streams-native.json', 'image-native.json', 'jpeg-native.json',
            'aider-native.json', 'firstparty-native.json', 'native-negative.json', 'native-fences.json',
            'recovered-cleanup.json', 'performance.json', 'soak.json', 'real-native-soak.json',
            'final-deployed-monitor.json', 'final-local-disable.json', 'final-state.json']
reports = {name: load(name) for name in required}
for name, report in reports.items():
    require(report.get('status') == 'passed', f'{name} has not passed')
    require(not report.get('failures'), f'{name} contains unresolved failures')
performance = reports['performance.json']
require(len(performance.get('trials', [])) >= 3, 'Fewer than three measured latency trials')
for trial in performance.get('trials', []):
    require(trial['milliseconds']['count'] >= 60 and trial['milliseconds']['p95'] < 500,
            f'Control latency trial {trial["trial"]} failed target')
backlog = performance.get('backlog', {})
require(backlog.get('transcriptBytes') == 10 * 1024 * 1024 and backlog.get('remaining') == 20,
        '10 MiB stalled outbox retention not established')
require(backlog.get('milliseconds', {}).get('p95', 1000) < 500, 'Backlog control p95 target not met')
approval = next((item for item in reports['firstparty-native.json'].get('results', [])
                 if item['kind'] == 'approval-visibility'), {})
require(len(approval.get('samples', [])) >= 2, 'Missing native approval visibility samples')
require(all(0 <= item['milliseconds'] < 1000 for item in approval.get('samples', [])),
        'Native approval visibility exceeds one second')
for name in ['soak.json', 'real-native-soak.json']:
    require(reports[name].get('actualDurationMs', 0) >= 3_600_000, f'{name} has not completed an actual hour')
require(reports['soak.json'].get('activeCommands', 0) >= 50, 'Bridge active phase lacked controls')
require(len(reports['real-native-soak.json'].get('turns', [])) >= 19, 'Real native active phase lacked turns')
require(reports['final-deployed-monitor.json'].get('actualDurationSeconds', 0) >= 3600,
        'Independent deployed monitor has not completed an actual hour')
require(reports['real-native-soak.json'].get('credentialCleanup') == 'revoked and rejected401',
        'Soak key cleanup not verified')
require(reports['final-local-disable.json'].get('remainingUnrevokedM26Keys') == 0,
        'M26 scoped keys still unrevoked or final cleanup missing')
fence = next((item for item in reports['final-local-disable.json'].get('results', [])
              if item['kind'] == 'local-disable-live-key-fence'), {})
require(fence.get('identityStatus') == 200 and fence.get('promptStatus') == 403 and
        fence.get('durablePromptCommandsBefore') == fence.get('durablePromptCommandsAfter'),
        'Local disable did not fence a live authenticated key without admission')
require(reports['final-state.json'].get('activeNativeBindings') == 0 and
        reports['final-state.json'].get('disposablePostgres') == 'stopped' and
        reports['final-state.json'].get('verifiedHttpsHealthStatus') == '200',
        'Final native/service cleanup state missing')

root_log = (EVIDENCE / 'root-test.log').read_text()
require(all(re.search(rf'^(?:#|ℹ) {label} {count}$', root_log, re.M)
            for label, count in [('pass', 182), ('fail', 0), ('skipped', 0)]),
        'Full enabled root regression result missing')
require('54 passed' in (EVIDENCE / 'gateway-test.log').read_text(), 'Gateway regression result missing')
require('Executed 8 tests, with 0 failures' in (EVIDENCE / 'swift-test.log').read_text(), 'Swift regression result missing')
require('Ran 2 tests' in (EVIDENCE / 'aider-shim-test.log').read_text() and
        'OK' in (EVIDENCE / 'aider-shim-test.log').read_text(), 'Aider retry identity regression missing')
require('Trusted signature and both artifact checksums verified.' in (EVIDENCE / 'signature.log').read_text(),
        'Trusted signature verification missing')
traceability = (EVIDENCE / 'traceability.md').read_text()
ids = sorted(set(re.findall(r'\| (FR-\d\d) ', traceability)))
require(ids == [f'FR-{n:02d}' for n in range(1, 29)], 'FR-01–FR-28 traceability incomplete')
docs = json.loads((EVIDENCE / 'documentation-audit.log').read_text())
require(docs.get('status') == 'passed', 'Guide/schema/archive audit failed')
result = {'status': 'failed' if errors else 'passed',
          'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'sourceFiles': len(frozen.get('sourceFiles', [])), 'deployedImages': len(frozen.get('deployedImages', [])),
          'installedNativeFingerprints': len(native_paths), 'requirements': ids,
          'requiredReports': required, 'errors': errors}
(EVIDENCE / 'gate-audit.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
sys.exit(1 if errors else 0)
