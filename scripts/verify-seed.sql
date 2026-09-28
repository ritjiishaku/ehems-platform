-- Post-seed assertions, run by the CI `database` job via `prisma db execute`.
--
-- `db execute` sends the script to the database but does NOT return rows, so a
-- bare SELECT here would execute and print nothing. It has to be a DO block that
-- raises: the assertion has to travel back as an error for the job to go red.
--
-- These duplicate the guarantees the seed itself already makes, on purpose. The
-- second `db:seed` run is the primary idempotency gate; this checks the things a
-- re-run cannot detect, namely that the seed silently wrote nothing at all.

DO $$
DECLARE
  expected_settings int;
BEGIN
  -- SEC-016: retention is defined per data category. An empty table means the
  -- retention surface AGENTS.md section 8 depends on is not configured.
  IF (SELECT count(*) FROM retention_policy) < 1 THEN
    RAISE EXCEPTION 'seed wrote no retention policies (SEC-016)';
  END IF;

  -- Must be exactly one: zero means the SystemSetting key is missing, more than
  -- one means the upsert stopped deduplicating.
  SELECT count(*) INTO expected_settings
  FROM system_setting
  WHERE key = 'consent_version';

  IF expected_settings <> 1 THEN
    RAISE EXCEPTION 'expected 1 consent_version setting, found %', expected_settings;
  END IF;
END $$;
