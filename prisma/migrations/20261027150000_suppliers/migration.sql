-- Supplier accounts, purchase discounts, automatic purchase numbers and the day's rate (accountant, 27 Oct 2026).
-- Schema: only NEW tables / nullable columns. Data: existing purchases are LINKED to new supplier records
-- made from their typed supplier names; the typed supplier invoice number moves to "supplierRef".
-- No amount, quantity or stock row is changed.

ALTER TABLE "StockDoc" ADD COLUMN "supplierId" TEXT,
ADD COLUMN "supplierRef" TEXT,
ADD COLUMN "rate" DECIMAL(18,6);
ALTER TABLE "CashEntry" ADD COLUMN "supplierId" TEXT;

CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "note" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");
CREATE INDEX "StockDoc_supplierId_idx" ON "StockDoc"("supplierId");
CREATE INDEX "CashEntry_supplierId_idx" ON "CashEntry"("supplierId");
ALTER TABLE "StockDoc" ADD CONSTRAINT "StockDoc_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Data: one supplier per distinct typed supplier name on existing purchases (first purchase first → S-0001…)
INSERT INTO "Supplier" ("id", "code", "name", "phone", "createdAt", "updatedAt")
SELECT 'supp_' || md5(k.key), 'S-' || lpad(k.n::text, 4, '0'), k.name, k.phone, k.first, now()
FROM (
  SELECT lower(btrim(d."party")) AS key,
         (array_agg(btrim(d."party") ORDER BY d."createdAt"))[1] AS name,
         (array_agg(d."phone" ORDER BY d."createdAt" DESC) FILTER (WHERE d."phone" IS NOT NULL))[1] AS phone,
         min(d."createdAt") AS first,
         row_number() OVER (ORDER BY min(d."createdAt"), lower(btrim(d."party"))) AS n
  FROM "StockDoc" d
  WHERE d."type" = 'BUY' AND d."party" IS NOT NULL AND btrim(d."party") <> ''
  GROUP BY lower(btrim(d."party"))
) k;

UPDATE "StockDoc" d SET "supplierId" = 'supp_' || md5(lower(btrim(d."party")))
WHERE d."type" = 'BUY' AND d."party" IS NOT NULL AND btrim(d."party") <> '';
UPDATE "CashEntry" e SET "supplierId" = d."supplierId"
FROM "StockDoc" d WHERE e."stockDocId" = d."id" AND d."supplierId" IS NOT NULL;
-- The invoice number typed on old purchases was the supplier's own; purchases had no discounts.
UPDATE "StockDoc" SET "supplierRef" = "invoiceNo", "invoiceNo" = NULL WHERE "type" = 'BUY' AND "invoiceNo" IS NOT NULL;
UPDATE "StockDoc" SET "subtotal" = "total" WHERE "type" = 'BUY' AND "total" IS NOT NULL;

INSERT INTO "Counter" ("name", "value") SELECT 'supplier', count(*) FROM "Supplier"
ON CONFLICT ("name") DO UPDATE SET "value" = GREATEST("Counter"."value", EXCLUDED."value");

-- Who may see / keep supplier accounts: the roles that already buy or see the safe.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT DISTINCT rp."roleId", p.perm FROM "RolePermission" rp CROSS JOIN (VALUES ('suppliers:view'), ('suppliers:manage')) AS p(perm)
WHERE rp."permission" IN ('stock:buy', 'cash:view')
ON CONFLICT DO NOTHING;
