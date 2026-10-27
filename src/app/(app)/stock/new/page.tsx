import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { canSeeMoney, can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStock } from "@/lib/stock";
import { PageHeader } from "@/components/ui";
import { DOC_PERM, DOC_TYPES, type DocType } from "../types";
import DocForm, { type CustomerOpt, type EditDoc } from "./doc-form";
import { notFound } from "next/navigation";
import { customerBalances } from "@/lib/customers";
import { listSafes } from "@/lib/cash";

export const metadata = { title: "New stock movement" };

export default async function NewStockDocPage({ searchParams }: { searchParams: Promise<{ type?: string; order?: string; customer?: string; supplier?: string; edit?: string }> }) {
  const me = await pageUser("stock:view");
  const t = await getTranslations();
  const sp = await searchParams;
  const allowed = DOC_TYPES.filter((d) => can(me, DOC_PERM[d]));
  if (allowed.length === 0) redirect("/forbidden");
  // Editing a saved receipt (same number): whoever may make that type may change it.
  let edit: EditDoc | undefined;
  if (sp.edit) {
    const d = await db.stockDoc.findUnique({ where: { id: sp.edit }, include: { lines: { orderBy: { createdAt: "asc" } }, payments: { select: { amount: true } } } });
    if (!d) notFound();
    if (!allowed.includes(d.type as DocType)) redirect("/forbidden");
    const num = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));
    edit = {
      id: d.id, number: d.number, type: d.type as DocType, reason: d.reason ?? "", customerId: d.customerId ?? "", phone: d.phone ?? "", supplierRef: d.supplierRef ?? "", delivery: d.delivery ?? "",
      currency: (d.currency ?? "IQD") as EditDoc["currency"], rate: num(d.rate), orderId: d.orderId ?? "", note: d.note ?? "",
      invKind: d.discountKind ?? "PERCENT", invDisc: num(d.discountValue), paid: Math.round(d.payments.reduce((x, p) => x + Math.abs(Number(p.amount)), 0) * 100) / 100,
      lines: d.lines.map((l) => ({ itemId: l.productId, qty: String(Math.abs(Number(l.qty))), price: num(l.unitPrice), discKind: l.discountKind ?? "PERCENT", disc: num(l.discountValue) })),
    };
  }
  const type = allowed.includes(sp.type as DocType) ? (sp.type as DocType) : allowed[0];
  const [items, orders] = await Promise.all([
    db.product.findMany({ where: { OR: [{ archivedAt: null }, ...(edit ? [{ id: { in: edit.lines.map((l) => l.itemId) } }] : [])] }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, name2: true, unit: true, kind: true } }),
    db.order.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, number: true, lines: { select: { productId: true, quantity: true } } } }),
  ]);
  const stock = await getStock();
  // Buy / Sell: customer accounts with their balance now (only for people who may buy or sell — they see money).
  let customers: CustomerOpt[] = [];
  if (allowed.includes("SELL") || allowed.includes("BUY")) {
    const list = await db.customer.findMany({ where: { OR: [{ archivedAt: null }, ...(edit?.customerId ? [{ id: edit.customerId }] : [])] }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, phone: true, address: true } });
    const bal = await customerBalances(list.map((c) => c.id));
    customers = list.map((c) => ({ ...c, balance: bal.get(c.id) ?? { IQD: 0, USD: 0, EUR: 0 } }));
  }
  // Buy / Sell: the safes the paid-now money can go into / come out of (balances only for people who see the safe).
  const safes = allowed.includes("BUY") || allowed.includes("SELL") ? await listSafes(can(me, "cash:view")) : [];
  return (
    <>
      <Link href="/stock" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.stock")}</Link>
      <PageHeader title={edit ? t("sd.editTitle", { number: edit.number }) : t("sd.newTitle")} />
      <DocForm
        allowed={allowed}
        initialType={type}
        initialOrder={orders.some((o) => o.id === sp.order) ? sp.order! : ""}
        items={items.map((i) => ({ ...i, stock: stock.get(i.id) ?? 0 }))}
        orders={orders.map((o) => ({ id: o.id, number: o.number, lines: o.lines }))}
        customers={customers}
        initialCustomer={customers.some((c) => c.id === (sp.customer ?? sp.supplier)) ? (sp.customer ?? sp.supplier)! : ""}
        safes={safes}
        canCost={canSeeMoney(me)}
        edit={edit}
      />
    </>
  );
}
