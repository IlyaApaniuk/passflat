-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "default_locale" TEXT NOT NULL,
    "supported_locales" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "launched_at" TIMESTAMP(3),

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "country_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "lat" DECIMAL(65,30),
    "lng" DECIMAL(65,30),
    "bounds" JSONB,
    "timezone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL,
    "city_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "bounds" JSONB,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "city_id" UUID NOT NULL,
    "district_id" UUID,
    "street" TEXT NOT NULL,
    "building_number" TEXT NOT NULL,
    "address_full" TEXT NOT NULL,
    "address_normalized" TEXT NOT NULL,
    "lat" DECIMAL(65,30),
    "lng" DECIMAL(65,30),
    "place_id" TEXT,
    "postal_code" TEXT,
    "total_apartments_approx" INTEGER,
    "building_type" TEXT,
    "year_built" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'replacement',
    "apartment_number" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "locale" TEXT,
    "currency" TEXT NOT NULL,
    "rent" DECIMAL(65,30),
    "admin_fee" DECIMAL(65,30),
    "utilities_avg" DECIMAL(65,30),
    "total_monthly" DECIMAL(65,30),
    "lease_type" TEXT,
    "lease_end_date" DATE,
    "available_from" DATE,
    "deposit_amount" DECIMAL(65,30),
    "price_per_person" DECIMAL(65,30),
    "total_apartment_rent" DECIMAL(65,30),
    "current_roommates" INTEGER,
    "total_rooms" INTEGER,
    "room_type" TEXT,
    "preferred_gender" TEXT,
    "preferred_age_min" INTEGER,
    "preferred_age_max" INTEGER,
    "roommate_description" TEXT,
    "available_to" DATE,
    "price_total" DECIMAL(65,30),
    "utilities_included" BOOLEAN,
    "internet_included" BOOLEAN,
    "sublet_rules" TEXT,
    "rooms" INTEGER,
    "area_m2" DECIMAL(65,30),
    "floor" INTEGER,
    "amenities" TEXT[],
    "things_to_know" TEXT[],
    "registration_possible" BOOLEAN,
    "photos" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "is_promoted" BOOLEAN NOT NULL DEFAULT false,
    "promoted_until" TIMESTAMP(3),
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "responses_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "expiring_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_translations" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "roommate_description" TEXT,
    "sublet_rules" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_responses" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "responder_id" UUID NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_listings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_views" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "viewer_hash" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_reports" (
    "id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "rent" DECIMAL(65,30),
    "admin_fee" DECIMAL(65,30),
    "electricity_avg" DECIMAL(65,30),
    "electricity_winter" DECIMAL(65,30),
    "electricity_summer" DECIMAL(65,30),
    "electricity_included" BOOLEAN,
    "gas" DECIMAL(65,30),
    "heating" DECIMAL(65,30),
    "heating_winter" DECIMAL(65,30),
    "heating_summer" DECIMAL(65,30),
    "heating_included" BOOLEAN,
    "water" DECIMAL(65,30),
    "water_included" BOOLEAN,
    "internet" DECIMAL(65,30),
    "internet_provider" TEXT,
    "other_costs" DECIMAL(65,30),
    "other_costs_note" TEXT,
    "total_monthly_avg" DECIMAL(65,30),
    "rooms" INTEGER,
    "area_m2" DECIMAL(65,30),
    "floor" INTEGER,
    "rental_type" TEXT,
    "lease_type" TEXT,
    "deposit_months" DECIMAL(65,30),
    "deposit_amount" DECIMAL(65,30),
    "deposit_returned" BOOLEAN,
    "deposit_return_days" INTEGER,
    "lived_from" DATE,
    "lived_until" DATE,
    "is_current_tenant" BOOLEAN,
    "verification_status" TEXT NOT NULL DEFAULT 'unverified',
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_term_labels" (
    "id" UUID NOT NULL,
    "country_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "label_key" TEXT NOT NULL,
    "tooltip_key" TEXT,

    CONSTRAINT "cost_term_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "display_name" TEXT,
    "locale" TEXT,
    "city_id" UUID,
    "contact_method" TEXT,
    "contact_value" TEXT,
    "has_contributed_cost" BOOLEAN NOT NULL DEFAULT false,
    "cost_access_until" TIMESTAMP(3),
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "stripe_checkout_session_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "product_type" TEXT NOT NULL,
    "reference_id" UUID,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "consent_accepted" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMP(3),
    "consent_text" TEXT,
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "stripe_subscription_id" TEXT,
    "plan_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "moderator_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city_notify_subscriptions" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "city_normalized" TEXT NOT NULL,
    "locale" TEXT,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "city_notify_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cities_slug_key" ON "cities"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "districts_city_id_slug_key" ON "districts"("city_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_city_id_slug_key" ON "buildings"("city_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_city_id_address_normalized_key" ON "buildings"("city_id", "address_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "listing_translations_listing_id_locale_key" ON "listing_translations"("listing_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "saved_listings_user_id_listing_id_key" ON "saved_listings"("user_id", "listing_id");

-- CreateIndex
CREATE INDEX "listing_views_listing_id_viewed_at_idx" ON "listing_views"("listing_id", "viewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "listing_views_listing_id_viewer_hash_key" ON "listing_views"("listing_id", "viewer_hash");

-- CreateIndex
CREATE UNIQUE INDEX "cost_term_labels_country_id_field_name_key" ON "cost_term_labels"("country_id", "field_name");

-- CreateIndex
CREATE INDEX "conversation_participants_user_id_idx" ON "conversation_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_user_id_key" ON "conversation_participants"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "city_notify_subscriptions_city_normalized_idx" ON "city_notify_subscriptions"("city_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "city_notify_subscriptions_email_city_normalized_key" ON "city_notify_subscriptions"("email", "city_normalized");

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_translations" ADD CONSTRAINT "listing_translations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_responses" ADD CONSTRAINT "listing_responses_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_responses" ADD CONSTRAINT "listing_responses_responder_id_fkey" FOREIGN KEY ("responder_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_reports" ADD CONSTRAINT "cost_reports_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_reports" ADD CONSTRAINT "cost_reports_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_term_labels" ADD CONSTRAINT "cost_term_labels_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

