CREATE TABLE oidc_identities (
  issuer text NOT NULL,
  subject text NOT NULL,
  user_id text NOT NULL REFERENCES app_users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer, subject),
  UNIQUE (user_id, issuer)
);

CREATE TABLE session_memberships (
  session_id text NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('operator', 'viewer')),
  granted_by_user_id text NOT NULL REFERENCES app_users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX session_memberships_user ON session_memberships(user_id, session_id);

CREATE TABLE pairing_requests (
  pairing_id text PRIMARY KEY,
  device_id text NOT NULL UNIQUE REFERENCES devices(device_id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_users(user_id),
  pairing_code_hash text NOT NULL UNIQUE,
  local_challenge_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  server_confirmed_at timestamptz,
  local_confirmed_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pairing_requests_expiry ON pairing_requests(expires_at) WHERE consumed_at IS NULL;

CREATE TABLE device_credentials (
  credential_id text PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_credential_id text REFERENCES device_credentials(credential_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_device_credential ON device_credentials(device_id) WHERE revoked_at IS NULL;
CREATE INDEX device_credentials_lookup ON device_credentials(token_hash) WHERE revoked_at IS NULL;

CREATE TABLE consumed_decision_assertions (
  assertion_id text PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  decision_id text NOT NULL,
  request_id text NOT NULL,
  request_revision integer NOT NULL CHECK (request_revision > 0),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, decision_id),
  UNIQUE (device_id, request_id, request_revision)
);
