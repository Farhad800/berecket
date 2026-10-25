-- Stock movements section: Input / Output / Buy / Sell documents (owner, 25 Oct 2026).

-- CreateEnum
CREATE TYPE "StockDocType" AS ENUM ('INPUT', 'OUTPUT', 'BUY', 'SELL');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('IQD', 'USD');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMoveType" ADD VALUE 'INPUT';
ALTER TYPE "StockMoveType" ADD VALUE 'OUTPUT';
ALTER TYPE "StockMoveType" ADD VALUE 'BUY';
ALTER TYPE "StockMoveType" ADD VALUE 'SELL';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "docId" TEXT,
ADD COLUMN     "unitPrice" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "StockDoc" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "StockDocType" NOT NULL,
    "reason" TEXT,
    "party" TEXT,
    "invoiceNo" TEXT,
    "currency" "Currency",
    "orderId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockDoc_number_key" ON "StockDoc"("number");

-- CreateIndex
CREATE INDEX "StockDoc_type_createdAt_idx" ON "StockDoc"("type", "createdAt");

-- CreateIndex
CREATE INDEX "StockDoc_orderId_idx" ON "StockDoc"("orderId");

-- CreateIndex
CREATE INDEX "StockMovement_docId_idx" ON "StockMovement"("docId");

-- AddForeignKey
ALTER TABLE "StockDoc" ADD CONSTRAINT "StockDoc_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_docId_fkey" FOREIGN KEY ("docId") REFERENCES "StockDoc"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Everyone can see stock documents; the Warehouse Team may record Input and Output.
-- Buy and Sell are switched on per role by the administrator (Administration → Roles).
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'stock:view' FROM "Role" r
ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", p.perm FROM "Role" r CROSS JOIN (VALUES ('stock:input'), ('stock:output')) AS p(perm)
WHERE r."name" = 'Warehouse Team'
ON CONFLICT DO NOTHING;
