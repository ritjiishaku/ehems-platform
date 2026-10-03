-- AlterTable
ALTER TABLE "programme_session" ADD COLUMN     "location_details" TEXT,
ADD COLUMN     "location_type" TEXT NOT NULL DEFAULT 'physical';
