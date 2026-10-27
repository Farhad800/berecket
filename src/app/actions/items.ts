"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, type Tx } from "@/lib/db";
import { can, canSeeMoney, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { nextNumber } from "@/lib/numbering";
import { run, UserError } from "@/lib/action";
import { round6 } from "@/lib/money";

/**
 * Labels, raw materials and packaging added by hand (accountant, 26 Oct 2026), each with its cost:
 * price + currency, and for USD/EUR the rate to IQD that day. Product costs are always worked out in IQD.
 */
const KINDS = { STICKER: "itemLabel", MATERIAL: "itemMaterial", PACKAGING: "itemPackaging" } as const;
const six = (n: number) => Math.abs(n * 1e6 - Math.round(n * 1e6)) < 1e-3;
const costSchema = z.object({
  price: z.coerce.number().min(0, "The price can't be negative").max(1_000_000_000).refine(six, "At most 6 decimals"),
  currency: z.enum(["IQD", "USD", "EUR"]),
  rate: z.coerce.number().positive("Type how many IQD 1 of this currency is today").max(10_000_000).refine(six, "At most 6 decimals").optional(),
});
type Cost = z.infer<typeof costSchema>;

/** The stored cost fields; USD/EUR need the rate to IQD. */
function costData(c: Cost) {
  if (c.currency !== "IQD" && !c.rate) throw new UserError(`Type the rate: 1 ${c.currency} = how many IQD?`);
  const rate = c.currency === "IQD" ? 1 : c.rate!;
  return { costPrice: c.price, costCurrency: c.currency, costRate: rate, costIqd: round6(c.price * rate), costUpdatedAt: new Date() };
}
const costText = (c: ReturnType<typeof costData>, unit: string) =>
  `${c.costPrice.toLocaleString("en", { maximumFractionDigits: 6 })} ${c.costCurrency} / ${unit}${c.costCurrency !== "IQD" ? ` (1 ${c.costCurrency} = ${c.costRate.toLocaleString("en")} IQD → ${c.costIqd.toLocaleString("en", { maximumFractionDigits: 6 })} IQD)` : ""}`;

/** Prices are only for people who see money (Buy, Sell or Safe). */
async function costUser(perm: "products:create" | "products:edit") {
  const me = await requireUser();
  if (!can(me, perm)) throw new UserError("You don't have permission to do this.");
  return me;
}

async function freeCode(tx: Tx, kind: keyof typeof KINDS) {
  for (let i = 0; i < 50; i++) {
    const c = await nextNumber(KINDS[kind], tx);
    if (!(await tx.product.count({ where: { code: c } }))) return c;
  }
  throw new UserError("Couldn't find a free code. Type one yourself.");
}

const itemSchema = z.object({
  kind: z.enum(["STICKER", "MATERIAL", "PACKAGING"]),
  name: z.string().trim().min(2, "Type the item's name").max(160),
  name2: z.string().trim().max(160).optional(),
  code: z.string().trim().max(40).regex(/^[A-Za-z0-9._\-/]*$/, "Letters, numbers, - _ . / only").optional(),
  unit: z.enum(["pcs", "kg"]),
  unitWeightKg: z.coerce.number().positive("More than 0").max(1000).optional(),
  cost: costSchema.optional(),
});

export async function createItemAction(input: unknown) {
  return run(async () => {
    const v = itemSchema.parse(input);
    const me = await costUser("products:create");
    if (v.cost && !canSeeMoney(me)) throw new UserError("You don't have permission to set prices.");
    const cost = v.cost ? costData(v.cost) : null;
    const item = await db.$transaction(async (tx) => {
      if (await tx.product.findFirst({ where: { kind: v.kind, archivedAt: null, name: { equals: v.name, mode: "insensitive" } } })) throw new UserError("An item with this name already exists in this section.");
      const code = v.code ? v.code.toUpperCase() : await freeCode(tx, v.kind);
      if (await tx.product.count({ where: { code } })) throw new UserError(`The code ${code} is already used.`);
      const it = await tx.product.create({ data: { code, kind: v.kind, name: v.name, name2: v.name2 || null, unit: v.unit, unitWeightKg: v.unit === "kg" ? v.unitWeightKg ?? null : null, ...(cost ?? {}) } });
      await audit({ userId: me.id, action: "product.create", entityType: "Product", entityId: it.id, after: { code, kind: v.kind, name: v.name, unit: v.unit, cost: cost ? costText(cost, v.unit) : null } }, tx);
      await notify({ type: "product.added", data: { name: it.name, code: it.code, by: me.fullName }, link: `/products/${it.id}`, toPermission: "products:view", exceptUserId: me.id }, tx);
      return it;
    });
    for (const p of ["/products", "/inventory", "/stock/new"]) revalidatePath(p);
    return { id: item.id, code: item.code };
  });
}

/** Change an item's cost (the cost of products that use it changes with it). */
export async function saveItemCostAction(input: unknown) {
  return run(async () => {
    const v = z.object({ id: z.string().min(1).max(40), cost: costSchema }).parse(input);
    const me = await costUser("products:edit");
    if (!canSeeMoney(me)) throw new UserError("You don't have permission to set prices.");
    const cost = costData(v.cost);
    await db.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id: v.id }, select: { code: true, kind: true, unit: true, costPrice: true, costCurrency: true, costRate: true, costIqd: true } });
      if (!before) throw new UserError("That item no longer exists.");
      if (before.kind === "PRODUCT") throw new UserError("A product's cost comes from what it is made of. Set the cost on its label, materials and packaging.");
      await tx.product.update({ where: { id: v.id }, data: cost });
      await audit({ userId: me.id, action: "product.cost", entityType: "Product", entityId: v.id,
        before: { code: before.code, cost: before.costPrice === null ? null : `${Number(before.costPrice)} ${before.costCurrency} (rate ${Number(before.costRate)})` },
        after: { code: before.code, cost: costText(cost, before.unit) } }, tx);
    });
    for (const p of ["/products", "/inventory"]) revalidatePath(p);
    revalidatePath(`/products/${v.id}`);
  });
}

const editSchema = itemSchema.omit({ cost: true }).extend({ id: z.string().min(1).max(40) });

/**
 * Changes a label / raw material / packaging item with the same boxes as when it was added:
 * section, name, second name, code, unit and weight per bag. (The cost has its own box on the page.)
 * The unit can't change once the item has stock history, and the section can't change while a product uses it.
 */
export async function updateItemAction(input: unknown) {
  return run(async () => {
    const v = editSchema.parse(input);
    const me = await costUser("products:edit");
    await db.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id: v.id }, select: { code: true, kind: true, name: true, name2: true, unit: true, unitWeightKg: true, _count: { select: { stockMovements: true, usedIn: true, labelledProducts: true } } } });
      if (!before) throw new UserError("That item no longer exists.");
      if (before.kind === "PRODUCT") throw new UserError("Edit products on the product page.");
      if (v.unit !== before.unit && before._count.stockMovements > 0) throw new UserError("This item already has stock in or out, so its unit can't change.");
      if (v.kind !== before.kind && (before._count.usedIn > 0 || before._count.labelledProducts > 0)) throw new UserError("Products use this item, so its section can't change. Take it out of their recipes first.");
      if (await tx.product.findFirst({ where: { id: { not: v.id }, kind: v.kind, archivedAt: null, name: { equals: v.name, mode: "insensitive" } } })) throw new UserError("An item with this name already exists in this section.");
      const code = v.code ? v.code.toUpperCase() : before.code;
      if (code !== before.code && (await tx.product.count({ where: { code } }))) throw new UserError(`The code ${code} is already used.`);
      const data = { code, kind: v.kind, name: v.name, name2: v.name2 || null, unit: v.unit, unitWeightKg: v.unit === "kg" ? v.unitWeightKg ?? before.unitWeightKg : null };
      await tx.product.update({ where: { id: v.id }, data });
      const b = { code: before.code, kind: before.kind, name: before.name, name2: before.name2, unit: before.unit, unitWeightKg: before.unitWeightKg === null ? null : Number(before.unitWeightKg) };
      const a = { ...data, unitWeightKg: data.unitWeightKg === null || data.unitWeightKg === undefined ? null : Number(data.unitWeightKg) };
      const changed = Object.fromEntries(Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]).map((k) => [k, true]));
      if (Object.keys(changed).length) await audit({ userId: me.id, action: "product.update", entityType: "Product", entityId: v.id,
        before: Object.fromEntries(Object.keys(changed).map((k) => [k, (b as Record<string, unknown>)[k]])), after: Object.fromEntries(Object.keys(changed).map((k) => [k, (a as Record<string, unknown>)[k]])) }, tx);
    });
    for (const p of ["/products", "/inventory", "/stock/new"]) revalidatePath(p);
    revalidatePath(`/products/${v.id}`);
  });
}
