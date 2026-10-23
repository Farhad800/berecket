"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit, diff } from "@/lib/audit";
import { run, formObject, UserError } from "@/lib/action";

const opt = z.string().trim().max(2000).optional();
const code = z.string().trim().min(1, "Required").max(40).regex(/^[A-Za-z0-9._\-/]+$/, "Letters, numbers, - _ . / only");
const optNum = z.coerce.number().nonnegative().optional();
const optInt = z.coerce.number().int().nonnegative().optional();
const bool = z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean());

function clean<T extends Record<string, unknown>>(o: T) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === undefined ? null : v])) as T;
}

// ───────── Products ─────────
const productSchema = z.object({
  code,
  name: z.string().trim().min(2, "Required").max(160),
  specifications: opt,
  unit: z.string().trim().max(12).default("pcs"),
  material: z.string().trim().max(80).optional(),
  color: z.string().trim().max(60).optional(),
  weightGrams: optNum,
  cycleTimeSec: optNum,
  qcRequired: bool,
});

export async function saveProductAction(_: unknown, fd: FormData) {
  return run(async () => {
    const raw = formObject(fd);
    const id = raw.id as string | undefined;
    const me = await requirePermission(id ? "products:edit" : "products:create");
    const v = productSchema.parse(raw);
    const data = clean({ ...v, code: v.code.toUpperCase() });
    if (id) {
      const before = await db.product.findUniqueOrThrow({ where: { id } });
      await db.product.update({ where: { id }, data });
      const d = diff({ ...before, weightGrams: before.weightGrams?.toString(), cycleTimeSec: before.cycleTimeSec?.toString() } as never, {
        ...data, weightGrams: data.weightGrams?.toString(), cycleTimeSec: data.cycleTimeSec?.toString(),
      } as never);
      if (d.changed) await audit({ userId: me.id, action: "product.update", entityType: "Product", entityId: id, before: d.before, after: d.after });
    } else {
      const p = await db.product.create({ data });
      await audit({ userId: me.id, action: "product.create", entityType: "Product", entityId: p.id, after: { code: p.code, name: p.name } });
    }
    revalidatePath("/products");
  });
}

// ───────── Machines ─────────
const machineSchema = z.object({
  code,
  name: z.string().trim().min(1, "Required").max(120),
  manufacturer: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  tonnage: optInt,
  status: z.enum(["AVAILABLE", "RUNNING", "DOWN", "MAINTENANCE", "RETIRED"]).default("AVAILABLE"),
  notes: opt,
});

export async function saveMachineAction(_: unknown, fd: FormData) {
  return run(async () => {
    const raw = formObject(fd);
    const id = raw.id as string | undefined;
    const me = await requirePermission(id ? "assets:edit" : "assets:create");
    const v = machineSchema.parse(raw);
    const data = clean({ ...v, code: v.code.toUpperCase() });
    if (id) {
      const before = await db.machine.findUniqueOrThrow({ where: { id } });
      await db.machine.update({ where: { id }, data });
      const d = diff(before as never, data as never);
      if (d.changed) await audit({ userId: me.id, action: "machine.update", entityType: "Machine", entityId: id, before: d.before, after: d.after });
    } else {
      const m = await db.machine.create({ data });
      await audit({ userId: me.id, action: "machine.create", entityType: "Machine", entityId: m.id, after: { code: m.code } });
    }
    revalidatePath("/assets");
    revalidatePath("/schedule");
  });
}

// ───────── Molds ─────────
const moldSchema = z.object({
  code,
  name: z.string().trim().min(1, "Required").max(120),
  cavities: z.coerce.number().int().min(1, "At least 1").max(512),
  productId: z.string().optional(),
  currentMachineId: z.string().optional(),
  status: z.enum(["AVAILABLE", "IN_USE", "IN_REPAIR", "RETIRED"]).default("AVAILABLE"),
  notes: opt,
});

export async function saveMoldAction(_: unknown, fd: FormData) {
  return run(async () => {
    const raw = formObject(fd);
    const id = raw.id as string | undefined;
    const me = await requirePermission(id ? "assets:edit" : "assets:create");
    const v = moldSchema.parse(raw);
    const data = clean({ ...v, code: v.code.toUpperCase() });
    if (id) {
      const before = await db.mold.findUniqueOrThrow({ where: { id } });
      await db.mold.update({ where: { id }, data });
      const d = diff(before as never, data as never);
      if (d.changed) await audit({ userId: me.id, action: "mold.update", entityType: "Mold", entityId: id, before: d.before, after: d.after });
    } else {
      const m = await db.mold.create({ data });
      await audit({ userId: me.id, action: "mold.create", entityType: "Mold", entityId: m.id, after: { code: m.code } });
    }
    revalidatePath("/assets");
  });
}

// ───────── Archive / restore (never hard-delete operational records) ─────────
const ARCHIVABLE = {
  product: { perm: "products:archive", path: "/products" },
  machine: { perm: "assets:archive", path: "/assets" },
  mold: { perm: "assets:archive", path: "/assets" },
} as const;

export async function setArchivedAction(kind: keyof typeof ARCHIVABLE, id: string, archived: boolean) {
  return run(async () => {
    const cfg = ARCHIVABLE[kind];
    if (!cfg) throw new UserError("Unknown record type.");
    const me = await requirePermission(cfg.perm);
    const archivedAt = archived ? new Date() : null;
    if (kind === "product") {
      await db.product.update({ where: { id }, data: { archivedAt } });
    } else if (kind === "machine") {
      await db.machine.update({ where: { id }, data: { archivedAt } });
    } else {
      await db.mold.update({ where: { id }, data: { archivedAt } });
    }
    await audit({ userId: me.id, action: `${kind}.${archived ? "archive" : "restore"}`, entityType: kind[0].toUpperCase() + kind.slice(1), entityId: id });
    revalidatePath(cfg.path);
  });
}

/**
 * Permanently deletes a product, machine or mold — but only if nothing in the
 * factory's history refers to it. Records that were used are archived instead, so past
 * orders, production and maintenance keep their meaning.
 */
export async function deleteMasterAction(kind: keyof typeof ARCHIVABLE, id: string) {
  return run(async () => {
    const cfg = ARCHIVABLE[kind];
    if (!cfg) throw new UserError("Unknown record type.");
    const me = await requirePermission(cfg.perm);
    const used = (what: string) => {
      throw new UserError(`It can't be deleted because ${what}. Use Archive instead — it disappears from lists but history stays correct.`);
    };
    await db.$transaction(async (tx) => {
      if (kind === "product") {
        const p = await tx.product.findUniqueOrThrow({ where: { id } });
        if (await tx.orderLine.count({ where: { productId: id } })) used("it is on orders");
        if (await tx.productionEntry.count({ where: { productId: id } })) used("production was recorded for it");
        if (await tx.stockMovement.count({ where: { productId: id } })) used("it has stock movements");
        await tx.mold.updateMany({ where: { productId: id }, data: { productId: null } });
        await tx.product.delete({ where: { id } });
        await audit({ userId: me.id, action: "product.delete", entityType: "Product", entityId: id, before: { code: p.code, name: p.name } }, tx);
      } else if (kind === "machine") {
        const m = await tx.machine.findUniqueOrThrow({ where: { id } });
        if (await tx.maintenanceRequest.count({ where: { machineId: id } })) used("it has maintenance requests");
        if (await tx.serviceReport.count({ where: { machineId: id } })) used("it has service reports");
        await tx.mold.updateMany({ where: { currentMachineId: id }, data: { currentMachineId: null, status: "AVAILABLE" } });
        await tx.preventiveTask.deleteMany({ where: { machineId: id } });
        await tx.machine.delete({ where: { id } });
        await audit({ userId: me.id, action: "machine.delete", entityType: "Machine", entityId: id, before: { code: m.code, name: m.name } }, tx);
      } else {
        const m = await tx.mold.findUniqueOrThrow({ where: { id } });
        if (await tx.maintenanceRequest.count({ where: { moldId: id } })) used("it has maintenance requests");
        if (await tx.serviceReport.count({ where: { OR: [{ moldId: id }, { moldRemovedId: id }, { moldInstalledId: id }] } })) used("it appears in service reports");
        await tx.preventiveTask.deleteMany({ where: { moldId: id } });
        await tx.mold.delete({ where: { id } });
        await audit({ userId: me.id, action: "mold.delete", entityType: "Mold", entityId: id, before: { code: m.code, name: m.name } }, tx);
      }
    });
    revalidatePath(cfg.path);
  });
}
