import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/time";
import { ORDER_TONE } from "@/lib/tones";
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";

export const metadata = { title: "Orders" };

const STATUSES: OrderStatus[] = ["OPEN", "COMPLETED", "CANCELLED"];
const PAGE = 50;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; deleted?: string }> }) {
  const me = await pageUser("orders:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();

  const where: Prisma.OrderWhereInput = {
    ...(STATUSES.includes(sp.status as OrderStatus) ? { status: sp.status as OrderStatus } : sp.status === "all" ? {} : { status: "OPEN" }),
    ...(q ? { OR: [
      { number: { contains: q, mode: "insensitive" } },
      { lines: { some: { product: { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } } } },
    ] } : {}),
  };
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE,
      include: { lines: { include: { product: { select: { code: true } } }, orderBy: { lineNo: "asc" } } },
    }),
    db.order.count({ where }),
  ]);
  const params = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "deleted") as [string, string][]);
  const pageHref = (p: number) => { const x = new URLSearchParams(params); x.set("page", String(p)); return `/orders?${x}`; };
  const n = (v: number) => formatNumber(v, locale);

  return (
    <>
      <PageHeader
        title={t("nav.orders")}
        subtitle={t("order.count", { n: total })}
        actions={can(me, "orders:create") && <LinkButton href="/orders/new"><Plus className="size-4" /> {t("order.new")}</LinkButton>}
      />
      {sp.deleted && <div className="mb-4"><Alert tone="green">{t("order.deletedMsg")}</Alert></div>}
      <ListToolbar
        placeholder={t("order.searchPlaceholder")}
        filters={[{ name: "status", label: t("status.order.OPEN"), options: [...STATUSES.filter((s) => s !== "OPEN").map((s) => ({ value: s, label: t(`status.order.${s}`) })), { value: "all", label: t("order.allStatuses") }] }]}
      />
      {orders.length === 0 ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {orders.map((o) => {
              const pcs = o.lines.reduce((s, l) => s + l.quantity, 0);
              return (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="grid gap-1 px-4 py-3 hover:bg-surface-2 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold" dir="ltr">{o.number}</span>
                        <Badge tone={ORDER_TONE[o.status]}>{t(`status.order.${o.status}`)}</Badge>
                      </div>
                      <p className="truncate text-xs text-muted" dir="ltr">{o.lines.slice(0, 8).map((l) => l.product.code).join(" · ")}{o.lines.length > 8 ? " …" : ""}</p>
                    </div>
                    <div className="text-sm sm:text-end">
                      <p className="font-semibold tabular-nums">{t("order.productsPieces", { n: o.lines.length, pcs: n(pcs) })}</p>
                      <p className="text-xs text-muted">{formatDate(o.createdAt, locale)}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {total > PAGE && (
            <div className="flex items-center justify-end gap-3 border-t border-line px-4 py-3 text-sm">
              {page > 1 && <Link className="font-semibold text-brand-600" href={pageHref(page - 1)}>←</Link>}
              <span>{page} / {Math.ceil(total / PAGE)}</span>
              {page * PAGE < total && <Link className="font-semibold text-brand-600" href={pageHref(page + 1)}>→</Link>}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
