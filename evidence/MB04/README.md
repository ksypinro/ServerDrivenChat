# MB-04 Cline driver checkpoint

Updated: 2026-10-12. Status: **Done for the declared experimental Cline core subset**.
See [verification](verification.json) for real versus fixture evidence and limits.
The generic host is not admitted to the production catalog. Optional controls, broad
switching/recovery acceptance and distribution remain MB-07/08/09. Earlier entries
below are historical checkpoints.

`adapters/cline/src/driver.ts` wraps the existing Cline adapter behind local driver
contract 1.0. It selects the adopted native API 1.3, preserves opaque task/window/
workspace generation, checks current host authority at attachment, reads the native
conversation revision, and forwards invalidation/disposal. It does not use stock
Cline internals and does not start a model during discovery/attachment.

Two focused tests use the existing app-owned native-patch fixture to verify selected
task attachment/revision and refusal of old API, other window, stale selection and
revoked host. Those tests simulate native behavior; they do not extend the installed
Cline pair's acceptance. The full focused contract/host/service/driver run passed
28 checks on Node 24.19.0/npm 11.12.1 after build/lint.

Final root build/lint/test also passed on that toolchain: **154 passed, 55 optional
database checks skipped, 0 failures** (209 total). `git diff --check` and new task,
decision and evidence links passed. This remains fixture/source verification, not
native or package acceptance.

Before MB-04 can be Done:

1. Complete editor/runtime provenance and the external trusted qualification envelope; extension-tree measurement and loader wiring are implemented.
2. Establish a clearly labeled, explicitly consented native evaluation procedure;
   never invent a native qualification record to bypass the empty production catalog.
3. Freeze and verify the evaluation candidate separately from the accepted pair.
4. Run fresh graphical native binding/authority/workflow/API/recovery/lifecycle checks.
5. Publish a trusted exact qualification record only for the observed passing subset.

The broader three-backend goal remains subject to the MB-01 Claude/Codex missing
primitives. The user explicitly selected **Preserve existing IDE conversations**.
Separate vendor runtimes remain prohibited. This resolves the scope question,
without resolving the missing Claude/Codex native interfaces.

## Loader and package checkpoint — 2026-10-12

Added a reviewed loader primitive that checks inventory before and after activation,
requires native qualification and validates exported/factory identity. Four fixture
tests cover mismatch and cleanup. These synthetic records exercise the native-policy
branch; they are not native evidence. The Cline registration extension checks the
adopted native version and two entry fingerprints before obtaining its public API.
Production catalog and loader integration remain incomplete; no driver is enabled.

`python3 scripts/package-backend-candidates.py` builds deterministic unsigned VSIXs
for the generic host and Cline registration extension.
[Artifact manifest](artifact-manifest.json) records archive and packaged-file hashes.
Both archives passed ZIP integrity, XML parsing, main-entry and file-hash checks; a
second packaging run produced identical archives and manifest. MIT and bundled
dependency notices are included. No package was installed or signed.

Latest verification used Node 24.19.0/npm 11.12.1:
`npm install --package-lock-only --ignore-scripts`, `npm ci`, `npm run build`,
`npm run lint`, and `npm test`: **158 passed, 55 optional database checks skipped,
0 failures** (213 total). `git diff --check` passed.

The [native evaluation procedure](EVALUATION.md) separates remaining implementation,
local consent, native acceptance and production promotion. It is not executed
evidence and cannot authorize a production qualification record.

## Installed measurement checkpoint — 2026-10-12

Completed the next MB-04 implementation step: deterministic full installed-extension
measurement and concrete VS Code loader ports are wired into activation. Manifest
identity and complete bytes are checked before native registration. Extension
changes invalidate the host and block reconnect until reload. Five additional
filesystem tests cover repeatability, nested edits, extra files, executable modes,
symlinks, real-file loader admission and manifest substitution. No native operation
is performed by the inventory tool.

Read-only measurement of the existing maintained Cline 4.1.2204 installation passed:
41 files, 36,065,895 bytes, `sdc-installed-tree-v1` digest
`cdd924195d55e989857fc0912cddc9ff1eff3b6c34cff09e693a0b072e84e2be`.
This identifies the installed files at measurement time, including editor metadata;
it is not behavioral qualification or an archive digest. No account/history/token
files were inspected or copied.

Exact checks: Node 24.19.0/npm 11.12.1 `npm run build`, `npm run lint`, `npm test`:
**163 passed, 55 optional database skips, zero failures** (218 total). Focused
artifact/installed-loader/loader tests passed 9/9. Rebuilt both unsigned review VSIXs
with `python3 scripts/package-backend-candidates.py`; repeated packaging is
byte-identical and archive/XML/file hash checks passed. The artifact manifest now
contains the rebuilt host hash.

Remaining MB-04 work: trusted external catalog/evaluation bootstrap (without a
self-referential host digest), editor/runtime provenance, then fresh graphical
native/API/recovery/lifecycle acceptance. The catalog stays empty and neither
candidate is installed. Earlier checkpoint counts and remaining-work descriptions
are historical; this entry supersedes the extension-measurement gap only.

## Signed evaluation and real editor checkpoint — 2026-10-12

The separate evaluation entry point and Ed25519 envelope are implemented, with
complete host/driver/native trees, signed macOS editor bundle, fixed HTTPS loopback
origin and a 24-hour expiry enforced at native effect boundaries. Production and
simulation loaders reject evaluation evidence. The compiled key is public; its
private counterpart remains outside the checkout. No production record is created.

The user approved loading the exact candidate in PluginLab and binding existing
Cline task `1791641555978_71d6l` to `mb04-local` at `https://localhost:15943`, with
prompts/questions/cancel only and auto-approve None. Real Keycloak sign-in was
completed by the user. An expired lease after the pause was detached graphically;
reconnection of the same approved task became **online**. Model round trips and
public API checks are recorded separately in `native-acceptance.json` when run.

PluginLab isolates editor user-data and extension binaries. Cline exposes its
existing vendor-owned history across these instances; history/account isolation is
not claimed, and no existing history or credential files were copied or erased.

The first real editor measurement exposed Electron's virtual ASAR filesystem
metadata. The verifier now uses Electron's built-in `original-fs` to measure the
physical archive bytes. Actual Electron 43.7.3/Node 24.21.0 measurement matches the
developer Node result; the signed VS Code 1.140.0 bundle digest is
`328dd3daf8afd6ac9ad89de6ce7f652b014306ec28a9f8aaae9294e3de489c60`.

Latest source checks: Node 24.19.0/npm 11.12.1 root lint/test (including build):
**169 passed, 55 optional database skips, zero failures** (224 total). This does
not stand in for native/API acceptance. Earlier checkpoint gaps are historical.

## Bounded native acceptance and lifecycle — 2026-10-12

[Native acceptance](native-acceptance.json) passed against the real deployed HTTPS
gateway/TypeScript server/PostgreSQL and user-completed Keycloak PKCE identity.
The same existing IDE task passed tagged text, native question/answer, cancellation,
OpenAI Chat Completions/Responses and Anthropic Messages text. Approval requests
were refused with 422 before dispatch; the prompt cursor stayed unchanged. Caller
tools and media remained withheld. The disposable API credential was revoked in
`finally`; no bearer/password was saved.

[Initial readiness failure](native-not-ready-attempt.json) is retained: Cline showed
Resume Task after earlier cancellation. The first prompt was rejected with no native
echo. Local no-tools resumption returned `MB04-LOCAL-READY`; reconnect and the complete
bounded suite then passed. Cancellation is last in the test consumer because Cline
requires local resumption before another prompt after cancellation.

[Lifecycle checkpoint](lifecycle.json): graphical reload started disconnected,
retained one uncertain binding marker and reconciled it with public detach, leaving
zero markers. The user approved selected-scope permanent credential cleanup and
same-package reinstall. The UI confirmed device revocation and removal of only the
selected credentials/inbox; a read-only server query confirmed `revoked`. Both
generic packages were uninstalled/reinstalled through the isolated editor's supported
CLI. Native Cline 4.1.2204 and shared task history remained present. The renewed
evaluation loaded and local no-tools resumption returned `MB04-REINSTALL-READY`.
Fresh bounded pairing became online with the same task and selected controls.
Post-reinstall remote roundtrip and local takeover are running separately.

Installed metadata changes on reinstall, so full tree digests are recorded separately
in [first inventory](evaluation-inventory.json) and [reinstalled inventory](reinstalled-evaluation-inventory.json).
Native/runtime digests and VSIX archive bytes remain unchanged. Real authority-change/
isolation tests and reviewed native promotion remain open; MB-04 is still In Progress.

## Completion scope

[Post-reinstall acceptance](post-reinstall-native.json) passed: a new device paired
with the exact task and bounded controls, a remote text roundtrip completed, local
no-tools takeover detached the binding, and a later stale prompt was refused.
[Lifecycle](lifecycle.json) records the completed candidate lifecycle subset.
The editor is left disconnected after takeover; no replacement runtime was created.

Exact [original native qualification](native-qualification-original.json) and
[reinstalled native qualification](native-qualification-reinstalled.json) records
identify only the accepted core operations. Detached signatures use the existing
project release-integrity key, verified against the already recorded M24 public key.
They do not enable production catalog admission. Reinstall changed editor metadata,
while packaged executable bytes remained identical; the original complete control/
provider suite and fresh reinstall echo/takeover jointly support that limited record.

MB-04's candidate implementation and declared core acceptance are complete.
Optional approval/media/caller-tool qualification is MB-07; broader live switching,
queued/crash recovery and isolation is MB-08; native release adoption/distribution
is MB-09. Those rows are not filled by fixture results. Codex/Claude remain blocked
by the supported existing-IDE routes identified in MB-01. This is not completion
of task.md or a three-backend release.
