import Link from "next/link";
import type { StockMoveType } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/time";
import { getStock } from "@/lib/stock";
import { MOVE_TONE } from "@/lib/tones";
import { Alert, Badge, Card, EmptyState, PageHeader, cn } from "@/components/ui";
import RecordForm from "@/components/record-form";
import ListToolbar from "@/components/list-toolbar";
import { adjustStockAction } from "@/app/actions/warehouse";
import StockOut from "./stock-out";

export const metadata = { title: "Warehouse stock" };
const TABS = ["stock", "movements"] as const;
const TYPES: StockMoveType[] = ["PRODUCTION", "QC_REJECT", "OUT", "ADJUST"];

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; type?: string; all?: string }> }) {
  const me = await pageUser("warehouse:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "stock";
  const n = (v: number) => formatNumber(v, locale);
  const q = sp.q?.trim();

  return (
    <>
      <PageHeader title={t("nav.inventory")} subtitle={t("wh.ledgerNote")} />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((k) => (
          <Link key={k} href={`/inventory?tab=${k}`} role="tab" aria-selected={tab === k}
            className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap", tab === k ? "border-brand-600 text-brand-700 dark:text-brand-200" : "border-transparent text-muted hover:text-ink")}>
            {t(`wh.tab.${k}`)}
          </Link>
        ))}
      </div>
      {tab === "stock" ? <StockTab /> : <MovementsTab />}
    </>
  );

  async function StockTab() {
    const [products, stock] = await Promise.all([
      db.product.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
      getStock(),
    ]);
    const rows = products.map((p) => ({ id: p.id, code: p.code, name: p.name, stock: stock.get(p.id) ?? 0 }));
    const total = rows.reduce((s, r) => s + r.stock, 0);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card><p className="text-xs text-muted">{t("wh.totalPieces")}</p><p className="mt-1 text-2xl font-bold tabular-nums">{n(total)}</p></Card>
          <Card><p className="text-xs text-muted">{t("wh.productsInStock")}</p><p className="mt-1 text-2xl font-bold tabular-nums">{n(rows.filter((r) => r.stock > 0).length)}</p></Card>
        </div>
        <StockOut rows={rows} canOut={can(me, "warehouse:create")} />
        {can(me, "warehouse:approve") && (
          <Card>
            <h2 className="font-semibold">{t("wh.adjustTitle")}</h2>
            <p className="mb-3 text-xs text-muted">{t("wh.adjustHint")}</p>
            <RecordForm
              action={adjustStockAction}
              submitLabel={t("wh.saveAdjustment")}
              initial={{ kind: "COUNT" }}
              fields={[
                { name: "productId", label: t("order.product"), type: "combo", required: true, options: products.map((p) => ({ value: p.id, label: p.name, hint: p.code })) },
                { name: "qty", label: t("wh.adjustQty"), type: "number", required: true, ltr: true, hint: t("wh.adjustQtyHint") },
                { name: "kind", label: t("wh.adjustKind"), type: "select", required: true, options: (["COUNT", "DAMAGE", "SCRAP", "OTHER"] as const).map((k) => ({ value: k, label: t(`wh.kind.${k}`) })) },
                { name: "reason", label: t("prod.reason"), required: true, wide: true },
              ]}
            />
          </Card>
        )}
      </div>
    );
  }

  async function MovementsTab() {
    const type = TYPES.includes(sp.type as StockMoveType) ? (sp.type as StockMoveType) : undefined;
    const moves = await db.stockMovement.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(q ? { product: { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { product: { select: { code: true, name: true } } },
    });
    const users = await db.user.findMany({ where: { id: { in: [...new Set(moves.map((m) => m.createdById))] } }, select: { id: true, fullName: true } });
    return (
      <>
        <ListToolbar placeholder={t("order.filterProducts")} filters={[{ name: "type", label: t("wh.allTypes"), options: TYPES.map((x) => ({ value: x, label: t(`wh.mv.${x}`) })) }]} />
        {moves.length === 0 ? <EmptyState>{t("common.empty")}</EmptyState> : (
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {moves.map((m) => (
                <li key={m.id} className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={MOVE_TONE[m.type]}>{t(`wh.mv.${m.type}`)}</Badge>
                      <span className="truncate font-medium">{m.product.name}</span>
                      <span className="text-xs text-muted" dir="ltr">{m.product.code}</span>
                    </div>
                    <p className="truncate text-xs text-muted">
                      {formatDateTime(m.createdAt, locale)} · {users.find((u) => u.id === m.createdById)?.fullName ?? "—"}
                      {(m.reference || m.reason) && <> · {m.reference ?? m.reason}</>}
                      {m.entryId && <> · <Link href={`/qc/entries/${m.entryId}`} className="text-brand-600">{t("wh.viewEntry")}</Link></>}
                    </p>
                  </div>
                  <span className={cn("self-center text-end font-bold tabular-nums", m.qty < 0 && "text-red-600 dark:text-red-400")} dir="ltr">{m.qty > 0 ? "+" : "−"}{n(Math.abs(m.qty))}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {moves.length === 300 && <p className="mt-2 text-xs text-muted"><Alert tone="blue">{t("wh.moreInReport")}</Alert></p>}
      </>
    );
  }
}
