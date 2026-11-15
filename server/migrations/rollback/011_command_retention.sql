DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM commands WHERE archived_at IS NOT NULL OR payload IS NULL)
     OR EXISTS (SELECT 1 FROM command_lane_retention WHERE archived_through > 0) THEN
    RAISE EXCEPTION 'Refusing rollback: compacted command payloads or archive floors cannot be reconstructed';
  END IF;
END $$;
DROP INDEX commands_unarchived_delivery;
DROP TABLE command_lane_retention;
ALTER TABLE commands DROP CONSTRAINT command_archive_metadata_valid;
ALTER TABLE commands DROP COLUMN original_payload_bytes;
ALTER TABLE commands DROP COLUMN payload_sha256;
ALTER TABLE commands DROP COLUMN archived_at;
ALTER TABLE commands ALTER COLUMN payload SET NOT NULL;
DELETE FROM schema_migrations WHERE version=11;
