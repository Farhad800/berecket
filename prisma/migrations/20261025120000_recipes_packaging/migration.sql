-- Product recipes (made of) and packaging; label per product; Packaging as its own kind of stock item.

-- CreateEnum
CREATE TYPE "ComponentBasis" AS ENUM ('PIECE', 'CARTON');

-- AlterEnum
ALTER TYPE "ItemKind" ADD VALUE 'PACKAGING';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "labelId" TEXT,
ADD COLUMN     "piecesPerCarton" INTEGER,
ADD COLUMN     "unitWeightKg" DECIMAL(12,6);

-- CreateTable
CREATE TABLE "ProductComponent" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "qty" DECIMAL(14,4) NOT NULL,
    "per" "ComponentBasis" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductComponent_componentId_idx" ON "ProductComponent"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductComponent_productId_componentId_per_key" ON "ProductComponent"("productId", "componentId", "per");

-- CreateIndex
CREATE INDEX "Product_labelId_idx" ON "Product"("labelId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

