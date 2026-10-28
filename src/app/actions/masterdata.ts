"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { notify } from "@/lib/notify";
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
  name: z.string().trim().max(160).optional(),
  name2: z.string().trim().max(160).optional(),
  labelId: z.string().max(40).optional(),
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
    const before = id ? await db.product.findUniqueOrThrow({ where: { id } }) : null;
    // A product's name is always typed by hand (owner, 28 Oct 2026): a label's name has "اتيكيت" in it.
    if (v.labelId && !(await db.product.count({ where: { id: v.labelId, kind: "STICKER" } }))) throw new UserError("That label doesn't exist any more.");
    if (!v.name || v.name.length < 2) throw new UserError("Type the product's name.");
    const data = clean({ ...v, name: v.name, code: v.code.toUpperCase() });
    if (id && before) {
      await db.product.update({ where: { id }, data });
      const d = diff({ ...before, weightGrams: before.weightGrams?.toString(), cycleTimeSec: before.cycleTimeSec?.toString() } as never, {
        ...data, weightGrams: data.weightGrams?.toString(), cycleTimeSec: data.cycleTimeSec?.toString(),
      } as never);
      if (d.changed) await audit({ userId: me.id, action: "product.update", entityType: "Product", entityId: id, before: d.before, after: d.after });
    } else {
      const p = await db.product.create({ data });
      await audit({ userId: me.id, action: "product.create", entityType: "Product", entityId: p.id, after: { code: p.code, name: p.name } });
      await notify({ type: "product.added", data: { name: p.name, code: p.code, by: me.fullName }, link: `/products?q=${encodeURIComponent(p.code)}`, toPermission: "products:view", exceptUserId: me.id });
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
      await notify({ type: "machine.added", data: { name: m.name, code: m.code, by: me.fullName }, link: "/assets", toPermission: "assets:view", exceptUserId: me.id });
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
      await notify({ type: "mold.added", data: { name: m.name, code: m.code, by: me.fullName }, link: "/assets?tab=molds", toPermission: "assets:view", exceptUserId: me.id });
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
    const rec =
      kind === "product" ? await db.product.update({ where: { id }, data: { archivedAt } })
      : kind === "machine" ? await db.machine.update({ where: { id }, data: { archivedAt } })
      : await db.mold.update({ where: { id }, data: { archivedAt } });
    await audit({ userId: me.id, action: `${kind}.${archived ? "archive" : "restore"}`, entityType: kind[0].toUpperCase() + kind.slice(1), entityId: id });
    await notify({
      type: `${kind}.${archived ? "archived" : "restored"}`, data: { name: rec.name, code: rec.code, by: me.fullName },
      link: kind === "product" ? "/products" : kind === "mold" ? "/assets?tab=molds" : "/assets", toPermission: kind === "product" ? "products:view" : "assets:view", exceptUserId: me.id,
    });
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
        await notify({ type: "product.removed", data: { name: p.name, code: p.code, by: me.fullName }, link: "/products", toPermission: "products:view", exceptUserId: me.id }, tx);
      } else if (kind === "machine") {
        const m = await tx.machine.findUniqueOrThrow({ where: { id } });
        if (await tx.maintenanceRequest.count({ where: { machineId: id } })) used("it has maintenance requests");
        if (await tx.serviceReport.count({ where: { machineId: id } })) used("it has service reports");
        await tx.mold.updateMany({ where: { currentMachineId: id }, data: { currentMachineId: null, status: "AVAILABLE" } });
        await tx.preventiveTask.deleteMany({ where: { machineId: id } });
        await tx.machine.delete({ where: { id } });
        await audit({ userId: me.id, action: "machine.delete", entityType: "Machine", entityId: id, before: { code: m.code, name: m.name } }, tx);
        await notify({ type: "machine.removed", data: { name: m.name, code: m.code, by: me.fullName }, link: "/assets", toPermission: "assets:view", exceptUserId: me.id }, tx);
      } else {
        const m = await tx.mold.findUniqueOrThrow({ where: { id } });
        if (await tx.maintenanceRequest.count({ where: { moldId: id } })) used("it has maintenance requests");
        if (await tx.serviceReport.count({ where: { OR: [{ moldId: id }, { moldRemovedId: id }, { moldInstalledId: id }] } })) used("it appears in service reports");
        await tx.preventiveTask.deleteMany({ where: { moldId: id } });
        await tx.product.updateMany({ where: { moldId: id }, data: { moldId: null } });
        await tx.mold.delete({ where: { id } });
        await audit({ userId: me.id, action: "mold.delete", entityType: "Mold", entityId: id, before: { code: m.code, name: m.name } }, tx);
        await notify({ type: "mold.removed", data: { name: m.name, code: m.code, by: me.fullName }, link: "/assets?tab=molds", toPermission: "assets:view", exceptUserId: me.id }, tx);
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
      if (data.length) await notify({ type: "labels.added", data: { n: data.length, mold: mold.code, by: me.fullName }, link: `/products?mold=${mold.id}`, toPermission: "products:view", exceptUserId: me.id }, tx);
      revalidatePath("/products");
      revalidatePath("/assets");
      return { created: data.length, skipped } satisfies LabelsResult;
    }, { timeout: 30_000 });
  });
}

// ───────── Recipe ("made of") and packaging of one product ─────────
// PIECE lines: amount per piece (grams for kg items, pieces for counted items).
// CARTON lines (packaging): how many products go into ONE of that item (one carton holds 1,800, one nylon bag holds 60).
const linesSchema = z.array(z.object({
  componentId: z.string().min(1, "Choose the item").max(40),
  qty: z.coerce.number().positive("More than 0").max(10_000_000),
  per: z.enum(["PIECE", "CARTON"]),
})).max(60);
type Lines = z.infer<typeof linesSchema>;

function checkLines(lines: Lines, productId?: string) {
  const seen = new Set<string>();
  for (const l of lines) {
    const k = `${l.componentId}|${l.per}`;
    if (seen.has(k)) throw new UserError("The same item is listed twice. Put it on one line.");
    seen.add(k);
    if (productId && l.componentId === productId) throw new UserError("A product can't be made of itself.");
  }
}

async function writeRecipe(tx: Prisma.TransactionClient, productId: string, labelId: string | null, lines: Lines, userId: string) {
  if (labelId && !(await tx.product.count({ where: { id: labelId, kind: "STICKER" } }))) throw new UserError("That label doesn't exist any more.");
  const comps = await tx.product.findMany({ where: { id: { in: lines.map((l) => l.componentId) } }, select: { id: true, code: true, kind: true } });
  if (comps.length !== new Set(lines.map((l) => l.componentId)).size) throw new UserError("One of the items no longer exists. Reload the page.");
  for (const l of lines) {
    const k = comps.find((c) => c.id === l.componentId)!.kind;
    if (l.per === "CARTON" && k !== "PACKAGING") throw new UserError("Only packaging items (cartons, nylon…) go under Packaging.");
    if (l.per === "PIECE" && (k === "PACKAGING" || k === "STICKER")) throw new UserError("Labels and packaging don't go under Made of.");
  }
  await tx.product.update({ where: { id: productId }, data: { labelId } });
  await tx.productComponent.deleteMany({ where: { productId } });
  if (lines.length) await tx.productComponent.createMany({ data: lines.map((l) => ({ productId, componentId: l.componentId, qty: l.qty, per: l.per })) });
  const code = (id: string) => comps.find((c) => c.id === id)?.code ?? id;
  await audit({
    userId, action: "product.recipe", entityType: "Product", entityId: productId,
    after: { label: labelId, lines: lines.map((l) => (l.per === "PIECE" ? `${code(l.componentId)} ${l.qty} per piece` : `${code(l.componentId)} holds ${l.qty} pcs`)) },
  }, tx);
}

/**
 * Saves the product page: label, made-of and packaging, and (when sent) the same details as when it was added —
 * code, typed name / second name (no label), mold and QC.
 */
export async function saveProductPageAction(input: unknown) {
  return run(async () => {
    const me = await requirePermission("products:edit");
    const v = z.object({
      productId: z.string().min(1).max(40), labelId: z.string().max(40).optional(), lines: linesSchema,
      code: code.optional(), name: z.string().trim().max(160).optional(), name2: z.string().trim().max(160).optional(),
      moldId: z.string().max(40).optional(), qcRequired: z.boolean().optional(),
    }).parse(input);
    checkLines(v.lines, v.productId);
    await db.$transaction(async (tx) => {
      const p = await tx.product.findUniqueOrThrow({ where: { id: v.productId }, select: { kind: true, labelId: true, code: true, name: true, name2: true, moldId: true, qcRequired: true } });
      if (p.kind !== "PRODUCT") throw new UserError("Only products have a recipe.");
      const data: Prisma.ProductUpdateInput = {};
      if (v.code !== undefined) {
        const c = v.code.toUpperCase();
        if (c !== p.code && (await tx.product.count({ where: { code: c, id: { not: v.productId } } }))) throw new UserError(`The code ${c} is already used by another item.`);
        data.code = c;
        data.mold = v.moldId ? { connect: { id: v.moldId } } : { disconnect: true };
        if (v.qcRequired !== undefined) data.qcRequired = v.qcRequired;
      }
      // The name is always typed by hand; choosing a label never renames the product (owner, 28 Oct 2026).
      if (v.code !== undefined) {
        if (!v.name || v.name.length < 2) throw new UserError("Type the product's name.");
        data.name = v.name; data.name2 = v.name2 || null;
      }
      if (Object.keys(data).length) {
        await tx.product.update({ where: { id: v.productId }, data });
        const after = await tx.product.findUniqueOrThrow({ where: { id: v.productId }, select: { code: true, name: true, name2: true, moldId: true, qcRequired: true } });
        const d = diff({ code: p.code, name: p.name, name2: p.name2, moldId: p.moldId, qcRequired: p.qcRequired } as never, after as never);
        if (d.changed) await audit({ userId: me.id, action: "product.update", entityType: "Product", entityId: v.productId, before: d.before, after: d.after }, tx);
      }
      await writeRecipe(tx, v.productId, v.labelId ?? null, v.lines, me.id);
    });
    revalidatePath(`/products/${v.productId}`);
    revalidatePath("/products");
  });
}

/** New product in one go: typed name, code, mold, and what it is made of (label included) and packed in. */
export async function createProductAction(input: unknown) {
  const res = await run(async () => {
    const me = await requirePermission("products:create");
    const v = z.object({
      code, labelId: z.string().max(40).optional(),
      name: z.string().trim().max(160).optional(), name2: z.string().trim().max(160).optional(),
      moldId: z.string().max(40).optional(), qcRequired: z.boolean().default(false), lines: linesSchema,
    }).parse(input);
    checkLines(v.lines);
    // Always the typed name (owner, 28 Oct 2026) — never the label's name, which has "اتيكيت" in it.
    if (!v.name || v.name.length < 2) throw new UserError("Type the product's name.");
    const names = { name: v.name, name2: v.name2 || null };
    const p = await db.$transaction(async (tx) => {
      const created = await tx.product.create({ data: { code: v.code.toUpperCase(), kind: "PRODUCT", name: names.name, name2: names.name2 ?? null, moldId: v.moldId || null, qcRequired: v.qcRequired } });
      await audit({ userId: me.id, action: "product.create", entityType: "Product", entityId: created.id, after: { code: created.code, name: created.name } }, tx);
      await writeRecipe(tx, created.id, v.labelId ?? null, v.lines, me.id);
      await notify({ type: "product.added", data: { name: created.name, code: created.code, by: me.fullName }, link: `/products/${created.id}`, toPermission: "products:view", exceptUserId: me.id }, tx);
      return created;
    });
    revalidatePath("/products");
    return p.id;
  });
  if (res.ok) redirect(`/products/${res.data}?created=1`);
  return res;
}

/** Weight of one bag/piece for items stocked in kg but used by count (e.g. nylon bags). */
export async function saveUnitWeightAction(itemId: string, kg: number) {
  return run(async () => {
    const me = await requirePermission("products:edit");
    const w = z.coerce.number().positive("More than 0").max(1000).parse(kg);
    const it = await db.product.update({ where: { id: String(itemId) }, data: { unitWeightKg: w }, select: { code: true } });
    await audit({ userId: me.id, action: "product.update", entityType: "Product", entityId: String(itemId), after: { code: it.code, unitWeightKg: w } });
    revalidatePath("/products");
    revalidatePath("/inventory");
  });
}
