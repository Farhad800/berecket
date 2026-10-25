-- Buy/Sell unit prices: up to 6 decimals (e.g. 0.005 USD per label). Widening only:
-- 12 digits before the point both before and after, so every stored price keeps its exact value.
-- AlterTable
ALTER TABLE "StockMovement" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,6);
