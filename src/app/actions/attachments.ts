"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, UserError } from "@/lib/action";
import { ATTACHABLE, isAttachable } from "@/lib/attachments";
import { ALLOWED_TYPES, MAX_FILE_BYTES, putFile } from "@/lib/storage";

async function recordExists(type: string, id: string) {
  switch (type) {
    case "MaintenanceRequest": return db.maintenanceRequest.count({ where: { id } });
    case "ServiceReport": return db.serviceReport.count({ where: { id } });
    case "QcInspection": return db.qcInspection.count({ where: { id } });
    case "QualityIssue": return db.qualityIssue.count({ where: { id } });
    default: return 0;
  }
}

/** Real file-type check from the first bytes — the browser's claimed type isn't trusted. */
function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (buf.subarray(4, 8).toString() === "ftyp" && /^(heic|heix|mif1|msf1|heif)/.test(buf.subarray(8, 12).toString())) return "image/heic";
  return null;
}

export async function uploadAttachmentsAction(fd: FormData) {
  return run(async () => {
    const me = await requireUser();
    const entityType = String(fd.get("entityType") ?? "");
    const entityId = String(fd.get("entityId") ?? "");
    if (!isAttachable(entityType)) throw new UserError("Files can't be attached here.");
    const rule = ATTACHABLE[entityType];
    if (!rule.add.some((p) => me.permissions.has(p))) throw new UserError("You don't have permission to add files here.");
    if (!(await recordExists(entityType, entityId))) throw new UserError("That record no longer exists.");

    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) throw new UserError("Choose at least one photo or PDF.");
    if (files.length > 10) throw new UserError("Up to 10 files at a time.");

    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) throw new UserError(`${f.name} is larger than 8 MB.`);
      const buf = Buffer.from(await f.arrayBuffer());
      const type = sniff(buf);
      if (!type || !ALLOWED_TYPES.includes(type)) throw new UserError(`${f.name}: only photos (JPG, PNG, WEBP, HEIC) or PDF files are allowed.`);
      const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
      const key = await putFile(`${entityType}/${entityId}/${randomUUID()}-${safe}`, buf, type);
      const a = await db.attachment.create({
        data: { entityType, entityId, storageKey: key, filename: f.name.slice(0, 200), mimeType: type, size: f.size, uploadedById: me.id },
      });
      await audit({ userId: me.id, action: "file.upload", entityType, entityId, after: { attachment: a.id, filename: a.filename, size: a.size } });
    }
    revalidatePath("/service");
    revalidatePath("/qc");
  });
}
