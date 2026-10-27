"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, requirePermission, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { nextNumber } from "@/lib/numbering";
import { run, UserError } from "@/lib/action";
import { maxDecimals } from "@/lib/money";
import { supplierBalance } from "@/lib/suppliers";
import { pickSafe, takeOut } from "@/lib/cash";
import { once, submissionKey } from "@/lib/submission";

/** Supplier accounts (accountant, 27 Oct 2026): code, name, phone, address; purchases and payments are booked to them. */
const CODE = /^[A-Za-z0-9._\-/]{1,30}$/;
const PHONE = /^[0-9+()\-\s]*$/;
const fields = {
  code: z.string().trim().max(30).regex(CODE, "Letters, numbers, - . / only").optional(),
  name: z.string().trim().min(2, "Type the supplier's name").max(160),
  phone: z.string().trim().max(40).regex(PHONE, "The phone number can only have digits, spaces, + and -").optional(),
  address: z.string().trim().max(300).optional(),
  note: z.string().trim().max(1000).optional(),
};
const done = (id?: string) => { revalidatePath("/suppliers"); if (id) revalidatePath(`/suppliers/${id}`); revalidatePath("/stock/new"); };

/** People who buy may add a supplier while making a purchase; keeping the list needs suppliers:manage. */
async function mayCreate() {
  const me = await requireUser();
  if (!(can(me, "suppliers:manage") || can(me, "stock:buy"))) throw new UserError("You don't have permission to do this.");
  return me;
}

export async function createSupplierAction(input: unknown) {
  return run(async () => {
    const v = z.object(fields).parse(input);
    const me = await mayCreate();
    const c = await db.$transaction(async (tx) => {
      const same = await tx.supplier.findFirst({ where: { name: { equals: v.name, mode: "insensitive" }, archivedAt: null }, select: { code: true } });
      if (same) throw new UserError(`A supplier with this name already exists (${same.code}). Choose it from the list.`);
      const code = v.code ? v.code.toUpperCase() : await nextNumber("supplier", tx);
      const c = await tx.supplier.create({ data: { code, name: v.name, phone: v.phone || null, address: v.address || null, note: v.note || null } });
      await audit({ userId: me.id, action: "supplier.create", entityType: "Supplier", entityId: c.id, after: { code, name: v.name, phone: v.phone ?? null } }, tx);
      return c;
    });
    done(c.id);
    return { id: c.id, code: c.code, name: c.name, phone: c.phone };
  });
}

export async function updateSupplierAction(input: unknown) {
  return run(async () => {
    const v = z.object({ id: z.string().min(1).max(40), ...fields, code: z.string().trim().min(1, "Type the code").max(30).regex(CODE, "Letters, numbers, - . / only") }).parse(input);
    const me = await requirePermission("suppliers:manage");
    await db.$transaction(async (tx) => {
      const before = await tx.supplier.findUnique({ where: { id: v.id } });
      if (!before) throw new UserError("That supplier no longer exists.");
      const data = { code: v.code.toUpperCase(), name: v.name, phone: v.phone || null, address: v.address || null, note: v.note || null };
      await tx.supplier.update({ where: { id: v.id }, data });
      await audit({ userId: me.id, action: "supplier.update", entityType: "Supplier", entityId: v.id, before: { code: before.code, name: before.name, phone: before.phone, address: before.address }, after: data }, tx);
    });
    done(v.id);
  });
}

export async function archiveSupplierAction(input: unknown) {
  return run(async () => {
    const v = z.object({ id: z.string().min(1).max(40), archived: z.boolean() }).parse(input);
    const me = await requirePermission("suppliers:manage");
    const c = await db.supplier.update({ where: { id: v.id }, data: { archivedAt: v.archived ? new Date() : null } });
    await audit({ userId: me.id, action: v.archived ? "supplier.archive" : "supplier.restore", entityType: "Supplier", entityId: v.id, after: { code: c.code } });
    done(v.id);
  });
}

const paySchema = z.object({
  supplierId: z.string().min(1).max(40),
  currency: z.enum(["IQD", "USD", "EUR"]),
  safeId: z.string().min(1).max(40).optional(),
  amount: z.coerce.number().positive("The amount must be more than 0").max(100_000_000_000).refine((n) => maxDecimals(n, 2), "At most 2 decimals"),
  note: z.string().trim().max(1000).optional(),
  submissionId: z.string().optional(),
});

/**
 * Money paid to a supplier (not for one particular purchase): it leaves the chosen safe and raises the
 * supplier's balance. More than is owed is allowed — that is money paid in advance (+).
 */
export async function payToSupplierAction(input: unknown) {
  return run(async () => {
    const v = paySchema.parse(input);
    const me = await requireUser();
    if (!(can(me, "cash:out") || can(me, "stock:buy"))) throw new UserError("You don't have permission to do this.");
    const fmt = (n: number) => `${n.toLocaleString("en", { maximumFractionDigits: 2 })} ${v.currency}`;
    const { result } = await once(submissionKey(v.submissionId), me.id, "supplier.pay", async (tx) => {
      const c = await tx.supplier.findFirst({ where: { id: v.supplierId } });
      if (!c) throw new UserError("That supplier no longer exists.");
      const before = (await supplierBalance(c.id, {}, tx))[v.currency];
      const safe = await pickSafe(tx, v.safeId, v.currency);
      await takeOut(tx, safe, v.currency, v.amount);
      const number = await nextNumber("cashPay", tx);
      const e = await tx.cashEntry.create({ data: { number, kind: "PURCHASE", safeId: safe.id, currency: v.currency, amount: -v.amount, supplierId: c.id, party: c.name, note: v.note || null, createdById: me.id } });
      await audit({ userId: me.id, action: "cash.pay", entityType: "CashEntry", entityId: e.id, reason: v.note ?? null,
        after: { number, supplier: `${c.code} · ${c.name}`, safe: safe.name, amount: fmt(v.amount), balanceBefore: fmt(before), balanceAfter: fmt(before + v.amount) } }, tx);
      await notify({ type: "cash.pay", data: { number, doc: c.code, amount: fmt(v.amount), party: c.name, by: me.fullName },
        link: `/suppliers/${c.id}`, toPermission: "cash:view", exceptUserId: me.id }, tx);
      return { id: e.id, number };
    });
    done(v.supplierId);
    revalidatePath("/cash");
    return result;
  });
}
