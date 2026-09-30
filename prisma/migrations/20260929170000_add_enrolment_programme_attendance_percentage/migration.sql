-- Per-programme attendance cache. PRD §12.3 measures attendance per programme,
-- so a member enrolled on two programmes must not be able to pool sessions across
-- them to clear a single programme's threshold.
ALTER TABLE "enrolment_programme"
  ADD COLUMN "attendance_percentage" INTEGER NOT NULL DEFAULT 0;
