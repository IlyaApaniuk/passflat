-- CreateIndex
CREATE INDEX "buildings_district_id_idx" ON "buildings"("district_id");

-- CreateIndex
CREATE INDEX "cost_reports_building_id_idx" ON "cost_reports"("building_id");

-- CreateIndex
CREATE INDEX "cost_reports_author_id_idx" ON "cost_reports"("author_id");
