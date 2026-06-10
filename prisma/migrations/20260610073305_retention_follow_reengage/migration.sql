-- AlterTable
ALTER TABLE "cost_reports" ADD COLUMN     "confirmed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "last_reengagement_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "building_follows" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_notified_at" TIMESTAMP(3),

    CONSTRAINT "building_follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "building_follows_building_id_idx" ON "building_follows"("building_id");

-- CreateIndex
CREATE UNIQUE INDEX "building_follows_user_id_building_id_key" ON "building_follows"("user_id", "building_id");

-- AddForeignKey
ALTER TABLE "building_follows" ADD CONSTRAINT "building_follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_follows" ADD CONSTRAINT "building_follows_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
