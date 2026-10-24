-- Stickers and materials kept in the warehouse; second item name; kg stock (decimal).
-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('PRODUCT', 'STICKER', 'MATERIAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMoveType" ADD VALUE 'RECEIVE';
ALTER TYPE "StockMoveType" ADD VALUE 'USE';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "kind" "ItemKind" NOT NULL DEFAULT 'PRODUCT',
ADD COLUMN     "name2" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ALTER COLUMN "qty" SET DATA TYPE DECIMAL(14,3);

-- CreateIndex
CREATE INDEX "Product_kind_idx" ON "Product"("kind");

