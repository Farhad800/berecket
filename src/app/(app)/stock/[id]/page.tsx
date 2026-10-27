import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import { can, canSeeMoney, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStock } from "@/lib/stock";
import { formatDateTime } from "@/lib/time";
import { Alert, Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { DOC_PERM, DOC_TONE, fmtMoney, fmtQty, type DocType } from "../types";
import { docTotal, fmtPrice, lineTotal } from "@/lib/money";
import PayForm from "./pay-form";
import { customerBalance } from "@/lib/customers";
import { listSafes } from "@/lib/cash";

export const metadata = { title: "Stock movement" };

export default async function StockDocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const me = await pageUser("stock:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const { id } = await params;
  const saved = (await searchParams).saved === "1";
  const d = await db.stockDoc.findUnique({
    where: { id },
    include: { order: { select: { id: true, number: true } }, customer: { select: { id: true, code: true, name: true } }, lines: { orderBy: { createdAt: "asc" }, include: { product: { select: { id: true, code: true, name: true, name2: true, unit: true } } } } },
  });
  if (!d) notFound();
  const [by, stock, payments] = await Promise.all([
    db.user.findUnique({ where: { id: d.createdById }, select: { fullName: true } }),
    getStock(d.lines.map((l) => l.productId)),
    canSeeMoney(me) ? db.cashEntry.findMany({ where: { stockDocId: d.id }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
  ]);
  const payers = await db.user.findMany({ where: { id: { in: [...new Set(payments.map((p) => p.createdById))] } }, select: { id: true, fullName: true } });
  // Prices, totals, payments and the receipt only for people who buy, sell or see the safe (M3).
  const money = !!d.currency && (d.type === "BUY" || d.type === "SELL") && canSeeMoney(me);
  const costed = d.type === "INPUT" && !!d.currency && canSeeMoney(me); // an Input with a cost per line (batches)
  // The stored total is what payments are checked against; older documents fall back to the lines.
  const total = d.total !== null ? Number(d.total) : docTotal(d.lines.map((l) => ({ qty: Math.abs(Number(l.qty)), price: Number(l.unitPrice ?? 0) })));
  const sell = d.type === "SELL";
  const paid = Math.round(payments.reduce((s, p) => s + Math.abs(Number(p.amount)), 0) * 100) / 100;
  const owed = Math.round((total - paid) * 100) / 100;
  const mayPay = sell ? can(me, "stock:sell") || can(me, "cash:in") : can(me, "stock:buy") || can(me, "cash:out");
  const balance = money && d.currency && d.customerId ? (await customerBalance(d.customerId))[d.currency] : null;
  // Whoever may make this type of receipt may change it; a priced one only by people who see money.
  const mayEdit = can(me, DOC_PERM[d.type as DocType]) && (canSeeMoney(me) || !d.lines.some((l) => l.unitPrice !== null));
  const hasLineDisc = d.lines.some((l) => Number(l.discount ?? 0) > 0);
  const minus = d.lines.filter((l) => (stock.get(l.productId) ?? 0) < 0);

  return (
    <>
      <Link href="/stock" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.stock")}</Link>
      <PageHeader title={d.number} actions={(money || mayEdit) ? <>
        {mayEdit && <LinkButton href={`/stock/new?edit=${d.id}`} variant="secondary"><Pencil className="size-4" /> {t("sd.edit")}</LinkButton>}
        {money && <LinkButton href={`/print/receipt/doc/${d.id}`} target="_blank"><Printer className="size-4" /> {t("rc2.printReceipt")}</LinkButton>}
      </> : undefined} subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={DOC_TONE[d.type]}>{t(`sd.type.${d.type}`)}</Badge>{formatDateTime(d.createdAt, locale)} · {by?.fullName ?? "—"}</span>} />
      {saved && <div className="mb-3"><Alert tone="green">{t("sd.saved", { number: d.number })}</Alert></div>}
      {minus.length > 0 && <div className="mb-3"><Alert tone="amber">{t("sd.minusNow", { items: minus.map((l) => `${l.product.code} (${fmtQty(stock.get(l.productId) ?? 0)} ${l.product.unit})`).join(", ") })}</Alert></div>}
      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {d.reason && <div><dt className="text-xs text-muted">{t("sd.reasonLabel")}</dt><dd>{t(`sd.reason.${d.reason}`)}</dd></div>}
          {d.party && <div><dt className="text-xs text-muted">{t("sd.customer")}</dt><dd className="font-semibold">
            {d.customer && can(me, "customers:view") && canSeeMoney(me) ? <Link href={`/customers/${d.customer.id}`} className="text-brand-600 hover:underline">{d.party}</Link>
              : d.party}
            {d.customer && <span className="ms-1 text-xs font-normal text-muted" dir="ltr">{d.customer.code}</span>}</dd></div>}
          {d.delivery && <div><dt className="text-xs text-muted">{t("sd.delivery")}</dt><dd>{d.delivery}</dd></div>}
          {money && d.phone && <div><dt className="text-xs text-muted">{t("sd.phone")}</dt><dd dir="ltr">{d.phone}</dd></div>}
          {d.invoiceNo && <div><dt className="text-xs text-muted">{t(d.type === "BUY" ? "sd.purchaseNo" : "sd.invoice")}</dt><dd dir="ltr">{d.invoiceNo}</dd></div>}
          {d.supplierRef && <div><dt className="text-xs text-muted">{t("sd.supplierRef")}</dt><dd dir="ltr">{d.supplierRef}</dd></div>}
          {(money || costed) && d.rate && <div><dt className="text-xs text-muted">{t("sd.buyRate")}</dt><dd dir="ltr">1 {d.currency} = {Number(d.rate).toLocaleString("en", { maximumFractionDigits: 6 })} IQD</dd></div>}
          {d.order && <div><dt className="text-xs text-muted">{t("sd.order")}</dt><dd><Link href={`/orders/${d.order.id}`} className="text-brand-600 hover:underline" dir="ltr">{d.order.number}</Link></dd></div>}
          {money && <div><dt className="text-xs text-muted">{t("sd.total")}</dt><dd className="text-lg font-bold" dir="ltr">{fmtMoney(total)} {d.currency}</dd>
            {d.rate && <dd className="text-xs text-muted" dir="ltr" data-testid="doc-iqd">{t("sd.iqdValue")}: {fmtMoney(Math.round(total * Number(d.rate) * 100) / 100)} IQD</dd>}</div>}
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
          {balance !== null && <p className="mt-3 text-sm" data-testid="customer-balance">{t("cust.balanceNow")}: <b dir="ltr" className={balance < 0 ? "text-red-600" : ""}>{fmtMoney(balance)} {d.currency}</b> <span className="text-xs text-muted">({t("cust.signHint")})</span></p>}
          {owed > 0 && mayPay && <PayForm docId={d.id} owed={owed} currency={d.currency!} sell={sell} safes={await listSafes(can(me, "cash:view"))} />}
        </Card>
      )}
      <Card className="p-0 sm:p-0">
        <div className="table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-start">{t("wh.item")}</th>
                <th className="px-3 py-2 text-end">{t("order.quantity")}</th>
                {costed && <th className="px-3 py-2 text-end">{t("lot.costPerUnit")}</th>}
                {money && <><th className="px-3 py-2 text-end">{t("sd.unitPrice")}</th>{hasLineDisc && <th className="px-3 py-2 text-end">{t("sd.discount")}</th>}<th className="px-3 py-2 text-end">{t("sd.lineTotal")}</th></>}
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
                    {costed && <td className="px-3 py-2 text-end tabular-nums" dir="ltr">{l.unitPrice === null ? <span className="text-xs text-muted">{t("lot.startingCost")}</span> : `${fmtPrice(Number(l.unitPrice))} ${d.currency}`}</td>}
                    {money && <><td className="px-3 py-2 text-end tabular-nums" dir="ltr">{fmtPrice(Number(l.unitPrice ?? 0))}</td>
                      {hasLineDisc && <td className="px-3 py-2 text-end tabular-nums" dir="ltr">{Number(l.discount ?? 0) > 0 ? `−${fmtMoney(Number(l.discount))}${l.discountKind === "PERCENT" ? ` (${Number(l.discountValue)}%)` : ""}` : ""}</td>}
                      <td className="px-3 py-2 text-end font-semibold tabular-nums" dir="ltr">{fmtMoney(lineTotal(q, Number(l.unitPrice ?? 0)) - Number(l.discount ?? 0))}</td></>}
                    <td className={`px-4 py-2 text-end tabular-nums ${now < 0 ? "font-bold text-red-600" : ""}`} dir="ltr">{fmtQty(now)}</td>
                  </tr>
                );
              })}
            </tbody>
            {money && (
              <tfoot>
                {Number(d.discount ?? 0) > 0 && <>
                  <tr className="border-t border-line"><td className="px-4 py-2" colSpan={hasLineDisc ? 4 : 3}>{t("sd.subtotal")}</td><td className="px-3 py-2 text-end" dir="ltr">{fmtMoney(Number(d.subtotal))} {d.currency}</td><td /></tr>
                  <tr><td className="px-4 py-2" colSpan={hasLineDisc ? 4 : 3}>{t("sd.invoiceDiscount")}{d.discountKind === "PERCENT" ? ` (${Number(d.discountValue)}%)` : ""}</td><td className="px-3 py-2 text-end" dir="ltr">−{fmtMoney(Number(d.discount))} {d.currency}</td><td /></tr>
                </>}
                <tr className="border-t border-line font-bold"><td className="px-4 py-2" colSpan={hasLineDisc ? 4 : 3}>{t("sd.total")}</td><td className="px-3 py-2 text-end" dir="ltr">{fmtMoney(total)} {d.currency}</td><td /></tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </>
  );
}
