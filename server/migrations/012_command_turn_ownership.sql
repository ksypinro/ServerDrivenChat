-- Old candidate payloads cannot reconstruct permanent turn ownership after archival.
LOCK TABLE commands IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM commands WHERE payload IS NULL OR archived_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Cannot migrate command turn ownership from compacted candidate 011; use a reviewed pre-compaction backup';
 END IF;
END $$;
ALTER TABLE commands ADD COLUMN turn_id text;
UPDATE commands SET turn_id=payload->>'turnId'
 WHERE lane='prompt' AND payload->>'type'='turn.submit'
 AND jsonb_typeof(payload->'turnId')='string' AND length(payload->>'turnId') BETWEEN 1 AND 2048;
-- Historical duplicates remain visible and conservatively block eligibility.
CREATE INDEX commands_session_turn ON commands(session_id,turn_id) WHERE turn_id IS NOT NULL;
-- Parameterized evidence lookups must not rescan the complete transcript per command.
CREATE INDEX events_retention_turn ON events(session_id,(payload->>'bindingRevision'),(payload->>'leaseGeneration'),(payload->'payload'->>'turnId'),created_at DESC,session_seq DESC)
 WHERE payload->>'type' IN ('turn.completed','turn.failed','turn.cancelled');
CREATE INDEX events_retention_rejection ON events(session_id,(payload->>'bindingRevision'),(payload->>'leaseGeneration'),(payload->'payload'->>'commandId'),created_at DESC,session_seq DESC)
 WHERE payload->>'type'='command.rejected';
CREATE INDEX events_retention_uncertain ON events(session_id,created_at)
 WHERE payload->>'type'='session.reconciliation_required';
