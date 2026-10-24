import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import OrderForm from "../../order-form";

export const metadata = { title: "Edit order" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await pageUser("orders:edit");
  const { id } = await params;
  const t = await getTranslations();
  const order = await db.order.findUnique({ where: { id }, include: { lines: true } });
  if (!order) notFound();
  if (order.status !== "OPEN") redirect(`/orders/${id}`);
  const products = await db.product.findMany({
    where: { OR: [{ archivedAt: null, kind: "PRODUCT" }, { id: { in: order.lines.map((l) => l.productId) } }] },
    orderBy: [{ mold: { code: "asc" } }, { code: "asc" }],
    select: { id: true, name: true, name2: true, code: true, mold: { select: { code: true } } },
  });
  return (
    <>
      <PageHeader title={`${t("common.edit")} · ${order.number}`} />
      <OrderForm products={products.map((p) => ({ ...p, mold: p.mold?.code }))} initial={{ id: order.id, quantities: Object.fromEntries(order.lines.map((l) => [l.productId, l.quantity])) }} />
    </>
  );
}
