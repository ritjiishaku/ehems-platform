-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "deleted_at" TIMESTAMP(3),
    "data_retention_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "absolute_expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_record" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "consent_version" TEXT NOT NULL,
    "consent_text" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "withdrawn_at" TIMESTAMP(3),

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_subject_request" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "request_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "handling_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_subject_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breach_incident" (
    "id" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "affected_count" INTEGER NOT NULL,
    "risk_level" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ndpc_notified_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breach_incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "channel" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB,
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_link" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "access_level" TEXT NOT NULL,
    "tier_name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "product_type" TEXT NOT NULL,
    "price_kobo" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "total_kobo" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_form" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_response" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "user_id" TEXT,
    "response_data" JSONB NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "retention_policy" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "expiry_days" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "attendance_threshold" INTEGER NOT NULL DEFAULT 60,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programme_session" (
    "id" TEXT NOT NULL,
    "programme_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programme_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_email_idx" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_deleted_at_idx" ON "user"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "session_token_hash_idx" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_expires_at_idx" ON "session"("expires_at");

-- CreateIndex
CREATE INDEX "consent_record_user_id_idx" ON "consent_record"("user_id");

-- CreateIndex
CREATE INDEX "consent_record_withdrawn_at_idx" ON "consent_record"("withdrawn_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log"("actor_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "data_subject_request_user_id_idx" ON "data_subject_request"("user_id");

-- CreateIndex
CREATE INDEX "data_subject_request_status_idx" ON "data_subject_request"("status");

-- CreateIndex
CREATE INDEX "breach_incident_detected_at_idx" ON "breach_incident"("detected_at");

-- CreateIndex
CREATE INDEX "notification_user_id_idx" ON "notification"("user_id");

-- CreateIndex
CREATE INDEX "notification_channel_sent_at_idx" ON "notification"("channel", "sent_at");

-- CreateIndex
CREATE INDEX "community_link_access_level_active_idx" ON "community_link"("access_level", "active");

-- CreateIndex
CREATE INDEX "product_active_idx" ON "product"("active");

-- CreateIndex
CREATE INDEX "order_user_id_idx" ON "order"("user_id");

-- CreateIndex
CREATE INDEX "order_product_id_idx" ON "order"("product_id");

-- CreateIndex
CREATE INDEX "feedback_response_form_id_idx" ON "feedback_response"("form_id");

-- CreateIndex
CREATE INDEX "feedback_response_user_id_idx" ON "feedback_response"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "retention_policy_category_key" ON "retention_policy"("category");

-- CreateIndex
CREATE INDEX "programme_session_programme_id_idx" ON "programme_session"("programme_id");

-- CreateIndex
CREATE INDEX "programme_session_starts_at_idx" ON "programme_session"("starts_at");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_request" ADD CONSTRAINT "data_subject_request_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_response" ADD CONSTRAINT "feedback_response_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "feedback_form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme_session" ADD CONSTRAINT "programme_session_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- AuditLog append-only protections (SEC-015, AGENTS.md section 8)
-- ---------------------------------------------------------------------------
-- Hand-appended. Prisma's schema language cannot express triggers, so this
-- protection lives in migration history and is invisible to `prisma migrate dev`
-- and to schema drift detection. That is the accepted trade-off: retrofitting
-- this once audit rows exist is materially harder, so it is cheapest here while
-- the table is still empty.
--
-- Consequences to know about:
--   * Prisma never reports drift for these objects, so if the trigger is dropped
--     in a development database, `migrate dev` will not put it back.
--   * The only thing that notices is scripts/verify-audit-trigger.sql, run by CI.
--
-- `REVOKE TRUNCATE ... FROM PUBLIC` is the interim form: the schema has a single
-- datasource and no distinct application role yet, so there is no named role to
-- revoke from. When a read-only auditor role is introduced, revoke from that role
-- explicitly as well.

CREATE OR REPLACE FUNCTION audit_log_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (SEC-015): % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_reject_update
  BEFORE UPDATE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

CREATE TRIGGER audit_log_reject_delete
  BEFORE DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

-- TRUNCATE is blocked by a trigger rather than by privilege on purpose. The
-- first attempt used `REVOKE TRUNCATE ... FROM PUBLIC`, which was verified to be
-- inert: the datasource connects as `postgres`, which owns the table and is a
-- superuser, and both owner and superuser bypass privilege checks entirely. The
-- revoke did not fail loudly, it simply did nothing, and TRUNCATE still worked.
-- A BEFORE TRUNCATE statement trigger refuses the statement for every role,
-- which is what SEC-015 actually requires.
CREATE TRIGGER audit_log_reject_truncate
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_reject_mutation();

-- Defence in depth only, for the day a non-owner application role exists. It is
-- inert while the datasource owns the table; the trigger above is the control
-- that actually holds.
