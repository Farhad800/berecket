-- Redesign (owner's decision, 23 Oct 2026): no customers, no production schedule, no shipments.
-- Orders become a sheet of products and amounts; production becomes daily entries (day, shift,
-- product, quantity) that add to stock automatically; QC inspects daily entries.
-- The old operational records were test data and are removed. Employees, roles, products,
-- machines, molds, maintenance requests, service reports and the audit log are kept.

DELETE FROM "Notification";
DELETE FROM "Comment" WHERE "entityType" IN ('Order', 'QualityIssue', 'Shipment');
DELETE FROM "Attachment" WHERE "entityType" IN ('QcInspection', 'QualityIssue', 'Shipment');
DELETE FROM "CorrectiveAction";
DELETE FROM "QualityIssue";
DELETE FROM "QcInspection";
DELETE FROM "ShipmentLine";
DELETE FROM "Shipment";
DELETE FROM "StockMovement";
DELETE FROM "WarehouseReceipt";
DELETE FROM "Downtime";
DELETE FROM "ProductionEntry";
DELETE FROM "Batch";
UPDATE "MaintenanceRequest" SET "jobId" = NULL;
UPDATE "ServiceReport" SET "orderId" = NULL;
DELETE FROM "ProductionJob";
DELETE FROM "OrderLine";
DELETE FROM "Order";
DELETE FROM "Customer";
DELETE FROM "Counter" WHERE "name" ~ '^(order|job|batch|inspection|issue|receipt|shipment)-' OR "name" = 'customer';
DELETE FROM "RolePermission" WHERE "permission" ~ '^(schedule|shipments|customers):';
UPDATE "Machine" SET "status" = 'AVAILABLE' WHERE "status" = 'RUNNING';

-- CreateEnum
CREATE TYPE "EntryQcStatus" AS ENUM ('NOT_INSPECTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StockMoveType" AS ENUM ('PRODUCTION', 'QC_REJECT', 'OUT', 'ADJUST');

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'OPEN';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "QcDecision_new" AS ENUM ('APPROVE', 'REJECT');
ALTER TABLE "QcInspection" ALTER COLUMN "decision" TYPE "QcDecision_new" USING ("decision"::text::"QcDecision_new");
ALTER TYPE "QcDecision" RENAME TO "QcDecision_old";
ALTER TYPE "QcDecision_new" RENAME TO "QcDecision";
DROP TYPE "public"."QcDecision_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Batch" DROP CONSTRAINT "Batch_jobId_fkey";

-- DropForeignKey
ALTER TABLE "Batch" DROP CONSTRAINT "Batch_orderLineId_fkey";

-- DropForeignKey
ALTER TABLE "Batch" DROP CONSTRAINT "Batch_productId_fkey";

-- DropForeignKey
ALTER TABLE "Downtime" DROP CONSTRAINT "Downtime_jobId_fkey";

-- DropForeignKey
ALTER TABLE "Downtime" DROP CONSTRAINT "Downtime_machineId_fkey";

-- DropForeignKey
ALTER TABLE "Downtime" DROP CONSTRAINT "Downtime_maintenanceRequestId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceRequest" DROP CONSTRAINT "MaintenanceRequest_jobId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionEntry" DROP CONSTRAINT "ProductionEntry_batchId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionEntry" DROP CONSTRAINT "ProductionEntry_jobId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionJob" DROP CONSTRAINT "ProductionJob_machineId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionJob" DROP CONSTRAINT "ProductionJob_moldId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionJob" DROP CONSTRAINT "ProductionJob_orderLineId_fkey";

-- DropForeignKey
ALTER TABLE "QcInspection" DROP CONSTRAINT "QcInspection_batchId_fkey";

-- DropForeignKey
ALTER TABLE "QualityIssue" DROP CONSTRAINT "QualityIssue_batchId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceReport" DROP CONSTRAINT "ServiceReport_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_orderId_fkey";

-- DropForeignKey
ALTER TABLE "ShipmentLine" DROP CONSTRAINT "ShipmentLine_batchId_fkey";

-- DropForeignKey
ALTER TABLE "ShipmentLine" DROP CONSTRAINT "ShipmentLine_orderLineId_fkey";

-- DropForeignKey
ALTER TABLE "ShipmentLine" DROP CONSTRAINT "ShipmentLine_shipmentId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_batchId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_locationId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_orderLineId_fkey";

-- DropForeignKey
ALTER TABLE "WarehouseReceipt" DROP CONSTRAINT "WarehouseReceipt_batchId_fkey";

-- DropForeignKey
ALTER TABLE "WarehouseReceipt" DROP CONSTRAINT "WarehouseReceipt_locationId_fkey";

-- DropForeignKey
ALTER TABLE "WarehouseReceipt" DROP CONSTRAINT "WarehouseReceipt_orderLineId_fkey";

-- DropIndex
DROP INDEX "Order_customerId_idx";

-- DropIndex
DROP INDEX "Order_requestedDeliveryDate_idx";

-- DropIndex
DROP INDEX "ProductionEntry_batchId_idx";

-- DropIndex
DROP INDEX "ProductionEntry_jobId_idx";

-- DropIndex
DROP INDEX "ProductionEntry_reportedAt_idx";

-- DropIndex
DROP INDEX "QcInspection_batchId_idx";

-- DropIndex
DROP INDEX "StockMovement_batchId_state_idx";

-- DropIndex
DROP INDEX "StockMovement_productId_state_idx";

-- DropIndex
DROP INDEX "StockMovement_transactionId_idx";

-- AlterTable
ALTER TABLE "MaintenanceRequest" DROP COLUMN "jobId";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "confirmedAt",
DROP COLUMN "customerId",
DROP COLUMN "customerReference",
DROP COLUMN "deliveredAt",
DROP COLUMN "deliveryException",
DROP COLUMN "instructions",
DROP COLUMN "notes",
DROP COLUMN "packaging",
DROP COLUMN "plannedEnd",
DROP COLUMN "plannedStart",
DROP COLUMN "priority",
DROP COLUMN "requestedDeliveryDate",
ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "OrderLine" DROP COLUMN "createdAt",
DROP COLUMN "specifications",
DROP COLUMN "unit",
DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "ProductionEntry" DROP COLUMN "batchId",
DROP COLUMN "isCorrection",
DROP COLUMN "jobId",
DROP COLUMN "qtyDefective",
DROP COLUMN "qtyGood",
DROP COLUMN "reportedAt",
DROP COLUMN "reportedById",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "day" DATE NOT NULL,
ADD COLUMN     "productId" TEXT NOT NULL,
ADD COLUMN     "qcStatus" "EntryQcStatus" NOT NULL DEFAULT 'NOT_INSPECTED',
ADD COLUMN     "quantity" INTEGER NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "QcInspection" DROP COLUMN "batchId",
DROP COLUMN "qtyAccepted",
DROP COLUMN "qtyHold",
ADD COLUMN     "entryId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "QualityIssue" DROP COLUMN "batchId",
ADD COLUMN     "entryId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ServiceReport" DROP COLUMN "orderId";

-- AlterTable
ALTER TABLE "StockMovement" DROP COLUMN "batchId",
DROP COLUMN "locationId",
DROP COLUMN "orderLineId",
DROP COLUMN "referenceId",
DROP COLUMN "referenceType",
DROP COLUMN "state",
DROP COLUMN "transactionId",
ADD COLUMN     "entryId" TEXT,
ADD COLUMN     "reference" TEXT,
DROP COLUMN "type",
ADD COLUMN     "type" "StockMoveType" NOT NULL;

-- DropTable
DROP TABLE "Batch";

-- DropTable
DROP TABLE "Customer";

-- DropTable
DROP TABLE "Downtime";

-- DropTable
DROP TABLE "ProductionJob";

-- DropTable
DROP TABLE "Shipment";

-- DropTable
DROP TABLE "ShipmentLine";

-- DropTable
DROP TABLE "StorageLocation";

-- DropTable
DROP TABLE "WarehouseReceipt";

-- DropEnum
DROP TYPE "BatchQcStatus";

-- DropEnum
DROP TYPE "JobStatus";

-- DropEnum
DROP TYPE "ShipmentStatus";

-- DropEnum
DROP TYPE "StockState";

-- CreateIndex
CREATE INDEX "OrderLine_productId_idx" ON "OrderLine"("productId");

-- CreateIndex
CREATE INDEX "ProductionEntry_day_idx" ON "ProductionEntry"("day");

-- CreateIndex
CREATE INDEX "ProductionEntry_productId_day_idx" ON "ProductionEntry"("productId", "day");

-- CreateIndex
CREATE INDEX "ProductionEntry_qcStatus_idx" ON "ProductionEntry"("qcStatus");

-- CreateIndex
CREATE INDEX "QcInspection_entryId_idx" ON "QcInspection"("entryId");

-- CreateIndex
CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcInspection" ADD CONSTRAINT "QcInspection_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ProductionEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityIssue" ADD CONSTRAINT "QualityIssue_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ProductionEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ProductionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

