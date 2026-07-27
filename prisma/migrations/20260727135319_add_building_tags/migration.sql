-- CreateTable
CREATE TABLE "building_tags" (
    "id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "tag_key" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'standalone',
    "voter_key" TEXT NOT NULL,
    "author_id" UUID,
    "cost_report_id" UUID,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "building_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "building_tags_building_id_is_visible_idx" ON "building_tags"("building_id", "is_visible");

-- CreateIndex
CREATE INDEX "building_tags_voter_key_idx" ON "building_tags"("voter_key");

-- CreateIndex
CREATE UNIQUE INDEX "building_tags_building_id_tag_key_voter_key_key" ON "building_tags"("building_id", "tag_key", "voter_key");

-- AddForeignKey
ALTER TABLE "building_tags" ADD CONSTRAINT "building_tags_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_tags" ADD CONSTRAINT "building_tags_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_tags" ADD CONSTRAINT "building_tags_cost_report_id_fkey" FOREIGN KEY ("cost_report_id") REFERENCES "cost_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
