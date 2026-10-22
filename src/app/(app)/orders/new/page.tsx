import { getTranslations } from "next-intl/server";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, EmptyState, LinkButton } from "@/components/ui";
import OrderForm from "../order-form";

export const metadata = { title: "New order" };

export default async function NewOrderPage() {
  const me = await pageUser("orders:create");
  const t = await getTranslations();
  const [customers, products] = await Promise.all([
    db.customer.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    db.product.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, name: true, code: true, specifications: true } }),
  ]);

  if (customers.length === 0 || products.length === 0) {
    return (
      <>
        <PageHeader title={t("order.new")} />
        <EmptyState>
          <p className="mb-3">{t("order.needMasterData")}</p>
          <div className="flex justify-center gap-2">
            {customers.length === 0 && <LinkButton href="/customers" variant="secondary">{t("nav.customers")}</LinkButton>}
            {products.length === 0 && <LinkButton href="/products" variant="secondary">{t("nav.products")}</LinkButton>}
          </div>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("order.new")} subtitle={t("order.newHint")} />
      <OrderForm
        canConfirm={can(me, "orders:approve")}
        customers={customers.map((c) => ({ value: c.id, label: c.name, hint: c.code }))}
        products={products.map((p) => ({ value: p.id, label: p.name, hint: p.code, specs: p.specifications ?? "" }))}
      />
    </>
  );
}
