import Link from "next/link";
import type { StockMoveType } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { can, canSeeMoney, pageUser } from "@/lib/auth";
import { fifoState } from "@/lib/fifo";
import { db } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/time";
import { getStock } from "@/lib/stock";
import { MOVE_TONE } from "@/lib/tones";
import { ArrowLeftRight, FileSpreadsheet, PackagePlus } from "lucide-react";
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader, cn } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import StockTable from "./stock-table";
import StockValue, { type Section, type SectionValue } from "./stock-value";

export const metadata = { title: "Warehouse stock" };
const TABS = ["stock", "stickers", "materials", "packaging", "movements"] as const;
const TYPES: StockMoveType[] = ["PRODUCTION", "USE", "QC_REJECT", "INPUT", "OUTPUT", "BUY", "SELL", "OUT", "ADJUST", "RECEIVE"];
/** Average cost per unit of what is in stock (Σ batch left × its cost ÷ stock); with no stock, the latest cost. */
function unitCost(f: Awaited<ReturnType<typeof fifoState>>, id: string) {
  const v = f.value(id);
  if (v.qty > 0.0005 && v.noCost < v.qty) return { unit: v.value / (v.qty - v.noCost), partial: v.noCost > 0 || f.partial(id) };
  return { unit: f.lastUnit(id), partial: f.partial(id) };
}
const fmt = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 3 });

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; type?: string; all?: string }> }) {
  const me = await pageUser("warehouse:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "stock";
  const n = (v: number) => formatNumber(v, locale);
  const q = sp.q?.trim();
  const money = canSeeMoney(me); // costs only for people who see money (Buy, Sell or Safe)

  return (
    <>
      <PageHeader title={t("nav.inventory")} subtitle={t("wh.readOnlyNote")} actions={<>
        {can(me, "products:create") && can(me, "products:edit") && <LinkButton href="/import/items" variant="secondary"><FileSpreadsheet className="size-4" /> {t("iw.button")}</LinkButton>}
        {can(me, "products:create") && <LinkButton href={`/products/new-item${tab === "stickers" ? "?kind=STICKER" : tab === "materials" ? "?kind=MATERIAL" : tab === "packaging" ? "?kind=PACKAGING" : ""}`} variant="secondary"><PackagePlus className="size-4" /> {t("item.newButton")}</LinkButton>}
        {can(me, "stock:view") && <LinkButton href="/stock"><ArrowLeftRight className="size-4" /> {t("nav.stock")}</LinkButton>}
      </>} />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((k) => (
          <Link key={k} href={`/inventory?tab=${k}`} role="tab" aria-selected={tab === k}
            className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap", tab === k ? "border-brand-600 text-brand-700 dark:text-brand-200" : "border-transparent text-muted hover:text-ink")}>
            {t(`wh.tab.${k}`)}
          </Link>
        ))}
      </div>
      {money && <div className="mb-4">{await valuePanel()}</div>}
      {tab === "stock" ? <StockTab /> : tab === "movements" ? <MovementsTab /> : <SuppliesTab kind={tab === "stickers" ? "STICKER" : tab === "packaging" ? "PACKAGING" : "MATERIAL"} />}
    </>
  );

  /** Value of all stock in IQD per section (stock × cost; products at their cost per piece). Money roles only. */
  async function valuePanel() {
    const [items, fifo] = await Promise.all([db.product.findMany({ where: { archivedAt: null }, select: { id: true, kind: true } }), fifoState()]);
    const values = { PRODUCT: { value: 0, items: 0, noCost: 0 }, STICKER: { value: 0, items: 0, noCost: 0 }, MATERIAL: { value: 0, items: 0, noCost: 0 }, PACKAGING: { value: 0, items: 0, noCost: 0 } } as Record<Exclude<Section, "ALL">, SectionValue>;
    for (const it of items) {
      const b = fifo.value(it.id); // each batch still in stock × its own cost
      if (!(b.qty > 0)) continue;
      const v = values[it.kind as Exclude<Section, "ALL">];
      v.items++;
      if (b.noCost > 0) v.noCost++;
      v.value += Math.max(0, b.value);
    }
    const initial: Section = tab === "stock" ? "PRODUCT" : tab === "stickers" ? "STICKER" : tab === "materials" ? "MATERIAL" : tab === "packaging" ? "PACKAGING" : "ALL";
    return <StockValue key={tab} values={values} initial={initial} />;
  }

  async function StockTab() {
    const [products, stock, costs] = await Promise.all([
      db.product.findMany({ where: { archivedAt: null, kind: "PRODUCT" }, orderBy: [{ mold: { code: "asc" } }, { code: "asc" }], select: { id: true, code: true, name: true, name2: true, unit: true, mold: { select: { code: true } } } }),
      getStock(),
      money ? fifoState() : Promise.resolve(null),
    ]);
    const rows = products.map((p) => {
      const c = costs ? unitCost(costs, p.id) : null;
      return { id: p.id, code: p.code, name: p.name, name2: p.name2, unit: p.unit, mold: p.mold?.code ?? null, stock: stock.get(p.id) ?? 0, cost: c?.unit ?? null, costPartial: !!c?.partial };
    });
    const total = rows.reduce((s, r) => s + r.stock, 0);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card><p className="text-xs text-muted">{t("wh.totalPieces")}</p><p className="mt-1 text-2xl font-bold tabular-nums">{n(total)}</p></Card>
          <Card><p className="text-xs text-muted">{t("wh.productsInStock")}</p><p className="mt-1 text-2xl font-bold tabular-nums">{n(rows.filter((r) => r.stock > 0).length)}</p></Card>
        </div>
        {money && <p className="text-xs text-muted">{t("cost.tableHint")}</p>}
        <StockTable rows={rows} withMolds money={money} />
      </div>
    );
  }

  async function SuppliesTab({ kind }: { kind: "STICKER" | "MATERIAL" | "PACKAGING" }) {
    const where = {
      archivedAt: null, kind,
      ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }, { name2: { contains: q, mode: "insensitive" as const } }] } : {}),
    };
    const items = await db.product.findMany({ where, orderBy: [{ name: "asc" }], select: { id: true, code: true, name: true, name2: true, unit: true } });
    const [stock, fifo] = await Promise.all([getStock(items.map((i) => i.id)), money ? fifoState() : null]);
    const rows = items.map((i) => { const c = fifo ? unitCost(fifo, i.id) : null; return { ...i, stock: stock.get(i.id) ?? 0, cost: c?.unit ?? null, costPartial: !!c?.partial }; });
    const kg = rows.filter((r) => r.unit.toLowerCase() === "kg");
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card><p className="text-xs text-muted">{t("wh.itemsN")}</p><p className="mt-1 text-2xl font-bold tabular-nums">{n(rows.length)}</p></Card>
          <Card><p className="text-xs text-muted">{t("wh.withStock")}</p><p className="mt-1 text-2xl font-bold tabular-nums">{n(rows.filter((r) => r.stock > 0).length)}</p></Card>
          {kg.length > 0 && <Card><p className="text-xs text-muted">{t("wh.totalKg")}</p><p className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">{fmt(kg.reduce((s, r) => s + r.stock, 0))} kg</p></Card>}
        </div>
        {rows.length === 0 ? <EmptyState>{t(kind === "STICKER" ? "wh.noStickers" : kind === "PACKAGING" ? "wh.noPackaging" : "wh.noMaterials")}</EmptyState> : <StockTable key={kind} rows={rows} money={money} />}
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
      include: { product: { select: { code: true, name: true, unit: true } } },
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
                      {m.docId && <> · <Link href={`/stock/${m.docId}`} className="text-brand-600">{t("sd.viewDoc")}</Link></>}
                    </p>
                  </div>
                  <span className={cn("self-center text-end font-bold tabular-nums", Number(m.qty) < 0 && "text-red-600 dark:text-red-400")} dir="ltr">{Number(m.qty) > 0 ? "+" : "−"}{fmt(Math.abs(Number(m.qty)))}{m.product.unit.toLowerCase() === "kg" && " kg"}</span>
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
