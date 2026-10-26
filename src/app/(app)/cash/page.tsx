import Link from "next/link";
import type { CashKind, Currency, Prisma } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowDownToLine, ArrowUpFromLine, Repeat } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { balances, paidFor } from "@/lib/cash";
import { customerBalances } from "@/lib/customers";
import { formatDateTime } from "@/lib/time";
import { Badge, Card, EmptyState, LinkButton, PageHeader, cn } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import Converter from "./converter";
import Categories from "./categories";
import { CURS, KINDS, KIND_TONE, catName, fmtMoney, type CurCode } from "./types";

export const metadata = { title: "Safe" };
const TABS = ["movements", "owed", "categories"] as const;

/** The safe: balance per currency, every movement of money, what is still owed, expense categories. */
export default async function CashPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; kind?: string; currency?: string }> }) {
  const me = await pageUser("cash:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const tabs = TABS.filter((k) => k !== "categories" || can(me, "cash:manage"));
  const tab = (tabs as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "movements";
  const bal = await balances();

  // Last exchange rates as the converter's starting point.
  const ex = await db.cashEntry.findMany({ where: { kind: "EXCHANGE" }, orderBy: { createdAt: "desc" }, take: 60, select: { number: true, currency: true, amount: true } });
  const byNum = new Map<string, { currency: Currency; amount: number }[]>();
  for (const e of ex) byNum.set(e.number, [...(byNum.get(e.number) ?? []), { currency: e.currency, amount: Number(e.amount) }]);
  const lastRate = (c: CurCode) => {
    for (const pair of byNum.values()) {
      const a = pair.find((p) => p.currency === c), b = pair.find((p) => p.currency === "IQD");
      if (a && b && pair.length === 2) return Math.round((Math.abs(b.amount) / Math.abs(a.amount)) * 100) / 100;
    }
    return null;
  };

  return (
    <>
      <PageHeader title={t("nav.cash")} subtitle={t("cash.intro")} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {CURS.map((c) => (
          <Card key={c}>
            <p className="text-xs text-muted">{t(`cash.cur.${c}`)}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", bal[c] < 0 && "text-red-600")} dir="ltr" data-testid={`bal-${c}`}>{fmtMoney(bal[c])} {c}</p>
          </Card>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {can(me, "cash:in") && <LinkButton href="/cash/new?type=IN"><ArrowDownToLine className="size-4" /> {t("cash.new.IN")}</LinkButton>}
        {can(me, "cash:out") && <LinkButton href="/cash/new?type=OUT" variant="secondary"><ArrowUpFromLine className="size-4" /> {t("cash.new.OUT")}</LinkButton>}
        {can(me, "cash:exchange") && <LinkButton href="/cash/new?type=EXCHANGE" variant="secondary"><Repeat className="size-4" /> {t("cash.new.EXCHANGE")}</LinkButton>}
      </div>
      <div className="mb-4"><Converter bal={bal} usdRate={lastRate("USD")} eurRate={lastRate("EUR")} /></div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {tabs.map((k) => (
          <Link key={k} href={`/cash?tab=${k}`} role="tab" aria-selected={tab === k}
            className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap", tab === k ? "border-brand-600 text-brand-700 dark:text-brand-200" : "border-transparent text-muted hover:text-ink")}>
            {t(`cash.tab.${k}`)}
          </Link>
        ))}
      </div>
      {tab === "movements" ? <Movements /> : tab === "owed" ? <Owed /> : <CategoriesTab />}
    </>
  );

  async function Movements() {
    const q = sp.q?.trim();
    const kind = (KINDS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as CashKind) : undefined;
    const currency = (CURS as readonly string[]).includes(sp.currency ?? "") ? (sp.currency as Currency) : undefined;
    const where: Prisma.CashEntryWhereInput = {
      ...(kind ? { kind } : {}), ...(currency ? { currency } : {}),
      ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { party: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }, { stockDoc: { number: { contains: q, mode: "insensitive" } } }] } : {}),
    };
    const list = await db.cashEntry.findMany({ where, orderBy: { createdAt: "desc" }, take: 300, include: { category: true, stockDoc: { select: { id: true, number: true } } } });
    const users = await db.user.findMany({ where: { id: { in: [...new Set(list.map((e) => e.createdById))] } }, select: { id: true, fullName: true } });
    return (
      <>
        <ListToolbar placeholder={t("cash.search")} filters={[
          { name: "kind", label: t("cash.allKinds"), options: KINDS.map((k) => ({ value: k, label: t(`cash.kind.${k}`) })) },
          { name: "currency", label: t("cash.allCurrencies"), options: CURS.map((c) => ({ value: c, label: c })) },
        ]} />
        {list.length === 0 ? <EmptyState>{t("cash.none")}</EmptyState> : (
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {list.map((e) => {
                const a = Number(e.amount);
                return (
                  <li key={e.id}>
                    <Link href={`/cash/${e.id}`} className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-3 hover:bg-surface-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2"><Badge tone={KIND_TONE[e.kind]}>{t(`cash.kind.${e.kind}`)}</Badge><span className="font-semibold" dir="ltr">{e.number}</span>
                          {e.category && <span className="text-sm">{catName(t, e.category)}</span>}{e.party && <span className="truncate text-sm">{e.party}</span>}
                          {e.stockDoc && <span className="text-xs text-muted" dir="ltr">{e.stockDoc.number}</span>}</p>
                        <p className="mt-0.5 truncate text-xs text-muted">{formatDateTime(e.createdAt, locale)} · {users.find((u) => u.id === e.createdById)?.fullName ?? "—"}{e.note && ` · ${e.note}`}</p>
                      </div>
                      <span className={cn("self-center text-end font-bold tabular-nums", a < 0 ? "text-red-600" : "text-green-700 dark:text-green-400")} dir="ltr">{a < 0 ? "−" : "+"}{fmtMoney(Math.abs(a))} {e.currency}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </>
    );
  }

  async function Owed() {
    // Sales booked to a customer account count in that customer's balance (below); the rest per invoice.
    const docs = await db.stockDoc.findMany({ where: { type: { in: ["BUY", "SELL"] }, total: { gt: 0 }, customerId: null }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, type: true, party: true, currency: true, total: true, createdAt: true } });
    const custs = await db.customer.findMany({ select: { id: true, code: true, name: true } });
    const cb = await customerBalances(custs.map((c) => c.id));
    const custRows = custs.flatMap((c) => CURS.filter((x) => (cb.get(c.id)?.[x] ?? 0) < 0).map((x) => ({ ...c, cur: x, owed: -(cb.get(c.id)![x]) })));
    const paid = await paidFor(docs.map((d) => d.id));
    const open = docs.map((d) => ({ ...d, owed: Math.round((Number(d.total) - (paid.get(d.id) ?? 0)) * 100) / 100 })).filter((d) => d.owed > 0.004);
    const sum = (type: string, c: string) => open.filter((d) => d.type === type && d.currency === c).reduce((s, d) => s + d.owed, 0) + (type === "SELL" ? custRows.filter((r) => r.cur === c).reduce((s, r) => s + r.owed, 0) : 0);
    const block = (type: "SELL" | "BUY") => {
      const rows = open.filter((d) => d.type === type);
      return (
        <Card className="p-0 sm:p-0">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-semibold">{t(type === "SELL" ? "cash.owedToUs" : "cash.weOwe")}</h2>
            <p className="text-sm font-bold" dir="ltr">{CURS.filter((c) => sum(type, c) > 0).map((c) => `${fmtMoney(sum(type, c))} ${c}`).join(" · ") || "0"}</p>
          </div>
          {type === "SELL" && custRows.length > 0 && (
            <ul className="divide-y divide-line border-b border-line">
              {custRows.map((r) => (
                <li key={r.id + r.cur}>
                  <Link href={`/customers/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <span className="min-w-0"><span className="block truncate font-medium">{r.name}</span><span className="text-xs text-muted" dir="ltr">{r.code}</span></span>
                    <span className="font-bold text-red-600 tabular-nums" dir="ltr">−{fmtMoney(r.owed)} {r.cur}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {rows.length === 0 && !(type === "SELL" && custRows.length > 0) ? <p className="px-4 py-3 text-sm text-muted">{t("cash.nothingOwed")}</p> : rows.length === 0 ? null : (
            <ul className="divide-y divide-line">
              {rows.map((d) => (
                <li key={d.id}>
                  <Link href={`/stock/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <span className="min-w-0"><span className="block truncate font-medium">{d.party}</span><span className="text-xs text-muted" dir="ltr">{d.number} · {formatDateTime(d.createdAt, locale)} · {t("sd.total")} {fmtMoney(Number(d.total))} {d.currency}</span></span>
                    <span className="font-bold text-amber-600 tabular-nums" dir="ltr">{fmtMoney(d.owed)} {d.currency}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      );
    };
    return <div className="grid gap-4 lg:grid-cols-2">{block("SELL")}{block("BUY")}</div>;
  }

  async function CategoriesTab() {
    const cats = await db.expenseCategory.findMany({ orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }], include: { _count: { select: { entries: true } } } });
    return <Categories rows={cats.map((c) => ({ id: c.id, name: catName(t, c), archived: !!c.archivedAt, used: c._count.entries }))} />;
  }
}
