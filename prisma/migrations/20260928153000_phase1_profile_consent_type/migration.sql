-- Phase 1 registration profile fields and typed consent purpose.
CREATE TYPE "consent_type" AS ENUM (
  'data_processing',
  'marketing',
  'sensitive_data',
  'cross_border_transfer'
);

ALTER TABLE "user"
  ADD COLUMN "profession" TEXT,
  ADD COLUMN "healthcare_specialty" TEXT,
  ADD COLUMN "password_reset_token_hash" TEXT,
  ADD COLUMN "password_reset_expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "user_password_reset_token_hash_key"
  ON "user"("password_reset_token_hash");

CREATE TABLE "auth_rate_limit_bucket" (
  "key_hash" TEXT NOT NULL,
  "attempts" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[],
  "expires_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "auth_rate_limit_bucket_pkey" PRIMARY KEY ("key_hash")
);

CREATE INDEX "auth_rate_limit_bucket_expires_at_idx"
  ON "auth_rate_limit_bucket"("expires_at");

ALTER TABLE "consent_record"
  ADD COLUMN "consent_type" "consent_type" NOT NULL DEFAULT 'data_processing';
