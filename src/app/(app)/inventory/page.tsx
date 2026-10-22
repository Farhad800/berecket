import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/time";
import { getBatchBalances } from "@/lib/stock";
import { QC_TONE } from "@/lib/tones";
import { Badge, Card, EmptyState, PageHeader, cn } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import RecordForm from "@/components/record-form";
import { adjustStockAction, saveLocationAction } from "@/app/actions/warehouse";
import ReceiveForm from "./receive-form";

export const metadata = { title: "Warehouse Inventory" };
const TABS = ["stock", "awaiting", "receipts", "movements", "locations"] as const;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; batch?: string; state?: string; type?: string }>;
}) {
  const me = await pageUser("warehouse:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : sp.batch ? "awaiting" : "stock";
  const q = sp.q?.trim();
  const n = (v: number) => formatNumber(v, locale);

  const tabs = (
    <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {TABS.map((k) => (
        <Link key={k} href={`/inventory?tab=${k}`} role="tab" aria-selected={tab === k}
          className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap", tab === k ? "border-brand-600 text-brand-700 dark:text-brand-200" : "border-transparent text-muted")}>
          {t(`wh.tab.${k}`)}
        </Link>
      ))}
    </div>
  );
  const header = <><PageHeader title={t("nav.inventory")} subtitle={t("wh.ledgerNote")} />{tabs}</>;
  const productFilter = q ? { OR: [
    { number: { contains: q, mode: "insensitive" as const } },
    { product: { code: { contains: q, mode: "insensitive" as const } } },
    { product: { name: { contains: q, mode: "insensitive" as const } } },
    { orderLine: { order: { number: { contains: q, mode: "insensitive" as const } } } },
  ] } : {};

  // ── Stock on hand per batch
  if (tab === "stock") {
    const withStock = await db.stockMovement.groupBy({ by: ["batchId"], where: { state: { not: "SHIPPED" } }, _sum: { qty: true } });
    const ids = withStock.filter((r) => (r._sum.qty ?? 0) !== 0).map((r) => r.batchId);
    const batches = await db.batch.findMany({
      where: { id: { in: ids }, ...productFilter },
      include: { product: { select: { code: true, name: true } }, orderLine: { select: { order: { select: { id: true, number: true, customer: { select: { name: true } } } } } } },
      orderBy: [{ product: { code: "asc" } }, { createdAt: "asc" }],
    });
    const bal = await getBatchBalances(batches.map((b) => b.id));
    const totals = { AVAILABLE: 0, RESERVED: 0, QUARANTINE: 0, REJECTED: 0 };
    for (const b of batches) for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += bal.get(b.id)![k];
    const all = await db.batch.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, product: { select: { code: true } } }, orderBy: { number: "asc" } });

    return (
      <>
        {header}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["AVAILABLE", "RESERVED", "QUARANTINE", "REJECTED"] as const).map((s) => (
            <Card key={s} className={cn(s === "QUARANTINE" && totals[s] > 0 && "border-amber-300", s === "REJECTED" && totals[s] > 0 && "border-red-300")}>
              <p className="text-xs text-muted">{t(`status.stock.${s}`)}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{n(totals[s])}</p>
            </Card>
          ))}
        </div>
        <ListToolbar placeholder={t("wh.searchStock")} />
        {batches.length === 0 ? <EmptyState>{t("wh.noStock")}</EmptyState> : (
          <Card className="mb-4 p-0 sm:p-0">
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 text-start">{t("md.product")} / {t("prod.batch")}</th>
                    <th className="px-2 py-2 text-start">{t("order.customer")}</th>
                    <th className="px-2 py-2 text-end">{t("status.stock.AVAILABLE")}</th>
                    <th className="px-2 py-2 text-end">{t("status.stock.RESERVED")}</th>
                    <th className="px-2 py-2 text-end">{t("status.stock.QUARANTINE")}</th>
                    <th className="px-4 py-2 text-end">{t("status.stock.REJECTED")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {batches.map((b) => {
                    const x = bal.get(b.id)!;
                    return (
                      <tr key={b.id} className="hover:bg-surface-2">
                        <td className="px-4 py-2">
                          <span className="font-semibold">{b.product.name}</span> <span className="text-xs text-muted" dir="ltr">{b.product.code}</span>
                          <div className="flex items-center gap-2 text-xs"><Link href={`/qc/batches/${b.id}`} className="text-brand-600 hover:underline" dir="ltr">{b.number}</Link><Badge tone={QC_TONE[b.qcStatus]}>{t(`status.qc.${b.qcStatus}`)}</Badge></div>
                        </td>
                        <td className="px-2 py-2 text-xs"><Link href={`/orders/${b.orderLine.order.id}`} className="hover:underline" dir="ltr">{b.orderLine.order.number}</Link><div className="text-muted">{b.orderLine.order.customer.name}</div></td>
                        <td className="px-2 py-2 text-end font-semibold tabular-nums">{n(x.AVAILABLE)}</td>
                        <td className="px-2 py-2 text-end tabular-nums">{n(x.RESERVED)}</td>
                        <td className={cn("px-2 py-2 text-end tabular-nums", x.QUARANTINE > 0 && "font-semibold text-amber-700")}>{n(x.QUARANTINE)}</td>
                        <td className={cn("px-4 py-2 text-end tabular-nums", x.REJECTED > 0 && "font-semibold text-red-600")}>{n(x.REJECTED)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {can(me, "warehouse:approve") && all.length > 0 && (
          <Card>
            <h2 className="mb-1 font-semibold">{t("wh.adjustTitle")}</h2>
            <p className="mb-3 text-xs text-muted">{t("wh.adjustHint")}</p>
            <RecordForm
              action={adjustStockAction}
              submitLabel={t("wh.saveAdjustment")}
              initial={{ state: "AVAILABLE", kind: "COUNT" }}
              fields={[
                { name: "batchId", label: t("prod.batch"), type: "combo", required: true, options: all.map((b) => ({ value: b.id, label: b.number, hint: b.product.code })) },
                { name: "state", label: t("wh.stockState"), type: "select", required: true, options: (["AVAILABLE", "QUARANTINE", "REJECTED"] as const).map((s) => ({ value: s, label: t(`status.stock.${s}`) })) },
                { name: "qty", label: t("wh.adjustQty"), type: "number", required: true, ltr: true, hint: t("prod.deltaHint") },
                { name: "kind", label: t("wh.adjustKind"), type: "select", required: true, options: ["COUNT", "DAMAGE", "SCRAP", "OTHER"].map((k) => ({ value: k, label: t(`wh.kind.${k}`) })) },
                { name: "reason", label: t("prod.reason"), required: true, wide: true },
              ]}
            />
          </Card>
        )}
      </>
    );
  }

  // ── Finished goods waiting for warehouse receipt
  if (tab === "awaiting") {
    const rows = await db.$queryRaw<{ id: string; produced: bigint; received: bigint }[]>`
      SELECT b.id, COALESCE(p.good,0) AS produced, COALESCE(r.rec,0) AS received
      FROM "Batch" b
      LEFT JOIN (SELECT "batchId", SUM("qtyGood") AS good FROM "ProductionEntry" GROUP BY "batchId") p ON p."batchId" = b.id
      LEFT JOIN (SELECT "batchId", SUM("qtyReceived") AS rec FROM "WarehouseReceipt" GROUP BY "batchId") r ON r."batchId" = b.id
      WHERE b."qcStatus" <> 'REJECTED' AND COALESCE(p.good,0) > COALESCE(r.rec,0)`;
    const remaining = new Map(rows.map((r) => [r.id, Number(r.produced) - Number(r.received)]));
    const [batches, locations] = await Promise.all([
      db.batch.findMany({
        where: { id: { in: [...remaining.keys()] }, ...productFilter },
        include: { product: { select: { code: true, name: true } }, orderLine: { select: { order: { select: { number: true } } } }, job: { select: { machine: { select: { code: true } } } } },
        orderBy: { createdAt: "asc" },
      }),
      db.storageLocation.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    ]);
    const canReceive = can(me, "warehouse:create");
    return (
      <>
        {header}
        <div className={cn("grid gap-4", canReceive && "lg:grid-cols-[1fr_400px]")}>
          <div className="min-w-0">
            <ListToolbar placeholder={t("wh.searchStock")} />
            {batches.length === 0 ? <EmptyState>{t("wh.nothingAwaiting")}</EmptyState> : (
              <Card className="p-0 sm:p-0">
                <ul className="divide-y divide-line">
                  {batches.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{b.product.name} <span className="text-xs font-normal text-muted" dir="ltr">{b.product.code}</span></p>
                        <p className="flex flex-wrap items-center gap-2 text-xs text-muted"><span dir="ltr">{b.number} · {b.orderLine.order.number} · {b.job.machine?.code}</span><Badge tone={QC_TONE[b.qcStatus]}>{t(`status.qc.${b.qcStatus}`)}</Badge></p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold tabular-nums">{n(remaining.get(b.id) ?? 0)}</span>
                        {canReceive && <Link href={`/inventory?tab=awaiting&batch=${b.id}`} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface-2">{t("wh.receive")}</Link>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
          {canReceive && (
            <div className="lg:sticky lg:top-20 lg:self-start">
              <ReceiveForm
                key={sp.batch ?? "none"}
                preselect={sp.batch}
                canOver={can(me, "warehouse:approve")}
                locations={locations.map((l) => ({ id: l.id, label: `${l.code} · ${l.name}` }))}
                batches={batches.map((b) => ({ value: b.id, label: b.number, hint: `${b.product.code} · ${b.orderLine.order.number}`, remaining: remaining.get(b.id) ?? 0, qc: b.qcStatus }))}
              />
            </div>
          )}
        </div>
      </>
    );
  }

  if (tab === "receipts") {
    const receipts = await db.warehouseReceipt.findMany({
      where: q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { batch: productFilter }] } : {},
      orderBy: { receivedAt: "desc" }, take: 150,
      include: { batch: { select: { id: true, number: true, product: { select: { code: true } } } }, location: { select: { code: true } }, orderLine: { select: { order: { select: { number: true } } } } },
    });
    const users = await db.user.findMany({ select: { id: true, fullName: true } });
    return (
      <>
        {header}
        <ListToolbar placeholder={t("wh.searchStock")} />
        {receipts.length === 0 ? <EmptyState>{t("common.empty")}</EmptyState> : (
          <Card className="p-0 sm:p-0">
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr><th className="px-4 py-2 text-start">{t("wh.receipt")}</th><th className="px-2 py-2 text-start">{t("prod.batch")}</th><th className="px-2 py-2 text-end">{t("wh.qtyReceived")}</th><th className="px-2 py-2 text-end">{t("status.stock.QUARANTINE")}</th><th className="px-2 py-2 text-start">{t("wh.location")}</th><th className="px-4 py-2 text-start">{t("wh.by")}</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2"><span dir="ltr">{r.number}</span><div className="text-xs text-muted">{formatDateTime(r.receivedAt, locale)}</div></td>
                      <td className="px-2 py-2"><Link href={`/qc/batches/${r.batch.id}`} className="text-brand-600 hover:underline" dir="ltr">{r.batch.number}</Link><div className="text-xs text-muted" dir="ltr">{r.batch.product.code} · {r.orderLine.order.number}</div></td>
                      <td className="px-2 py-2 text-end font-semibold tabular-nums">{n(r.qtyReceived)}</td>
                      <td className="px-2 py-2 text-end tabular-nums">{n(r.qtyQuarantine)}</td>
                      <td className="px-2 py-2" dir="ltr">{r.location.code}</td>
                      <td className="px-4 py-2">{users.find((u) => u.id === r.receivedById)?.fullName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </>
    );
  }

  if (tab === "movements") {
    const types = ["RECEIPT", "RESERVE", "UNRESERVE", "SHIP", "QC_SYNC", "ADJUST", "SCRAP"];
    const moves = await db.stockMovement.findMany({
      where: {
        ...(types.includes(sp.type ?? "") ? { type: sp.type } : {}),
        ...(q ? { batch: productFilter } : {}),
      },
      orderBy: { createdAt: "desc" }, take: 300,
      include: { batch: { select: { id: true, number: true } }, product: { select: { code: true } } },
    });
    const users = await db.user.findMany({ select: { id: true, fullName: true } });
    return (
      <>
        {header}
        <ListToolbar placeholder={t("wh.searchStock")} filters={[{ name: "type", label: t("wh.allTypes"), options: types.map((x) => ({ value: x, label: t(`wh.mv.${x}`) })) }]} />
        {moves.length === 0 ? <EmptyState>{t("common.empty")}</EmptyState> : (
          <Card className="p-0 sm:p-0">
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr><th className="px-4 py-2 text-start">{t("admin.when")}</th><th className="px-2 py-2 text-start">{t("wh.type")}</th><th className="px-2 py-2 text-start">{t("prod.batch")}</th><th className="px-2 py-2 text-start">{t("wh.stockState")}</th><th className="px-2 py-2 text-end">{t("order.quantity")}</th><th className="px-4 py-2 text-start">{t("wh.by")} / {t("prod.reason")}</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {moves.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2 text-xs whitespace-nowrap text-muted">{formatDateTime(m.createdAt, locale)}</td>
                      <td className="px-2 py-2"><Badge>{t(`wh.mv.${m.type}`)}</Badge></td>
                      <td className="px-2 py-2"><Link href={`/qc/batches/${m.batch.id}`} className="text-brand-600 hover:underline" dir="ltr">{m.batch.number}</Link> <span className="text-xs text-muted" dir="ltr">{m.product.code}</span></td>
                      <td className="px-2 py-2 text-xs">{t(`status.stock.${m.state}`)}</td>
                      <td className={cn("px-2 py-2 text-end font-semibold tabular-nums", m.qty < 0 ? "text-red-600" : "text-emerald-700")} dir="ltr">{m.qty > 0 ? "+" : ""}{n(m.qty)}</td>
                      <td className="px-4 py-2 text-xs">{users.find((u) => u.id === m.createdById)?.fullName}{m.reason && <div className="text-muted">{m.reason}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </>
    );
  }

  // Locations
  const locations = await db.storageLocation.findMany({ orderBy: { code: "asc" }, include: { _count: { select: { receipts: true } } } });
  return (
    <>
      {header}
      {can(me, "warehouse:approve") && (
        <Card className="mb-4">
          <h2 className="mb-3 font-semibold">{t("wh.newLocation")}</h2>
          <RecordForm action={saveLocationAction} fields={[{ name: "code", label: t("md.code"), required: true, ltr: true, hint: "FG-C" }, { name: "name", label: t("wh.locationName"), required: true }]} />
        </Card>
      )}
      <Card className="p-0 sm:p-0">
        <ul className="divide-y divide-line">
          {locations.map((l) => (
            <li key={l.id} className="flex justify-between px-4 py-3 text-sm"><span><b dir="ltr">{l.code}</b> · {l.name}</span><span className="text-xs text-muted">{t("wh.receiptsCount", { n: l._count.receipts })}</span></li>
          ))}
        </ul>
      </Card>
    </>
  );
}
