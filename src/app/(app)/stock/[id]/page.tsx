import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Printer } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStock } from "@/lib/stock";
import { formatDateTime } from "@/lib/time";
import { Alert, Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { DOC_TONE, fmtMoney, fmtQty } from "../types";
import PayForm from "./pay-form";

export const metadata = { title: "Stock movement" };

export default async function StockDocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const me = await pageUser("stock:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const { id } = await params;
  const saved = (await searchParams).saved === "1";
  const d = await db.stockDoc.findUnique({
    where: { id },
    include: { order: { select: { id: true, number: true } }, lines: { orderBy: { createdAt: "asc" }, include: { product: { select: { id: true, code: true, name: true, name2: true, unit: true } } } } },
  });
  if (!d) notFound();
  const [by, stock, payments] = await Promise.all([
    db.user.findUnique({ where: { id: d.createdById }, select: { fullName: true } }),
    getStock(d.lines.map((l) => l.productId)),
    db.cashEntry.findMany({ where: { stockDocId: d.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const payers = await db.user.findMany({ where: { id: { in: [...new Set(payments.map((p) => p.createdById))] } }, select: { id: true, fullName: true } });
  const money = !!d.currency;
  const total = d.lines.reduce((s, l) => s + Math.abs(Number(l.qty)) * Number(l.unitPrice ?? 0), 0);
  const sell = d.type === "SELL";
  const paid = Math.round(payments.reduce((s, p) => s + Math.abs(Number(p.amount)), 0) * 100) / 100;
  const owed = Math.round((total - paid) * 100) / 100;
  const mayPay = sell ? can(me, "stock:sell") || can(me, "cash:in") : can(me, "stock:buy") || can(me, "cash:out");
  const minus = d.lines.filter((l) => (stock.get(l.productId) ?? 0) < 0);

  return (
    <>
      <Link href="/stock" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.stock")}</Link>
      <PageHeader title={d.number} actions={money ? <LinkButton href={`/print/receipt/doc/${d.id}`} target="_blank"><Printer className="size-4" /> {t("rc2.printReceipt")}</LinkButton> : undefined} subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={DOC_TONE[d.type]}>{t(`sd.type.${d.type}`)}</Badge>{formatDateTime(d.createdAt, locale)} · {by?.fullName ?? "—"}</span>} />
      {saved && <div className="mb-3"><Alert tone="green">{t("sd.saved", { number: d.number })}</Alert></div>}
      {minus.length > 0 && <div className="mb-3"><Alert tone="amber">{t("sd.minusNow", { items: minus.map((l) => `${l.product.code} (${fmtQty(stock.get(l.productId) ?? 0)} ${l.product.unit})`).join(", ") })}</Alert></div>}
      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {d.reason && <div><dt className="text-xs text-muted">{t("sd.reasonLabel")}</dt><dd>{t(`sd.reason.${d.reason}`)}</dd></div>}
          {d.party && <div><dt className="text-xs text-muted">{t(d.type === "BUY" ? "sd.supplier" : "sd.customer")}</dt><dd className="font-semibold">{d.party}</dd></div>}
          {d.phone && <div><dt className="text-xs text-muted">{t("sd.phone")}</dt><dd dir="ltr">{d.phone}</dd></div>}
          {d.invoiceNo && <div><dt className="text-xs text-muted">{t("sd.invoice")}</dt><dd dir="ltr">{d.invoiceNo}</dd></div>}
          {d.order && <div><dt className="text-xs text-muted">{t("sd.order")}</dt><dd><Link href={`/orders/${d.order.id}`} className="text-brand-600 hover:underline" dir="ltr">{d.order.number}</Link></dd></div>}
          {money && <div><dt className="text-xs text-muted">{t("sd.total")}</dt><dd className="text-lg font-bold" dir="ltr">{fmtMoney(total)} {d.currency}</dd></div>}
        </dl>
        {d.note && <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{d.note}</p>}
      </Card>
      {money && (
        <Card className="mb-4">
          <h2 className="font-semibold">{t(sell ? "cash.receivedTitle" : "cash.paidTitle")}</h2>
          <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-xs text-muted">{t("sd.total")}</dt><dd className="font-semibold" dir="ltr">{fmtMoney(total)} {d.currency}</dd></div>
            <div><dt className="text-xs text-muted">{t(sell ? "cash.received" : "cash.paid")}</dt><dd className="font-semibold text-green-700 dark:text-green-400" dir="ltr">{fmtMoney(paid)} {d.currency}</dd></div>
            <div><dt className="text-xs text-muted">{t("cash.stillOwed")}</dt><dd className={`font-bold ${owed > 0 ? "text-amber-600" : ""}`} dir="ltr">{fmtMoney(owed)} {d.currency}</dd></div>
          </dl>
          {payments.length > 0 && (
            <ul className="mt-3 divide-y divide-line text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span><span className="font-semibold" dir="ltr">{p.number}</span> · {formatDateTime(p.createdAt, locale)} · {payers.find((u) => u.id === p.createdById)?.fullName ?? "—"}{p.note && ` · ${p.note}`}</span>
                  <span className="flex items-center gap-3">
                    {sell && <Link href={`/print/receipt/payment/${p.id}`} target="_blank" className="text-xs font-semibold text-brand-600 hover:underline">{t("rc2.printShort")}</Link>}
                    <span className="font-semibold tabular-nums" dir="ltr">{fmtMoney(Math.abs(Number(p.amount)))} {p.currency}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {owed > 0 && mayPay && <PayForm docId={d.id} owed={owed} currency={d.currency!} sell={sell} />}
        </Card>
      )}
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
