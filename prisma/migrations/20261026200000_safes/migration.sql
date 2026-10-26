-- Several safes (accountant, 26 Oct 2026). Additive: existing money stays exactly where it is,
-- every existing entry is put in the "Main safe", which holds IQD, USD and EUR.

-- New kind of movement: the same currency moved between two safes.
ALTER TYPE "CashKind" ADD VALUE IF NOT EXISTS 'TRANSFER';

CREATE TABLE "Safe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencies" "Currency"[],
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Safe_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Safe_name_key" ON "Safe"("name");

INSERT INTO "Safe" ("id", "name", "currencies", "isMain", "updatedAt")
VALUES ('safe_main', 'Main safe', ARRAY['IQD', 'USD', 'EUR']::"Currency"[], true, CURRENT_TIMESTAMP);

ALTER TABLE "CashEntry" ADD COLUMN "safeId" TEXT;
UPDATE "CashEntry" SET "safeId" = 'safe_main' WHERE "safeId" IS NULL;
ALTER TABLE "CashEntry" ALTER COLUMN "safeId" SET NOT NULL;
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_safeId_fkey" FOREIGN KEY ("safeId") REFERENCES "Safe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CashEntry_safeId_currency_idx" ON "CashEntry"("safeId", "currency");

-- Moving money between safes: given to the roles that may already exchange money.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT DISTINCT rp."roleId", 'cash:transfer' FROM "RolePermission" rp WHERE rp."permission" = 'cash:exchange'
ON CONFLICT DO NOTHING;
