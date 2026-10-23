-- One mold → many products (each label is a product). Move the old link (Mold.productId) onto Product.moldId.
ALTER TABLE "Product" ADD COLUMN "moldId" TEXT;
UPDATE "Product" p SET "moldId" = m.id FROM "Mold" m WHERE m."productId" = p.id;
ALTER TABLE "Mold" DROP CONSTRAINT IF EXISTS "Mold_productId_fkey";
ALTER TABLE "Mold" DROP COLUMN "productId";
CREATE INDEX "Product_moldId_idx" ON "Product"("moldId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_moldId_fkey" FOREIGN KEY ("moldId") REFERENCES "Mold"("id") ON DELETE SET NULL ON UPDATE CASCADE;
