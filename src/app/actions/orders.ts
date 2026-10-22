"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, formObject, UserError } from "@/lib/action";
import { nextNumber } from "@/lib/numbering";
import { parseFactoryDate } from "@/lib/time";
import { getLineProgress, recomputeOrderStatus, OPEN_STATUSES } from "@/lib/orders";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const optDate = dateStr.optional();

const headerSchema = z.object({
  customerId: z.string().min(1, "Choose a customer"),
  customerReference: z.string().trim().max(80).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  requestedDeliveryDate: dateStr,
  plannedStart: optDate,
  plannedEnd: optDate,
  instructions: z.string().trim().max(4000).optional(),
  packaging: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(4000).optional(),
});

const lineSchema = z.object({
  lineId: z.string().optional(),
  productId: z.string().min(1, "Choose a product"),
  quantity: z.coerce.number().int("Whole pieces only").positive("Must be more than 0").max(100_000_000),
  specifications: z.string().trim().max(2000).optional(),
});

function parseLines(raw: Record<string, unknown>) {
  const arr = (k: string) => (raw[k] as (string | undefined)[] | undefined) ?? [];
  const productIds = arr("productId");
  const lines = productIds.map((_, i) => ({
    lineId: arr("lineId")[i],
    productId: arr("productId")[i],
    quantity: arr("quantity")[i],
    specifications: arr("specifications")[i],
  }));
  const parsed = lines.filter((l) => l.productId || l.quantity).map((l, i) => {
    const r = lineSchema.safeParse(l);
    if (!r.success) throw new UserError(`Product line ${i + 1}: ${r.error.issues[0].message}`);
    return r.data;
  });
  if (parsed.length === 0) throw new UserError("Add at least one product line.");
  return parsed;
}

function headerData(v: z.infer<typeof headerSchema>) {
  const plannedStart = v.plannedStart ? parseFactoryDate(v.plannedStart) : null;
  const plannedEnd = v.plannedEnd ? parseFactoryDate(v.plannedEnd) : null;
  if (plannedStart && plannedEnd && plannedEnd < plannedStart) throw new UserError("Planned finish is before planned start.");
  return {
    customerId: v.customerId,
    customerReference: v.customerReference ?? null,
    priority: v.priority,
    requestedDeliveryDate: parseFactoryDate(v.requestedDeliveryDate),
    plannedStart,
    plannedEnd,
    instructions: v.instructions ?? null,
    packaging: v.packaging ?? null,
    notes: v.notes ?? null,
  };
}

export async function createOrderAction(_: unknown, fd: FormData) {
  let id = "";
  const res = await run(async () => {
    const raw = formObject(fd);
    const confirm = raw.intent === "confirm";
    const me = await requirePermission(confirm ? "orders:approve" : "orders:create");
    if (confirm && !me.permissions.has("orders:create")) throw new UserError("You don't have permission to create orders.");
    const header = headerData(headerSchema.parse(raw));
    const lines = parseLines(raw);
    const customer = await db.customer.findUnique({ where: { id: header.customerId } });
    if (!customer || customer.archivedAt) throw new UserError("That customer is archived or doesn't exist.");

    const order = await db.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { id: { in: lines.map((l) => l.productId) }, archivedAt: null } });
      if (products.length !== new Set(lines.map((l) => l.productId)).size) throw new UserError("One of the products is archived or doesn't exist.");
      const o = await tx.order.create({
        data: {
          ...header,
          number: await nextNumber("order", tx),
          status: confirm ? "CONFIRMED" : "DRAFT",
          confirmedAt: confirm ? new Date() : null,
          createdById: me.id,
          lines: {
            create: lines.map((l, i) => ({
              lineNo: i + 1,
              productId: l.productId,
              quantity: l.quantity,
              specifications: l.specifications ?? null,
              unit: products.find((p) => p.id === l.productId)?.unit ?? "pcs",
            })),
          },
        },
      });
      await audit({ userId: me.id, action: confirm ? "order.create_confirm" : "order.create", entityType: "Order", entityId: o.id, after: { number: o.number, lines: lines.length } }, tx);
      if (confirm) await recomputeOrderStatus(o.id, tx);
      return o;
    });
    id = order.id;
  });
  if (res.ok) {
    revalidatePath("/orders");
    redirect(`/orders/${id}`);
  }
  return res;
}

export async function updateOrderAction(_: unknown, fd: FormData) {
  const raw = formObject(fd);
  const id = String(raw.id ?? "");
  const res = await run(async () => {
    const me = await requirePermission("orders:edit");
    const header = headerData(headerSchema.parse(raw));
    const reason = (raw.reason as string | undefined)?.trim();
    const lines = parseLines(raw);

    await db.$transaction(async (tx) => {
      const before = await tx.order.findUniqueOrThrow({ where: { id }, include: { lines: { include: { jobs: true } } } });
      if (["DELIVERED", "CANCELLED"].includes(before.status)) throw new UserError("Delivered or cancelled orders can't be edited.");

      const deadlineMoved = before.requestedDeliveryDate.getTime() !== header.requestedDeliveryDate.getTime();
      const datesMoved =
        deadlineMoved ||
        before.plannedStart?.getTime() !== header.plannedStart?.getTime() ||
        before.plannedEnd?.getTime() !== header.plannedEnd?.getTime();
      if (before.status !== "DRAFT" && datesMoved && !reason) {
        throw new UserError("Please give a reason for changing the dates of a confirmed order.");
      }

      const progress = await getLineProgress([id], tx);
      const keepIds = new Set(lines.map((l) => l.lineId).filter(Boolean));
      // Lines removed by the user: only allowed if nothing has happened on them yet.
      for (const old of before.lines) {
        if (keepIds.has(old.id)) continue;
        const p = progress.get(old.id);
        if (old.jobs.some((j) => j.status !== "CANCELLED") || (p && (p.produced > 0 || p.shipped > 0))) {
          throw new UserError(`Line ${old.lineNo} already has production or shipments and can't be removed.`);
        }
        await tx.orderLine.delete({ where: { id: old.id } });
      }
      let nextNo = Math.max(0, ...before.lines.map((l) => l.lineNo)) + 1;
      for (const l of lines) {
        if (l.lineId) {
          const old = before.lines.find((x) => x.id === l.lineId);
          if (!old) throw new UserError("A product line no longer exists. Reload the page.");
          const p = progress.get(old.id);
          const floor = p?.shipped ?? 0;
          if (l.quantity < floor) throw new UserError(`Line ${old.lineNo}: quantity can't be below the ${floor} already shipped.`);
          if (old.productId !== l.productId && (old.jobs.length > 0 || (p?.produced ?? 0) > 0)) {
            throw new UserError(`Line ${old.lineNo}: product can't change once production is planned.`);
          }
          await tx.orderLine.update({ where: { id: old.id }, data: { productId: l.productId, quantity: l.quantity, specifications: l.specifications ?? null } });
        } else {
          await tx.orderLine.create({ data: { orderId: id, lineNo: nextNo++, productId: l.productId, quantity: l.quantity, specifications: l.specifications ?? null } });
        }
      }
      await tx.order.update({ where: { id }, data: header });

      const iso = (d: Date | null) => d?.toISOString() ?? null;
      await audit({
        userId: me.id,
        action: deadlineMoved ? "order.deadline_change" : "order.update",
        entityType: "Order",
        entityId: id,
        reason: reason ?? null,
        before: { requestedDeliveryDate: iso(before.requestedDeliveryDate), plannedStart: iso(before.plannedStart), plannedEnd: iso(before.plannedEnd), priority: before.priority, lines: before.lines.map((l) => ({ no: l.lineNo, qty: l.quantity })) },
        after: { requestedDeliveryDate: iso(header.requestedDeliveryDate), plannedStart: iso(header.plannedStart), plannedEnd: iso(header.plannedEnd), priority: header.priority, lines: lines.map((l) => ({ qty: l.quantity })) },
      }, tx);
      await recomputeOrderStatus(id, tx);
    });
  });
  if (res.ok) {
    revalidatePath(`/orders/${id}`);
    revalidatePath("/orders");
    redirect(`/orders/${id}`);
  }
  return res;
}

/** Status changes a person makes deliberately. Everything else is calculated. */
export async function orderTransitionAction(
  orderId: string,
  action: "confirm" | "hold" | "resume" | "cancel" | "close",
  reason?: string,
) {
  return run(async () => {
    const perm = action === "close" || action === "confirm" ? "orders:approve" : "orders:edit";
    const me = await requirePermission(perm);
    const why = reason?.trim();
    if (["hold", "cancel", "close"].includes(action) && (!why || why.length < 3)) throw new UserError("Please give a reason.");

    await db.$transaction(async (tx) => {
      const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { lines: { select: { id: true } } } });
      const progress = await getLineProgress([orderId], tx);
      const anyShipped = [...progress.values()].some((p) => p.shipped > 0);
      const anyProduced = [...progress.values()].some((p) => p.produced > 0);

      switch (action) {
        case "confirm":
          if (o.status !== "DRAFT") throw new UserError("Only draft orders can be confirmed.");
          if (o.lines.length === 0) throw new UserError("Add at least one product line first.");
          await tx.order.update({ where: { id: orderId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
          await recomputeOrderStatus(orderId, tx);
          break;
        case "hold":
          if (!OPEN_STATUSES.includes(o.status) || o.status === "ON_HOLD") throw new UserError("This order can't be put on hold now.");
          await tx.order.update({ where: { id: orderId }, data: { status: "ON_HOLD" } });
          break;
        case "resume":
          if (o.status !== "ON_HOLD") throw new UserError("This order isn't on hold.");
          await tx.order.update({ where: { id: orderId }, data: { status: "CONFIRMED" } });
          await recomputeOrderStatus(orderId, tx);
          break;
        case "cancel":
          if (["DELIVERED", "CANCELLED"].includes(o.status)) throw new UserError("This order is already closed.");
          if (anyShipped) throw new UserError("Goods have already been shipped. Use 'Close with exception' instead.");
          await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
          // Planned jobs that never started are cancelled with it; running jobs must be stopped by Production.
          await tx.productionJob.updateMany({ where: { orderLine: { orderId }, status: "PLANNED" }, data: { status: "CANCELLED" } });
          break;
        case "close":
          if (!OPEN_STATUSES.includes(o.status) || o.status === "DRAFT") throw new UserError("Only open orders can be closed.");
          if (!anyShipped && !anyProduced) throw new UserError("Nothing has been produced or shipped. Cancel the order instead.");
          await tx.order.update({ where: { id: orderId }, data: { deliveryException: why, status: "DELIVERED", deliveredAt: new Date() } });
          break;
      }
      await audit({ userId: me.id, action: `order.${action}`, entityType: "Order", entityId: orderId, reason: why ?? null, before: { status: o.status } }, tx);
    });
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
  });
}

const commentSchema = z.object({
  entityType: z.enum(["Order", "MaintenanceRequest", "QualityIssue"]),
  entityId: z.string().min(1),
  body: z.string().trim().min(1, "Write a comment").max(4000),
});

/** Any signed-in employee who can see a record may comment on it. */
export async function addCommentAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requireUser();
    const v = commentSchema.parse(formObject(fd));
    const perm = { Order: "orders:view", MaintenanceRequest: "maintenance:view", QualityIssue: "qc:view" }[v.entityType];
    if (!me.permissions.has(perm)) throw new UserError("You don't have permission to comment here.");
    const exists =
      v.entityType === "Order" ? await db.order.count({ where: { id: v.entityId } })
      : v.entityType === "MaintenanceRequest" ? await db.maintenanceRequest.count({ where: { id: v.entityId } })
      : await db.qualityIssue.count({ where: { id: v.entityId } });
    if (!exists) throw new UserError("That record no longer exists.");
    await db.comment.create({ data: { ...v, authorId: me.id } });
    if (v.entityType === "Order") revalidatePath(`/orders/${v.entityId}`);
  });
}
