-- CreateEnum
CREATE TYPE "ReceiptFor" AS ENUM ('SELL', 'BUY', 'PAYMENT');

-- AlterTable
ALTER TABLE "StockDoc" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "ReceiptLayout" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "docType" "ReceiptFor" NOT NULL,
    "language" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "banner" TEXT,
    "settings" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReceiptLayout_docType_idx" ON "ReceiptLayout"("docType");

