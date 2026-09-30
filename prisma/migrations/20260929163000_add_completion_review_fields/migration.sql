ALTER TABLE "enrolment"
  ADD COLUMN "performance_satisfactory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "feedback_considered" BOOLEAN NOT NULL DEFAULT false;
