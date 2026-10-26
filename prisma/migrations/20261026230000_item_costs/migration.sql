-- Cost of labels, raw materials and packaging (accountant, 26 Oct 2026). Additive: new empty columns only.
ALTER TABLE "Product" ADD COLUMN "costPrice" DECIMAL(18,6),
ADD COLUMN "costCurrency" "Currency",
ADD COLUMN "costRate" DECIMAL(18,6),
ADD COLUMN "costIqd" DECIMAL(18,6),
ADD COLUMN "costUpdatedAt" TIMESTAMP(3);
