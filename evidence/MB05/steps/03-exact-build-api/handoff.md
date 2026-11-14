# MB-05 Step 03: exact-build API and safeguard contract

**Step:** 03 — Confirm the exact-build API and safeguard contract  
**Inspection time:** 2026-10-15, 02:56 UTC  
**Implementation status:** Reviewed  
**Step result:** PASS for API inventory and explicit unknowns  
**Luna review:** ACCEPT (gpt-6-luna)

## Scope and prerequisites

Step 01 is PASS/ACCEPT. Step 02 remains BLOCKED because Claude reports the
selected conversation is open elsewhere. The plan permits this step's independent
developer-only inspection while Step 02 awaits user assistance. Nothing here
opened the editor or conversation, submitted a prompt, created/resumed a session,
loaded a Mod, changed settings, or accessed credentials.

The pinned bundle is Anthropic Claude Code VS Code extension **2.1.296**, native
runtime version `2.1.296 (Claude Code)`, runtime SHA-256
`c9b5341637becbd423ddffc5b254afb645682a3868cb708bbc6cc0e7bb419937`. The installed
settings schema SHA-256 is
`7e729d9c8db0d16357faff86bcdf844e50c6b4bc3fffd1f723ec525eb63df87d`. These match
the Step 01 baseline and prior exact-build checks.

## Supported API inventory

The exact bundled executable accepted strict validation for all three reviewed
evaluation Mods. Its validator identifies these callable surfaces and event
registrations:

| Surface | Exact-build validation or observed support | Limits |
| --- | --- | --- |
| Lifecycle events | `session.start`, `session.end`, `turn.start`, `turn.complete`; each passes an event to the next handler | Event delivery is shown for the probe, not a complete lifecycle contract for every resume/branch/reload case |
| Prompt hook | `prompt.submit` is recognized as a gating hook; observer event fields included `origin`, `text`, and `wait` | Field presence does not establish caller control of those fields or their semantics |
| Session identity | `$.session.id()` accepted by the validator and observed as a stable digest across two manual turns in the same conversation | No exact 2.1.296 generated type declaration; identity behavior across clear/branch/recovery is unresolved |
| Turn identity/output | `turn.start` and `turn.complete` were observed with matching `turnId` digests; completion fields included answer, duration, abort state, reason, usage | No exact generated type declaration; streaming, partial output, replay, and durable checkpoints are unproven |
| Native prompt submission | `$.prompt.submit` accepted by strict validation in origin/queue Mods; default attribution is retained in the candidate code | Result shape and timing semantics are not established by static validation; observed refusal is not proof of no delayed effect in every race |
| Command/timer/log helpers | `$.command.register`, `$.clock.after`, and `$.ui.log` accepted by strict validation | No server bridge, persistence, authentication, or native command-effect guarantee follows |
| Refusal | A normal hook result can drop a prompt in fixture tests; exact settings schema accepts `onFailure: "block"` for command hooks | Fixture effects are stubs. Mod guard and refusal-handler failure can fall through to core processing; refusal behavior at the critical post-allow race is unproven |

The observer's generated exact-version declarations are absent. The extension
package contains no `.d.ts` or Mods type bundle, and the supported `plugin
validate` output is a schema/static validator rather than a signature declaration.
The public declaration examined earlier identifies itself as 2.1.277 and is not
used as 2.1.296 proof. Do not call undeclared methods or infer optional arguments
from fixtures. Obtaining exact declarations or documenting their supported
unavailability remains an explicit Step 12 closure question.

## Candidate execution-fence operation for Test B

The candidate is the existing **classic `UserPromptSubmit` command hook** configured
with `onFailure: "block"`, whose authority guard checks the synthetic permission
state, followed by the diagnostic slow hook. The exact installed settings schema
accepts that setting and documents block-on-hook-failure. Test B is intended to
revoke synthetic authority after the first guard records allow but before the
second hook returns, then observe whether the prompt is still admitted.

This identifies the experiment input; it does **not** establish atomic fencing.
The schema only describes failure handling. It does not document rechecking
authority after an allow, ordering/serialization among handlers, or cancellation
of pending input. A Mod catch is not an independent fence. The user-approved Test B
has not run because Step 02's ownership warning is unresolved.

## Exact-build checks performed

Using the executable inside the pinned installed extension:

```sh
"$HOME/Library/Application Support/ServerDrivenChat/PluginLab/extensions/anthropic.claude-code-2.1.296-darwin-arm64/resources/native-binary/claude" --version
"$HOME/Library/Application Support/ServerDrivenChat/PluginLab/extensions/anthropic.claude-code-2.1.296-darwin-arm64/resources/native-binary/claude" plugin validate --strict --json extensions/claude-mod-evaluation
"$HOME/Library/Application Support/ServerDrivenChat/PluginLab/extensions/anthropic.claude-code-2.1.296-darwin-arm64/resources/native-binary/claude" plugin validate --strict --json extensions/claude-origin-evaluation
"$HOME/Library/Application Support/ServerDrivenChat/PluginLab/extensions/anthropic.claude-code-2.1.296-darwin-arm64/resources/native-binary/claude" plugin validate --strict --json extensions/claude-queue-evaluation
```

All three strict validations returned `success: true`, with zero errors and
warnings. Their registered events and callable API inventory are captured in
[`validation-summary.json`](validation-summary.json). Current relevant source
hashes and schema hash are recorded in [`result.json`](result.json). No model
session or test runner was started in this step.

The historical `classic-hook-schema-check.json` records a README source hash
`22daa82b52aac2ad3c038b344015aeb1ef1bd7892e8f8ecf964bd33673566e40` that does
not match the current README hash. Its settings-fragment hash still matches the
current file, and its schema acceptance concerns the fragment rather than the
README. The README changed after that check; the historical value is retained and
the current value is recorded in
[`schema-evidence-reconciliation.md`](schema-evidence-reconciliation.md). This
does not broaden the older check into a validation of the current README.

## Disposition

**PASS for Step 03's developer API inventory.** The exact installed build accepts
the evaluation package surfaces; supported events, observed behavior, and
unresolved guarantees are separated. The exact type declarations and the
execution-time effect fence remain unresolved requirements for the Phase A Step 12
decision. This PASS does not authorize the Test B native run, pass Step 02, or
support a Claude driver.

**Next:** Step 04 may review the already approved Test B harness and correlation
protocol after Step 02 ownership is resolved. Native interaction remains blocked
until the existing conversation has one verified owner.
