import Link from "next/link";
import type { OrderStatus, Prisma, Priority } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { factoryDay, formatDate, formatNumber } from "@/lib/time";
import { getLineProgress, OPEN_STATUSES, PRIORITY_TONE, STATUS_TONE } from "@/lib/orders";
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader, cn } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import { StackedProgress } from "@/components/progress";

export const metadata = { title: "Customer Orders" };

const ALL_STATUSES: OrderStatus[] = ["DRAFT", ...OPEN_STATUSES, "DELIVERED", "CANCELLED"];
const PAGE = 50;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; priority?: string; due?: string; customer?: string; page?: string; deleted?: string }>;
}) {
  const me = await pageUser("orders:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { start, end } = factoryDay();
  const q = sp.q?.trim();

  const where: Prisma.OrderWhereInput = {
    ...(sp.status === "open" ? { status: { in: OPEN_STATUSES } }
      : ALL_STATUSES.includes(sp.status as OrderStatus) ? { status: sp.status as OrderStatus }
      : { status: { not: "CANCELLED" } }),
    ...(["LOW", "NORMAL", "HIGH", "URGENT"].includes(sp.priority ?? "") ? { priority: sp.priority as Priority } : {}),
    ...(sp.customer ? { customerId: sp.customer } : {}),
    ...(sp.due === "today" ? { requestedDeliveryDate: { gte: start, lt: end }, status: { in: OPEN_STATUSES } } : {}),
    ...(sp.due === "overdue" ? { requestedDeliveryDate: { lt: start }, status: { in: OPEN_STATUSES } } : {}),
    ...(sp.due === "week" ? { requestedDeliveryDate: { gte: start, lt: new Date(start.getTime() + 7 * 86_400_000) }, status: { in: OPEN_STATUSES } } : {}),
    ...(q ? { OR: [
      { number: { contains: q, mode: "insensitive" } },
      { customerReference: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { lines: { some: { product: { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } } } },
    ] } : {}),
  };

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: [{ requestedDeliveryDate: "asc" }, { number: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { customer: { select: { name: true } }, lines: { include: { product: { select: { code: true } } }, orderBy: { lineNo: "asc" } } },
    }),
    db.order.count({ where }),
  ]);
  const progress = await getLineProgress(orders.map((o) => o.id));

  const params = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  const pageHref = (p: number) => { params.set("page", String(p)); return `/orders?${params}`; };

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
        filters={[
          { name: "status", label: t("order.allStatuses"), options: [{ value: "open", label: t("order.openOnly") }, ...ALL_STATUSES.map((s) => ({ value: s, label: t(`status.order.${s}`) }))] },
          { name: "priority", label: t("order.priority"), options: ["URGENT", "HIGH", "NORMAL", "LOW"].map((p) => ({ value: p, label: t(`status.priority.${p}`) })) },
          { name: "due", label: t("order.due"), options: [
            { value: "overdue", label: t("dashboard.overdue") },
            { value: "today", label: t("dashboard.dueToday") },
            { value: "week", label: t("order.dueWeek") },
          ] },
        ]}
      />

      {orders.length === 0 ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {orders.map((o) => {
              const lp = o.lines.map((l) => progress.get(l.id)!).filter(Boolean);
              const qty = lp.reduce((s, l) => s + l.quantity, 0);
              const sum = (k: "planned" | "released" | "shipped") => lp.reduce((s, l) => s + Math.min(l[k], l.quantity), 0);
              const overdue = OPEN_STATUSES.includes(o.status) && o.requestedDeliveryDate < start;
              return (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="grid gap-2 px-4 py-3 hover:bg-surface-2 md:grid-cols-[1.4fr_1fr_1fr_1.2fr] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold" dir="ltr">{o.number}</span>
                        {o.priority !== "NORMAL" && <Badge tone={PRIORITY_TONE[o.priority]}>{t(`status.priority.${o.priority}`)}</Badge>}
                      </div>
                      <p className="truncate text-sm">{o.customer.name}</p>
                      <p className="truncate text-xs text-muted" dir="ltr">{o.lines.map((l) => l.product.code).join(" · ")}</p>
                    </div>
                    <div><Badge tone={STATUS_TONE[o.status]}>{t(`status.order.${o.status}`)}</Badge></div>
                    <div className={cn("text-sm", overdue && "font-semibold text-red-600")}>
                      <span className="text-xs text-muted md:hidden">{t("order.requestedDelivery")}: </span>
                      {formatDate(o.requestedDeliveryDate, locale)}
                      {overdue && <span className="ms-1 text-xs">({t("order.overdueShort")})</span>}
                    </div>
                    <div>
                      <StackedProgress quantity={qty} planned={sum("planned")} produced={sum("released")} shipped={sum("shipped")} />
                      <p className="mt-1 text-xs text-muted tabular-nums">
                        {t("order.progressLine", { done: formatNumber(sum("released"), locale), total: formatNumber(qty, locale), shipped: formatNumber(sum("shipped"), locale) })}
                      </p>
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
