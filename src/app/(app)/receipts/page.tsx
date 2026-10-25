import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { RECEIPT_FOR } from "@/lib/receipt-layout";
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Receipts" };

/** Saved receipt layouts, grouped by what they print. */
export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await pageUser("stock:view");
  const t = await getTranslations();
  const locale = await getLocale();
  const saved = (await searchParams).saved;
  const manage = can(me, "receipts:manage");
  const layouts = await db.receiptLayout.findMany({ orderBy: [{ docType: "asc" }, { isDefault: "desc" }, { name: "asc" }], select: { id: true, name: true, docType: true, language: true, isDefault: true, updatedAt: true, banner: true } });
  return (
    <>
      <PageHeader title={t("nav.receipts")} subtitle={t("rc2.intro")} actions={manage ? <LinkButton href="/receipts/new"><Plus className="size-4" /> {t("rc2.new")}</LinkButton> : undefined} />
      {saved && <div className="mb-3"><Alert tone="green">{t("rc2.saved")}</Alert></div>}
      {layouts.length === 0 ? <EmptyState>{manage ? t("rc2.noneManage") : t("rc2.none")}</EmptyState> : (
        <div className="space-y-4">
          {RECEIPT_FOR.filter((d) => layouts.some((l) => l.docType === d)).map((d) => (
            <section key={d}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{t(`rc2.type.${d}`)}</h2>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {layouts.filter((l) => l.docType === d).map((l) => (
                  <li key={l.id}>
                    <Card className="h-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {l.banner && <img src={l.banner} alt="" className="mb-2 h-14 w-full rounded object-contain" />}
                      <p className="flex flex-wrap items-center gap-2 font-semibold">{manage ? <Link href={`/receipts/${l.id}`} className="hover:underline">{l.name}</Link> : l.name}{l.isDefault && <Badge tone="green">{t("rc2.isDefault")}</Badge>}</p>
                      <p className="mt-0.5 text-xs text-muted">{t(`rc2.lang.${l.language}`)} · {formatDateTime(l.updatedAt, locale)}</p>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="mt-4 text-sm text-muted">{t("rc2.howToPrint")}</p>
    </>
  );
}
