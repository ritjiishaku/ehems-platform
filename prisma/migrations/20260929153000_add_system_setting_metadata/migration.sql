ALTER TABLE "system_setting"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "updated_by" TEXT;

-- A fresh environment must not accept payment uploads until an operator has
-- deliberately configured the payment destination and chosen a mode.
INSERT INTO "system_setting" ("key", "value", "description", "updated_by", "updated_at")
VALUES (
  'payment.instructions.mode',
  'disabled',
  'test | live | disabled. Payment instructions are fail-closed by default.',
  'migration:20260929153000',
  NOW()
)
ON CONFLICT ("key") DO NOTHING;
