import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { can, canSeeMoney, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { customerBalances } from "@/lib/customers";
import { Card, EmptyState, PageHeader, cn } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import { fmtMoney } from "../stock/types";
import NewCustomer from "./new-customer";

export const metadata = { title: "Customers" };
const CURS = ["IQD", "USD", "EUR"] as const;

/** Customer accounts (bought from and sold to): code, name, phone and what each owes (−) or is owed (+), per currency. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const me = await pageUser("customers:view");
  const t = await getTranslations();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const money = canSeeMoney(me);
  const where: Prisma.CustomerWhereInput = {
    archivedAt: sp.show === "archived" ? { not: null } : null,
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { address: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const list = await db.customer.findMany({ where, orderBy: { code: "asc" }, take: 500, include: { _count: { select: { sales: true } } } });
  const bal = money ? await customerBalances(list.map((c) => c.id)) : new Map();
  let rows = list.map((c) => ({ ...c, bal: bal.get(c.id) ?? { IQD: 0, USD: 0, EUR: 0 } }));
  if (sp.show === "owing") rows = rows.filter((r) => CURS.some((c) => r.bal[c] < 0));
  if (sp.show === "weOwe") rows = rows.filter((r) => CURS.some((c) => r.bal[c] > 0));
  const owed = Object.fromEntries(CURS.map((c) => [c, rows.reduce((s, r) => s + Math.min(r.bal[c], 0), 0)])) as Record<(typeof CURS)[number], number>;
  const weOwe = Object.fromEntries(CURS.map((c) => [c, rows.reduce((s, r) => s + Math.max(r.bal[c], 0), 0)])) as Record<(typeof CURS)[number], number>;

  return (
    <>
      <PageHeader title={t("nav.customers")} subtitle={t("cust.intro")} actions={can(me, "customers:manage") || can(me, "stock:sell") || can(me, "stock:buy") ? <NewCustomer /> : undefined} />
      {money && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {CURS.map((c) => (
            <Card key={c}>
              <p className="text-xs text-muted">{t("cust.totalOwed", { cur: c })}</p><p className={cn("mt-1 text-2xl font-bold tabular-nums", owed[c] < 0 && "text-red-600")} dir="ltr" data-testid={`owed-${c}`}>{fmtMoney(owed[c])} {c}</p>
              <p className="mt-2 text-xs text-muted">{t("cust.totalWeOwe", { cur: c })}</p><p className={cn("text-lg font-bold tabular-nums", weOwe[c] > 0 && "text-amber-600")} dir="ltr" data-testid={`weowe-${c}`}>{weOwe[c] > 0 ? "+" : ""}{fmtMoney(weOwe[c])} {c}</p>
            </Card>
          ))}
        </div>
      )}
      <ListToolbar placeholder={t("cust.search")} filters={[{ name: "show", label: t("cust.all"), options: [{ value: "owing", label: t("cust.owing") }, { value: "weOwe", label: t("cust.weOweFilter") }, { value: "archived", label: t("common.archived") }] }]} />
      {rows.length === 0 ? <EmptyState>{t("cust.none")}</EmptyState> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-3 hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2"><span className="font-semibold" dir="ltr">{c.code}</span><span className="truncate">{c.name}</span></p>
                    <p className="mt-0.5 truncate text-xs text-muted">{[c.phone, c.address].filter(Boolean).join(" · ") || "—"} · {t("cust.salesN", { n: c._count.sales })}</p>
                  </div>
                  {money && (
                    <span className="self-center text-end text-sm font-bold tabular-nums" dir="ltr">
                      {CURS.filter((x) => c.bal[x] !== 0).map((x) => <span key={x} className={cn("block", c.bal[x] < 0 ? "text-red-600" : "text-green-700 dark:text-green-400")}>{fmtMoney(c.bal[x])} {x}</span>)}
                      {CURS.every((x) => c.bal[x] === 0) && <span className="text-muted">0</span>}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
