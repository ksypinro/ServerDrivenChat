-- MI-06 metadata only: applying this migration does not compact or delete commands.
ALTER TABLE commands ALTER COLUMN payload DROP NOT NULL;
ALTER TABLE commands ADD COLUMN archived_at timestamptz;
ALTER TABLE commands ADD COLUMN payload_sha256 text;
ALTER TABLE commands ADD COLUMN original_payload_bytes bigint;
ALTER TABLE commands ADD CONSTRAINT command_archive_metadata_valid CHECK (
  (archived_at IS NULL AND payload IS NOT NULL) OR
  (archived_at IS NOT NULL AND payload IS NULL AND payload_sha256 IS NOT NULL AND payload_sha256 ~ '^[0-9a-f]{64}$'
   AND original_payload_bytes IS NOT NULL AND original_payload_bytes >= 0)
);
CREATE TABLE command_lane_retention (
  device_id text NOT NULL REFERENCES devices(device_id),
  lane text NOT NULL CHECK (lane IN ('prompt','control')),
  archived_through bigint NOT NULL DEFAULT 0 CHECK (archived_through >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id,lane)
);
CREATE INDEX commands_unarchived_delivery ON commands(device_id,lane,lane_seq) WHERE archived_at IS NULL;
