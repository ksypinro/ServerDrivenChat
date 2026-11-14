# Generic host and Cline: native evaluation procedure

Status: bounded native workflow/API suite and reload reconciliation passed,
2026-10-12; reinstall roundtrip, remaining authority checks and promotion pending.
The unsigned packages are review artifacts, not a qualified replacement for the
accepted Cline/companion pair. The production catalog remains empty; only the separately signed local evaluation
path can admit a candidate for explicitly consented testing.

## Evaluation implementation and current execution

The signed local evaluation command is implemented. It verifies a detached Ed25519
manifest with a compiled local evaluation key and explicit `evaluation` evidence.
Default production and simulation paths reject that evidence level. The signed
plan pins complete extension trees plus the signed macOS VS Code bundle, fixes the
HTTPS loopback origin and expires in 24 hours. Expiry is enforced at effect time,
not just by the disconnect timer. Native consent remains required.

The manifest is selected through **SDC Backend: Load Signed Evaluation Plan
(Unqualified)**. Preparation uses `scripts/prepare-backend-evaluation.mjs`; it reads
installed artifacts without activation, checks the signer, and writes only an
evaluation plan. No production record is created. All executable files and editor
metadata participate in extension identity. macOS bundle measurement hashes
physical ASAR bytes via Electron's built-in `original-fs`, not its virtual archive
view, and rejects links escaping the bundle.

On 2026-10-12 the user approved isolated launch and evaluation loading. The maintained
Cline/native driver/host were installed only in PluginLab. The corrected candidate
passed real graphical manifest verification and loading; the status bar shows
**SDC UNQUALIFIED EVALUATION: select conversation**. This is startup evidence only.
The user subsequently approved task `1791641555978_71d6l` with prompts/questions/
cancel only. Sign-in completed; after the pause expired its first lease, graphical
detach and reconnection became online. Authenticated chat/control/provider text
round trips subsequently passed in [native-acceptance.json](native-acceptance.json). Shared Cline history is preserved and is not claimed
to be isolated by the separate editor directories.

## Prepare the isolated environment

Use separate VS Code user-data and extension directories. A named profile alone
cannot isolate extension binaries. Preserve the accepted M24 installation and all
of its saved history, credentials and task grants. Use a signed, reviewed graphical
VS Code host and the existing certificate-validated loopback deployment. Never
copy the private login file into logs or evidence.

Install the exact maintained Cline 4.1.2204/API 1.3 package before the registration
extension. The registration extension declares Cline's stock extension ID; allowing
VS Code to fetch that dependency from Marketplace can install an incompatible
stock package. Verify the installed full inventory before activating a driver.
Record the user-reviewed candidate package hashes and selected environment.

## Execute and record acceptance

For each row, record candidate inventory, selected task identity, observed result,
and sanitized evidence. Record failures as failures; a fixture result cannot fill
an unexecuted native row.

| Check | Required observation |
| --- | --- |
| Existing conversation | User selects a disposable existing Cline task; connection retains its identity and history. |
| Local consent | The native screen shows the correct task, server and exact categories before the user grants access. |
| Sign-in | User enters credentials in the real sign-in page; no password appears in evidence. |
| Text round trip | One uniquely tagged server prompt and its native reply appear in the same selected task. |
| Questions and cancel | Native question/reply correlation and cancellation complete only when granted. |
| Refusal | A category absent from consent is rejected before any native effect. |
| Authority change | Local takeover, task switch, generation change and lease loss fence a queued mutation at its actual native effect boundary. |
| Isolation | Another window/task cannot receive this binding's commands or consume its credentials. |
| Recovery | Reload/reconnect reconciles durable commands without repeating completed effects; uncertain detach prevents rebinding. |
| Public APIs | Existing accepted API profiles dispatch through the new host only for the demonstrated capability subset. |
| Lifecycle | Disable/uninstall/reinstall and explicit revoke/forget affect only the candidate's selected scope; accepted installation and history remain intact. |

Start with prompts/questions/cancel only. Approval or caller-tool claims require
separate bounded native tests and the corresponding explicit consent. Preserve the
existing server-owned semantics and do not claim native activity as a caller tool.

## Promote only after passing

Create a native qualification record from the observed passing subset and exact
inventory. Review it before adding it to the host-owned catalog. Rebuild and rerun
all affected checks if promotion changes executable bytes: an evaluation package's
hash does not qualify a different production package. A usable evaluation design
must account for this transition without a self-referential host digest.

Publish the evidence and remaining unsupported capabilities. MB-04 is complete only for the declared core candidate subset in verification.json.
Broader acceptance and production adoption remain the later milestone gates. This does not qualify
Codex or Claude; both still need supported existing-IDE attachment and fencing.
