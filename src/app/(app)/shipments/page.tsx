import Link from "next/link";
import type { Prisma, ShipmentStatus } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/time";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { SHIP_TONE } from "@/lib/tones";
import ListToolbar from "@/components/list-toolbar";

export const metadata = { title: "Customer Shipments" };

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const me = await pageUser("shipments:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const status = ["DRAFT", "CONFIRMED", "CANCELLED"].includes(sp.status ?? "") ? (sp.status as ShipmentStatus) : undefined;
  const where: Prisma.ShipmentWhereInput = {
    ...(status ? { status } : { status: { not: "CANCELLED" } }),
    ...(q ? { OR: [
      { number: { contains: q, mode: "insensitive" } },
      { deliveryNote: { contains: q, mode: "insensitive" } },
      { order: { number: { contains: q, mode: "insensitive" } } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
    ] } : {}),
  };
  const shipments = await db.shipment.findMany({
    where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 150,
    include: { customer: { select: { name: true } }, order: { select: { id: true, number: true } }, lines: { select: { qty: true } } },
  });

  return (
    <>
      <PageHeader
        title={t("nav.shipments")}
        actions={can(me, "shipments:create") && <LinkButton href="/shipments/new"><Plus className="size-4" /> {t("ship.new")}</LinkButton>}
      />
      <ListToolbar placeholder={t("ship.search")} filters={[{ name: "status", label: t("ship.notCancelled"), options: ["DRAFT", "CONFIRMED", "CANCELLED"].map((s) => ({ value: s, label: t(`status.ship.${s}`) })) }]} />
      {shipments.length === 0 ? <EmptyState>{t("common.empty")}</EmptyState> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {shipments.map((s) => (
              <li key={s.id}>
                <Link href={`/shipments/${s.id}`} className="grid gap-1 px-4 py-3 hover:bg-surface-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold" dir="ltr">{s.number}</span>
                      <Badge tone={SHIP_TONE[s.status]}>{t(`status.ship.${s.status}`)}</Badge>
                      {s.deliveryNote && <span className="text-xs text-muted" dir="ltr">{s.deliveryNote}</span>}
                    </div>
                    <p className="text-sm">{s.customer.name} · <span dir="ltr">{s.order.number}</span></p>
                  </div>
                  <div className="text-sm sm:text-end">
                    <p className="font-semibold tabular-nums">{formatNumber(s.lines.reduce((a, l) => a + l.qty, 0), locale)} {t("md.pcs")}</p>
                    <p className="text-xs text-muted">{formatDate(s.shippedAt ?? s.plannedDate ?? s.createdAt, locale)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
