-- A native conversation is controllable through at most one live binding, across sessions and devices.
-- Registrations without a native scope keep a NULL key, so earlier companions remain unconstrained.
ALTER TABLE bindings ADD COLUMN native_conversation_key text;
CREATE UNIQUE INDEX one_active_binding_per_native_conversation ON bindings(native_conversation_key) WHERE state = 'active';
