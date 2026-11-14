DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM bindings WHERE native_conversation_key IS NOT NULL AND state='active') THEN
        RAISE EXCEPTION 'Refusing rollback while live native conversation exclusivity is retained';
    END IF;
END $$;
DROP INDEX one_active_binding_per_native_conversation;
ALTER TABLE bindings DROP COLUMN native_conversation_key;
DELETE FROM schema_migrations WHERE version=10;
