ALTER TABLE bindings ADD COLUMN lease_expires_at timestamptz;
UPDATE bindings SET lease_expires_at=now() + interval '45 seconds' WHERE state='active';
CREATE INDEX bindings_active_lease ON bindings(device_id, session_id, lease_expires_at) WHERE state='active';
