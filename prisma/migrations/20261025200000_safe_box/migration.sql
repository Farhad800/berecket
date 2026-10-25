-- CreateEnum
CREATE TYPE "CashKind" AS ENUM ('DEPOSIT', 'EXPENSE', 'SALE', 'PURCHASE', 'EXCHANGE');

-- AlterEnum
ALTER TYPE "Currency" ADD VALUE 'EUR';

-- AlterTable
ALTER TABLE "StockDoc" ADD COLUMN     "total" DECIMAL(16,2);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashEntry" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "CashKind" NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "rate" DECIMAL(18,6),
    "categoryId" TEXT,
    "stockDocId" TEXT,
    "party" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_key_key" ON "ExpenseCategory"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "CashEntry_currency_idx" ON "CashEntry"("currency");

-- CreateIndex
CREATE INDEX "CashEntry_number_idx" ON "CashEntry"("number");

-- CreateIndex
CREATE INDEX "CashEntry_stockDocId_idx" ON "CashEntry"("stockDocId");

-- CreateIndex
CREATE INDEX "CashEntry_createdAt_idx" ON "CashEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_stockDocId_fkey" FOREIGN KEY ("stockDocId") REFERENCES "StockDoc"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Buy / Sell totals, so what is paid and still owed can be shown quickly.
UPDATE "StockDoc" d SET "total" = x.t
FROM (SELECT "docId", ROUND(SUM(ABS(qty) * COALESCE("unitPrice", 0)), 2) AS t FROM "StockMovement" WHERE "docId" IS NOT NULL GROUP BY 1) x
WHERE d."id" = x."docId" AND d."type" IN ('BUY', 'SELL');

-- Built-in expense categories (names are translated in the app by key; the admin can add more).
INSERT INTO "ExpenseCategory" ("id", "key", "name") VALUES
  ('expcat_salaries', 'SALARIES', 'Salaries'),
  ('expcat_electricity', 'ELECTRICITY', 'Electricity'),
  ('expcat_fuel', 'FUEL', 'Fuel / generator'),
  ('expcat_rent', 'RENT', 'Rent'),
  ('expcat_maintenance', 'MAINTENANCE', 'Maintenance & spare parts'),
  ('expcat_transport', 'TRANSPORT', 'Transport'),
  ('expcat_food', 'FOOD', 'Food'),
  ('expcat_other', 'OTHER', 'Other')
ON CONFLICT DO NOTHING;
-- The safe is off for every role except Administrator (seed gives it all permissions); switch it on per role.
