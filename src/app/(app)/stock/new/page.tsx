import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStock } from "@/lib/stock";
import { PageHeader } from "@/components/ui";
import { DOC_PERM, DOC_TYPES, type DocType } from "../types";
import DocForm from "./doc-form";

export const metadata = { title: "New stock movement" };

export default async function NewStockDocPage({ searchParams }: { searchParams: Promise<{ type?: string; order?: string }> }) {
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
      />
    </>
  );
}
