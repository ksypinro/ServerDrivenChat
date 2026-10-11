-- Public callers never receive device credentials. Tokens are random, scoped and hashed.
CREATE TABLE public_credentials (
    credential_id text PRIMARY KEY,
    owner_user_id text NOT NULL REFERENCES app_users(user_id),
    session_id text NOT NULL REFERENCES sessions(session_id),
    binding_id text NOT NULL REFERENCES bindings(binding_id),
    token_hash text NOT NULL UNIQUE,
    scopes text[] NOT NULL,
    label text NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK (scopes <@ ARRAY['view','prompt','approve','administer']::text[] AND cardinality(scopes)>0)
);

-- Activating the public admission profile also fences the GUI/low-level ingress.
CREATE TABLE public_session_admission (
    session_id text PRIMARY KEY REFERENCES sessions(session_id),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public_operations (
    operation_id text PRIMARY KEY,
    principal_id text NOT NULL,
    owner_user_id text NOT NULL REFERENCES app_users(user_id),
    session_id text NOT NULL REFERENCES sessions(session_id),
    idempotency_key text NOT NULL,
    request_fingerprint text NOT NULL,
    command_id text NOT NULL UNIQUE REFERENCES commands(command_id),
    prompt_id text NOT NULL UNIQUE,
    turn_id text NOT NULL UNIQUE,
    binding_id text NOT NULL REFERENCES bindings(binding_id),
    binding_revision integer NOT NULL,
    lease_generation integer NOT NULL,
    admitted_watermark bigint NOT NULL CHECK (admitted_watermark>=0),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (principal_id, session_id, idempotency_key)
);
CREATE INDEX public_operations_session ON public_operations(session_id, created_at);
CREATE INDEX public_credentials_owner ON public_credentials(owner_user_id, session_id);

CREATE TABLE public_command_authority (
    command_id text PRIMARY KEY REFERENCES commands(command_id),
    credential_id text REFERENCES public_credentials(credential_id),
    owner_user_id text NOT NULL REFERENCES app_users(user_id),
    permission text NOT NULL CHECK (permission IN ('prompt','approve','administer')),
    request_fingerprint text
);

CREATE TABLE public_request_buckets (
    principal_id text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    requests integer NOT NULL CHECK (requests>0)
);
