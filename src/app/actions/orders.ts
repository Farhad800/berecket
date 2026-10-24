"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, formObject, UserError } from "@/lib/action";
import { nextNumber } from "@/lib/numbering";
import { notify } from "@/lib/notify";

/**
 * An order is a sheet the Sales Manager gives to production: products and amounts.
 * (No customer, dates or priority — owner's decision, 23 Oct 2026.)
 */
const lineSchema = z.object({
  productId: z.string().min(1, "Choose a product"),
  quantity: z.coerce.number().int("Whole pieces only").positive("Must be more than 0").max(100_000_000),
});

function parseLines(raw: Record<string, unknown>) {
  const ids = ([] as unknown[]).concat(raw.productId ?? []) as string[];
  const qtys = ([] as unknown[]).concat(raw.quantity ?? []) as string[];
  const lines = ids.map((productId, i) => ({ productId, quantity: qtys[i] })).filter((l) => l.productId || l.quantity);
  const parsed = lines.map((l, i) => {
    const r = lineSchema.safeParse(l);
    if (!r.success) throw new UserError(`Line ${i + 1}: ${r.error.issues[0].message}`);
    return r.data;
  });
  if (parsed.length === 0) throw new UserError("Add at least one product.");
  if (parsed.length > 500) throw new UserError("An order can have up to 500 products.");
  // The same product twice on one sheet is almost always a typing mistake.
  const seen = new Set<string>();
  for (const l of parsed) {
    if (seen.has(l.productId)) throw new UserError("The same product is on the sheet twice. Add the amounts together on one line.");
    seen.add(l.productId);
  }
  return parsed;
}

async function checkProducts(ids: string[]) {
  const found = await db.product.count({ where: { id: { in: ids }, archivedAt: null, kind: "PRODUCT" } });
  if (found !== ids.length) throw new UserError("One of the products is archived or doesn't exist.");
}

export async function createOrderAction(_: unknown, fd: FormData) {
  const res = await run(async () => {
    const me = await requirePermission("orders:create");
    const lines = parseLines(formObject(fd));
    await checkProducts(lines.map((l) => l.productId));
    const order = await db.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          number: await nextNumber("order", tx),
          createdById: me.id,
          lines: { create: lines.map((l, i) => ({ lineNo: i + 1, productId: l.productId, quantity: l.quantity })) },
        },
      });
      const pieces = lines.reduce((s, l) => s + l.quantity, 0);
      await audit({ userId: me.id, action: "order.create", entityType: "Order", entityId: o.id, after: { number: o.number, products: lines.length, pieces } }, tx);
      await notify({
        type: "order.new", data: { number: o.number, products: lines.length, pcs: pieces, by: me.fullName },
        link: `/orders/${o.id}`, toPermission: "orders:view", exceptUserId: me.id,
      }, tx);
      return o;
    });
    revalidatePath("/orders");
    revalidatePath("/dashboard");
    return order.id;
  });
  if (res.ok) redirect(`/orders/${res.data}`);
  return res;
}

export async function updateOrderAction(_: unknown, fd: FormData) {
  const res = await run(async () => {
    const me = await requirePermission("orders:edit");
    const raw = formObject(fd);
    const id = z.string().min(1).parse(raw.id);
    const lines = parseLines(raw);
    await checkProducts(lines.map((l) => l.productId));
    await db.$transaction(async (tx) => {
      const before = await tx.order.findUniqueOrThrow({ where: { id }, include: { lines: { include: { product: { select: { code: true } } } } } });
      if (before.status !== "OPEN") throw new UserError("Only open orders can be changed.");
      await tx.orderLine.deleteMany({ where: { orderId: id } });
      await tx.orderLine.createMany({ data: lines.map((l, i) => ({ orderId: id, lineNo: i + 1, productId: l.productId, quantity: l.quantity })) });
      const products = await tx.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } }, select: { id: true, code: true } });
      const code = (pid: string) => products.find((p) => p.id === pid)?.code ?? pid;
      await audit({
        userId: me.id, action: "order.update", entityType: "Order", entityId: id,
        before: { lines: before.lines.map((l) => `${l.product.code} × ${l.quantity}`) },
        after: { lines: lines.map((l) => `${code(l.productId)} × ${l.quantity}`) },
      }, tx);
      await notify({
        type: "order.changed", data: { number: before.number, products: lines.length, pcs: lines.reduce((s, l) => s + l.quantity, 0), by: me.fullName },
        link: `/orders/${id}`, toPermission: "orders:view", exceptUserId: me.id,
      }, tx);
    });
    revalidatePath(`/orders/${id}`);
    revalidatePath("/orders");
    return id;
  });
  if (res.ok) redirect(`/orders/${res.data}`);
  return res;
}

/** Open → Completed / Cancelled, and back to Open if closed by mistake. */
export async function orderTransitionAction(orderId: string, action: "complete" | "cancel" | "reopen", reason?: string) {
  return run(async () => {
    const me = await requirePermission(action === "complete" ? "orders:edit" : "orders:approve");
    const why = reason?.trim();
    if (action !== "complete" && (!why || why.length < 3)) throw new UserError("Please give a reason.");
    await db.$transaction(async (tx) => {
      const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (action === "reopen") {
        if (o.status === "OPEN") throw new UserError("This order is already open.");
        await tx.order.update({ where: { id: orderId }, data: { status: "OPEN", completedAt: null, cancelledAt: null } });
      } else {
        if (o.status !== "OPEN") throw new UserError("Only open orders can be completed or cancelled.");
        await tx.order.update({
          where: { id: orderId },
          data: action === "complete" ? { status: "COMPLETED", completedAt: new Date() } : { status: "CANCELLED", cancelledAt: new Date() },
        });
      }
      await audit({ userId: me.id, action: `order.${action}`, entityType: "Order", entityId: orderId, reason: why || null, before: { status: o.status } }, tx);
      await notify({
        type: action === "complete" ? "order.completed" : action === "cancel" ? "order.cancelled" : "order.reopened",
        data: { number: o.number, by: me.fullName, reason: why || "—" }, link: `/orders/${orderId}`, toPermission: "orders:view", exceptUserId: me.id,
      }, tx);
    });
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
    revalidatePath("/dashboard");
  });
}

/** Removes an order sheet completely (e.g. entered twice). A record stays in the audit log. */
export async function deleteOrderAction(orderId: string, reason?: string) {
  const res = await run(async () => {
    const me = await requirePermission("orders:archive");
    const why = reason?.trim();
    if (!why || why.length < 3) throw new UserError("Please give a reason.");
    await db.$transaction(async (tx) => {
      const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { lines: { include: { product: { select: { code: true } } } } } });
      await tx.comment.deleteMany({ where: { entityType: "Order", entityId: orderId } });
      await tx.notification.deleteMany({ where: { link: `/orders/${orderId}` } });
      await tx.order.delete({ where: { id: orderId } });
      await audit({
        userId: me.id, action: "order.delete", entityType: "Order", entityId: orderId, reason: why,
        before: { number: o.number, status: o.status, lines: o.lines.map((l) => `${l.product.code} × ${l.quantity}`) },
      }, tx);
      await notify({ type: "order.deleted", data: { number: o.number, by: me.fullName, reason: why }, link: "/orders", toPermission: "orders:view", exceptUserId: me.id }, tx);
    });
    revalidatePath("/orders");
    revalidatePath("/dashboard");
  });
  if (res.ok) redirect("/orders?deleted=1");
  return res;
}

const commentSchema = z.object({
  entityType: z.enum(["Order", "MaintenanceRequest", "QualityIssue"]),
  entityId: z.string().min(1),
  body: z.string().trim().min(1, "Write a comment").max(4000),
});

export async function addCommentAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requireUser();
    const v = commentSchema.parse(formObject(fd));
    const perm = ({ Order: "orders:view", MaintenanceRequest: "maintenance:view", QualityIssue: "qc:view" } as const)[v.entityType];
    if (!me.permissions.has(perm)) throw new UserError("You don't have permission to comment here.");
    const exists =
      v.entityType === "Order" ? await db.order.count({ where: { id: v.entityId } })
      : v.entityType === "MaintenanceRequest" ? await db.maintenanceRequest.count({ where: { id: v.entityId } })
      : await db.qualityIssue.count({ where: { id: v.entityId } });
    if (!exists) throw new UserError("That record no longer exists.");
    await db.comment.create({ data: { ...v, authorId: me.id } });
    revalidatePath(
      v.entityType === "Order" ? `/orders/${v.entityId}` : v.entityType === "MaintenanceRequest" ? `/service/requests/${v.entityId}` : `/qc/issues/${v.entityId}`,
    );
  });
}
