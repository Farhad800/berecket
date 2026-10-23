"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, formObject, UserError } from "@/lib/action";
import { getStock, lockProduct } from "@/lib/stock";

/**
 * Warehouse stock (owner's decision, 23 Oct 2026): production adds stock automatically,
 * the warehouse records goods going out and count corrections. No shipments or locations.
 */

function refresh() {
  for (const p of ["/inventory", "/dashboard", "/reports"]) revalidatePath(p);
}

export type OutResult = { lines: number; pieces: number };

/** Goods leaving the warehouse — one or many products in one go. */
export async function stockOutAction(_: unknown, fd: FormData) {
  return run(async (): Promise<OutResult> => {
    const me = await requirePermission("warehouse:create");
    const raw = formObject(fd);
    const reference = z.string().trim().max(200).optional().parse(raw.reference);
    const rows: { productId: string; qty: number }[] = [];
    for (const [key, val] of fd.entries()) {
      const m = /^out_([a-z0-9]{10,40})$/i.exec(key);
      if (!m || typeof val !== "string" || val.trim() === "") continue;
      const qty = Number(val);
      if (!Number.isInteger(qty) || qty < 0 || qty > 5_000_000) throw new UserError("Quantities must be whole numbers.");
      if (qty > 0) rows.push({ productId: m[1], qty });
    }
    if (rows.length === 0) throw new UserError("Type the quantity going out for at least one product.");
    await db.$transaction(async (tx) => {
      for (const r of rows) await lockProduct(r.productId, tx);
      const stock = await getStock(rows.map((r) => r.productId), tx);
      const products = await tx.product.findMany({ where: { id: { in: rows.map((r) => r.productId) } }, select: { id: true, code: true } });
      const code = (id: string) => products.find((p) => p.id === id)?.code ?? id;
      for (const r of rows) {
        const have = stock.get(r.productId) ?? 0;
        if (r.qty > have) throw new UserError(`${code(r.productId)}: only ${have.toLocaleString("en")} pcs in stock.`);
      }
      for (const r of rows) {
        await tx.stockMovement.create({ data: { productId: r.productId, type: "OUT", qty: -r.qty, reference: reference ?? null, createdById: me.id } });
      }
      await audit({ userId: me.id, action: "stock.out", entityType: "StockMovement", reason: reference ?? null, after: { lines: rows.map((r) => `${code(r.productId)} × ${r.qty}`) } }, tx);
    });
    refresh();
    return { lines: rows.length, pieces: rows.reduce((s, r) => s + r.qty, 0) };
  });
}

const adjustSchema = z.object({
  productId: z.string().min(1, "Choose the product"),
  qty: z.coerce.number().int().refine((n) => n !== 0, "Enter + or − pieces").refine((n) => Math.abs(n) <= 5_000_000, "Too large"),
  kind: z.enum(["COUNT", "DAMAGE", "SCRAP", "OTHER"]),
  reason: z.string().trim().min(3, "Please give a reason").max(500),
});

/** Count corrections, damage, scrap — supervisor permission, always with a reason. */
export async function adjustStockAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("warehouse:approve");
    const v = adjustSchema.parse(formObject(fd));
    await db.$transaction(async (tx) => {
      await lockProduct(v.productId, tx);
      const p = await tx.product.findUnique({ where: { id: v.productId }, select: { code: true } });
      if (!p) throw new UserError("Product not found.");
      const have = (await getStock([v.productId], tx)).get(v.productId) ?? 0;
      if (have + v.qty < 0) throw new UserError(`Only ${have.toLocaleString("en")} pcs of ${p.code} in stock.`);
      await tx.stockMovement.create({ data: { productId: v.productId, type: "ADJUST", qty: v.qty, reason: `${v.kind}: ${v.reason}`, createdById: me.id } });
      await audit({ userId: me.id, action: "stock.adjust", entityType: "StockMovement", reason: v.reason, before: { stock: have }, after: { product: p.code, qty: v.qty, kind: v.kind, stock: have + v.qty } }, tx);
    });
    refresh();
  });
}
