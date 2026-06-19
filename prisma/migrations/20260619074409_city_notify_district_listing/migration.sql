-- District-scoped listings waitlist: extend CityNotifySubscription with
-- district_slug + listing_type ("" = whole-city legacy path) and widen the
-- dedupe unique key. Empty-string defaults keep existing city-only rows valid.

-- AlterTable
ALTER TABLE "city_notify_subscriptions"
  ADD COLUMN "district_slug" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "listing_type" TEXT NOT NULL DEFAULT '';

-- DropIndex (old city-only unique + single-column index)
DROP INDEX "city_notify_subscriptions_email_city_normalized_key";
DROP INDEX "city_notify_subscriptions_city_normalized_idx";

-- CreateIndex (composite lookup index)
CREATE INDEX "city_notify_city_district_idx" ON "city_notify_subscriptions"("city_normalized", "district_slug");

-- CreateIndex (composite dedupe unique)
CREATE UNIQUE INDEX "city_notify_email_city_district_type_key" ON "city_notify_subscriptions"("email", "city_normalized", "district_slug", "listing_type");
