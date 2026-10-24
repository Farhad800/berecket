"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { run, formObject, UserError } from "@/lib/action";
import { dayValue, todayYmd } from "@/lib/production";
import { getStock, lockProduct } from "@/lib/stock";

/**
 * Daily production: what was made, per day, shift and product (owner's decision, 23 Oct 2026).
 * Every entry adds its pieces to warehouse stock automatically.
 */

const shiftEnum = z.enum(["A", "B", "C"]);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

function refresh() {
  for (const p of ["/production", "/production/daily", "/inventory", "/qc", "/dashboard"]) revalidatePath(p);
}

export type SheetResult = { products: number; pieces: number };

/** Saves the quantities typed on the daily sheet — any number of products in one save. */
export async function saveDailyEntriesAction(_: unknown, fd: FormData) {
  return run(async (): Promise<SheetResult> => {
    const me = await requirePermission("production:create");
    const day = ymd.parse(fd.get("day"));
    if (day > todayYmd()) throw new UserError("You can't enter production for a future date.");
    const shift = shiftEnum.parse(fd.get("shift"));
    const rows: { productId: string; qty: number }[] = [];
    for (const [key, raw] of fd.entries()) {
      const m = /^qty_([a-z0-9]{10,40})$/i.exec(key);
      if (!m || typeof raw !== "string" || raw.trim() === "") continue;
      const qty = Number(raw);
      if (!Number.isInteger(qty) || qty < 0 || qty > 5_000_000) throw new UserError("Quantities must be whole numbers between 0 and 5,000,000.");
      if (qty > 0) rows.push({ productId: m[1], qty });
    }
    if (rows.length === 0) throw new UserError("Type the quantity for at least one product.");
    if (rows.length > 1000) throw new UserError("Save at most 1,000 products at a time.");
    const products = await db.product.findMany({ where: { id: { in: rows.map((r) => r.productId) }, archivedAt: null, kind: "PRODUCT" }, select: { id: true, code: true } });
    if (products.length !== new Set(rows.map((r) => r.productId)).size) throw new UserError("One of the products is archived or doesn't exist. Reload the page.");
    const code = new Map(products.map((p) => [p.id, p.code]));

    await db.$transaction(
      async (tx) => {
        for (const r of rows) {
          // Same product, day and shift again (and QC hasn't looked at it yet): add to that entry.
          const existing = await tx.productionEntry.findFirst({ where: { day: dayValue(day), shift, productId: r.productId, qcStatus: "NOT_INSPECTED" } });
          const entry = existing
            ? await tx.productionEntry.update({ where: { id: existing.id }, data: { quantity: { increment: r.qty } } })
            : await tx.productionEntry.create({ data: { day: dayValue(day), shift, productId: r.productId, quantity: r.qty, createdById: me.id } });
          await tx.stockMovement.create({ data: { productId: r.productId, type: "PRODUCTION", qty: r.qty, entryId: entry.id, createdById: me.id } });
          await audit({ userId: me.id, action: "production.report", entityType: "ProductionEntry", entityId: entry.id, after: { day, shift, product: code.get(r.productId), qty: r.qty, total: entry.quantity } }, tx);
        }
        await notify({
          type: "production.saved", data: { pcs: rows.reduce((s, r) => s + r.qty, 0), products: rows.length, day, shift, by: me.fullName },
          link: `/production?day=${day}`, toPermission: "production:view", exceptUserId: me.id,
        }, tx);
      },
      { timeout: 60_000 },
    );
    refresh();
    return { products: rows.length, pieces: rows.reduce((s, r) => s + r.qty, 0) };
  });
}

const correctSchema = z.object({
  entryId: z.string().min(1),
  quantity: z.coerce.number().int("Whole pieces only").min(0).max(5_000_000),
  reason: z.string().trim().min(3, "Please give a reason").max(500),
});

/** Fixes a typing mistake. 0 removes the entry. Stock is corrected with a balancing movement. */
export async function correctEntryAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("production:edit");
    const v = correctSchema.parse(formObject(fd));
    await db.$transaction(async (tx) => {
      const e = await tx.productionEntry.findUnique({ where: { id: v.entryId }, include: { product: { select: { code: true } }, _count: { select: { inspections: true } } } });
      if (!e) throw new UserError("Entry not found.");
      if (e._count.inspections > 0) throw new UserError("QC has already inspected this entry, so it can't be changed. Ask QC.");
      const delta = v.quantity - e.quantity;
      if (delta === 0) throw new UserError("The quantity is the same as before.");
      await lockProduct(e.productId, tx);
      if (delta < 0) {
        const stock = (await getStock([e.productId], tx)).get(e.productId) ?? 0;
        if (stock + delta < 0) throw new UserError(`Only ${stock.toLocaleString("en")} pcs of ${e.product.code} are in stock — the rest has already left the warehouse.`);
      }
      await tx.stockMovement.create({ data: { productId: e.productId, type: "PRODUCTION", qty: delta, entryId: v.quantity === 0 ? null : e.id, reason: `Correction: ${v.reason}`, createdById: me.id } });
      if (v.quantity === 0) {
        await tx.stockMovement.updateMany({ where: { entryId: e.id }, data: { entryId: null } });
        await tx.productionEntry.delete({ where: { id: e.id } });
      } else {
        await tx.productionEntry.update({ where: { id: e.id }, data: { quantity: v.quantity } });
      }
      await audit({
        userId: me.id, action: v.quantity === 0 ? "production.delete" : "production.correct", entityType: "ProductionEntry", entityId: e.id, reason: v.reason,
        before: { day: e.day.toISOString().slice(0, 10), shift: e.shift, product: e.product.code, qty: e.quantity }, after: { qty: v.quantity },
      }, tx);
      const d = e.day.toISOString().slice(0, 10);
      await notify({
        type: v.quantity === 0 ? "production.deleted" : "production.corrected",
        data: { product: e.product.code, before: e.quantity, after: v.quantity, day: d, shift: e.shift, by: me.fullName, reason: v.reason },
        link: `/production?day=${d}`, toPermission: "production:view", exceptUserId: me.id,
      }, tx);
    });
    refresh();
  });
}
