import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Pencil } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatNumber } from "@/lib/time";
import { getStock } from "@/lib/stock";
import { ORDER_TONE } from "@/lib/tones";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import Comments from "@/components/comments";
import OrderActions from "./order-actions";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageUser("orders:view");
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const order = await db.order.findUnique({
    where: { id },
    include: { lines: { orderBy: { lineNo: "asc" }, include: { product: { select: { id: true, code: true, name: true } } } } },
  });
  if (!order) notFound();

  const [stock, history, comments, users, sales] = await Promise.all([
    getStock(order.lines.map((l) => l.productId)),
    db.auditLog.findMany({ where: { entityType: "Order", entityId: id }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { fullName: true } } } }),
    db.comment.findMany({ where: { entityType: "Order", entityId: id }, orderBy: { createdAt: "asc" } }),
    db.user.findMany({ select: { id: true, fullName: true } }),
    db.stockDoc.findMany({ where: { orderId: id, type: "SELL" }, orderBy: { createdAt: "asc" }, select: { id: true, number: true, party: true, createdAt: true, lines: { select: { productId: true, qty: true } } } }),
  ]);
  const sold = new Map<string, number>();
  for (const d of sales) for (const l of d.lines) sold.set(l.productId, (sold.get(l.productId) ?? 0) - Number(l.qty));
  const userName = (uid: string) => users.find((u) => u.id === uid)?.fullName ?? "—";
  const n = (v: number) => formatNumber(v, locale);
  const pcs = order.lines.reduce((s, l) => s + l.quantity, 0);

  const allowed: ("complete" | "cancel" | "reopen" | "delete")[] = [];
  if (order.status === "OPEN" && can(me, "orders:edit")) allowed.push("complete");
  if (order.status === "OPEN" && can(me, "orders:approve")) allowed.push("cancel");
  if (order.status !== "OPEN" && can(me, "orders:approve")) allowed.push("reopen");
  if (can(me, "orders:archive")) allowed.push("delete");

  return (
    <>
      <PageHeader
        title={order.number}
        subtitle={`${t("order.productsPieces", { n: order.lines.length, pcs: n(pcs) })} · ${formatDate(order.createdAt, locale)} · ${userName(order.createdById)}`}
        actions={order.status === "OPEN" && can(me, "orders:edit") && (
          <LinkButton variant="secondary" href={`/orders/${order.id}/edit`}><Pencil className="size-4" /> {t("common.edit")}</LinkButton>
        )}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ORDER_TONE[order.status]}>{t(`status.order.${order.status}`)}</Badge>
              {order.completedAt && <span className="text-xs text-muted">{t("order.completedOn", { date: formatDate(order.completedAt, locale) })}</span>}
              {order.cancelledAt && <span className="text-xs text-muted">{t("order.cancelledOn", { date: formatDate(order.cancelledAt, locale) })}</span>}
            </div>
            <div className="mt-3"><OrderActions orderId={order.id} allowed={allowed} /></div>
          </Card>
          <Card className="p-0 sm:p-0">
            <div className="grid grid-cols-[2rem_1fr_6rem_6rem_6rem] gap-3 border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-muted">
              <span>#</span><span>{t("order.product")}</span><span className="text-end">{t("order.quantity")}</span><span className="text-end">{t("sd.sold")}</span><span className="text-end">{t("order.inStock")}</span>
            </div>
            <ul className="divide-y divide-line">
              {order.lines.map((l) => {
                const s = stock.get(l.productId) ?? 0;
                return (
                  <li key={l.id} className="grid grid-cols-[2rem_1fr_6rem_6rem_6rem] items-center gap-3 px-4 py-2 text-sm">
                    <span className="text-xs text-muted tabular-nums">{l.lineNo}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{l.product.name}</span>
                      <span className="block text-xs text-muted" dir="ltr">{l.product.code}</span>
                    </span>
                    <span className="text-end font-semibold tabular-nums">{n(l.quantity)}</span>
                    <span className={`text-end tabular-nums ${(sold.get(l.productId) ?? 0) >= l.quantity ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-muted"}`}>{n(sold.get(l.productId) ?? 0)}</span>
                    <span className={`text-end tabular-nums ${s >= l.quantity ? "text-emerald-700 dark:text-emerald-400" : "text-muted"}`}>{n(s)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="grid grid-cols-[2rem_1fr_6rem_6rem_6rem] gap-3 border-t-2 border-line bg-surface-2 px-4 py-2 text-sm font-bold">
              <span /><span>{t("rep.total")}</span><span className="text-end tabular-nums">{n(pcs)}</span><span className="text-end tabular-nums">{n([...sold.values()].reduce((a, b) => a + b, 0))}</span><span />
            </div>
          </Card>
          <p className="text-xs text-muted">{t("order.stockNote")}</p>
          {(sales.length > 0 || can(me, "stock:sell")) && (
            <Card>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{t("sd.salesForOrder")}</h2>
                {can(me, "stock:sell") && order.status === "OPEN" && <LinkButton href={`/stock/new?type=SELL&order=${order.id}`}>{t("sd.new.SELL")}</LinkButton>}
              </div>
              {sales.length === 0 ? <p className="text-sm text-muted">{t("sd.noSales")}</p> : (
                <ul className="divide-y divide-line text-sm">
                  {sales.map((d) => <li key={d.id} className="py-1.5"><Link href={`/stock/${d.id}`} className="font-semibold text-brand-600 hover:underline" dir="ltr">{d.number}</Link> <span className="text-xs text-muted">· {d.party} · {formatDate(d.createdAt, locale)}</span></li>)}
                </ul>
              )}
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold">{t("comments.title")}</h2>
            <Comments entityType="Order" entityId={order.id} comments={comments.map((c) => ({ id: c.id, author: userName(c.authorId), when: formatDateTime(c.createdAt, locale), body: c.body }))} />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{t("order.history")}</h2>
            <ol className="space-y-3 border-s-2 border-line ps-4 text-sm">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full bg-brand-400" aria-hidden />
                  <p className="font-medium">{t.has(`history.${h.action}`) ? t(`history.${h.action}`) : h.action}</p>
                  <p className="text-xs text-muted">{h.user?.fullName ?? t("audit.system")} · {formatDateTime(h.createdAt, locale)}</p>
                  {h.reason && <p className="mt-0.5 text-xs">“{h.reason}”</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
