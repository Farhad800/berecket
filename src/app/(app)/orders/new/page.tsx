import { getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, EmptyState, LinkButton } from "@/components/ui";
import OrderForm from "../order-form";

export const metadata = { title: "New order" };

export default async function NewOrderPage() {
  await pageUser("orders:create");
  const t = await getTranslations();
  const products = await db.product.findMany({ where: { archivedAt: null, kind: "PRODUCT" }, orderBy: [{ mold: { code: "asc" } }, { code: "asc" }], select: { id: true, name: true, name2: true, code: true, mold: { select: { code: true } } } });
  if (products.length === 0) {
    return (
      <>
        <PageHeader title={t("order.new")} />
        <EmptyState>
          <p className="mb-3">{t("order.needProducts")}</p>
          <LinkButton href="/products" variant="secondary">{t("nav.products")}</LinkButton>
        </EmptyState>
      </>
    );
  }
  return (
    <>
      <PageHeader title={t("order.new")} subtitle={t("order.newHint")} />
      <OrderForm products={products.map((p) => ({ ...p, mold: p.mold?.code }))} />
    </>
  );
}
