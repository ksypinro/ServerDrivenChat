-- Authenticated tombstones retain device-lane continuity without exposing obsolete session payloads.
CREATE TABLE command_skips (
    device_id text NOT NULL,
    lane text NOT NULL CHECK (lane IN ('prompt','control')),
    lane_seq bigint NOT NULL,
    command_id text NOT NULL REFERENCES commands(command_id),
    reason text NOT NULL CHECK (reason='obsolete_binding'),
    PRIMARY KEY (device_id,lane,lane_seq),
    FOREIGN KEY (device_id,lane,lane_seq) REFERENCES commands(device_id,lane,lane_seq)
);
