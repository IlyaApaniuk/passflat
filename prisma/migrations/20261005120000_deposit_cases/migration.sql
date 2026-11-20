-- CreateTable
CREATE TABLE "deposit_cases" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'intake',
    "step" TEXT,
    "moved_out_at" DATE,
    "deposit_amount" INTEGER,
    "returned_amount" INTEGER,
    "reason" TEXT,
    "protocol" TEXT,
    "letter_at" TIMESTAMP(3),
    "follow_up_at" TIMESTAMP(3),
    "follow_up_kind" TEXT,
    "outcome" TEXT,
    "outcome_at" TIMESTAMP(3),
    "wants_lawyer" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deposit_cases_chat_id_status_idx" ON "deposit_cases"("chat_id", "status");

-- CreateIndex
CREATE INDEX "deposit_cases_follow_up_at_idx" ON "deposit_cases"("follow_up_at");

-- AddForeignKey
ALTER TABLE "deposit_cases" ADD CONSTRAINT "deposit_cases_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "telegram_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

