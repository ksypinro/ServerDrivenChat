LOCK TABLE commands IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM commands WHERE archived_at IS NOT NULL)
 OR EXISTS (SELECT 1 FROM command_lane_retention WHERE archived_through>0) THEN
  RAISE EXCEPTION 'Refusing rollback: retained turn ownership is required by compacted commands';
 END IF;
END $$;
DROP INDEX events_retention_turn;
DROP INDEX events_retention_rejection;
DROP INDEX events_retention_uncertain;
DROP INDEX commands_session_turn;
ALTER TABLE commands DROP COLUMN turn_id;
DELETE FROM schema_migrations WHERE version=12;
