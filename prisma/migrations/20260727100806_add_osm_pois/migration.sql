-- CreateTable
CREATE TABLE "pois" (
    "id" UUID NOT NULL,
    "city_slug" TEXT NOT NULL,
    "osm_type" TEXT NOT NULL,
    "osm_id" BIGINT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT,
    "lat" DECIMAL(65,30) NOT NULL,
    "lng" DECIMAL(65,30) NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pois_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pois_city_slug_lat_lng_idx" ON "pois"("city_slug", "lat", "lng");

-- CreateIndex
CREATE INDEX "pois_city_slug_category_idx" ON "pois"("city_slug", "category");

-- CreateIndex
CREATE UNIQUE INDEX "pois_osm_type_osm_id_category_key" ON "pois"("osm_type", "osm_id", "category");
