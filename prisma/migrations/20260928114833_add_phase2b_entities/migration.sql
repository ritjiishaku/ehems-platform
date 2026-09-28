/*
  Warnings:

  - You are about to drop the `permission` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `role_permission` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "role_permission" DROP CONSTRAINT "role_permission_permission_id_fkey";

-- DropForeignKey
ALTER TABLE "role_permission" DROP CONSTRAINT "role_permission_role_id_fkey";

-- DropTable
DROP TABLE "permission";

-- DropTable
DROP TABLE "role_permission";

-- CreateTable
CREATE TABLE "tier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "price_kobo" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "mentorship_duration_months" INTEGER NOT NULL,
    "positioning_text" TEXT,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tier_benefit" (
    "id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "benefit_text" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "tier_benefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programme_tier" (
    "programme_id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,

    CONSTRAINT "programme_tier_pkey" PRIMARY KEY ("programme_id","tier_id")
);

-- CreateTable
CREATE TABLE "certificate_catalogue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template_url" TEXT,
    "issuing_body" TEXT NOT NULL DEFAULT 'EHEMS',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "certificate_catalogue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tier_certificate" (
    "tier_id" TEXT NOT NULL,
    "certificate_id" TEXT NOT NULL,

    CONSTRAINT "tier_certificate_pkey" PRIMARY KEY ("tier_id","certificate_id")
);

-- CreateTable
CREATE TABLE "member_certificate" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "certificate_id" TEXT NOT NULL,
    "enrolment_id" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by" TEXT,
    "verification_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "member_certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrolment" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "completion_marked_by" TEXT,
    "attendance_percentage" INTEGER NOT NULL DEFAULT 0,
    "assignment_checklist_completed" BOOLEAN NOT NULL DEFAULT false,
    "certificate_eligible" BOOLEAN NOT NULL DEFAULT false,
    "upgrade_from_enrolment_id" TEXT,

    CONSTRAINT "enrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrolment_programme" (
    "enrolment_id" TEXT NOT NULL,
    "programme_id" TEXT NOT NULL,
    "attendance_threshold" INTEGER NOT NULL,

    CONSTRAINT "enrolment_programme_pkey" PRIMARY KEY ("enrolment_id","programme_id")
);

-- CreateTable
CREATE TABLE "attendance_record" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "enrolment_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "marked_by" TEXT,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "attendance_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_checklist" (
    "id" TEXT NOT NULL,
    "enrolment_id" TEXT NOT NULL,
    "requirement_name" TEXT NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "marked_by" TEXT,
    "notes" TEXT,

    CONSTRAINT "assignment_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material" (
    "id" TEXT NOT NULL,
    "programme_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tier_name_key" ON "tier"("name");

-- CreateIndex
CREATE INDEX "tier_benefit_tier_id_idx" ON "tier_benefit"("tier_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_catalogue_name_key" ON "certificate_catalogue"("name");

-- CreateIndex
CREATE UNIQUE INDEX "member_certificate_verification_id_key" ON "member_certificate"("verification_id");

-- CreateIndex
CREATE INDEX "member_certificate_user_id_idx" ON "member_certificate"("user_id");

-- CreateIndex
CREATE INDEX "member_certificate_enrolment_id_idx" ON "member_certificate"("enrolment_id");

-- CreateIndex
CREATE INDEX "enrolment_user_id_idx" ON "enrolment"("user_id");

-- CreateIndex
CREATE INDEX "enrolment_tier_id_idx" ON "enrolment"("tier_id");

-- CreateIndex
CREATE INDEX "attendance_record_user_id_idx" ON "attendance_record"("user_id");

-- CreateIndex
CREATE INDEX "attendance_record_session_id_idx" ON "attendance_record"("session_id");

-- CreateIndex
CREATE INDEX "attendance_record_enrolment_id_idx" ON "attendance_record"("enrolment_id");

-- CreateIndex
CREATE INDEX "assignment_checklist_enrolment_id_idx" ON "assignment_checklist"("enrolment_id");

-- CreateIndex
CREATE INDEX "material_programme_id_idx" ON "material"("programme_id");

-- AddForeignKey
ALTER TABLE "tier_benefit" ADD CONSTRAINT "tier_benefit_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme_tier" ADD CONSTRAINT "programme_tier_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme_tier" ADD CONSTRAINT "programme_tier_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_certificate" ADD CONSTRAINT "tier_certificate_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_certificate" ADD CONSTRAINT "tier_certificate_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "certificate_catalogue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_certificate" ADD CONSTRAINT "member_certificate_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_certificate" ADD CONSTRAINT "member_certificate_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "certificate_catalogue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_certificate" ADD CONSTRAINT "member_certificate_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "enrolment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "tier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment_programme" ADD CONSTRAINT "enrolment_programme_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment_programme" ADD CONSTRAINT "enrolment_programme_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "programme_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "enrolment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_checklist" ADD CONSTRAINT "assignment_checklist_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
