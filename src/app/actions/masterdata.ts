"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit, diff } from "@/lib/audit";
import { run, formObject, UserError } from "@/lib/action";
import { nextNumber } from "@/lib/numbering";

const opt = z.string().trim().max(2000).optional();
const code = z.string().trim().min(1, "Required").max(40).regex(/^[A-Za-z0-9._\-/]+$/, "Letters, numbers, - _ . / only");
const optNum = z.coerce.number().nonnegative().optional();
const optInt = z.coerce.number().int().nonnegative().optional();
const bool = z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean());

function clean<T extends Record<string, unknown>>(o: T) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === undefined ? null : v])) as T;
}

// ───────── Customers ─────────
const customerSchema = z.object({
  code: z.string().trim().max(40).optional(),
  name: z.string().trim().min(2, "Required").max(160),
  contactName: opt,
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email("Invalid email").optional(),
  address: opt,
  notes: opt,
});

export async function saveCustomerAction(_: unknown, fd: FormData) {
  return run(async () => {
    const raw = formObject(fd);
    const id = raw.id as string | undefined;
    const me = await requirePermission(id ? "customers:edit" : "customers:create");
    const v = customerSchema.parse(raw);
    const data = clean({ ...v, code: v.code?.toUpperCase() || undefined });
    if (id) {
      const before = await db.customer.findUniqueOrThrow({ where: { id } });
      const { code: _c, ...rest } = data; // codes are permanent once created
      await db.customer.update({ where: { id }, data: rest });
      const d = diff(before as never, rest as never);
      if (d.changed) await audit({ userId: me.id, action: "customer.update", entityType: "Customer", entityId: id, before: d.before, after: d.after });
    } else {
      const c = await db.customer.create({ data: { ...data, code: data.code ?? (await nextNumber("customer")) } });
      await audit({ userId: me.id, action: "customer.create", entityType: "Customer", entityId: c.id, after: { code: c.code, name: c.name } });
    }
    revalidatePath("/customers");
  });
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
  customer: { perm: "customers:archive", path: "/customers" },
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
    if (kind === "customer") {
      if (archived) {
        const open = await db.order.count({ where: { customerId: id, status: { notIn: ["DELIVERED", "CANCELLED", "DRAFT"] } } });
        if (open) throw new UserError(`This customer has ${open} open order(s). Close or cancel them first.`);
      }
      await db.customer.update({ where: { id }, data: { archivedAt } });
    } else if (kind === "product") {
      await db.product.update({ where: { id }, data: { archivedAt } });
    } else if (kind === "machine") {
      if (archived) {
        const jobs = await db.productionJob.count({ where: { machineId: id, status: { in: ["PLANNED", "IN_PROGRESS", "PAUSED"] } } });
        if (jobs) throw new UserError(`This machine has ${jobs} planned or running job(s). Move them first.`);
      }
      await db.machine.update({ where: { id }, data: { archivedAt } });
    } else {
      await db.mold.update({ where: { id }, data: { archivedAt } });
    }
    await audit({ userId: me.id, action: `${kind}.${archived ? "archive" : "restore"}`, entityType: kind[0].toUpperCase() + kind.slice(1), entityId: id });
    revalidatePath(cfg.path);
  });
}

/**
 * Permanently deletes a customer, product, machine or mold — but only if nothing in the
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
      if (kind === "customer") {
        const c = await tx.customer.findUniqueOrThrow({ where: { id } });
        if (await tx.order.count({ where: { customerId: id } })) used("it has orders");
        await tx.customer.delete({ where: { id } });
        await audit({ userId: me.id, action: "customer.delete", entityType: "Customer", entityId: id, before: { code: c.code, name: c.name } }, tx);
      } else if (kind === "product") {
        const p = await tx.product.findUniqueOrThrow({ where: { id } });
        if (await tx.orderLine.count({ where: { productId: id } })) used("it is on orders");
        if (await tx.batch.count({ where: { productId: id } })) used("it has production batches");
        await tx.mold.updateMany({ where: { productId: id }, data: { productId: null } });
        await tx.product.delete({ where: { id } });
        await audit({ userId: me.id, action: "product.delete", entityType: "Product", entityId: id, before: { code: p.code, name: p.name } }, tx);
      } else if (kind === "machine") {
        const m = await tx.machine.findUniqueOrThrow({ where: { id } });
        if (await tx.productionJob.count({ where: { machineId: id } })) used("production jobs were planned on it");
        if (await tx.maintenanceRequest.count({ where: { machineId: id } })) used("it has maintenance requests");
        if (await tx.serviceReport.count({ where: { machineId: id } })) used("it has service reports");
        if (await tx.downtime.count({ where: { machineId: id } })) used("it has downtime records");
        await tx.mold.updateMany({ where: { currentMachineId: id }, data: { currentMachineId: null, status: "AVAILABLE" } });
        await tx.preventiveTask.deleteMany({ where: { machineId: id } });
        await tx.machine.delete({ where: { id } });
        await audit({ userId: me.id, action: "machine.delete", entityType: "Machine", entityId: id, before: { code: m.code, name: m.name } }, tx);
      } else {
        const m = await tx.mold.findUniqueOrThrow({ where: { id } });
        if (await tx.productionJob.count({ where: { moldId: id } })) used("production jobs used it");
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
