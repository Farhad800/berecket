import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentShift, formatDate } from "@/lib/time";
import { dayValue, todayYmd } from "@/lib/production";
import { openOrderDemand } from "@/lib/orders";
import { getStock } from "@/lib/stock";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import DailySheet from "./daily-sheet";

export const metadata = { title: "Daily production entry" };

/** The sheet the factory fills in every day: product + quantity, per shift. */
export default async function DailyEntryPage({ searchParams }: { searchParams: Promise<{ day?: string; shift?: string }> }) {
  await pageUser("production:create");
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const today = todayYmd();
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day <= today ? sp.day : today;
  const shift = (["A", "B", "C"] as const).find((s) => s === sp.shift) ?? currentShift();

  const [products, demand, stock, entered] = await Promise.all([
    db.product.findMany({ where: { archivedAt: null, kind: "PRODUCT" }, orderBy: [{ mold: { code: "asc" } }, { code: "asc" }], select: { id: true, code: true, name: true, name2: true, mold: { select: { code: true } } } }),
    openOrderDemand(),
    getStock(),
    db.productionEntry.groupBy({ by: ["productId", "shift"], where: { day: dayValue(day) }, _sum: { quantity: true } }),
  ]);
  if (products.length === 0) {
    return (
      <>
        <PageHeader title={t("daily.title")} />
        <EmptyState><p className="mb-3">{t("order.needProducts")}</p><LinkButton href="/products" variant="secondary">{t("nav.products")}</LinkButton></EmptyState>
      </>
    );
  }
  const rows = products.map((p) => ({
    id: p.id, code: p.code, name: p.name, name2: p.name2, mold: p.mold?.code ?? null,
    ordered: demand.get(p.id) ?? 0,
    stock: stock.get(p.id) ?? 0,
    entered: Object.fromEntries((["A", "B", "C"] as const).map((s) => [s, entered.find((e) => e.productId === p.id && e.shift === s)?._sum.quantity ?? 0])) as Record<"A" | "B" | "C", number>,
  }));

  return (
    <>
      <Link href={`/production?day=${day}`} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.production")}
      </Link>
      <PageHeader title={t("daily.title")} subtitle={t("daily.subtitle", { date: formatDate(dayValue(day), locale) })} />
      <DailySheet rows={rows} day={day} today={today} shift={shift} />
    </>
  );
}
