-- AlterTable
ALTER TABLE "telegram_chats" ADD COLUMN     "roommate_banned_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "roommate_profiles" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "step" TEXT,
    "entry_source" TEXT,
    "district_slugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "any_district" BOOLEAN NOT NULL DEFAULT false,
    "budget_band" TEXT,
    "move_in_month" DATE,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gender" TEXT,
    "prefers" TEXT NOT NULL DEFAULT 'anyone',
    "about" VARCHAR(280),
    "smoking" TEXT,
    "pets" TEXT,
    "adult_confirmed_at" TIMESTAMPTZ(3),
    "tg_username" TEXT,
    "activated_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "renewal_reminded_at" TIMESTAMPTZ(3),
    "expired_at" TIMESTAMPTZ(3),
    "renewed_at" TIMESTAMPTZ(3),
    "notify_on_open_at" TIMESTAMPTZ(3),
    "notified_open_at" TIMESTAMPTZ(3),
    "push_off" BOOLEAN NOT NULL DEFAULT false,
    "last_push_at" TIMESTAMPTZ(3),
    "hidden_at" TIMESTAMPTZ(3),
    "hidden_reason" TEXT,
    "statement_sent_at" TIMESTAMPTZ(3),
    "appealed_at" TIMESTAMPTZ(3),
    "outcome_asked_at" TIMESTAMPTZ(3),
    "outcome" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roommate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roommate_reactions" (
    "id" UUID NOT NULL,
    "from_profile_id" UUID NOT NULL,
    "to_profile_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matched_at" TIMESTAMPTZ(3),
    "revealed_at" TIMESTAMPTZ(3),

    CONSTRAINT "roommate_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roommate_reports" (
    "id" UUID NOT NULL,
    "reporter_profile_id" UUID,
    "target_profile_id" UUID,
    "reason" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'none',
    "automated" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),
    "reporter_notified_at" TIMESTAMPTZ(3),

    CONSTRAINT "roommate_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roommate_profiles_chat_id_key" ON "roommate_profiles"("chat_id");

-- CreateIndex
CREATE INDEX "roommate_profiles_status_expires_at_idx" ON "roommate_profiles"("status", "expires_at");

-- CreateIndex
CREATE INDEX "roommate_reactions_to_profile_id_idx" ON "roommate_reactions"("to_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "roommate_reactions_from_profile_id_to_profile_id_key" ON "roommate_reactions"("from_profile_id", "to_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "roommate_reports_reporter_profile_id_target_profile_id_key" ON "roommate_reports"("reporter_profile_id", "target_profile_id");

-- AddForeignKey
ALTER TABLE "roommate_profiles" ADD CONSTRAINT "roommate_profiles_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "telegram_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roommate_reactions" ADD CONSTRAINT "roommate_reactions_from_profile_id_fkey" FOREIGN KEY ("from_profile_id") REFERENCES "roommate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roommate_reactions" ADD CONSTRAINT "roommate_reactions_to_profile_id_fkey" FOREIGN KEY ("to_profile_id") REFERENCES "roommate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roommate_reports" ADD CONSTRAINT "roommate_reports_reporter_profile_id_fkey" FOREIGN KEY ("reporter_profile_id") REFERENCES "roommate_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roommate_reports" ADD CONSTRAINT "roommate_reports_target_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "roommate_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
