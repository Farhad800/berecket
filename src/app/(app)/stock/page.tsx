import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowDownToLine, ArrowUpFromLine, ShoppingCart, BadgeDollarSign } from "lucide-react";
import { can, canSeeMoney, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import { DOC_PERM, DOC_TONE, DOC_TYPES, fmtMoney, type DocType } from "./types";
import { docTotal } from "@/lib/money";

export const metadata = { title: "Stock movements" };
const ICON = { INPUT: ArrowDownToLine, OUTPUT: ArrowUpFromLine, BUY: ShoppingCart, SELL: BadgeDollarSign };

/** Every manual stock change as a document: Input, Output, Buy, Sell. */
export default async function StockDocsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const me = await pageUser("stock:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const type = DOC_TYPES.includes(sp.type as DocType) ? (sp.type as DocType) : undefined;
  const where: Prisma.StockDocWhereInput = {
    ...(type ? { type } : {}),
    ...(q ? { OR: [
      { number: { contains: q, mode: "insensitive" } }, { party: { contains: q, mode: "insensitive" } }, { invoiceNo: { contains: q, mode: "insensitive" } },
      { lines: { some: { product: { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } } } },
    ] } : {}),
  };
  const docs = await db.stockDoc.findMany({
    where, orderBy: { createdAt: "desc" }, take: 200,
    include: { lines: { select: { qty: true, unitPrice: canSeeMoney(me) } }, order: { select: { number: true } } },
  });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(docs.map((d) => d.createdById))] } }, select: { id: true, fullName: true } });
  const allowed = DOC_TYPES.filter((d) => can(me, DOC_PERM[d]));
  const seeMoney = canSeeMoney(me);

  return (
    <>
      <PageHeader title={t("nav.stock")} subtitle={t("sd.intro")} />
      {allowed.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {allowed.map((d) => {
            const Icon = ICON[d];
            return <LinkButton key={d} href={`/stock/new?type=${d}`} variant={d === "BUY" || d === "SELL" ? "primary" : "secondary"} className="justify-center"><Icon className="size-4" /> {t(`sd.new.${d}`)}</LinkButton>;
          })}
        </div>
      )}
      <ListToolbar placeholder={t("sd.search")} filters={[{ name: "type", label: t("sd.allTypes"), options: DOC_TYPES.map((d) => ({ value: d, label: t(`sd.type.${d}`) })) }]} />
      {docs.length === 0 ? <EmptyState>{t("sd.none")}</EmptyState> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {docs.map((d) => {
              const total = !seeMoney ? 0 : d.total !== null ? Number(d.total) : docTotal(d.lines.map((l) => ({ qty: Math.abs(Number(l.qty)), price: Number(l.unitPrice ?? 0) })));
              return (
                <li key={d.id}>
                  <Link href={`/stock/${d.id}`} className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-3 hover:bg-surface-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2"><Badge tone={DOC_TONE[d.type]}>{t(`sd.type.${d.type}`)}</Badge><span className="font-semibold" dir="ltr">{d.number}</span>
                        {d.party && <span className="truncate text-sm">{d.party}</span>}{d.order && <span className="text-xs text-muted" dir="ltr">{d.order.number}</span>}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {formatDateTime(d.createdAt, locale)} · {users.find((u) => u.id === d.createdById)?.fullName ?? "—"} · {t("sd.linesN", { n: d.lines.length })}
                        {d.reason && ` · ${t(`sd.reason.${d.reason}`)}`}{d.invoiceNo && ` · ${t("sd.invoice")} ${d.invoiceNo}`}
                      </p>
                    </div>
                    {seeMoney && d.currency && <span className="self-center text-end font-bold tabular-nums" dir="ltr">{fmtMoney(total)} {d.currency}</span>}
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
