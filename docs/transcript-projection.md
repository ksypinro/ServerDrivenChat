# Transcript projection and snapshots (M12)

`TranscriptProjector` in `@server-driven-chat/protocol` reduces server-sequenced events into stable output items, artifacts, pending approvals, interaction states, turn states, completion evidence, and a replay watermark. Call `ingest({ sessionSeq, event })` with persisted session sequence numbers. Duplicate event IDs are idempotent; conflicting event IDs/cursors are errors. Events wait in a sequence buffer until the missing prefix arrives. Output deltas require the exact current `baseRevision` and next revision. A mismatch leaves the transcript unchanged and sets `needsRepair`/`repairAfter`; fetch and install a new consistent snapshot before continuing.

Approval required/updated events are indexed as soon as they arrive, independent of transcript sequence gaps, so urgent review cards do not wait for unrelated output. Terminal events change turn state; they do not append a second copy of final text. Replacements update the existing item. Each output item carries `observed`, `partial`, or `unknown` evidence according to its source and partial flag. Completion is separate from output text.

`GET /v2/sessions/{sessionId}/snapshot` returns the repeatable-read storage snapshot, lane/session cursors, and a `projection` built from that same event/interaction cut. Resume event replay strictly after `cursors.sessionSeq`; if a delta cannot be applied or replay continuity is lost, install the newest projection and resume after its watermark. Event history is currently retained without pruning.

The projector is deterministic and model/browser independent. It does not establish that accessibility or screen observations are native token events, and it labels uncertain evidence instead of upgrading it.
