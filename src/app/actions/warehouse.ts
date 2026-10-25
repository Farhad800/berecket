"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { notify } from "@/lib/notify";
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
      await notify({
        type: "stock.out", data: { pcs: rows.reduce((s, r) => s + r.qty, 0), products: rows.length, ref: reference ?? "—", by: me.fullName },
        link: "/inventory?tab=movements", toPermission: "warehouse:view", exceptUserId: me.id,
      }, tx);
    });
    refresh();
    return { lines: rows.length, pieces: rows.reduce((s, r) => s + r.qty, 0) };
  });
}

const adjustSchema = z.object({
  productId: z.string().min(1, "Choose the product"),
  qty: z.coerce.number().refine((n) => n !== 0, "Enter + or − quantity").refine((n) => Math.abs(n) <= 50_000_000, "Too large"),
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
      const p = await tx.product.findUnique({ where: { id: v.productId }, select: { code: true, unit: true } });
      if (!p) throw new UserError("Product not found.");
      if (!isKg(p.unit) && !Number.isInteger(v.qty)) throw new UserError(`${p.code} is counted in pieces — whole numbers only.`);
      const have = (await getStock([v.productId], tx)).get(v.productId) ?? 0;
      if (have + v.qty < 0) throw new UserError(`Only ${have.toLocaleString("en")} pcs of ${p.code} in stock.`);
      await tx.stockMovement.create({ data: { productId: v.productId, type: "ADJUST", qty: v.qty, reason: `${v.kind}: ${v.reason}`, createdById: me.id } });
      await audit({ userId: me.id, action: "stock.adjust", entityType: "StockMovement", reason: v.reason, before: { stock: have }, after: { product: p.code, qty: v.qty, kind: v.kind, stock: have + v.qty } }, tx);
      await notify({
        type: "stock.adjusted", data: { product: p.code, qty: `${v.qty > 0 ? "+" : "−"}${Math.abs(v.qty).toLocaleString("en")} ${p.unit}`, reason: v.reason, by: me.fullName },
        link: "/inventory?tab=movements", toPermission: "warehouse:view", exceptUserId: me.id,
      }, tx);
    });
    refresh();
  });
}

// ───────── Stickers and materials: received in, used for production
export type SupplyResult = { lines: number; total: number; mode: "RECEIVE" | "USE" };
const isKg = (unit: string) => unit.toLowerCase() === "kg";

/** Stickers or materials received (in) or taken to production (out), many items at once. */
export async function stockSuppliesAction(_: unknown, fd: FormData) {
  return run(async (): Promise<SupplyResult> => {
    const me = await requirePermission("warehouse:create");
    const raw = formObject(fd);
    const mode = z.enum(["RECEIVE", "USE"]).parse(raw.mode);
    const kind = z.enum(["STICKER", "MATERIAL", "PACKAGING"]).parse(raw.kind);
    const reference = z.string().trim().max(200).optional().parse(raw.reference);
    const rows: { productId: string; qty: number }[] = [];
    for (const [key, val] of fd.entries()) {
      const m = /^q_([a-z0-9]{10,40})$/i.exec(key);
      if (!m || typeof val !== "string" || val.trim() === "") continue;
      const qty = Number(val.replace(",", "."));
      if (!Number.isFinite(qty) || qty < 0 || qty > 50_000_000) throw new UserError("Check the quantities.");
      if (qty > 0) rows.push({ productId: m[1], qty: Math.round(qty * 1000) / 1000 });
    }
    if (rows.length === 0) throw new UserError("Type the quantity for at least one item.");
    if (rows.length > 1000) throw new UserError("At most 1,000 items at a time.");
    const total = await db.$transaction(async (tx) => {
      const items = await tx.product.findMany({ where: { id: { in: rows.map((r) => r.productId) }, kind, archivedAt: null }, select: { id: true, code: true, unit: true } });
      if (items.length !== new Set(rows.map((r) => r.productId)).size) throw new UserError("One of the items no longer exists. Reload the page.");
      const item = (id: string) => items.find((i) => i.id === id)!;
      for (const r of rows) {
        const it = item(r.productId);
        if (!isKg(it.unit) && !Number.isInteger(r.qty)) throw new UserError(`${it.code} is counted in pieces — whole numbers only.`);
      }
      if (mode === "USE") {
        for (const r of rows) await lockProduct(r.productId, tx);
        const stock = await getStock(rows.map((r) => r.productId), tx);
        for (const r of rows) {
          const have = stock.get(r.productId) ?? 0;
          if (r.qty > have + 1e-9) throw new UserError(`${item(r.productId).code}: only ${have.toLocaleString("en")} ${item(r.productId).unit} in stock.`);
        }
      }
      for (const r of rows) {
        await tx.stockMovement.create({ data: { productId: r.productId, type: mode, qty: mode === "USE" ? -r.qty : r.qty, reference: reference ?? null, createdById: me.id } });
      }
      const sumQty = rows.reduce((s, r) => s + r.qty, 0);
      await audit({
        userId: me.id, action: mode === "RECEIVE" ? "stock.receive" : "stock.use", entityType: "StockMovement", reason: reference ?? null,
        after: { kind, lines: rows.map((r) => `${item(r.productId).code} × ${r.qty} ${item(r.productId).unit}`) },
      }, tx);
      await notify({
        type: mode === "RECEIVE" ? (kind === "STICKER" ? "stock.stickersIn" : kind === "PACKAGING" ? "stock.packagingIn" : "stock.materialsIn") : (kind === "STICKER" ? "stock.stickersUsed" : kind === "PACKAGING" ? "stock.packagingUsed" : "stock.materialsUsed"),
        data: { n: rows.length, ref: reference ?? "—", by: me.fullName },
        link: `/inventory?tab=${kind === "STICKER" ? "stickers" : kind === "PACKAGING" ? "packaging" : "materials"}`, toPermission: "warehouse:view", exceptUserId: me.id,
      }, tx);
      return sumQty;
    }, { timeout: 60_000 });
    refresh();
    return { lines: rows.length, total, mode };
  });
}
