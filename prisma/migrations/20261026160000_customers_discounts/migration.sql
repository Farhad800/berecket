-- Customer accounts, sale discounts and delivery place (accountant, 26 Oct 2026).
-- Schema: only NEW tables/columns (all nullable). Data: existing sales are LINKED to new customer
-- records made from their typed customer names; no amount, quantity or stock row is changed.
-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('PERCENT', 'AMOUNT');

-- AlterTable
ALTER TABLE "CashEntry" ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "StockDoc" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "delivery" TEXT,
ADD COLUMN     "discount" DECIMAL(16,2),
ADD COLUMN     "discountKind" "DiscountKind",
ADD COLUMN     "discountValue" DECIMAL(16,4),
ADD COLUMN     "subtotal" DECIMAL(16,2);

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "discount" DECIMAL(16,2),
ADD COLUMN     "discountKind" "DiscountKind",
ADD COLUMN     "discountValue" DECIMAL(16,4);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "note" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "CashEntry_customerId_idx" ON "CashEntry"("customerId");

-- CreateIndex
CREATE INDEX "StockDoc_customerId_idx" ON "StockDoc"("customerId");

-- AddForeignKey
ALTER TABLE "StockDoc" ADD CONSTRAINT "StockDoc_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Data: one customer per distinct typed customer name on existing sales (first sale first → C-0001…)
INSERT INTO "Customer" ("id", "code", "name", "phone", "createdAt", "updatedAt")
SELECT 'cust_' || md5(k.key), 'C-' || lpad(k.n::text, 4, '0'), k.name, k.phone, k.first, now()
FROM (
  SELECT lower(btrim(d."party")) AS key,
         (array_agg(btrim(d."party") ORDER BY d."createdAt"))[1] AS name,
         (array_agg(d."phone" ORDER BY d."createdAt" DESC) FILTER (WHERE d."phone" IS NOT NULL))[1] AS phone,
         min(d."createdAt") AS first,
         row_number() OVER (ORDER BY min(d."createdAt"), lower(btrim(d."party"))) AS n
  FROM "StockDoc" d
  WHERE d."type" = 'SELL' AND d."party" IS NOT NULL AND btrim(d."party") <> ''
  GROUP BY lower(btrim(d."party"))
) k;

-- Book each existing sale, and the money already received for it, to its customer.
UPDATE "StockDoc" d SET "customerId" = 'cust_' || md5(lower(btrim(d."party")))
WHERE d."type" = 'SELL' AND d."party" IS NOT NULL AND btrim(d."party") <> '';
UPDATE "CashEntry" e SET "customerId" = d."customerId"
FROM "StockDoc" d WHERE e."stockDocId" = d."id" AND d."customerId" IS NOT NULL;
-- Existing sales had no discounts: the subtotal is the total.
UPDATE "StockDoc" SET "subtotal" = "total" WHERE "type" = 'SELL' AND "total" IS NOT NULL;

-- Customer codes continue after the ones made above.
INSERT INTO "Counter" ("name", "value") SELECT 'customer', count(*) FROM "Customer"
ON CONFLICT ("name") DO UPDATE SET "value" = GREATEST("Counter"."value", EXCLUDED."value");

-- Who may see / keep customer accounts: the roles that already deal with money (Sell or Safe).
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT DISTINCT rp."roleId", p.perm FROM "RolePermission" rp CROSS JOIN (VALUES ('customers:view'), ('customers:manage')) AS p(perm)
WHERE rp."permission" IN ('stock:sell', 'cash:view')
ON CONFLICT DO NOTHING;
