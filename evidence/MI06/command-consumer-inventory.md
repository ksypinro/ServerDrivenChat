# Command identity and payload inventory

- `ServerDatabase.recordCommand` and `ApprovalEngine.decide` write command rows. Both calculate canonical payload fingerprints; approval admission also uses the retained-payload capacity check.
- Command replay reads only unarchived payloads from a repeatable-read snapshot. A stream rechecks the floor on every poll.
- Command admission counts unarchived payloads. Single-outstanding admission excludes compacted rows. Final acknowledgement and turn events remain available.
- `recordCommandAck` retains the original acknowledgement and applies approval/grant effects only while a payload exists; identical archived acknowledgements return the original disposition without repeating effects.
- Dispatch authority takes a command-row share lock and refuses archived commands before issuing a permit; compaction updates that same row and uses a short timeout. It holds no binding or session locks while owning the lane lock.
- Public operations, public command authority, public generation cancellation commands and skip/ACK tables continue to reference the permanent command identity; tests cover public receipts, idempotency and cancellation foreign keys.
- SQLite recovery records a separate certified floor and leaves existing attempts, acknowledgement outbox and producer output untouched. A conflicting unfinished command fails closed.
