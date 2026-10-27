import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Printer } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { listSafes } from "@/lib/cash";
import EditEntry from "./edit-entry";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { Alert, Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { KIND_TONE, catName, fmtMoney } from "../types";
import { rateText } from "@/lib/money";

export const metadata = { title: "Safe" };

/** One movement of money (an exchange shows both sides). */
export default async function CashEntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const me = await pageUser("cash:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const { id } = await params;
  const saved = (await searchParams).saved === "1";
  const e = await db.cashEntry.findUnique({ where: { id }, include: { safe: { select: { name: true } }, category: true, stockDoc: { select: { id: true, number: true, type: true } } } });
  if (!e) notFound();
  const [by, pair] = await Promise.all([
    db.user.findUnique({ where: { id: e.createdById }, select: { fullName: true } }),
    e.kind === "EXCHANGE" || e.kind === "TRANSFER" ? db.cashEntry.findMany({ where: { number: e.number }, orderBy: { amount: "asc" }, include: { safe: { select: { name: true } } } }) : Promise.resolve([e]),
  ]);
  // The same people who may make this kind of entry may change it.
  const mayEdit = ({ DEPOSIT: can(me, "cash:in"), EXPENSE: can(me, "cash:out"), SALE: can(me, "cash:in") || can(me, "stock:sell"), PURCHASE: can(me, "cash:out") || can(me, "stock:buy"), EXCHANGE: can(me, "cash:exchange"), TRANSFER: can(me, "cash:transfer") } as Record<string, boolean>)[e.kind];
  async function editor() {
    const [safes, cats] = await Promise.all([listSafes(true), e!.kind === "EXPENSE" ? db.expenseCategory.findMany({ where: { OR: [{ archivedAt: null }, { id: e!.categoryId ?? "" }] }, orderBy: { createdAt: "asc" } }) : Promise.resolve([])]);
    const out = pair.find((p) => Number(p.amount) < 0), inn = pair.find((p) => Number(p.amount) > 0);
    return <EditEntry safes={safes} cats={cats.map((c) => ({ id: c.id, label: catName(t, c) }))} e={{
      id: e!.id, kind: e!.kind, currency: e!.currency as "IQD" | "USD" | "EUR", amount: Math.abs(Number(e!.amount)), safeId: e!.safeId, categoryId: e!.categoryId ?? "", party: e!.party ?? "", note: e!.note ?? "",
      ...(e!.kind === "EXCHANGE" && out && inn ? { fromAmount: -Number(out.amount), toAmount: Number(inn.amount), rate: e!.rate ? Number(e!.rate) : undefined, fromCur: out.currency, toCur: inn.currency } : {}),
    }} />;
  }
  const row = (label: string, value: React.ReactNode, ltr = false) => <div><dt className="text-xs text-muted">{label}</dt><dd className="font-semibold" dir={ltr ? "ltr" : undefined}>{value}</dd></div>;
  return (
    <>
      <Link href="/cash" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.cash")}</Link>
      <PageHeader title={e.number} actions={e.kind === "SALE" && (e.stockDoc || e.customerId) ? <LinkButton href={`/print/receipt/payment/${e.id}`} target="_blank"><Printer className="size-4" /> {t("rc2.printReceipt")}</LinkButton> : undefined} subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={KIND_TONE[e.kind]}>{t(`cash.kind.${e.kind}`)}</Badge>{formatDateTime(e.createdAt, locale)} · {by?.fullName ?? "—"}</span>} />
      {saved && <div className="mb-3"><Alert tone="green">{t("cash.saved", { number: e.number })}</Alert></div>}
      <Card>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          {pair.map((p) => {
            const a = Number(p.amount);
            return <div key={p.id}><dt className="text-xs text-muted">{a < 0 ? t("cash.moneyOut") : t("cash.moneyIn")} · {p.safe.name}</dt><dd className={`text-xl font-bold tabular-nums ${a < 0 ? "text-red-600" : "text-green-700 dark:text-green-400"}`} dir="ltr" data-testid={a < 0 ? "side-out" : "side-in"}>{a < 0 ? "−" : "+"}{fmtMoney(Math.abs(a))} {p.currency}</dd></div>;
          })}
          {e.rate && pair.length === 2 && row(t("cash.rateLabel"), rateText(Number(e.rate), pair[0].currency, pair[1].currency), true)}
          {e.category && row(t("cash.category"), catName(t, e.category))}
          {e.party && row(e.kind === "EXPENSE" ? t("cash.paidTo") : e.kind === "DEPOSIT" ? t("cash.from") : t("sd.customer"), e.party)}
          {e.stockDoc && row(t("cash.forDoc"), <Link href={`/stock/${e.stockDoc.id}`} className="text-brand-600 hover:underline" dir="ltr">{e.stockDoc.number}</Link>)}
        </dl>
        {e.note && <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{e.note}</p>}
      </Card>
      {mayEdit && await editor()}
    </>
  );
}
