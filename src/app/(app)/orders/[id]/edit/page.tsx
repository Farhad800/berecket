import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { toFactoryDateInput } from "@/lib/time";
import { getLineProgress } from "@/lib/orders";
import { PageHeader } from "@/components/ui";
import OrderForm from "../../order-form";

export const metadata = { title: "Edit order" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageUser("orders:edit");
  const { id } = await params;
  const t = await getTranslations();
  const order = await db.order.findUnique({ where: { id }, include: { lines: { orderBy: { lineNo: "asc" }, include: { jobs: { select: { status: true } } } } } });
  if (!order) notFound();
  if (["DELIVERED", "CANCELLED"].includes(order.status)) redirect(`/orders/${id}`);

  const [customers, products, progress] = await Promise.all([
    db.customer.findMany({ where: { OR: [{ archivedAt: null }, { id: order.customerId }] }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    db.product.findMany({ where: { OR: [{ archivedAt: null }, { id: { in: order.lines.map((l) => l.productId) } }] }, orderBy: { code: "asc" }, select: { id: true, name: true, code: true, specifications: true } }),
    getLineProgress([id]),
  ]);

  return (
    <>
      <PageHeader title={`${t("common.edit")} · ${order.number}`} />
      <OrderForm
        canConfirm={can(me, "orders:approve")}
        customers={customers.map((c) => ({ value: c.id, label: c.name, hint: c.code }))}
        products={products.map((p) => ({ value: p.id, label: p.name, hint: p.code, specs: p.specifications ?? "" }))}
        initial={{
          id: order.id,
          status: order.status,
          customerId: order.customerId,
          customerReference: order.customerReference ?? "",
          priority: order.priority,
          requestedDeliveryDate: toFactoryDateInput(order.requestedDeliveryDate),
          plannedStart: toFactoryDateInput(order.plannedStart),
          plannedEnd: toFactoryDateInput(order.plannedEnd),
          instructions: order.instructions ?? "",
          packaging: order.packaging ?? "",
          notes: order.notes ?? "",
          lines: order.lines.map((l) => {
            const p = progress.get(l.id);
            return {
              lineId: l.id,
              productId: l.productId,
              quantity: String(l.quantity),
              specifications: l.specifications ?? "",
              // Product can't be swapped once production is planned or started on that line.
              locked: l.jobs.some((j) => j.status !== "CANCELLED") || (p?.produced ?? 0) > 0,
            };
          }),
        }}
      />
    </>
  );
}
