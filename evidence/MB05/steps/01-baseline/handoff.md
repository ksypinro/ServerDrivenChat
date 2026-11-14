# MB-05 Step 01: baseline and evidence inventory

**Step:** 01 — Freeze the baseline and evidence inventory  
**Baseline first captured:** 2026-10-15 02:33 UTC  
**Inventory and comparison finalized:** 2026-10-15 02:39 UTC  
**Implementation status:** Reviewed
**Step result:** PASS for baseline capture  
**Luna review:** Final consistency re-review ACCEPT (gpt-6-luna)
**Step acceptance:** PASS and ACCEPT

## Objective and bounds

Record the project/native starting point before another MB-05 action. This step
made no source/runtime changes, installed nothing, opened no editor, submitted no
prompt, and accessed no credentials or Keychain content. The only new files are
this evidence packet and a current status line in `task.md` that prevents the
older dated notes from being mistaken for the latest disposition.

The checkout already contained extensive unrelated work. Its baseline was captured
before this step's files were created in `working-tree-status.txt`; do not reset,
stage, or attribute those paths to Step 01.

## Pinned artifact measurements

The complete VS Code application at
`~/Applications/ServerDrivenChat VS Code 1.140.app` reports version **1.140.0**,
bundle identifier `com.microsoft.VSCode`, and Microsoft team identifier
`UBF8T346G9`. `codesign --verify --deep --strict` reported that the application
is valid on disk and satisfies its designated requirement. Its complete-tree
SHA-256 is in `inventory.json`.

The installed extension directory contains these measured artifacts:

| Extension | Installed version | Complete-tree SHA-256 |
| --- | --- | --- |
| Anthropic Claude Code | 2.1.296 | `bd9640da5d63db53e4dc23bac823aa54a126983a8ae95e4f203ee241e584f66f` |
| Cline | 4.1.2204 | `c368d33773cfe2c18dde78a5ca482dc96c4d01393f5de166ed4f187051307bdb` |
| SDC generic VS Code host | 0.1.0 | `586b35a69225e127640616074a146c2970ec1cd9ef249038c3bf162c664f5390` |
| SDC Cline driver | 0.1.0 | `2d25adff04d1c4df7c8858018824e21a31e31f931409334542ec81d99fd3adcb` |
| OpenAI ChatGPT VS Code extension | 26.1007.21434 | `226c855071a5585c4d8e0c52e8f043765477c87e613a0d457974b386cb267f23` |
| OpenAI Codex audio helper | 26.1007.21434 | `6d7f484af00ef3a5051ca11394b5855f11c12af1f2971c22f52f39cc0a50a67f` |

The installed local Claude evaluation Mods are observer 0.1.0, origin probe 0.1.0,
and queue probe 0.1.0. Their cache trees are measured in `inventory.json`. The
project-local enablement settings are false for all three. The safety-relevant
`plugin.json`, marketplace manifest, hook configuration, and executable
`register.js` bytes match their repository-reviewed source copies exactly; see
[`measurement-verification.json`](measurement-verification.json). The origin
cache README differs from source, and the queue cache has a README difference plus
an `.in_use` marker. Those are included in the separate complete-tree hashes and
are not execution code. Claude's last native manager log also said the queue Mod
was disabled and would not register. The isolated editor is now confirmed open;
the native plugin manager itself was not opened during this read-only inventory.

Claude's bundled native executable reports **2.1.296** and has SHA-256
`c9b5341637becbd423ddffc5b254afb645682a3868cb708bbc6cc0e7bb419937`.
The inventory records file size, package hash, complete-tree measurement method,
and other installed identities. These local measurements are compared with the
pins in `task.md` and the last selected M24 target; they do not declare Codex,
Claude, or Cline support for SDC.

## Configuration and connection state

The current project-local `.claude/settings.local.json` hash is
`576ed52b059f2ccc198d20e3978ff5722f69f090c0f1632657674b312dff7d85`. It has no
`hooks` entry and records the observer, origin probe, and queue probe flags as
`false`. No local access token or other settings value was copied into evidence.

The broad desktop app inventory initially reported that the separately named
**ServerDrivenChat VS Code** application was not running; this was stale. A direct
view showed the isolated 1.140.0 app running with the existing Project analysis
conversation in the ServerDrivenChat workspace. Its status item currently reads
`SDC backends: disconnected`. The PluginLab user-data directory exists at
`~/Library/Application Support/ServerDrivenChat/PluginLab/user-data`; its
`User/settings.json` contains no backend enablement keys. The live Claude UI shows
an ownership warning, so the actual session owner remains unresolved. See
[`state-reconciliation.md`](state-reconciliation.md). The last native cleanup
observation remains the 2026-10-15 entry in
[`NATIVE-AUTHORITY.md`](../../NATIVE-AUTHORITY.md): Claude reported the probe
disabled/not registered after reload, settings had no hooks, and the SDC host was
disconnected. This historical native observation is not presented as a fresh GUI
check.

The standalone toolchain currently reports Node **25.9.0**, npm **11.12.1**,
Python **3.13.7**, and Swift **6.4**. The repository's implementation checks
require Node 24/npm 11; no build or test was run in this step. Later steps must
select the documented Node 24 runtime before running implementation checks.

## Prior evidence classification

| Evidence | Class | Narrow conclusion |
| --- | --- | --- |
| `NATIVE-CLASSIC-HOOKS.md` | Real native interaction | Four manual prompt cases were refused; this is not attributed Mod-origin coverage and had no independent turn-start observer |
| `NATIVE-ORIGIN.md` | Real native interaction | Attributed prompts were dropped; its busy-labeled offer followed completion and does not prove queue timing |
| `NATIVE-QUEUE.md` | Real native interaction | One attributed offer preceded completion by 10.381 seconds and was refused after the active turn |
| `NATIVE-AUTHORITY.md` Test A | Real native interaction with synthetic local state | Revocation before queued admission blocked the offer; it is not a real server lease test |
| `NATIVE-AUTHORITY.md` Test B | No native run | The post-allow race remains untested after the cross-view ownership warning |
| `native-observer-events.json` | Real native observation/manual prompts | Session and turn observations and two manual replies; does not prove remote input, durable replay, or effect fencing |
| `exact-build-check.json`, `exact-build-followup.json`, schema checks | Exact-runtime/schema or developer diagnostics | Validates package/schema and the tested stubs; does not substitute for native races |
| Python/Node candidate suites | Isolated script/fixture tests | Tests evaluation helper behavior only; no Claude native effect is established |

Older entries remain useful historical records. Their narrower earlier conclusions
are not overwritten; the new current-status note in `task.md` points readers to
the latest authority evidence.

## Reproduction and integrity

The inventory is generated at `inventory.json`. Its complete-tree digest includes
sorted relative paths, file type, file content and length, directory entries, and
symlink targets. The pre-step Git HEAD and the SHA-256/count of the complete
pre-step `git status --porcelain=v1 -uall` snapshot are recorded there; the captured
path list itself is in `working-tree-status.txt`. The implementation is retained
as `measure-tree.py`; rerunning the recorded labeled paths reproduces all tree
hashes. The independently repeated measurements and source/cache executable-byte
comparisons are recorded in `measurement-verification.json`.

Read-only checks performed:

```sh
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$HOME/Applications/ServerDrivenChat VS Code 1.140.app/Contents/Info.plist"
"$HOME/Library/Application Support/ServerDrivenChat/PluginLab/extensions/anthropic.claude-code-2.1.296-darwin-arm64/resources/native-binary/claude" --version
codesign --verify --deep --strict "$HOME/Applications/ServerDrivenChat VS Code 1.140.app"
```

These were run for this capture; `inventory.json` is the authoritative output.
No tests or database suites were run.

The source/cache executable comparison is independently repeatable with
`python3 evidence/MB05/steps/01-baseline/compare-mod-runtime.py`; its captured
output is `runtime-file-comparison.json`. It checks each installed Mod's manifest,
marketplace descriptor, hook configuration, and registered hook code against the
reviewed source copy. Complete tree measurements also include documentation and
cache markers, so those whole-tree digests can differ while executable files match.

## Step 01 disposition

**Step result PASS:** installed package
identities and versions match the selected pins; host, Claude runtime/package,
Cline, SDC host/driver, all installed evaluation Mods and all evaluation source
trees are measured; safety-relevant installed Mod files match their reviewed source;
settings are clean and disabled; native evidence is classified without inflating
its scope; and all prior working-tree changes are captured. The isolated editor
is running but live plugin-manager state is explicitly
historical and must be freshly checked before native work. Step 02 found an
unresolved ownership warning in the existing conversation; no ownership or
execution safety claim follows from the app being open. The initial Luna ACCEPT
applied to the earlier packet. A later CHANGES REQUIRED review found that the
superseded ACCEPT was not clearly labeled in every record. Step 01 acceptance is
accepted as PASS after the final consistency re-review returned ACCEPT; see
[`luna-review-amendment-attempt-02.md`](luna-review-amendment-attempt-02.md).

**Next:** Step 02 remains blocked until the owner of the existing conversation is
safely identified or releases it through its normal UI. Do not choose “Open here
anyway,” remove session state, or submit a prompt to bypass the warning.
