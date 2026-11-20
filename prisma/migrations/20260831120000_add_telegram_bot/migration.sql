-- CreateTable
CREATE TABLE "telegram_chats" (
    "id" UUID NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "profile_id" UUID,
    "locale" TEXT NOT NULL DEFAULT 'ru',
    "start_payload" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_subscriptions" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "target_key" TEXT NOT NULL,
    "building_id" UUID,
    "district_slug" TEXT NOT NULL DEFAULT '',
    "city_slug" TEXT NOT NULL DEFAULT 'warsaw',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_notified_at" TIMESTAMP(3),

    CONSTRAINT "telegram_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_chats_chat_id_key" ON "telegram_chats"("chat_id");

-- CreateIndex
CREATE INDEX "telegram_chats_profile_id_idx" ON "telegram_chats"("profile_id");

-- CreateIndex
CREATE INDEX "telegram_subscriptions_building_id_idx" ON "telegram_subscriptions"("building_id");

-- CreateIndex
CREATE INDEX "telegram_subscriptions_city_slug_district_slug_idx" ON "telegram_subscriptions"("city_slug", "district_slug");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_sub_chat_target_key" ON "telegram_subscriptions"("chat_id", "target_key");

-- AddForeignKey
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_subscriptions" ADD CONSTRAINT "telegram_subscriptions_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "telegram_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_subscriptions" ADD CONSTRAINT "telegram_subscriptions_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

