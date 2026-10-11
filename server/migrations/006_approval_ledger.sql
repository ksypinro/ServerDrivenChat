ALTER TABLE grants DROP CONSTRAINT grants_state_check;
ALTER TABLE grants ADD CONSTRAINT grants_state_check CHECK (state IN ('pending', 'active', 'revoked', 'expired', 'unknown'));
