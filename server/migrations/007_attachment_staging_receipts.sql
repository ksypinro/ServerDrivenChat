CREATE TABLE attachment_staging_receipts (
  receipt_id text PRIMARY KEY,
  attachment_id text NOT NULL REFERENCES attachment_metadata(attachment_id),
  session_id text NOT NULL REFERENCES sessions(session_id),
  binding_id text NOT NULL,
  adapter_id text NOT NULL,
  sha256 text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  mime_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attachment_id,binding_id,sha256)
);
