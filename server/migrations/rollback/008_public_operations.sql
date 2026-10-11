-- Developer rollback of an unused M27 schema only. Used ledgers/keys are retained.
-- Run in one transaction; migrate() will reapply 008 on subsequent startup.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public_operations) OR EXISTS (SELECT 1 FROM public_credentials)
       OR EXISTS (SELECT 1 FROM public_command_authority) OR EXISTS (SELECT 1 FROM public_session_admission) THEN
        RAISE EXCEPTION 'M27 rollback refuses to remove retained public authority/operations; archive or reconcile through a reviewed migration';
    END IF;
END $$;
DROP TABLE public_request_buckets;
DROP TABLE public_command_authority;
DROP TABLE public_operations;
DROP TABLE public_session_admission;
DROP TABLE public_credentials;
DELETE FROM schema_migrations WHERE version=8;
