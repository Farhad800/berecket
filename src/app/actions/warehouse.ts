"use server";

import { z } from "zod";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { StockState } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, formObject, UserError } from "@/lib/action";
import { nextNumber } from "@/lib/numbering";
import { getBatchBalances, syncBatchStock } from "@/lib/stock";
import { getLineProgress, recomputeOrderStatus } from "@/lib/orders";
import { notify } from "@/lib/notify";

const SHIPPABLE_QC = ["RELEASED", "APPROVED", "PARTIAL"];

function refreshWh(orderId?: string) {
  revalidatePath("/inventory");
  revalidatePath("/shipments");
  revalidatePath("/dashboard");
  revalidatePath("/qc");
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

/** Serialises stock changes per batch so two people can't over-receive or over-ship at the same moment. */
async function lockBatch(tx: Tx, batchId: string) {
  await tx.$queryRaw`SELECT id FROM "Batch" WHERE id = ${batchId} FOR UPDATE`;
}

// ───────── Receipts ─────────
const receiptSchema = z.object({
  batchId: z.string().min(1, "Choose a batch"),
  qtyReceived: z.coerce.number().int("Whole pieces only").positive("Must be more than 0"),
  locationId: z.string().min(1, "Choose a location"),
  idempotencyKey: z.string().uuid(),
  notes: z.string().trim().max(1000).optional(),
  overReason: z.string().trim().max(500).optional(),
});

export async function receiveAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("warehouse:create");
    const v = receiptSchema.parse(formObject(fd));

    // Same form submitted twice (double tap, retry on bad Wi-Fi) → return the first receipt, don't duplicate.
    const dup = await db.warehouseReceipt.findUnique({ where: { idempotencyKey: v.idempotencyKey } });
    if (dup) return { number: dup.number, duplicate: true };

    const result = await db.$transaction(async (tx) => {
      await lockBatch(tx, v.batchId);
      const batch = await tx.batch.findUniqueOrThrow({ where: { id: v.batchId }, include: { orderLine: { include: { order: true } }, product: true } });
      const loc = await tx.storageLocation.findFirst({ where: { id: v.locationId, active: true } });
      if (!loc) throw new UserError("Choose an active storage location.");
      const produced = (await tx.productionEntry.aggregate({ where: { batchId: batch.id }, _sum: { qtyGood: true } }))._sum.qtyGood ?? 0;
      const received = (await tx.warehouseReceipt.aggregate({ where: { batchId: batch.id }, _sum: { qtyReceived: true } }))._sum.qtyReceived ?? 0;
      const receivable = produced - received;

      if (v.qtyReceived > receivable) {
        // More than production reported — only allowed for an authorised person with a reason.
        if (!me.permissions.has("warehouse:approve")) {
          throw new UserError(`Only ${Math.max(receivable, 0)} pcs of ${batch.number} are waiting for receipt (produced ${produced}, already received ${received}). Ask a supervisor if the physical count is higher.`);
        }
        if (!v.overReason || v.overReason.length < 3) throw new UserError("Receiving more than production reported needs a reason.");
      }

      const number = await nextNumber("receipt", tx);
      const transactionId = randomUUID();
      await tx.stockMovement.create({
        data: {
          transactionId, type: "RECEIPT", productId: batch.productId, batchId: batch.id, orderLineId: batch.orderLineId,
          locationId: loc.id, state: "AVAILABLE", qty: v.qtyReceived, referenceType: "WarehouseReceipt", referenceId: number, createdById: me.id,
          reason: v.qtyReceived > receivable ? `Over-receipt: ${v.overReason}` : null,
        },
      });
      const before = (await getBatchBalances([batch.id], tx)).get(batch.id)!;
      // Puts the new pieces in the right state for the batch's QC status (e.g. quarantine while on hold).
      await syncBatchStock(batch.id, me.id, `${number}: receipt`, tx);
      const after = (await getBatchBalances([batch.id], tx)).get(batch.id)!;
      const toQuarantine = Math.max(after.QUARANTINE - (before.QUARANTINE), 0) + Math.max(after.REJECTED - before.REJECTED, 0);

      const r = await tx.warehouseReceipt.create({
        data: {
          number, batchId: batch.id, orderLineId: batch.orderLineId, qtyReceived: v.qtyReceived,
          qtyAvailable: v.qtyReceived - Math.min(toQuarantine, v.qtyReceived), qtyQuarantine: Math.min(toQuarantine, v.qtyReceived),
          locationId: loc.id, receivedById: me.id, idempotencyKey: v.idempotencyKey, notes: v.notes ?? null,
        },
      });
      await audit({
        userId: me.id, action: "warehouse.receive", entityType: "WarehouseReceipt", entityId: r.id, reason: v.overReason ?? null,
        after: { number, batch: batch.number, qty: v.qtyReceived, available: r.qtyAvailable, quarantine: r.qtyQuarantine, location: loc.code, overReceipt: v.qtyReceived > receivable },
      }, tx);
      await recomputeOrderStatus(batch.orderLine.orderId, tx);
      await notify({
        type: "warehouse.receipt", title: `${number}: ${v.qtyReceived} pcs of ${batch.product.code} received`,
        body: `${batch.number} · ${batch.orderLine.order.number}${r.qtyQuarantine ? ` · ${r.qtyQuarantine} in quarantine` : ""}`,
        link: `/orders/${batch.orderLine.orderId}`, toPermission: "orders:edit", exceptUserId: me.id,
      }, tx);
      return { number, orderId: batch.orderLine.orderId, quarantine: r.qtyQuarantine };
    });
    refreshWh(result.orderId);
    return { number: result.number, duplicate: false, quarantine: result.quarantine };
  });
}

// ───────── Adjustments (never edit totals — add a reasoned movement) ─────────
const adjustSchema = z.object({
  batchId: z.string().min(1, "Choose a batch"),
  state: z.enum(["AVAILABLE", "QUARANTINE", "REJECTED"]),
  qty: z.coerce.number().int().refine((n) => n !== 0, "Enter a positive or negative quantity"),
  kind: z.enum(["COUNT", "DAMAGE", "SCRAP", "OTHER"]),
  reason: z.string().trim().min(3, "Please give a reason").max(500),
});

export async function adjustStockAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("warehouse:approve");
    const v = adjustSchema.parse(formObject(fd));
    const orderId = await db.$transaction(async (tx) => {
      await lockBatch(tx, v.batchId);
      const batch = await tx.batch.findUniqueOrThrow({ where: { id: v.batchId }, include: { orderLine: true } });
      const bal = (await getBatchBalances([batch.id], tx)).get(batch.id)!;
      if (bal[v.state as StockState] + v.qty < 0) throw new UserError(`Only ${bal[v.state as StockState]} pcs are in ${v.state.toLowerCase()} for ${batch.number}.`);
      if (v.qty > 0 && v.state === "AVAILABLE" && !SHIPPABLE_QC.includes(batch.qcStatus)) {
        throw new UserError(`${batch.number} is ${batch.qcStatus.toLowerCase()} by QC — stock can't be added to available.`);
      }
      const transactionId = randomUUID();
      await tx.stockMovement.create({
        data: { transactionId, type: v.kind === "SCRAP" ? "SCRAP" : "ADJUST", productId: batch.productId, batchId: batch.id, orderLineId: batch.orderLineId, state: v.state, qty: v.qty, reason: `${v.kind}: ${v.reason}`, createdById: me.id },
      });
      await audit({ userId: me.id, action: "stock.adjust", entityType: "Batch", entityId: batch.id, reason: v.reason, after: { batch: batch.number, state: v.state, qty: v.qty, kind: v.kind } }, tx);
      await recomputeOrderStatus(batch.orderLine.orderId, tx);
      return batch.orderLine.orderId;
    });
    refreshWh(orderId);
  });
}

// ───────── Storage locations ─────────
export async function saveLocationAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("warehouse:approve");
    const v = z.object({
      id: z.string().optional(),
      code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9_\-/.]+$/, "Letters, numbers, - _ / ."),
      name: z.string().trim().min(2).max(120),
    }).parse(formObject(fd));
    const l = v.id
      ? await db.storageLocation.update({ where: { id: v.id }, data: { name: v.name } })
      : await db.storageLocation.create({ data: { code: v.code.toUpperCase(), name: v.name } });
    await audit({ userId: me.id, action: "location.save", entityType: "StorageLocation", entityId: l.id, after: { code: l.code, name: l.name } });
    revalidatePath("/inventory");
  });
}

// ───────── Shipments ─────────
const shipmentSchema = z.object({
  orderId: z.string().min(1),
  plannedDate: z.string().optional(),
  vehicle: z.string().trim().max(80).optional(),
  driver: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/** Creates a draft shipment and RESERVES the chosen approved stock so nobody else can ship it. */
export async function createShipmentAction(_: unknown, fd: FormData) {
  let id = "";
  const res = await run(async () => {
    const me = await requirePermission("shipments:create");
    const raw = formObject(fd);
    const v = shipmentSchema.parse(raw);
    const picks: { batchId: string; qty: number }[] = [];
    for (const [k, val] of Object.entries(raw)) {
      const m = /^qty_(.+)$/.exec(k);
      if (!m || val === undefined) continue;
      const qty = Number(val);
      if (!Number.isInteger(qty) || qty < 0) throw new UserError("Quantities must be whole numbers.");
      if (qty > 0) picks.push({ batchId: m[1], qty });
    }
    if (picks.length === 0) throw new UserError("Enter a quantity for at least one batch.");

    const sh = await db.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: v.orderId }, include: { lines: true } });
      if (["DRAFT", "CANCELLED", "DELIVERED", "ON_HOLD"].includes(order.status)) throw new UserError(`Order ${order.number} can't be shipped while it is ${order.status.toLowerCase().replace("_", " ")}.`);
      const progress = await getLineProgress([order.id], tx);
      const reservedByLine = new Map<string, number>();
      const draftLines = await tx.shipmentLine.findMany({ where: { shipment: { orderId: order.id, status: "DRAFT" } } });
      for (const l of draftLines) reservedByLine.set(l.orderLineId, (reservedByLine.get(l.orderLineId) ?? 0) + l.qty);

      const lines: { orderLineId: string; batchId: string; qty: number }[] = [];
      const perLine = new Map<string, number>();
      for (const p of picks) {
        await lockBatch(tx, p.batchId);
        const batch = await tx.batch.findUniqueOrThrow({ where: { id: p.batchId } });
        if (!order.lines.some((l) => l.id === batch.orderLineId)) throw new UserError(`${batch.number} doesn't belong to order ${order.number}.`);
        if (!SHIPPABLE_QC.includes(batch.qcStatus)) throw new UserError(`${batch.number} is ${batch.qcStatus.toLowerCase()} by Quality Control and can't be shipped.`);
        const bal = (await getBatchBalances([batch.id], tx)).get(batch.id)!;
        if (p.qty > bal.AVAILABLE) throw new UserError(`${batch.number}: only ${bal.AVAILABLE} approved, unreserved pcs are available.`);
        perLine.set(batch.orderLineId, (perLine.get(batch.orderLineId) ?? 0) + p.qty);
        lines.push({ orderLineId: batch.orderLineId, batchId: batch.id, qty: p.qty });
      }
      for (const [lineId, qty] of perLine) {
        const pr = progress.get(lineId)!;
        const open = pr.quantity - pr.shipped - (reservedByLine.get(lineId) ?? 0);
        const line = order.lines.find((l) => l.id === lineId)!;
        if (qty > open) throw new UserError(`Line ${line.lineNo}: only ${Math.max(open, 0)} pcs are still to be delivered (ordered ${pr.quantity}, shipped ${pr.shipped}, in other drafts ${reservedByLine.get(lineId) ?? 0}).`);
      }

      const number = await nextNumber("shipment", tx);
      const s = await tx.shipment.create({
        data: {
          number, customerId: order.customerId, orderId: order.id, status: "DRAFT",
          plannedDate: v.plannedDate ? new Date(`${v.plannedDate}T09:00:00Z`) : null,
          vehicle: v.vehicle ?? null, driver: v.driver ?? null, notes: v.notes ?? null, createdById: me.id,
          lines: { create: lines },
        },
      });
      const transactionId = randomUUID();
      const batches = await tx.batch.findMany({ where: { id: { in: lines.map((l) => l.batchId) } } });
      await tx.stockMovement.createMany({
        data: lines.flatMap((l) => {
          const b = batches.find((x) => x.id === l.batchId)!;
          const base = { transactionId, type: "RESERVE", productId: b.productId, batchId: b.id, orderLineId: l.orderLineId, referenceType: "Shipment", referenceId: s.id, createdById: me.id };
          return [{ ...base, state: "AVAILABLE" as const, qty: -l.qty }, { ...base, state: "RESERVED" as const, qty: l.qty }];
        }),
      });
      await audit({ userId: me.id, action: "shipment.create", entityType: "Shipment", entityId: s.id, after: { number, order: order.number, lines: lines.map((l) => ({ batch: batches.find((b) => b.id === l.batchId)?.number, qty: l.qty })) } }, tx);
      return s;
    });
    id = sh.id;
  });
  if (res.ok) {
    refreshWh();
    redirect(`/shipments/${id}`);
  }
  return res;
}

/**
 * Confirms dispatch. Stock deduction, shipment status and order quantities change together —
 * if any check fails, nothing changes.
 */
export async function confirmShipmentAction(shipmentId: string, deliveryNote?: string) {
  return run(async () => {
    const me = await requirePermission("shipments:approve");
    const orderId = await db.$transaction(async (tx) => {
      const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { lines: { include: { batch: true } }, order: true, customer: true } });
      if (s.status !== "DRAFT") throw new UserError("This shipment is already confirmed or cancelled.");
      if (s.lines.length === 0) throw new UserError("The shipment has no lines.");
      // Re-check every line at the moment of dispatch: QC can hold a batch after it was reserved.
      for (const l of s.lines) {
        await lockBatch(tx, l.batchId);
        const batch = await tx.batch.findUniqueOrThrow({ where: { id: l.batchId } });
        if (!SHIPPABLE_QC.includes(batch.qcStatus)) throw new UserError(`${batch.number} was put ${batch.qcStatus.toLowerCase()} by Quality Control. Cancel this shipment or remove the batch.`);
        const reservedHere = (await tx.stockMovement.aggregate({ where: { referenceType: "Shipment", referenceId: s.id, batchId: l.batchId, state: "RESERVED" }, _sum: { qty: true } }))._sum.qty ?? 0;
        const bal = (await getBatchBalances([l.batchId], tx)).get(l.batchId)!;
        if (reservedHere < l.qty || bal.RESERVED < l.qty) {
          throw new UserError(`${batch.number}: the reservation was released (for example by a QC hold). Cancel this draft and create a new one.`);
        }
      }
      const transactionId = randomUUID();
      await tx.stockMovement.createMany({
        data: s.lines.flatMap((l) => {
          const base = { transactionId, type: "SHIP", productId: l.batch.productId, batchId: l.batchId, orderLineId: l.orderLineId, referenceType: "Shipment", referenceId: s.id, createdById: me.id };
          return [{ ...base, state: "RESERVED" as const, qty: -l.qty }, { ...base, state: "SHIPPED" as const, qty: l.qty }];
        }),
      });
      await tx.shipment.update({
        where: { id: s.id },
        data: { status: "CONFIRMED", shippedAt: new Date(), confirmedById: me.id, deliveryNote: deliveryNote?.trim() || s.deliveryNote || s.number.replace("SHP", "DN") },
      });
      const status = await recomputeOrderStatus(s.orderId, tx);
      const total = s.lines.reduce((a, l) => a + l.qty, 0);
      await audit({ userId: me.id, action: "shipment.confirm", entityType: "Shipment", entityId: s.id, after: { number: s.number, order: s.order.number, pieces: total, orderStatus: status } }, tx);
      await notify({
        type: status === "DELIVERED" ? "order.delivered" : "shipment.confirmed",
        title: status === "DELIVERED" ? `${s.order.number} fully delivered` : `${s.number} dispatched to ${s.customer.name}`,
        body: `${total} pcs · ${s.order.number}`,
        link: `/orders/${s.orderId}`, toPermission: "orders:edit", exceptUserId: me.id,
      }, tx);
      return s.orderId;
    });
    refreshWh(orderId);
    revalidatePath(`/shipments/${shipmentId}`);
  });
}

export async function cancelShipmentAction(shipmentId: string, reason: string) {
  return run(async () => {
    const me = await requirePermission("shipments:edit");
    if (!reason || reason.trim().length < 3) throw new UserError("Please give a reason.");
    const orderId = await db.$transaction(async (tx) => {
      const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { lines: { include: { batch: true } } } });
      if (s.status !== "DRAFT") throw new UserError("Only draft shipments can be cancelled. Confirmed shipments are permanent records.");
      const transactionId = randomUUID();
      // Release whatever is still reserved for this shipment (a QC hold may already have moved some).
      for (const l of s.lines) {
        await lockBatch(tx, l.batchId);
        const reservedHere = (await tx.stockMovement.aggregate({ where: { referenceType: "Shipment", referenceId: s.id, batchId: l.batchId, state: "RESERVED" }, _sum: { qty: true } }))._sum.qty ?? 0;
        const bal = (await getBatchBalances([l.batchId], tx)).get(l.batchId)!;
        const release = Math.min(reservedHere, bal.RESERVED);
        if (release > 0) {
          const base = { transactionId, type: "UNRESERVE", productId: l.batch.productId, batchId: l.batchId, orderLineId: l.orderLineId, referenceType: "Shipment", referenceId: s.id, createdById: me.id };
          await tx.stockMovement.createMany({ data: [{ ...base, state: "RESERVED", qty: -release }, { ...base, state: "AVAILABLE", qty: release }] });
          await syncBatchStock(l.batchId, me.id, `${s.number}: cancelled`, tx); // released pieces go to quarantine if the batch is held now
        }
      }
      await tx.shipment.update({ where: { id: s.id }, data: { status: "CANCELLED", notes: [s.notes, `Cancelled: ${reason.trim()}`].filter(Boolean).join("\n") } });
      await audit({ userId: me.id, action: "shipment.cancel", entityType: "Shipment", entityId: s.id, reason: reason.trim() }, tx);
      return s.orderId;
    });
    refreshWh(orderId);
    revalidatePath(`/shipments/${shipmentId}`);
  });
}
