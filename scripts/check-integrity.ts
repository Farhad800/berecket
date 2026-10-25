/**
 * READ-ONLY integrity check for production and QC records (code review M2, 26 Oct 2026).
 * Lists records that simultaneous saves before the fix may have left inconsistent. It changes NOTHING:
 * everything runs inside a READ ONLY transaction, so even a mistake here cannot write.
 *
 *   DATABASE_URL=... npx tsx scripts/check-integrity.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const report = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    // 1. Stock from production must equal what the production entries say (per product).
    const production = await tx.$queryRaw<{ code: string; entries: number; movements: number }[]>`
      SELECT p.code, COALESCE(e.q, 0)::float AS entries, COALESCE(m.q, 0)::float AS movements
      FROM "Product" p
      LEFT JOIN (SELECT "productId", SUM(quantity) q FROM "ProductionEntry" GROUP BY 1) e ON e."productId" = p.id
      LEFT JOIN (SELECT "productId", SUM(qty) q FROM "StockMovement" WHERE type = 'PRODUCTION' GROUP BY 1) m ON m."productId" = p.id
      WHERE COALESCE(e.q, 0) <> COALESCE(m.q, 0)
      ORDER BY p.code`;
    // 2. QC never rejects more than was produced, and rejected pieces left stock exactly once.
    const qc = await tx.$queryRaw<{ code: string; day: string; shift: string; produced: number; rejected: number; leftStock: number }[]>`
      SELECT p.code, e.day::text AS day, e.shift::text AS shift, e.quantity::float AS produced,
             COALESCE(i.r, 0)::float AS rejected, COALESCE(-m.q, 0)::float AS "leftStock"
      FROM "ProductionEntry" e JOIN "Product" p ON p.id = e."productId"
      LEFT JOIN (SELECT "entryId", SUM("qtyRejected") r FROM "QcInspection" GROUP BY 1) i ON i."entryId" = e.id
      LEFT JOIN (SELECT "entryId", SUM(qty) q FROM "StockMovement" WHERE type = 'QC_REJECT' GROUP BY 1) m ON m."entryId" = e.id
      WHERE COALESCE(i.r, 0) > e.quantity OR COALESCE(i.r, 0) <> COALESCE(-m.q, 0)
      ORDER BY e.day, p.code`;
    // 3. Two uninspected entries for the same product, day and shift (should have been one).
    const duplicates = await tx.$queryRaw<{ code: string; day: string; shift: string; entries: number; pieces: number }[]>`
      SELECT p.code, e.day::text AS day, e.shift::text AS shift, COUNT(*)::int AS entries, SUM(e.quantity)::float AS pieces
      FROM "ProductionEntry" e JOIN "Product" p ON p.id = e."productId"
      WHERE e."qcStatus" = 'NOT_INSPECTED'
      GROUP BY p.code, e.day, e.shift HAVING COUNT(*) > 1
      ORDER BY e.day, p.code`;
    return { production, qc, duplicates };
  });

  const line = (s: string) => console.log(s);
  line("Bereket FMS — read-only integrity check");
  line(`1. Production stock ≠ production entries: ${report.production.length}`);
  for (const r of report.production) line(`   ${r.code}: entries ${r.entries}, stock movements ${r.movements} (difference ${r.movements - r.entries})`);
  line(`2. QC totals wrong (more rejected than produced, or stock not matching): ${report.qc.length}`);
  for (const r of report.qc) line(`   ${r.code} ${r.day} shift ${r.shift}: produced ${r.produced}, rejected ${r.rejected}, left stock ${r.leftStock}`);
  line(`3. Same product/day/shift split into several uninspected entries: ${report.duplicates.length}`);
  for (const r of report.duplicates) line(`   ${r.code} ${r.day} shift ${r.shift}: ${r.entries} entries, ${r.pieces} pcs together (totals are still right; only split)`);
  const problems = report.production.length + report.qc.length;
  line(problems === 0 ? "Result: no stock or QC inconsistencies found." : `Result: ${problems} record(s) need a look. Nothing was changed.`);
}

main().catch((e) => { console.error("Check failed:", e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
