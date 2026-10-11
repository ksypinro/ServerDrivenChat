-- Server semantics are neutral. Provider encodings remain in the HTTP gateway.
CREATE TABLE public_conversations (
    conversation_id text PRIMARY KEY,
    principal_id text NOT NULL,
    session_id text NOT NULL REFERENCES sessions(session_id),
    binding_id text NOT NULL REFERENCES bindings(binding_id),
    context_mode text NOT NULL CHECK(context_mode IN ('exclusive','shared-task')),
    history jsonb NOT NULL DEFAULT '[]',
    version integer NOT NULL DEFAULT 0,
    native_revision integer NOT NULL,
    latest_generation_id text,
    expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '7 days',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- A stateful native task can have only one independent API history, including other keys.
CREATE UNIQUE INDEX public_exclusive_context ON public_conversations(binding_id) WHERE context_mode='exclusive';
CREATE TABLE public_generations (
    generation_id text PRIMARY KEY REFERENCES public_operations(operation_id),
    conversation_id text NOT NULL REFERENCES public_conversations(conversation_id),
    parent_id text REFERENCES public_generations(generation_id),
    request jsonb NOT NULL,
    input_usage integer NOT NULL,
    result jsonb,
    cancellation_requested boolean NOT NULL DEFAULT false,
    cancellation_command_id text UNIQUE REFERENCES commands(command_id),
    deadline_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public_history_versions (
    conversation_id text NOT NULL REFERENCES public_conversations(conversation_id),
    version integer NOT NULL,
    generation_id text NOT NULL REFERENCES public_generations(generation_id),
    history jsonb NOT NULL,
    PRIMARY KEY(conversation_id,version)
);
CREATE TABLE public_caller_tools (
    call_id text PRIMARY KEY,
    generation_id text NOT NULL REFERENCES public_generations(generation_id),
    conversation_id text NOT NULL REFERENCES public_conversations(conversation_id),
    name text NOT NULL,
    arguments jsonb NOT NULL,
    result jsonb,
    UNIQUE(generation_id,call_id)
);
