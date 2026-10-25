"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, UserError } from "@/lib/action";
import { RECEIPT_FOR, RECEIPT_LANGS, normalize } from "@/lib/receipt-layout";

const MAX_BANNER = 1_500_000; // characters of the data: URL (about 1.1 MB image)
const schema = z.object({
  id: z.string().max(40).optional(),
  name: z.string().trim().min(2, "Give the layout a name").max(80),
  docType: z.enum(RECEIPT_FOR),
  language: z.enum(RECEIPT_LANGS),
  isDefault: z.boolean().default(false),
  banner: z.string().max(MAX_BANNER, "The banner image is too large — use a smaller picture (under 1 MB).").nullable().optional(),
  settings: z.unknown(),
});

/** Create or change a saved receipt layout. One default per document type. */
export async function saveLayoutAction(input: unknown) {
  return run(async () => {
    const v = schema.parse(input);
    const me = await requirePermission("receipts:manage");
    if (v.banner && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v.banner)) throw new UserError("The banner must be a PNG, JPG or WebP picture.");
    const settings = normalize(v.settings);
    const r = await db.$transaction(async (tx) => {
      if (v.id && !(await tx.receiptLayout.count({ where: { id: v.id } }))) throw new UserError("That layout no longer exists. Reload the page.");
      const isDefault = v.isDefault || (await tx.receiptLayout.count({ where: { docType: v.docType, isDefault: true, ...(v.id ? { id: { not: v.id } } : {}) } })) === 0;
      if (isDefault) await tx.receiptLayout.updateMany({ where: { docType: v.docType, isDefault: true }, data: { isDefault: false } });
      const data = { name: v.name, docType: v.docType, language: v.language, isDefault, banner: v.banner ?? null, settings };
      const l = v.id ? await tx.receiptLayout.update({ where: { id: v.id }, data }) : await tx.receiptLayout.create({ data: { ...data, createdById: me.id } });
      await audit({ userId: me.id, action: v.id ? "receipt.layoutEdit" : "receipt.layoutCreate", entityType: "ReceiptLayout", entityId: l.id, after: { name: v.name, for: v.docType, language: v.language, isDefault } }, tx);
      return { id: l.id };
    });
    revalidatePath("/receipts");
    return r;
  });
}

export async function deleteLayoutAction(input: unknown) {
  return run(async () => {
    const { id } = z.object({ id: z.string().min(1).max(40) }).parse(input);
    const me = await requirePermission("receipts:manage");
    await db.$transaction(async (tx) => {
      const l = await tx.receiptLayout.findUnique({ where: { id } });
      if (!l) throw new UserError("That layout no longer exists.");
      await tx.receiptLayout.delete({ where: { id } });
      if (l.isDefault) {
        const next = await tx.receiptLayout.findFirst({ where: { docType: l.docType }, orderBy: { createdAt: "asc" } });
        if (next) await tx.receiptLayout.update({ where: { id: next.id }, data: { isDefault: true } });
      }
      await audit({ userId: me.id, action: "receipt.layoutDelete", entityType: "ReceiptLayout", entityId: id, after: { name: l.name } }, tx);
    });
    revalidatePath("/receipts");
    return { id };
  });
}
