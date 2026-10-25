"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { run, UserError } from "@/lib/action";
import { planImport, readFile, type Plan, type SheetKey } from "@/lib/import";
import type { Permission } from "@/lib/permissions";

const MAX_BYTES = 5 * 1024 * 1024;

/** mode=check: read and validate only. mode=save: validate again and save everything in one transaction. */
export async function importMasterDataAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requireUser();
    const file = fd.get("file");
    const save = fd.get("mode") === "save";
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose the Excel (.xlsx) or CSV file first.");
    if (file.size > MAX_BYTES) throw new UserError("The file is larger than 5 MB.");
    if (!/\.(xlsx|csv|txt)$/i.test(file.name)) throw new UserError("Only Excel (.xlsx) or CSV files can be imported. In Excel use File → Save as → Excel Workbook (.xlsx).");
    let parsed;
    try {
      parsed = await readFile(Buffer.from(await file.arrayBuffer()), file.name);
    } catch {
      throw new UserError("This file couldn't be read. Save it again as an Excel Workbook (.xlsx) and retry.");
    }
    const present = (Object.keys(parsed.sheets) as SheetKey[]).filter((k) => parsed.sheets[k]!.length > 0);
    if (present.length === 0 && parsed.errors.length === 0) throw new UserError("No Machines, Molds or Products rows were found. Use the template's sheet names and headings.");
    // Permission per sheet: machines/molds need Assets, products need Products.
    const need: Permission[] = [];
    for (const k of present) {
      const res = k === "products" || k === "recipes" ? "products" : "assets";
      need.push(`${res}:create`, `${res}:edit`);
    }
    const missing = need.filter((p) => !me.permissions.has(p));
    if (missing.length) throw new UserError(`You don't have permission to import this (${[...new Set(missing)].join(", ")}).`);

    if (!save) return { saved: false, ...(await planImport(parsed.sheets, parsed.errors, false)) };
    const plan: Plan = await db.$transaction(async (tx) => {
      const p = await planImport(parsed.sheets, parsed.errors, true, tx);
      if (p.errors.length) return p;
      await audit({ userId: me.id, action: "masterdata.import", entityType: "System", reason: file.name, after: p.counts }, tx);
      const n = (k: SheetKey) => p.counts[k].create + p.counts[k].update;
      if (!p.empty) await notify({
        type: "masterdata.imported", data: { products: n("products"), molds: n("molds"), machines: n("machines"), by: me.fullName },
        link: "/products", toPermission: "products:view", exceptUserId: me.id,
      }, tx);
      return p;
    }, { timeout: 120_000, maxWait: 10_000 });
    if (!plan.errors.length) { revalidatePath("/products"); revalidatePath("/assets"); }
    return { saved: plan.errors.length === 0 && !plan.empty, ...plan };
  });
}
