DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM public_conversations) OR EXISTS(SELECT 1 FROM public_generations) THEN
        RAISE EXCEPTION 'Refusing rollback of retained public context/history/results';
    END IF;
END $$;
DROP TABLE public_caller_tools, public_history_versions, public_generations, public_conversations;
DELETE FROM schema_migrations WHERE version=9;
