-- AlterTable
ALTER TABLE "data_subject_request" ADD COLUMN     "handled_by" TEXT;

-- CreateIndex
CREATE INDEX "data_subject_request_handled_by_idx" ON "data_subject_request"("handled_by");

-- AddForeignKey
ALTER TABLE "data_subject_request" ADD CONSTRAINT "data_subject_request_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
