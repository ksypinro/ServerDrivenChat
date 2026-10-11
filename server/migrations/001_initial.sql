CREATE TABLE app_users (
  user_id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
  device_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(user_id),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  session_id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES app_users(user_id),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'disabled', 'closed')),
  last_event_seq bigint NOT NULL DEFAULT 0 CHECK (last_event_seq >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bindings (
  binding_id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES sessions(session_id),
  device_id text NOT NULL REFERENCES devices(device_id),
  binding_revision integer NOT NULL CHECK (binding_revision > 0),
  lease_generation integer NOT NULL CHECK (lease_generation > 0),
  state text NOT NULL CHECK (state IN ('active', 'stale', 'detached', 'revoked')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, binding_revision)
);
CREATE UNIQUE INDEX one_active_binding_per_session ON bindings(session_id) WHERE state = 'active';

CREATE TABLE lane_counters (
  device_id text NOT NULL REFERENCES devices(device_id),
  lane text NOT NULL CHECK (lane IN ('prompt', 'control')),
  last_seq bigint NOT NULL CHECK (last_seq > 0),
  PRIMARY KEY (device_id, lane)
);

CREATE TABLE commands (
  command_id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES sessions(session_id),
  device_id text NOT NULL REFERENCES devices(device_id),
  lane text NOT NULL CHECK (lane IN ('prompt', 'control')),
  lane_seq bigint NOT NULL CHECK (lane_seq > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, lane, lane_seq)
);
CREATE INDEX commands_delivery_order ON commands(device_id, lane, lane_seq);

CREATE TABLE events (
  event_id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES sessions(session_id),
  bridge_epoch text NOT NULL,
  producer_seq bigint NOT NULL CHECK (producer_seq > 0),
  session_seq bigint NOT NULL CHECK (session_seq > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, session_seq),
  UNIQUE (session_id, bridge_epoch, producer_seq)
);

CREATE TABLE interactions (
  interaction_id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES sessions(session_id),
  request_id text NOT NULL,
  request_revision integer NOT NULL CHECK (request_revision > 0),
  kind text NOT NULL CHECK (kind IN ('input', 'approval')),
  state text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, request_id, request_revision)
);

CREATE TABLE decisions (
  decision_id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES sessions(session_id),
  request_id text NOT NULL,
  request_revision integer NOT NULL CHECK (request_revision > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, request_id, request_revision),
  FOREIGN KEY (session_id, request_id, request_revision) REFERENCES interactions(session_id, request_id, request_revision)
);

CREATE TABLE grants (
  grant_id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES sessions(session_id),
  request_id text NOT NULL,
  decision_id text NOT NULL REFERENCES decisions(decision_id),
  state text NOT NULL CHECK (state IN ('active', 'revoked', 'expired', 'unknown')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attachment_metadata (
  attachment_id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES sessions(session_id),
  state text NOT NULL CHECK (state IN ('pending', 'committed', 'expired', 'deleted')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_records (
  audit_id text PRIMARY KEY,
  session_id text REFERENCES sessions(session_id),
  actor_id text,
  action text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX events_session_replay ON events(session_id, session_seq);
CREATE INDEX interactions_session_state ON interactions(session_id, state);
CREATE INDEX grants_session_state ON grants(session_id, state);
