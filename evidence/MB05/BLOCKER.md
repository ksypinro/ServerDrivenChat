# MB-05 execution authority: disposition and unblock requirements

Recorded: 2026-10-13 (Asia/Dhaka). Claude remains pinned to 2.1.296.

**2026-10-15 update:** [the deterministic native busy-queue test passed](NATIVE-QUEUE.md):
an attributed offer waited behind an active turn and reached classic refusal
after completion. This resolves queue timing for that path, not changing authority
or the final execution fence. The remaining gates are expiry/revocation, lifecycle,
takeover, late-hook races and recovery. All evaluation Mods are disabled/unloaded
and the temporary classic hook removed.

**2026-10-14 update:** the Mod-only assessment below is historical. A separate
classic `UserPromptSubmit` hook with `onFailure: "block"` is supported by the
installed 2.1.296 schema. This reopens Phase A with an independent native failure
policy candidate. [Four manual native failure/refusal cases passed](NATIVE-CLASSIC-HOOKS.md),
and the temporary hook was removed with exact settings restoration. See also
[alternate route and exact checks](ALTERNATIVES.md).
Native queue timing, lifecycle and authority races remain unqualified; MB-05
is still In Progress. Do not infer that the ordinary Mod failure diagnostic
also disproves this newly identified classic-hook route.

The [native Mod-origin follow-up](NATIVE-ORIGIN.md) establishes that attributed
`$.prompt.submit` reaches the classic guard for two idle offers. The intended busy
offer arrived after the counting turn completed; queue timing is still unproven.
Both prompts were dropped and cleanup verified. No production driver is admitted.

## Decision

The development and observation setup is working. The native driver cannot yet
be implemented under the accepted Phase A gate. A successful prompt demonstration
does not establish whether queued remote input is prevented after authority loss.
The available evidence rejects an ordinary prompt hook as the sole authority
boundary. It does not establish that every interface in Claude is incapable of
providing a suitable boundary.

MB-05 stays In Progress. Phases B–F remain gated by Phase A. Protocol 2.0 and
driver contract 1.0 are unchanged. No Claude control adapter, permissive catalog
entry, separate model process, or private native transport is introduced.

## What is resolved

| Earlier obstacle | Resolution | Evidence scope |
| --- | --- | --- |
| PATH selected Claude 2.1.193 | Use the official extension's bundled 2.1.296 executable | Exact-build developer commands |
| Dynamic event registration rejected | Register each hook with a literal event name | Strict native validator |
| Mod not installed or loaded | Approved local-scope observer installed in PluginLab | Live native plugin manager and logs |
| Existing conversation identity unobserved | Session digest agrees with selected native UI session | One selected existing conversation |
| Turn identity/completion unobserved | Two manual replies with distinct matching start/completion turn IDs | Manual native I/O |
| Stale view prevented reply verification | User window reload recovered the first reply; second reply rendered normally | Observation only, not driver crash recovery |

The observer is disabled and unloaded. The SDC host is disconnected. The package
remains locally installed so observation can be repeated without losing history.

## Exact-runtime diagnostic findings

The developer test runner executes Mods with native effects replaced by stubs.
It does not launch a model or control the IDE session. Tests count deliveries to
the core stub, so a successful diagnostic can demonstrate an unsafe fallback.

1. A normal `{ drop }` result prevents core delivery.
2. A successful refusal handler prevents delivery after the primary guard throws.
3. If both guard and refusal handler throw, the core stub receives the prompt.
4. Calling `$.prompt.submit` from a `prompt.submit` hook is rejected by the host
   because it would wait on the turn held by that hook. When the refusal handler
   then fails, the outer prompt reaches the core stub; the nested prompt does not.

The fourth experiment initially expected nested delivery. The actual runtime
rejected that hypothesis. The final test asserts the observed host rejection and
outer fallback. This is an additional reason not to implement recursive prompt
submission as a guard strategy.

[Follow-up validation and six diagnostics](exact-build-followup.json) includes
four fence tests and two observer tests, exact artifact measurements, executable
SHA-256, and the complete bounded test outputs. [Earlier checks](exact-build-check.json)
and [live observation](native-observer-events.json) retain their distinct scopes.

## Candidate routes checked

| Candidate | What it provides | Why it does not pass the gate |
| --- | --- | --- |
| Prompt guard with `.catch` | Refusal under normal operation and some guard failures | Both failures allow core processing in the exact-runtime fixture |
| Prompt submission from the prompt hook | An attempted recursive call | The exact host rejects it; failed fallback passes the outer prompt |
| Hold work in SDC until Claude looks idle | Avoids deliberately queuing while a known turn is active | Idle observation and native admission are separate; authority can change between them |
| Short-lived permit checked before submission | Bounds preflight authority | Does not establish authority when deferred native execution begins |
| Another guard Mod | Adds a second ordinary middleware check | No independent guarantee when those hooks fail or unload; more hooks alone are not proof |
| `$.turn.abort` | Targets a running turn | Stopping after start does not prove prevention of pending input; queued request identity/revocation is unqualified |
| `$.session.authorize` | Supplies an opaque native HTTP authentication handle | It is not an SDC lease or an execution-time prompt permit |
| `$.session.send` | Queues a delivery to a session | Acknowledged queuing does not establish an authority check at consumption |
| Native tools permission mode | Preserves checks on tool effects | Does not prevent the unauthorized text turn itself from starting |
| IDE UI automation, private socket, patched extension, separate CLI runtime | Potential demonstrations with different boundaries | Excluded by the user's accepted architecture |

The published types identify themselves as 2.1.277, so their signatures are
research evidence only. They describe `origin`, `turnId`, and `wait` as
engine-owned fields omitted from the plugin caller's prompt arguments. The test
runner's event inputs are different from a production Mod's caller arguments.
Consequently, tests using `wait: false` do not prove that production code can
disable native queuing. No unsupported argument is adopted into a driver.

References: [published declarations](https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts),
[Mods reference](https://code.claude.com/docs/en/plugins/mods/reference),
[hook failure behavior](https://code.claude.com/docs/en/plugins/mods/events#handle-a-hook-that-fails).

## Exact declarations and current native limitation

Marketplace installation did not generate exact-version declarations. The older
published file mentions `/plugin-types`; its availability in the installed IDE
has not been established. Current documentation describes automatic generation
for an interactive `--plugin-dir` load or a Mod authored by Claude. Creating a
separate session just to obtain those declarations would not qualify attachment
to the existing IDE conversation.

An attempt to discover the type command through the existing panel did not
produce a changed input or command result; computer use then reported that no
app window was available. No command was submitted and no successful type
generation is claimed. This UI limitation is separate from the demonstrated
authority failure. Reopening a window cannot itself repair that failure.

## Capability request for the native integration owner

This is a prepared specification, not a sent message or published issue.

For Claude 2.1.296, provide a supported interface that offers either:

- **Atomic admission:** native execution checks an SDC-authorized, session-bound
  permit at the final admission boundary; missing, expired, invalid or failed
  checks refuse execution, including when Mod code is unavailable.
- **Revocable native queue:** a pending request has a stable native identity and
  can be invalidated with a guarantee that it cannot subsequently start. The
  guarantee must define the race between execution and revocation.

The interface must bind the exact native session and selection generation,
retain plugin/remote attribution, expose a command-to-turn correlation, and
define outcomes when either side crashes or the Mod reloads. It must distinguish
pending, started, refused and unknown outcomes without requiring blind replay.
Cancellation of a running turn alone is insufficient.

No named fictional API is proposed as an existing callable method. An actual
documented interface, generated exact-build contract and measured runtime
acceptance are required.

## Required verification before reopening Phase B

Keep Claude busy, offer a remote prompt, then invalidate SDC authority before
Claude becomes idle. Confirm that the pending prompt never starts. Repeat for
lease expiry, local takeover, host loss, Mod unload/reload, a throwing guard,
timeout, and failed refusal handler. Use native session/turn evidence to detect
effects and wrong-conversation delivery. A missing reply is not proof of refusal.

After that gate passes, implement pairing and durable transport, then the text
driver and recovery behavior, real-server acceptance, and evidence closure in
the order already specified in `task.md`. Exact-build inventory and consent are
required again for any changed executable candidate. Production admission remains
MB-09. None of these exit checks are satisfied by the observation probe.
