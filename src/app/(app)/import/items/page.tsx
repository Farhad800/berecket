import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Download } from "lucide-react";
import { can, canSeeMoney, pageUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import ItemsImportForm from "./items-form";

export const metadata = { title: "Items workbook" };

/** Download every item as one Excel workbook, fill it in, upload it back. */
export default async function ItemsWorkbookPage() {
  const me = await pageUser();
  if (!can(me, "products:create") || !can(me, "products:edit")) redirect("/forbidden");
  const t = await getTranslations();
  return (
    <>
      <Link href="/inventory" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.inventory")}</Link>
      <PageHeader title={t("iw.title")} subtitle={t("iw.subtitle")} />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card><ItemsImportForm /></Card>
        <Card>
          <h2 className="mb-2 font-semibold">{t("iw.step1")}</h2>
          <p className="mb-3 text-sm text-muted">{t("iw.step1Hint")}</p>
          <a href="/api/import/items" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700" download>
            <Download className="size-4" /> {t("iw.download")}
          </a>
          <ul className="mt-4 list-disc space-y-1.5 ps-5 text-sm text-muted">
            <li>{t("iw.tip1")}</li>
            <li>{t("iw.tip2")}</li>
            {canSeeMoney(me) ? <li>{t("iw.tip3")}</li> : <li>{t("iw.tipNoCost")}</li>}
            <li>{t("iw.tip4")}</li>
            <li>{t("iw.tip5")}</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
