# M02 live probe plan

Status: Required M02 probes **Passed** in both hosts on 2026-10-05. The initial authentication failure is retained in each host's evidence. After user graphical sign-in, both returned exact text replies and same-task context continuity, then displayed a genuine native file proposal with Save/Reject controls. Save was exercised in VS Code; Reject in Antigravity. [VS Code evidence](vscode/live-probe.json), [Antigravity evidence](antigravity/live-probe.json).

The steps below describe the completed demonstration and future reruns. Native task/request IDs were not exposed in the UI; their programmatic export and atomic checks remain implementation gates.

## Setup

Use a disposable project/task per host. Do not overwrite or switch an active user task without first preserving it. Confirm Cline is enabled, provider access is configured, and the selected workspace is the intended probe workspace. Authentication, if needed, remains a graphical user step. Record the native permission settings and host location without credentials. No CLI or separately launched model runtime.

## Input/output

1. First prompt: `This is an M02 app-only probe. Do not use tools or change files. Remember M02-CONTEXT-6R8Q. Reply exactly M02-INPUT-OK.`
2. After a reliable terminal state, send into the same task: `Without tools, reply with the remembered marker followed by CONTINUITY-OK.`
3. Record submitted-message echo, exact output, task identity source, completion indicator, and whether partial output can be distinguished from replacements. A matching reply alone does not prove a public companion API.

## Approval

1. Ask Cline to propose creating only `m02-approval-marker.txt` in the disposable workspace with `M02 APPROVAL PROBE`, using its native file-edit tool and no shell command. Stop before approval.
2. Capture the native pending action, full diff, choices, task/request identity if exposed, and current permission mode. Ordinary assistant text requesting consent is insufficient.
3. If the action auto-executes, record auto-allowed and stop; do not create unrelated actions or broaden permissions to force a dialog.
4. A bounded allow/deny probe may proceed only through a permitted native control with a freshly identified request. Record the native resolution and resulting file state separately. Source analysis currently does not establish atomic remote resolution.

## Isolation and recovery

Observe behavior when another disposable task is selected, the IDE loses focus, and the tested task becomes idle. Test reload/reconnect only after pending work is resolved and user work is preserved. Any automated task-switch or stale-approval race test needs the proposed app-owned API; do not approximate it using blind button presses.

## Evidence and completion

Save sanitized transcript/approval evidence under a host-specific subdirectory and label observations as UI, native API, or source-only. Never save provider secrets or unrelated task history. Update capability-matrix.json and the logbook. M02 is Done after the required live demonstrations and documented API/Connect route decision. Unimplemented app-owned API and server integration remain downstream gates; UI success does not enable production remote capabilities.
