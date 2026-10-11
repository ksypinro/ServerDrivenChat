CREATE TABLE command_acknowledgements (
  device_id text NOT NULL,
  lane text NOT NULL CHECK (lane IN ('prompt', 'control')),
  lane_seq bigint NOT NULL CHECK (lane_seq > 0),
  state text NOT NULL CHECK (state IN ('received', 'applied', 'rejected', 'unknown', 'reconciliation_required')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, lane, lane_seq),
  FOREIGN KEY (device_id, lane, lane_seq) REFERENCES commands(device_id, lane, lane_seq)
);
