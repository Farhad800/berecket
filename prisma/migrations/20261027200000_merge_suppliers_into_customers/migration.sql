-- One account list (owner, 27 Oct 2026): suppliers become customers. A customer can be bought from and sold to;
-- one balance per currency (− = they owe the factory): sales and payments to them lower it, purchases and money received raise it.
-- Every supplier is copied to a customer (same id, next C-#### code); its purchases and payments are moved to it.
-- No amount, quantity or stock row is changed.

-- next free C- number: after the customer counter and any C-#### code already used
WITH base AS (
  SELECT GREATEST(
    COALESCE((SELECT "value" FROM "Counter" WHERE "name" = 'customer'), 0),
    COALESCE((SELECT max(substring("code" FROM '^C-(\d+)$')::int) FROM "Customer"), 0)
  ) AS n
)
INSERT INTO "Customer" ("id", "code", "name", "phone", "address", "note", "archivedAt", "createdAt", "updatedAt")
SELECT s."id", 'C-' || lpad((base.n + row_number() OVER (ORDER BY s."createdAt", s."id"))::text, 4, '0'),
       s."name", s."phone", s."address", s."note", s."archivedAt", s."createdAt", now()
FROM "Supplier" s CROSS JOIN base;

INSERT INTO "Counter" ("name", "value")
SELECT 'customer', COALESCE(max(substring("code" FROM '^C-(\d+)$')::int), 0) FROM "Customer"
ON CONFLICT ("name") DO UPDATE SET "value" = GREATEST("Counter"."value", EXCLUDED."value");

UPDATE "StockDoc" SET "customerId" = "supplierId" WHERE "supplierId" IS NOT NULL;
UPDATE "CashEntry" SET "customerId" = "supplierId" WHERE "supplierId" IS NOT NULL;

-- Whoever could see / keep supplier accounts can now see / keep customer accounts.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT DISTINCT rp."roleId", replace(rp."permission", 'suppliers:', 'customers:') FROM "RolePermission" rp
WHERE rp."permission" IN ('suppliers:view', 'suppliers:manage')
ON CONFLICT DO NOTHING;
DELETE FROM "RolePermission" WHERE "permission" LIKE 'suppliers:%';
DELETE FROM "Counter" WHERE "name" = 'supplier';

ALTER TABLE "StockDoc" DROP CONSTRAINT "StockDoc_supplierId_fkey";
ALTER TABLE "CashEntry" DROP CONSTRAINT "CashEntry_supplierId_fkey";
DROP INDEX "StockDoc_supplierId_idx";
DROP INDEX "CashEntry_supplierId_idx";
ALTER TABLE "StockDoc" DROP COLUMN "supplierId";
ALTER TABLE "CashEntry" DROP COLUMN "supplierId";
DROP TABLE "Supplier";
