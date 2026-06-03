-- AlterTable
ALTER TABLE "cost_reports" ADD COLUMN     "claimed_at" TIMESTAMP(3),
ADD COLUMN     "imported_email" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "cost_report_periodic_charges" (
    "id" UUID NOT NULL,
    "cost_report_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "frequency" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_report_periodic_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_report_periodic_charges_cost_report_id_idx" ON "cost_report_periodic_charges"("cost_report_id");

-- CreateIndex
CREATE INDEX "cost_reports_imported_email_idx" ON "cost_reports"("imported_email");

-- AddForeignKey
ALTER TABLE "cost_report_periodic_charges" ADD CONSTRAINT "cost_report_periodic_charges_cost_report_id_fkey" FOREIGN KEY ("cost_report_id") REFERENCES "cost_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
