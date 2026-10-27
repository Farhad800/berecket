"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, canSeeMoney, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { run, UserError } from "@/lib/action";
import { planItems, readItemsWorkbook, type ItemsPlan } from "@/lib/items-workbook";

const MAX_BYTES = 8 * 1024 * 1024;

/** mode=check: read and check only. mode=save: check again and save everything in one transaction. */
export async function importItemsAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requireUser();
    if (!can(me, "products:create") || !can(me, "products:edit")) throw new UserError("You don't have permission to do this (Products: Create and Edit).");
    const file = fd.get("file");
    const save = fd.get("mode") === "save";
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose the items workbook (.xlsx) first.");
    if (file.size > MAX_BYTES) throw new UserError("The file is larger than 8 MB.");
    if (!/\.xlsx$/i.test(file.name)) throw new UserError("Only the Excel workbook (.xlsx) can be uploaded here.");
    let parsed;
    try {
      parsed = await readItemsWorkbook(Buffer.from(await file.arrayBuffer()));
    } catch (e) {
      throw new UserError((e as Error).message === "NO_SHEETS"
        ? "No Labels, Raw materials, Packaging, Products or Made of & packaging sheet was found. Download the items workbook and fill that."
        : "This file couldn't be read. Save it again as an Excel Workbook (.xlsx) and retry.");
    }
    const opts = { withCost: canSeeMoney(me), canInput: can(me, "stock:input"), canOutput: can(me, "stock:output"), userId: me.id, file: file.name.slice(0, 120) };
    if (!save) return { saved: false, ...(await planItems(parsed.sheets, parsed.errors, opts)) };
    const plan: ItemsPlan = await db.$transaction(async (tx) => {
      const p = await planItems(parsed.sheets, parsed.errors, opts, tx);
      if (p.errors.length) return p;
      await audit({ userId: me.id, action: "items.import", entityType: "System", reason: file.name, after: { ...p.counts, costs: p.costs, stockUp: p.stockUp, stockDown: p.stockDown, documents: p.docs } }, tx);
      const n = Object.values(p.counts).reduce((s, c) => s + c.create + c.update, 0);
      if (n) await notify({ type: "masterdata.imported", data: { products: n, molds: 0, machines: 0, by: me.fullName }, link: "/inventory", toPermission: "products:view", exceptUserId: me.id }, tx);
      return p;
    }, { timeout: 180_000, maxWait: 10_000 });
    if (!plan.errors.length) for (const p of ["/products", "/inventory", "/stock", "/stock/new"]) revalidatePath(p);
    return { saved: plan.errors.length === 0, ...plan };
  });
}
