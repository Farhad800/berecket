"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
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
  moldId: z.string().max(40).optional(),
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
    revalidatePath("/assets");
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
  });
}

// ───────── Molds ─────────
const moldSchema = z.object({
  code,
  name: z.string().trim().min(1, "Required").max(120),
  cavities: z.coerce.number().int().min(1, "At least 1").max(512),
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
        await tx.product.updateMany({ where: { moldId: id }, data: { moldId: null } });
        await tx.mold.delete({ where: { id } });
        await audit({ userId: me.id, action: "mold.delete", entityType: "Mold", entityId: id, before: { code: m.code, name: m.name } }, tx);
      }
    });
    revalidatePath(cfg.path);
  });
}

// ───────── Many labels on one mold ─────────
const CODE_RE = /^[A-Za-z0-9._\-/]{1,40}$/;
export type LabelsResult = { created: number; skipped: string[] };

/**
 * Creates one product per label for a mold. Each line is a label name, or "CODE<TAB>name"
 * (two columns copied from Excel). Lines without a code get MOLDCODE-001, -002… automatically.
 * Labels that already exist on this mold (same name or code) are skipped, never duplicated.
 */
export async function addLabelsAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("products:create");
    const raw = formObject(fd);
    const v = z.object({
      moldId: z.string().min(1).max(40),
      labels: z.string().max(200_000),
      material: z.string().trim().max(80).optional(),
      color: z.string().trim().max(60).optional(),
      weightGrams: optNum,
      qcRequired: bool,
    }).parse(raw);
    const lines = v.labels.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) throw new UserError("Type or paste at least one label.");
    if (lines.length > 2000) throw new UserError("At most 2,000 labels at once.");
    const parsed = lines.map((l, i) => {
      const parts = l.includes("\t") ? l.split("\t").map((x) => x.trim()) : l.includes(" | ") ? l.split(" | ").map((x) => x.trim()) : [l];
      const [code, name] = parts.length >= 2 && parts[1] ? [parts[0].toUpperCase(), parts.slice(1).filter(Boolean).join(" ")] : [null, parts[0]];
      if (name.length < 1 || name.length > 160) throw new UserError(`Line ${i + 1}: the label name must be 1–160 characters.`);
      if (code && !CODE_RE.test(code)) throw new UserError(`Line ${i + 1}: "${code}" can't be a product code (letters, numbers, - _ . / only, up to 40).`);
      return { code, name };
    });

    return db.$transaction(async (tx) => {
      const mold = await tx.mold.findUnique({ where: { id: v.moldId } });
      if (!mold) throw new UserError("That mold no longer exists.");
      const existing = await tx.product.findMany({ where: { moldId: mold.id }, select: { code: true, name: true } });
      const names = new Set(existing.map((p) => p.name.toLowerCase()));
      const taken = new Set((await tx.product.findMany({ where: { code: { startsWith: mold.code } }, select: { code: true } })).map((p) => p.code));
      const explicit = parsed.filter((p) => p.code).map((p) => p.code!);
      for (const c of (await tx.product.findMany({ where: { code: { in: explicit } }, select: { code: true } }))) taken.add(c.code);

      let seq = 0;
      const nextCode = () => {
        let c: string;
        do c = `${mold.code}-${String(++seq).padStart(3, "0")}`; while (taken.has(c));
        return c;
      };
      const skipped: string[] = [];
      const data: Prisma.ProductCreateManyInput[] = [];
      for (const p of parsed) {
        if (names.has(p.name.toLowerCase())) { skipped.push(p.name); continue; }
        if (p.code && taken.has(p.code)) { skipped.push(`${p.code} ${p.name}`); continue; }
        const code = p.code ?? nextCode();
        taken.add(code); names.add(p.name.toLowerCase());
        data.push({
          code, name: p.name, moldId: mold.id, material: v.material ?? null, color: v.color ?? null,
          weightGrams: v.weightGrams ?? null, qcRequired: v.qcRequired,
        });
      }
      if (data.length) await tx.product.createMany({ data });
      await audit({ userId: me.id, action: "product.bulk_create", entityType: "Mold", entityId: mold.id, after: { mold: mold.code, created: data.length, skipped: skipped.length } }, tx);
      revalidatePath("/products");
      revalidatePath("/assets");
      return { created: data.length, skipped } satisfies LabelsResult;
    }, { timeout: 30_000 });
  });
}
