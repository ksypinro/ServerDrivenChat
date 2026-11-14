# DECISION-011: neutral driver contract and explicit qualification

Status: implemented contract foundation (MB-02); native adapters and host acceptance remain separate.

The user's 2026-10-11 instruction to finish `task.md` authorizes continuing the
shared implementation while documenting the MB-01 native-route blockers. This
amends the planning-only scope and permits sequential neutral work. It does not
replace the requirement that each advertised backend pass real native acceptance.

## Contract

Keep wire protocol **2.0** and `AppAdapter`. Add local driver contract **1.0** in
`adapters/core/src/driver.ts`. The descriptor identifies the backend, driver, app,
host kind, and exact extension IDs. Discovery lists existing user-visible choices;
the factory creates an `AppAdapter`. Neither operation may sign in, create a native
conversation, execute a model, or grant permission. Driver disposal releases its
resources. Installation/host/window/workspace identities are supplied by the host;
drivers must synchronously invalidate the host when their native identity changes.
Discovery includes an opaque native selection generation. The host rechecks it after
consent, passes the selected generation into the factory, and provides an abort
signal/current-authority assertion. Drivers must check both the selected native
generation and host authority at the native attach boundary, including after waits.
The driver also exposes a read-only `readConversationRevision(adapter, binding)`
hook. Existing server binding registration requires this native revision, while
`SessionSnapshot` does not contain it. Keeping this attachment metadata in the local
driver contract avoids inventing a revision or changing the wire snapshot shape.

Descriptor parsers reject unknown fields/contract versions. This is an internal
extension boundary, not a new HTTP message. Existing clients and wire schemas are
unchanged. Older hosts reject new driver contracts instead of guessing their meaning.

## Qualification and permission

The host separately measures complete host, driver, native, and any runtime artifacts
and obtains a reviewed qualification record from its trusted catalog. A driver
cannot qualify itself by returning a record. Every artifact is identified by role,
ID, exact version, and SHA-256. Inventories must include host/driver/native roles;
entry-point-only hashes are insufficient provenance for creating a release record.
Signature verification/catalog provenance is a host responsibility, not proof
provided by the parser. Records also distinguish native and simulation evidence.
Simulation is refused by default; tests must explicitly select simulation mode.

Qualification matches descriptor, measured inventory, native API version, platform,
and capability-report identity. Each operation needs native support and a reviewed
supported evidence entry. Missing/unknown/unverified entries remain unavailable.
Operation limits must agree exactly between the qualified and native reports;
arbitrary JSON limits have no safe universal intersection, so mismatch fails closed.
Native-tools-denied requires its own qualification and native report; it is never
inherited from an otherwise eligible text binding.

Host admission intersects qualification with authenticated server policy, local
consent and live authority. These pure functions do not grant authority. Every
mutation still receives `AdapterMutationContext`, checks its abort signal and calls
`assertAuthority()` immediately before the external effect. The context must be
passed through native queues; pre-enqueue validation alone cannot qualify a route.
No semantic change to the existing outcomes: `accepted` may precede an effect,
`applied` requires evidence, and `unknown` requires reconciliation without blind
retry. Unsupported controls are unavailable independently; text-only qualification
requires probe, attach, inspect, submit, subscribe and detach.

## Examples and validation

`tests/helpers/backend-driver.mjs` contains an explicitly simulated complete
descriptor/inventory/qualification. `tests/backend-contract.test.mjs` derives a
restricted text-only record, rejects identity/version/hash drift and simulation
evidence in native mode, withholds unfenced queued mutations, rejects malformed
contracts, and verifies policy intersections. These are contract tests and provide
no native support claim. Stateful binding, stale authority and queued effect tests
belong to the generic host phase.

No server/gateway schema change or dependency on a vendor enters shared code.
Actual Cline migration requires fresh host acceptance. Claude and Codex records
remain absent until their MB-01 requirements are met.


## MB-04 evaluation amendment — 2026-10-12

An explicit third evidence level, `evaluation`, identifies a source-reviewed test
plan, never native acceptance. Production mode and simulation mode both reject it.
Only an explicitly constructed evaluation host may use it, with a mandatory expiry
checked at native mutation boundaries using wall-clock and monotonic deadlines.
Runtime reports label every admitted operation UNQUALIFIED EVALUATION.

The graphical candidate verifies a detached Ed25519 envelope using a compiled local
evaluation public key, pins the complete host/driver/native/editor inventory, and
limits the server to the signed HTTPS loopback origin. It requires separate local
confirmation for loading and task control; the key/command cannot publish production
qualification. The private key remains outside the repository. The initial signed
plan omits approval, media, revocation and caller-tool qualification. This solves
candidate bootstrap without inventing native evidence or hashing a host digest
inside its own executable. Native release adoption remains a separate gate.
