import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStock } from "@/lib/stock";
import { PageHeader } from "@/components/ui";
import { DOC_PERM, DOC_TYPES, type DocType } from "../types";
import DocForm, { type CustomerOpt } from "./doc-form";
import { customerBalances } from "@/lib/customers";
import { supplierBalances } from "@/lib/suppliers";
import { listSafes } from "@/lib/cash";

export const metadata = { title: "New stock movement" };

export default async function NewStockDocPage({ searchParams }: { searchParams: Promise<{ type?: string; order?: string; customer?: string; supplier?: string }> }) {
  const me = await pageUser("stock:view");
  const t = await getTranslations();
  const sp = await searchParams;
  const allowed = DOC_TYPES.filter((d) => can(me, DOC_PERM[d]));
  if (allowed.length === 0) redirect("/forbidden");
  const type = allowed.includes(sp.type as DocType) ? (sp.type as DocType) : allowed[0];
  const [items, orders] = await Promise.all([
    db.product.findMany({ where: { archivedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, name2: true, unit: true, kind: true } }),
    db.order.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, number: true, lines: { select: { productId: true, quantity: true } } } }),
  ]);
  const stock = await getStock();
  // Sell: customer accounts with their balance now (only for people who may sell — they see money).
  let customers: CustomerOpt[] = [];
  if (allowed.includes("SELL")) {
    const list = await db.customer.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, phone: true, address: true } });
    const bal = await customerBalances(list.map((c) => c.id));
    customers = list.map((c) => ({ ...c, balance: bal.get(c.id) ?? { IQD: 0, USD: 0, EUR: 0 } }));
  }
  // Buy: supplier accounts with what the factory owes each now (only for people who may buy — they see money).
  let suppliers: CustomerOpt[] = [];
  if (allowed.includes("BUY")) {
    const list = await db.supplier.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, phone: true, address: true } });
    const bal = await supplierBalances(list.map((c) => c.id));
    suppliers = list.map((c) => ({ ...c, balance: bal.get(c.id) ?? { IQD: 0, USD: 0, EUR: 0 } }));
  }
  // Buy / Sell: the safes the paid-now money can go into / come out of (balances only for people who see the safe).
  const safes = allowed.includes("BUY") || allowed.includes("SELL") ? await listSafes(can(me, "cash:view")) : [];
  return (
    <>
      <Link href="/stock" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.stock")}</Link>
      <PageHeader title={t("sd.newTitle")} />
      <DocForm
        allowed={allowed}
        initialType={type}
        initialOrder={orders.some((o) => o.id === sp.order) ? sp.order! : ""}
        items={items.map((i) => ({ ...i, stock: stock.get(i.id) ?? 0 }))}
        orders={orders.map((o) => ({ id: o.id, number: o.number, lines: o.lines }))}
        customers={customers}
        initialCustomer={customers.some((c) => c.id === sp.customer) ? sp.customer! : ""}
        suppliers={suppliers}
        initialSupplier={suppliers.some((c) => c.id === sp.supplier) ? sp.supplier! : ""}
        safes={safes}
      />
    </>
  );
}
