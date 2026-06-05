-- CreateTable
CREATE TABLE "listing_periodic_charges" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "frequency" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_periodic_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_periodic_charges_listing_id_idx" ON "listing_periodic_charges"("listing_id");

-- AddForeignKey
ALTER TABLE "listing_periodic_charges" ADD CONSTRAINT "listing_periodic_charges_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
