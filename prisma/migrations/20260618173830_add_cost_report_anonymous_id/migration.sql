-- AlterTable
ALTER TABLE "cost_reports" ADD COLUMN     "anonymous_id" TEXT;

-- CreateIndex
CREATE INDEX "cost_reports_anonymous_id_idx" ON "cost_reports"("anonymous_id");
