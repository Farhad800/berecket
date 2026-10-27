import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, ShoppingCart, Truck } from "lucide-react";
import { can, canSeeMoney, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { Alert, Badge, Card, LinkButton, PageHeader, cn } from "@/components/ui";
import { fmtMoney } from "../../stock/types";
import CustomerTools from "./customer-tools";
import { listSafes } from "@/lib/cash";

export const metadata = { title: "Customer" };
const CURS = ["IQD", "USD", "EUR"] as const;
type Cur = (typeof CURS)[number];

/** One customer: balance per currency, statement (sales and money paid to them −, purchases from them and money received +, running balance), edit, receive / pay money. */
export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const me = await pageUser("customers:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const { id } = await params;
  const saved = (await searchParams).saved === "1";
  const c = await db.customer.findUnique({ where: { id } });
  if (!c) notFound();
  const money = canSeeMoney(me);
  const [sales, payments] = await Promise.all([
    db.stockDoc.findMany({ where: { customerId: id, type: { in: ["SELL", "BUY"] } }, orderBy: { createdAt: "asc" }, select: { id: true, type: true, number: true, invoiceNo: true, supplierRef: true, currency: true, total: true, delivery: true, createdAt: true, _count: { select: { lines: true } } } }),
    money ? db.cashEntry.findMany({ where: { customerId: id }, orderBy: { createdAt: "asc" }, select: { id: true, number: true, currency: true, amount: true, note: true, createdAt: true, stockDoc: { select: { number: true } } } }) : Promise.resolve([]),
  ]);
  // Statement in time order with the running balance of its currency:
  // sale −, purchase from them +, money received +, money paid to them −.
  type Row = { at: Date; kind: "sale" | "purchase" | "payment" | "paid"; doc: boolean; href: string; number: string; detail: string; cur: Cur; amount: number; balance: number };
  const rows: Row[] = [
    ...sales.map((s) => ({ at: s.createdAt, kind: s.type === "BUY" ? ("purchase" as const) : ("sale" as const), doc: true, href: `/stock/${s.id}`, number: s.number, detail: [s.invoiceNo, s.supplierRef, s.delivery, t("sd.linesN", { n: s._count.lines })].filter(Boolean).join(" · "), cur: s.currency as Cur, amount: (s.type === "BUY" ? 1 : -1) * Number(s.total ?? 0), balance: 0 })),
    ...payments.map((p) => ({ at: p.createdAt, kind: Number(p.amount) < 0 ? ("paid" as const) : ("payment" as const), doc: false, href: `/cash/${p.id}`, number: p.number, detail: [p.stockDoc?.number, p.note].filter(Boolean).join(" · "), cur: p.currency as Cur, amount: Number(p.amount), balance: 0 })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime() || (a.doc === b.doc ? 0 : a.doc ? -1 : 1));
  const run: Record<Cur, number> = { IQD: 0, USD: 0, EUR: 0 };
  for (const r of rows) { run[r.cur] = Math.round((run[r.cur] + r.amount) * 100) / 100; r.balance = run[r.cur]; }
  const shown = CURS.filter((x) => run[x] !== 0 || rows.some((r) => r.cur === x));

  return (
    <>
      <Link href="/customers" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.customers")}</Link>
      <PageHeader
        title={`${c.code} · ${c.name}`}
        subtitle={<span className="flex flex-wrap items-center gap-2">{[c.phone, c.address].filter(Boolean).join(" · ") || "—"}{c.archivedAt && <Badge>{t("common.archived")}</Badge>}</span>}
        actions={!c.archivedAt && (can(me, "stock:sell") || can(me, "stock:buy")) ? <>
          {can(me, "stock:sell") && <LinkButton href={`/stock/new?type=SELL&customer=${c.id}`}><ShoppingCart className="size-4" /> {t("cust.newSale")}</LinkButton>}
          {can(me, "stock:buy") && <LinkButton href={`/stock/new?type=BUY&customer=${c.id}`} variant="secondary"><Truck className="size-4" /> {t("cust.newPurchase")}</LinkButton>}
        </> : undefined}
      />
      {saved && <div className="mb-3"><Alert tone="green">{t("cust.saved")}</Alert></div>}
      {money && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {(shown.length ? shown : (["IQD"] as Cur[])).map((x) => (
            <Card key={x}>
              <p className="text-xs text-muted">{t("cust.balance", { cur: x })}</p>
              <p className={cn("mt-1 text-2xl font-bold tabular-nums", run[x] < 0 ? "text-red-600" : run[x] > 0 ? "text-green-700 dark:text-green-400" : "")} dir="ltr" data-testid={`balance-${x}`}>{fmtMoney(run[x])} {x}</p>
              <p className="text-xs text-muted">{run[x] < 0 ? t("cust.owesUs") : run[x] > 0 ? t("cust.weOwe") : t("cust.settled")}</p>
            </Card>
          ))}
        </div>
      )}
      <CustomerTools
        customer={{ id: c.id, code: c.code, name: c.name, phone: c.phone ?? "", address: c.address ?? "", note: c.note ?? "", archived: !!c.archivedAt }}
        canEdit={can(me, "customers:manage")}
        canReceive={money && (can(me, "cash:in") || can(me, "stock:sell"))}
        canPay={money && (can(me, "cash:out") || can(me, "stock:buy"))}
        safes={money ? await listSafes(can(me, "cash:view")) : []}
      />
      <Card className="mt-4 p-0 sm:p-0">
        <h2 className="border-b border-line px-4 py-3 font-semibold">{t("cust.statement")}</h2>
        {rows.length === 0 ? <p className="px-4 py-3 text-sm text-muted">{t("cust.noMoves")}</p> : (
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr><th className="px-4 py-2 text-start">{t("cust.when")}</th><th className="px-3 py-2 text-start">{t("cust.what")}</th>{money && <><th className="px-3 py-2 text-end">{t("cust.amount")}</th><th className="px-4 py-2 text-end">{t("cust.runBalance")}</th></>}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...rows].reverse().map((r) => (
                  <tr key={r.number + r.at.getTime()}>
                    <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(r.at, locale)}</td>
                    <td className="px-3 py-2"><Link href={r.href} className="font-semibold text-brand-600 hover:underline" dir="ltr">{r.number}</Link> <Badge tone={r.kind === "sale" ? "purple" : r.kind === "purchase" ? "blue" : r.kind === "paid" ? "amber" : "green"}>{t(`cust.kind.${r.kind}`)}</Badge><div className="text-xs text-muted">{r.detail}</div></td>
                    {money && <>
                      <td className={cn("px-3 py-2 text-end tabular-nums", r.amount < 0 ? "text-red-600" : "text-green-700 dark:text-green-400")} dir="ltr">{r.amount > 0 ? "+" : ""}{fmtMoney(r.amount)} {r.cur}</td>
                      <td className={cn("px-4 py-2 text-end font-semibold tabular-nums", r.balance < 0 && "text-red-600")} dir="ltr">{fmtMoney(r.balance)} {r.cur}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
