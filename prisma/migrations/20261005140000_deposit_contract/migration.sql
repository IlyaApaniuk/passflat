-- AlterTable
ALTER TABLE "deposit_cases" ADD COLUMN     "cleaning_rule" TEXT,
ADD COLUMN     "contract_files" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "contract_quotes" JSONB,
ADD COLUMN     "contract_return_unit" TEXT,
ADD COLUMN     "contract_return_value" INTEGER,
ADD COLUMN     "contract_status" TEXT,
ADD COLUMN     "contract_type" TEXT,
ADD COLUMN     "landlord_kind" TEXT,
ADD COLUMN     "letter_parties" JSONB,
ADD COLUMN     "renovation_rule" TEXT;

