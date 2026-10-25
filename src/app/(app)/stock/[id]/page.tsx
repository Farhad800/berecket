import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStock } from "@/lib/stock";
import { formatDateTime } from "@/lib/time";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { DOC_TONE, fmtMoney, fmtQty } from "../types";

export const metadata = { title: "Stock movement" };

export default async function StockDocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await pageUser("stock:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const { id } = await params;
  const saved = (await searchParams).saved === "1";
  const d = await db.stockDoc.findUnique({
    where: { id },
    include: { order: { select: { id: true, number: true } }, lines: { orderBy: { createdAt: "asc" }, include: { product: { select: { id: true, code: true, name: true, name2: true, unit: true } } } } },
  });
  if (!d) notFound();
  const [by, stock] = await Promise.all([
    db.user.findUnique({ where: { id: d.createdById }, select: { fullName: true } }),
    getStock(d.lines.map((l) => l.productId)),
  ]);
  const money = !!d.currency;
  const total = d.lines.reduce((s, l) => s + Math.abs(Number(l.qty)) * Number(l.unitPrice ?? 0), 0);
  const minus = d.lines.filter((l) => (stock.get(l.productId) ?? 0) < 0);

  return (
    <>
      <Link href="/stock" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.stock")}</Link>
      <PageHeader title={d.number} subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={DOC_TONE[d.type]}>{t(`sd.type.${d.type}`)}</Badge>{formatDateTime(d.createdAt, locale)} · {by?.fullName ?? "—"}</span>} />
      {saved && <div className="mb-3"><Alert tone="green">{t("sd.saved", { number: d.number })}</Alert></div>}
      {minus.length > 0 && <div className="mb-3"><Alert tone="amber">{t("sd.minusNow", { items: minus.map((l) => `${l.product.code} (${fmtQty(stock.get(l.productId) ?? 0)} ${l.product.unit})`).join(", ") })}</Alert></div>}
      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {d.reason && <div><dt className="text-xs text-muted">{t("sd.reasonLabel")}</dt><dd>{t(`sd.reason.${d.reason}`)}</dd></div>}
          {d.party && <div><dt className="text-xs text-muted">{t(d.type === "BUY" ? "sd.supplier" : "sd.customer")}</dt><dd className="font-semibold">{d.party}</dd></div>}
          {d.invoiceNo && <div><dt className="text-xs text-muted">{t("sd.invoice")}</dt><dd dir="ltr">{d.invoiceNo}</dd></div>}
          {d.order && <div><dt className="text-xs text-muted">{t("sd.order")}</dt><dd><Link href={`/orders/${d.order.id}`} className="text-brand-600 hover:underline" dir="ltr">{d.order.number}</Link></dd></div>}
          {money && <div><dt className="text-xs text-muted">{t("sd.total")}</dt><dd className="text-lg font-bold" dir="ltr">{fmtMoney(total)} {d.currency}</dd></div>}
        </dl>
        {d.note && <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{d.note}</p>}
      </Card>
      <Card className="p-0 sm:p-0">
        <div className="table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-start">{t("wh.item")}</th>
                <th className="px-3 py-2 text-end">{t("order.quantity")}</th>
                {money && <><th className="px-3 py-2 text-end">{t("sd.unitPrice")}</th><th className="px-3 py-2 text-end">{t("sd.lineTotal")}</th></>}
                <th className="px-4 py-2 text-end">{t("sd.stockNow")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.lines.map((l) => {
                const q = Math.abs(Number(l.qty)), now = stock.get(l.productId) ?? 0;
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-2"><Link href={`/products/${l.product.id}`} className="font-medium hover:underline">{l.product.name}</Link><div className="text-xs text-muted" dir="ltr">{[l.product.code, l.product.name2].filter(Boolean).join(" · ")}</div></td>
                    <td className="px-3 py-2 text-end tabular-nums" dir="ltr">{Number(l.qty) < 0 ? "−" : "+"}{fmtQty(q)} {l.product.unit}</td>
                    {money && <><td className="px-3 py-2 text-end tabular-nums" dir="ltr">{fmtMoney(Number(l.unitPrice ?? 0))}</td><td className="px-3 py-2 text-end font-semibold tabular-nums" dir="ltr">{fmtMoney(q * Number(l.unitPrice ?? 0))}</td></>}
                    <td className={`px-4 py-2 text-end tabular-nums ${now < 0 ? "font-bold text-red-600" : ""}`} dir="ltr">{fmtQty(now)}</td>
                  </tr>
                );
              })}
            </tbody>
            {money && <tfoot><tr className="border-t border-line font-bold"><td className="px-4 py-2" colSpan={3}>{t("sd.total")}</td><td className="px-3 py-2 text-end" dir="ltr">{fmtMoney(total)} {d.currency}</td><td /></tr></tfoot>}
          </table>
        </div>
      </Card>
    </>
  );
}
