-- CreateTable
CREATE TABLE "building_location_scores" (
    "building_id" UUID NOT NULL,
    "overall" INTEGER NOT NULL,
    "categories" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "building_location_scores_pkey" PRIMARY KEY ("building_id")
);

-- AddForeignKey
ALTER TABLE "building_location_scores" ADD CONSTRAINT "building_location_scores_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
