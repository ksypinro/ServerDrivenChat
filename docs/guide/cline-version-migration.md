# Migration guide: use another Cline version or fork

This guide explains how to prepare, test, and adopt a different Cline package with
Server-Driven Chat. It is for the developer who maintains the integration and the
operator who installs the resulting pair. Ordinary users should receive a reviewed
pair and follow the [beginner guide](user-guide.md).

**A Cline upgrade is an integration change.** The current bridge depends on a
maintained native patch and exact package fingerprints. Installing another VSIX or
editing a version string does not make that package compatible.

No replacement version is selected by this document. Choose one exact source commit
and artifact before applying the procedure. The existing qualified release remains
the baseline until the candidate passes its own checks.

## How to use this guide

1. [Decide whether you need a migration](#1-choose-the-right-kind-of-change).
2. [Record the baseline](#2-record-the-working-baseline).
3. [Understand the compatibility gates](#3-understand-what-must-stay-compatible).
4. Use the [repository change map](#4-repository-change-map) while implementing.
5. Follow the [migration procedure](#5-step-by-step-migration-procedure).
6. Complete the [acceptance matrix](#6-minimum-native-acceptance-matrix), then
   [troubleshoot](#7-troubleshooting) or [hand off the release](#8-release-handoff-checklist).

The [runtime architecture](../assets/runtime-architecture.svg) shows the parts that
should retain their roles during migration: server-owned authority and persistence,
a format-translating gateway, and a consented native bridge into Cline.

## 1. Choose the right kind of change

| Your goal | Work required | Who handles it |
|---|---|---|
| Use a different model/provider inside the accepted Cline build | Configure Cline locally and test affected behavior, images, tools, and context | User/operator, with qualification for changed advertised behavior |
| Use a newer or older upstream Cline release | Port the maintained patch, review interfaces, update candidate pins, and qualify a new pair | Integration developer and operator |
| Use a Cline fork | Review its source, identity, storage, permissions, and build; port the interface and qualify it separately | Integration developer and operator |
| Use stock Cline without the project patch | First establish an adequate supported native interface; the current integration requires the maintained export | Integration developer |
| Use Codex or Claude Code as the native application | Design a different adapter and prove its native behavior | See [other plugins](other-vscode-plugins.md) and the [integration plan](plugin-integration-plan.md) |

Changing a model inside Cline does not change the native application into Claude
Code or the Codex extension. It may also change tool behavior or image support, so
repeat the affected scenarios before claiming the same capabilities.

If only the model needs changing, do not start by changing Cline's package version,
SDC's API contract, or the server database.

## 2. Record the working baseline

The currently qualified local target is:

| Item | Baseline |
|---|---|
| Native host | Apple-silicon macOS; isolated VS Code **1.140.0** |
| Upstream Cline source version | **4.1.22** |
| Maintained package version | **4.1.2204** |
| Project-owned native API | **1.3** |
| Companion version | **0.7.3** |
| Cline extension ID | `saoudrizwan.claude-dev` |
| Companion extension ID | `server-driven-chat.sdc-cline-bridge` |
| Selected deployment controls | Prompts, questions, cancel; approvals disabled |

The upstream version, maintained package version, and native API version identify
different things. A package can keep the same visible version while its bytes change;
that is why the integration also checks SHA-256 fingerprints.

Start with the [release manifest](../../evidence/M24/artifact-manifest.json),
[support matrix](support-matrix.md), and [qualification summary](../../evidence/M26/README.md).
Some source constants still use historical names such as `M30_CANDIDATE_CLINE_PIN`;
use the current manifest and completion records to interpret them. Do not infer
that the final pair is unqualified merely from an old constant name.

Generated VSIX files, preserved native bundles, and raw qualification captures are
excluded from Git. A fresh source clone does not contain all release inputs.
Arrange access to the exact verified baseline artifacts before promising an
upgrade or rollback. See [source distribution notes](../source-distribution.md).

## 3. Understand what must stay compatible

There are several independent checks between installing a package and sending a
native command:

| Gate | What it verifies | Why it matters |
|---|---|---|
| Extension identity | Expected publisher/extension ID and patch metadata | Prevents selecting the wrong installed extension |
| Exact bytes | Reviewed native bundle and add-on hashes | Detects changed binaries despite matching version labels |
| Native API contract | Supported export, API version, operations and capabilities | Confirms the bridge can use the intended interface |
| Native controller behavior | Task/session structure, event identity, pending callbacks | Connects the interface to real native behavior |
| Live authority | Task/workspace identity, current lease, cancellation and consent | Prevents a previously valid command from affecting a changed task |

The maintained native package exports `serverDrivenChat`. Its implementation does
more than send text: it tracks the selected task and conversation revision, captures
output changes, correlates command echoes, stages images, captures exact question
and approval callbacks, and handles cancellation and local takeover.

For example, “send to the current task” is unsafe if the sidebar changed after the
server authorized a different task. “Press the approval button” does not establish
which action is being approved. A migration must retain task identity and exact
request checks at the point of the native effect.

These boundaries must remain intact:

- The existing graphical application runs the model. Do not replace it with a CLI,
  headless executor, hidden app server, or private control socket.
- The server owns authorization, durable operations, scheduling, API history and
  accounting. The gateway remains an HTTP/SSE facade without direct native access.
- Native mutations check `AdapterMutationContext.assertAuthority()` at their effect
  boundary and honor cancellation, including after awaited preparation.
- Local task changes, workspace changes, reload, revocation, and expired authority
  fence old commands. Ambiguous effects require reconciliation rather than replay.
- Native permissions still apply. Caller-tool support requires separate proof that
  the caller owns the effect and Cline does not execute it independently.

A native upgrade normally does not require a protocol or database change. Introduce
one only when an actual contract or durable schema change requires it, with its own
review and migration/restore tests.

## 4. Repository change map

Inspect these areas for the chosen target. Do not replace every historical version
string in the repository; old evidence and fixtures must retain their original identity.

| Area | Files | Review or change |
|---|---|---|
| Native contract | [native-api.ts](../../adapters/cline/src/native-api.ts) | Supported Cline/API versions, task identity, permits, receipts and snapshot fields |
| Native implementation | [native-patch.ts](../../adapters/cline/src/native-patch.ts) | Controller mapping, dispatch, user echoes, output replacement, readiness, attachments, cancellation and tool fence |
| Exact native controls | [native-controls.ts](../../adapters/cline/src/native-controls.ts) | Pending callbacks, complete action material, once/deny, local resolution and stale decisions |
| Native Connect | [native-connect.ts](../../adapters/cline/src/native-connect.ts) | Session hooks, trusted origin, cancellation and bounded tool results |
| Neutral adapter mapping | [adapter index.ts](../../adapters/cline/src/index.ts) | Constructor gate, event/state mapping, capability metadata and evidence references |
| Native extension entry | [native-entry.ts](../../extensions/vscode/src/native-entry.ts) | Extension lookup, installation identity, workspace/host identity and local-host restriction |
| Companion activation | [extension index.ts](../../extensions/vscode/src/index.ts) | Startup and task-selection gates, exported API checks, extension lookups and diagnostics |
| Exact pins | [pin.ts](../../extensions/vscode/src/pin.ts) | Explicit reviewed candidate metadata and native hashes; keep production support claims separate from candidate testing |
| Companion manifest | [package.json](../../extensions/vscode/package.json) | Version, extension dependency, editor engine, command declarations and dependencies |
| Bundle build | [build.mjs](../../extensions/vscode/scripts/build.mjs) | Native add-on/companion output, module formats and external `vscode` boundary |
| Source patch | [source-patch.py](../../extensions/vscode/scripts/source-patch.py) and [patches](../../extensions/vscode/patches) | Target source locations, insertion points and a new candidate patch filename |
| Packaging | [M24 packager](../../extensions/vscode/scripts/package-m24.mjs) and historical generators | Separate candidate input/output and evidence paths; license notices and artifact hashes |
| Signing | [sign-release.mjs](../../deploy/m24/sign-release.mjs) | Final manifest integrity, private key kept outside the checkout |
| Public capability qualification | [native API gate](../native-public-api-gate.md), server policy and [acceptance tests](../../tests) | Exact-binding permissions, caller-tool ownership, client compatibility and regressions |

If the fork changes extension ID, update the dependency, activation lookups, native
installation identity, diagnostics, and relevant tests together. A different ID
alone does not isolate command names, callback registrations, storage, or credentials.

## 5. Step-by-step migration procedure

### Step 1 — Define one immutable target

Create a migration record with the following fields. Keep secrets out of it.

```text
Reason for the migration:
Upstream or fork repository:
Source release/tag and resolved commit:
Artifact download source and SHA-256:
Publisher and extension ID:
Target OS/architecture and VS Code version:
Proposed maintained package version / patch revision:
Native API version / companion version:
Capabilities to preserve:
Capabilities deliberately withheld:
Baseline artifact and backup locations:
Candidate source and output locations:
Acceptance report location:
Rollback owner and procedure:
```

“Latest Cline” is not an immutable target. Record both source identity and binary
identity: a source manifest's version does not prove that a downloaded VSIX was
built from that source.

**Ready to continue when:** the target and required behavior are explicit. If no
target has been chosen, stop at planning; there is no specific patch to port yet.

### Step 2 — Preserve the baseline and create an isolated workspace

1. Retain the verified old VSIX pair, manifest, detached signature and trusted public
   verification key. Keep the accepted launcher usable.
2. Follow the [operator guide](operator-guide.md) for a consistent backup of server,
   identity and attachment state. Preserve native Cline history and isolated editor
   state separately; the server backup does not contain all extension-local data.
3. Check that the restore location and compatible old software are available.
4. Use a separate source checkout/worktree and candidate output folder. Keep candidate
   editor data, extension directories, credentials and SQLite inbox separate too.

For an established Git checkout with a reviewed commit, a developer can create an
isolated source worktree from the repository root:

```sh
git status --short
git worktree add ../ServerDrivenChat-cline-candidate -b migration/cline-candidate
```

Resolve or preserve existing work deliberately before choosing the starting commit.
The worktree starts from committed history; it does not copy uncommitted changes.
If the initial source import is still only staged, review and commit it first, or
start from another reviewed committed checkout. Never discard staged work to make
this command succeed.

**Ready to continue when:** the accepted installation can run without using candidate
binaries or state, and the source baseline can be identified precisely.

### Step 3 — Acquire and inspect the target

Obtain the selected source and artifact from the upstream project or fork owner's
verified distribution channel. Record the resolved commit, artifact checksum,
license, dependency locks, build scripts and bundled native dependencies.

For official Cline source, this is a developer acquisition example. Replace the
placeholder with the reviewed commit before running the checkout command:

```sh
git clone https://github.com/cline/cline.git cline-upstream-candidate
git -C cline-upstream-candidate checkout --detach <REVIEWED_COMMIT_SHA>
git -C cline-upstream-candidate rev-parse HEAD
```

For a fork, use its selected repository instead. Cloning acquires source; it does
not install or accept a native package. Inspect the target's own documented build
requirements before executing them. Its toolchain may differ from SDC's Node 24/npm
11 workspace. Do not copy historical upstream build commands without checking the
selected target.

### Step 4 — Map the old native behavior to the target

Trace the target's source for each operation below. For every required operation,
record the old hook, the target hook/file, changed semantics, and the test that will
prove it still works.

| Native path | Questions to answer |
|---|---|
| Task selection and readiness | How is the exact task identified? What happens when paused, resumed, switched, or disposed? |
| Prompt delivery | Where is input committed? How is its native echo correlated without treating local text as remote input? |
| Output | Are messages appended, replaced, or partially updated? How is terminal completion distinguished from idle? |
| Question and approval | Where is the exact callback captured? Can local resolution win safely against a late remote decision? |
| Cancel | Which active turn is addressed? What evidence distinguishes cancellation from an unknown result? |
| Attachments | Where are validated bytes admitted, and how are MIME, size and digest failures handled? |
| Host lifecycle | What invalidates the binding on reload, window/workspace change, or local takeover? |
| Caller-tool fence | Can native tool execution be denied before effects while preserving caller-owned proposal/result semantics? |

Matching method names is insufficient. If a required behavior cannot be implemented
through a reviewed app-owned boundary, withhold that capability or stop the migration.
Do not solve a controller mismatch by removing validation or using an unchecked cast.

### Step 5 — Port the maintained native interface

Implement the required interface inside the maintained Cline package. Prefer a
reviewable source patch built with the target's source and toolchain. Keep controller
hooks inside that package; the companion should consume its explicit export.

Preserve command/request identity, conversation revisions, effect-boundary authority
checks, cancellation, exact pending callbacks, and native event evidence. Recheck
authority after asynchronous preparation when the native context may have changed.

Keep native API **1.3** only if its contract and semantics remain compatible.
An incompatible change needs a new explicit native API version and clean rejection
by consumers that do not support it. Preserve neutral protocol names and requirement
IDs; a provider-format feature belongs in the gateway.

**Ready to continue when:** the target intentionally exports the native interface,
its behavior is mapped to the real application, and unavailable capabilities fail
before dispatch.

### Step 6 — Update the companion and candidate identity

Review every gate in the [change map](#4-repository-change-map), not just `pin.ts`.
The adapter, companion activation, task selection and native entry each make
assumptions about identity and version.

Use an explicit candidate pin in the isolated candidate source. It must represent
reviewed candidate bytes; it is needed to exercise the candidate, but it does not
by itself establish release support. Keep the accepted release artifacts unchanged.

If supporting both old and new targets, define the allowed combinations explicitly
and test both. Do not widen a version check to “all 4.x” or accept any bundle that
exports a similarly named method.

If extension identity or callback behavior changes, review sign-in registration,
credential storage, installation IDs and cleanup too. Do not copy an old task-control
grant into a materially different binding. Use fresh local selection and consent.

### Step 7 — Package into a separate candidate directory

Create a candidate-specific packaging entry point with distinct output, patch,
manifest and evidence paths. Record at least:

- Upstream source commit, maintained version and patch revision.
- Native API, companion version, editor version and OS/architecture.
- Native main-bundle, add-on, companion-bundle and VSIX SHA-256 hashes.
- Build toolchains, dependency lock revisions, license notices and source provenance.

The historical package generators are not generic migration tools. For example,
`package-development.mjs` is tied to an old companion and exact bundle insertion
marker; `package-m30.mjs` consumes preserved historical native inputs; the M24
packager recreates its release-candidate output and writes M24 evidence. Running
one with edited guards can overwrite the recovery artifacts you intended to preserve.

If a binary insertion step remains necessary, require the exact target input hash
and a unique reviewed insertion point. A renamed minified symbol is not permission
to patch the first approximate match. Do not edit an old evidence hash to make a
new binary pass as an old accepted one.

**Ready to continue when:** candidate packages are reproducible from identified
inputs, hashes are recorded, and the old output/evidence remains intact.

### Step 8 — Run source and contract checks

From the candidate SDC workspace with Node 24/npm 11:

```sh
npm ci
npm run build
npm run lint
npm test
```

Add target-specific tests for the changed seams. The focused scripts `test:m19`,
`test:m20`, `test:m21`, `test:m22`, and `test:m23` cover native adapter, controls,
Connect, workflow and recovery areas; use the relevant suites while developing.
They overlap the root suite, so repeating every suite is not a substitute for new
target-specific coverage.

The current native-bundle conformance test checks preserved baseline artifacts.
Extend/add coverage for the new target; merely passing the old test does not qualify
it. Use strict artifact checks during qualification. In a source-only checkout,
`SDC_REQUIRE_NATIVE_ARTIFACTS=1` makes missing baseline artifacts fail rather than skip.

Run affected real PostgreSQL tests with the disposable fixture, not a deployment
database. Keep restart/restore tests separate from concurrent database suites.
Run the locked gateway tests for affected API behavior and Swift tests if Swift
modules changed. See the [maintainer guide](maintainer-guide.md) for commands.

**Ready to continue when:** required checks pass and the record explicitly lists
skips, fixtures, and unresolved concerns. Simulated native output is not evidence
that the new graphical Cline build works.

### Step 9 — Install in a disposable graphical host

1. Use a verified editor build on the selected platform.
2. Provision separate user-data and extension directories, or a separate macOS user.
   A VS Code profile alone does not isolate binaries.
3. Keep candidate updates controlled so an automatic stock-extension replacement
   cannot invalidate the package under test.
4. Install the reviewed candidate pair and verify the actual installed versions,
   locations and bundle hashes against the candidate manifest.
5. Configure trusted TLS using the approved public CA. Browser trust and Node
   extension-host trust are separate checks; retain certificate verification.
6. Use a disposable workspace/task and isolated test service/account as appropriate.
   Keep the accepted installation and its history untouched.

**Ready to continue when:** the running host is demonstrably loading the candidate
bytes, and its graphical sign-in route reaches the intended service.

### Step 10 — Complete fresh native and client acceptance

Have the human sign in, select the intended task, and review the exact control
categories. Begin with prompts/questions/cancel and native automatic approvals off.
Run the [matrix below](#6-minimum-native-acceptance-matrix) against the real candidate.

Enable approval or caller-tool scenarios only for the bounded tests and bindings
that have been explicitly authorized. Text success does not qualify tools, images,
or an arbitrary third-party client. Record both the server result and the actual
native outcome; HTTP 200 alone is insufficient.

Repeat performance and soak checks needed by the proposed release scope. The
completed baseline M26 run is evidence for the old exact target, not transferable
acceptance for new bytes. Keep the work within the authorized migration/release scope.

### Step 11 — Rehearse upgrade, rollback, and cleanup

First rehearse on a disposable copy of the old state:

1. Finish or reconcile outstanding native turns; stop new admissions and disconnect
   at a safe boundary. Save the recovery point.
2. Install the matched candidate pair. Verify its loaded identity and hashes.
3. Sign in, select the task, and review fresh consent as required. Confirm history
   remains readable and intended operations work.
4. Rehearse returning to the old pair. If the candidate migrated native history or
   data into an incompatible format, restore compatible pre-upgrade state into an
   isolated restore target instead of expecting a binary downgrade to fix it.
5. Verify the old pair against the restored state before any operational switch.
6. Rehearse selected-profile revoke/forget, uninstall/reinstall, and fresh pairing.
   Verify unrelated profiles and native history are preserved.

A rollback is not a blind replay of uncertain commands or a restore over newer live
work. Record what happens to outstanding operations, newly created history and
retired device/API credentials. Keep retired authority revoked or fenced.

**Ready to continue when:** rollback and cleanup have observed outcomes, not just
written commands, and the operator knows which data each recovery path preserves.

### Step 12 — Freeze and adopt the tested pair

Freeze the final bytes after the last code/build change. Re-run affected checks if
anything changes after native acceptance, then sign the final manifest through the
operator's protected signing process. Verify the signature with the trusted public
key independently; a checksum alone is not a signature.

Publish a new support entry identifying the exact pair, platform, controls, clients,
limitations and evidence. Preserve the baseline's historical records. The project
signature does not become Marketplace signing, and an isolated local pass does not
establish Internet-production acceptance.

## 6. Minimum native acceptance matrix

For each row, record the exact build, test conditions, expected result, observed
native effect, server/bridge evidence, and pass/fail/withheld status. Store private
captures outside the public source submission; publish only reviewed sanitized material.

| Scenario | Required observation |
|---|---|
| Package identity | Correct candidate accepted; stock, modified and wrong-version bytes refused before native dispatch |
| Same task, two turns | Both prompts/replies occur in the selected native task with correct echoes and no duplicates |
| Native question | Exact request/revision answered once; a local answer safely wins over a stale remote answer |
| Addressed cancel | Intended active turn stops with native evidence; another task is unaffected; uncertain outcome is retained for reconciliation |
| Task/workspace/window/reload | Old binding is fenced; new context requires explicit selection/repair; no accidental dispatch into the new sidebar task |
| Delivery and restart recovery | Event replay, receipt continuity, inbox scheduling and checkpoints work without blind replay of uncertain effects |
| Authority and isolation | Revoked devices and expired/replaced leases cannot mutate; two bindings do not acquire each other's authority |
| Approval, if advertised | Exact whole-action once/deny, changed/stale/duplicate decisions, local races and native denial all behave correctly |
| Media, if advertised | Actual native turn receives committed PNG/JPEG; invalid MIME, bytes, size, digest and authorization are refused |
| Caller tools, if advertised | Caller owns the tool effect; native tools are denied before effects; mismatched or forged results are rejected |
| API/client paths | Real TLS, identity and scoped keys; exact consumer versions; retry identity, streams, cancellation and unsupported-field refusal |
| Lifecycle | Isolated clean install, upgrade, rollback with compatible state, scoped cleanup, uninstall/reinstall and fresh consent |
| Performance and soak | Affected latency, backlog, cancellation responsiveness and sustained-use checks meet the declared release requirements |

A failed required row blocks adoption. A deliberately unsupported optional feature
must stay withheld in capabilities and be listed as unsupported in the new release.

## 7. Troubleshooting

| Symptom | Likely cause | Correct next step |
|---|---|---|
| “Cline build changed or is unsupported” | Candidate metadata or bytes are not the reviewed pin | Check actual installed paths/hashes and candidate pin; do not bypass the check |
| Missing required task-bound API | Stock/unpatched package or changed export | Verify the maintained export and loading path |
| Controller shape mismatch | New native source no longer matches the old assumptions | Revisit the source mapping and native implementation |
| Connect command missing or inactive | Activation, extension dependency, patch/API gate or wrong host | Inspect each gate and loaded package; changing only `pin.ts` is insufficient |
| Browser login works but extension connection fails | Node CA trust, callback registration, or extension-host issue | Validate the isolated host's TLS/callback configuration separately |
| Candidate reverts to another build | Wrong extension directory or automatic update | Restore controlled candidate installation and recheck loaded bytes |
| Text works, tools fail | Tool capability/effect ownership is unqualified | Leave caller tools withheld until their native and client cases pass |
| Source tests pass but native output is wrong | Fixtures did not exercise changed real semantics | Trace native revisions, completion and event mapping; add a regression case |
| Old build cannot read history after downgrade | Native storage migration | Restore compatible state in an isolated target and verify it before switching |
| Native-artifact tests skip | Required bundles absent from source-only checkout | Supply verified test inputs and enable strict checks; skips are not acceptance |

## 8. Release handoff checklist

Before recommending the new pair to a user, hand the operator:

- The matched VSIX files, final manifest, detached signature and verification procedure.
- Exact editor, platform, source commit, package/API/companion versions and hashes.
- Capability and client matrix with withheld features and known limitations.
- Test report distinguishing real native behavior from fixtures, including failures
  resolved during development and any remaining limitations.
- Installation/consent instructions and release notes explaining changes from the baseline.
- Proven upgrade, rollback and scoped-cleanup instructions, with compatible backup locations.
- Updated license/dependency notices and a source patch/build record for reproduction.

The user can then follow the [beginner guide](user-guide.md) with the newly published
version-specific instructions. Do not tell users that any Marketplace update is safe
merely because one candidate completed this procedure.
