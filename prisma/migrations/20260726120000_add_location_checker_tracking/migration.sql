-- AlterTable
ALTER TABLE "buildings"
ADD COLUMN "checks_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_checked_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "buildings_place_id_idx" ON "buildings"("place_id");

-- CreateIndex
CREATE INDEX "buildings_created_at_idx" ON "buildings"("created_at");
