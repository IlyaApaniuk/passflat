-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");
