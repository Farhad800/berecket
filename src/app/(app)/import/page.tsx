import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import ImportForm from "./import-form";
import { redirect } from "next/navigation";

export const metadata = { title: "Import from Excel" };

export default async function ImportPage() {
  const me = await pageUser();
  if (!can(me, "products:create") && !can(me, "assets:create")) redirect("/forbidden");
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("imp.title")} subtitle={t("imp.subtitle")} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card><ImportForm /></Card>
        <Card>
          <h2 className="mb-2 font-semibold">{t("imp.step1")}</h2>
          <p className="mb-3 text-sm text-muted">{t("imp.step1Hint")}</p>
          <a href="/api/import/template" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface-2" download>
            <Download className="size-4" /> {t("imp.download")}
          </a>
          <ul className="mt-4 list-disc space-y-1.5 ps-5 text-sm text-muted">
            <li>{t("imp.tip1")}</li>
            <li>{t("imp.tip2")}</li>
            <li>{t("imp.tip3")}</li>
            <li>{t("imp.tip4")}</li>
          </ul>
          {can(me, "products:create") && can(me, "products:edit") && <p className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">{t("iw.fromImport")} <a href="/import/items" className="font-semibold text-brand-600 underline">{t("iw.button")}</a></p>}
        </Card>
      </div>
    </>
  );
}
