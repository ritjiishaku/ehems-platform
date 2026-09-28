-- Proves the SEC-015 append-only protections on audit_log actually exist.
--
-- Hand-appended triggers are invisible to Prisma (see the note in
-- prisma/migrations/*_init/migration.sql), so nothing in the normal toolchain
-- will notice if they are dropped from a development database. This is the only
-- thing that checks, which is why it is a script rather than a comment.
--
-- The four behaviours asserted:
--   INSERT   permitted  - the audit log is still writable, which is the point
--   UPDATE   blocked    - SEC-015, no edits to history
--   DELETE   blocked    - SEC-015, no removals from history
--   TRUNCATE blocked    - AGENTS.md section 8, the empty-table attack
--
-- Run with:
--   npx prisma db execute --file scripts/verify-audit-trigger.sql --schema prisma/schema.prisma
--
-- Every statement runs inside a transaction that is rolled back at the end, so
-- the verification row does not accumulate in a developer's local database. This
-- is not a workaround for the protections being missing: ROLLBACK is a
-- transaction-level operation and is deliberately not blocked, because blocking
-- it would break legitimate schema resets. DELETE, UPDATE and TRUNCATE are the
-- three that are refused, and all three are asserted below.

BEGIN;

DO $$
DECLARE
  v_id         text;
  v_insert_ok  boolean := false;
  v_update_ok  boolean := false;
  v_delete_ok  boolean := false;
  v_truncate_ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO audit_log (id, action, entity_type, entity_id)
    VALUES ('ci-verify-audit-log', 'ci.verify', 'verification', 'ci-verify-audit-log')
    RETURNING id INTO v_id;
    v_insert_ok := true;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'SEC-015 regression: audit_log rejects INSERT - the audit log is unwritable: %', SQLERRM;
  END;

  BEGIN
    UPDATE audit_log SET action = 'ci.tampered' WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'audit_log is append-only%' THEN
      v_update_ok := true;
    ELSE
      RAISE EXCEPTION 'SEC-015 regression: UPDATE failed for the wrong reason: %', SQLERRM;
    END IF;
  END;

  BEGIN
    DELETE FROM audit_log WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'audit_log is append-only%' THEN
      v_delete_ok := true;
    ELSE
      RAISE EXCEPTION 'SEC-015 regression: DELETE failed for the wrong reason: %', SQLERRM;
    END IF;
  END;

  -- TRUNCATE is caught by the BEFORE TRUNCATE statement trigger, so it raises the
  -- trigger's message. The privilege check is also accepted, because the revoke
  -- is the intended second layer wherever a non-owner role is in play.
  BEGIN
    EXECUTE 'TRUNCATE TABLE audit_log';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'audit_log is append-only%' OR SQLERRM LIKE '%permission denied%' THEN
      v_truncate_ok := true;
    ELSE
      RAISE EXCEPTION 'SEC-015 regression: TRUNCATE failed for the wrong reason: %', SQLERRM;
    END IF;
  END;

  IF NOT v_update_ok THEN
    RAISE EXCEPTION 'SEC-015 regression: UPDATE on audit_log was NOT blocked';
  END IF;
  IF NOT v_delete_ok THEN
    RAISE EXCEPTION 'SEC-015 regression: DELETE on audit_log was NOT blocked';
  END IF;
  IF NOT v_truncate_ok THEN
    RAISE EXCEPTION 'SEC-015 regression: TRUNCATE on audit_log was NOT blocked';
  END IF;
  IF NOT v_insert_ok THEN
    RAISE EXCEPTION 'SEC-015 regression: audit_log is not writable';
  END IF;

  RAISE NOTICE 'SEC-015 verified: INSERT allowed, UPDATE/DELETE/TRUNCATE refused';
END $$;

ROLLBACK;
