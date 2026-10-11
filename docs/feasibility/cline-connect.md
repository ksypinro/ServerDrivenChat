# M02 — Cline Connect and approval integration design

Status: **Proposed**, based on pinned source inspection and completed two-host M02 UI probes; no Connect tool or server implemented. Companion placement and packaging are finalized in M03; wire schemas in M04; implementation in M19–M21.

## Intended user journey

After graphical installation and pairing, the user opens a project and Cline task, then asks “Connect with my server and follow its instructions.” Cline invokes the installed Connect tool. A local confirmation identifies the server, project, task, and permitted control categories. The companion binds that task and starts its persistent connection. The tool returns a bounded status response, and the initiating model turn may finish. Later server prompts are delivered into the same visible task by the companion.

“Connect” never installs software, signs into a provider, or expands permissions solely because the model requested it. Initial installation, authentication, and delegation use explicit graphical flows. Once established, the connection runs independently of model tool polling.

## Trusted origin and server selection

The preferred Connect tool is registered through an app-owned Cline integration hook. Its handler receives trusted context containing the installation/extension-host instance, workspace identity, native task/session identity, and binding generation. Cline supplies this context outside the model's tool arguments.

The model may supply an already configured server alias and an optional display label. It must not supply authoritative task IDs, permission grants, credentials, callback URLs, or reviewer identities. Unknown server aliases require local setup. A raw URL copied from a remote prompt is not a server profile.

If Connect is exposed through MCP, the Cline host must add authenticated out-of-band origin metadata or a short-lived, single-use context assertion. Bind it to the specific MCP service, task, invocation, and local bridge; validate it before pairing. A model-writable `taskId` field is insufficient.

The inspected 3.83.0 MCP path receives `ulid` locally for telemetry but sends only the tool name and arguments. In 4.1.22's inspected SDK path, execution context is passed internally, while the client sends name/arguments and uses the cancellation signal locally. Neither proves trusted originating-task metadata reaches an ordinary MCP server. [3.83.0 MCP path](https://github.com/cline/cline/blob/80783b62cb0aad6e9061a6616dade1582ab5174d/src/services/mcp/McpHub.ts), [4.1.22 MCP client](https://github.com/cline/cline/blob/f58bc118bdeef1bd2813cd08e00d98bdcda96475/sdk/packages/core/src/extensions/mcp/client.ts).

## Connection lifecycle

1. Resolve trusted origin and the user-configured server profile. Reject ambiguous window, workspace, host, or task bindings.
2. Display local confirmation and complete authenticated device/session pairing. Keep credentials in secure extension storage; tool results contain no tokens.
3. Persist the binding and resume cursors, then subscribe through the bridge's transport component. Report `connected` only after server handshake and task binding succeed; otherwise return a truthful pending/error state.
4. Return from Connect. The extension service continues listening without keeping a model turn alive. Repeated Connect for the identical binding is idempotent; a different binding requires a fresh local selection.
5. Queue normal prompts using command IDs. Validate the native binding at dispatch and confirm the prompt echo before reporting application acceptance. A selected-task change must not redirect queued work.
6. Process approval, clarification, cancellation, and disconnect controls independently of the normal prompt queue. Keep native request identity through retries.
7. On reload or loss of connectivity, expose stale/offline state. Reauthenticate, inspect current native state, and reconcile uncertain commands before resuming. Never blindly replay a prompt or decision whose application outcome is unknown.

The service persists while the relevant IDE extension host is alive, not after the IDE exits. Multiple windows and remote workspaces need distinct host identities and leases. Disconnect revokes the binding and stops delivery; cancellation of an active operation is a separate explicit action.

## Input and output design

Use typed commands: normal prompt, clarification answer, approval decision, cancel, connect, and disconnect. A normal message cannot become authorization. Keep content blocks, attachments, command IDs, binding generations, and expiry explicit.

Outputs identify task/turn/message, source, revision, and lifecycle. Partial message replacements must update an existing item, rather than appear as duplicated text. Snapshot watermarks and event cursors allow recovery. Transcript data must never manufacture trusted approval cards. Native tool events and interaction records create those cards through a separate validated path.

## Native approval round trip

1. Cline creates a native pending interaction before execution. The integration captures full reviewable action/input or diff, offered choices, resource scope, native identities, revision, and action digest.
2. The bridge persists it and sends `approval.required`. The server authenticates the reviewer and displays exact scope and consequences.
3. The server records a request-specific, expiring decision. The bridge verifies server authority, session ownership, binding generation, decision identity, digest, and native choices.
4. Cline atomically compares the pending request and consumes it once. A local decision, edited action, task switch, cancellation, or new request invalidates stale responses.
5. Report `approval.applied` only after native acceptance. Report execution success/failure separately. When confirmation is lost, reconcile or report unknown.

Default grant is one native action once. A denied decision contains no grants. Fine-grained permission subsets are offered only if Cline can enforce them; the generic yes/no helper cannot provide them. Auto-approved native actions generate no pending approval to relay. Expose that fact without changing auto-approval settings to make the probe pass.

## Acceptance evidence still required

- The Connect invocation is bound to its originating task even if the visible task changes before completion.
- A later server event reaches the same idle task after the Connect turn ends.
- A remote decision remains available while the model waits, and stale/duplicate/conflicting decisions are handled safely.
- Local resolution, extension reload, server reconnect, and the two different IDE hosts cannot reuse another binding's authority.

These are future integration checks. M02 demonstrated native UI input/output and Save/Reject approval resolution, but did not execute Connect or relay a server decision. The stock public API and default MCP origin gaps still require an app-owned API addition.
