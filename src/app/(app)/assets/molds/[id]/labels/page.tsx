import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import LabelsForm from "./labels-form";

export const metadata = { title: "Add labels" };

/** Paste every label printed on one mold's product — each becomes its own product. */
export default async function MoldLabelsPage({ params }: { params: Promise<{ id: string }> }) {
  await pageUser("products:create");
  const t = await getTranslations();
  const { id } = await params;
  const mold = await db.mold.findUnique({
    where: { id },
    include: { products: { where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } } },
  });
  if (!mold) notFound();
  return (
    <>
      <Link href="/assets?tab=molds" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("md.molds")}
      </Link>
      <PageHeader title={`${t("md.addLabels")} · ${mold.code}`} subtitle={`${mold.name} — ${t("md.labelsN", { n: mold.products.length })}`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card><LabelsForm moldId={mold.id} moldCode={mold.code} /></Card>
        <Card>
          <h2 className="mb-2 font-semibold">{t("md.existingLabels")}</h2>
          {mold.products.length === 0 ? <p className="text-sm text-muted">{t("md.noLabelsYet")}</p> : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto text-sm">
              {mold.products.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 py-1.5"><span className="truncate">{p.name}</span><span className="text-xs text-muted" dir="ltr">{p.code}</span></li>
              ))}
            </ul>
          )}
          <Link href={`/products?mold=${mold.id}`} className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">{t("md.viewLabels")}</Link>
        </Card>
      </div>
    </>
  );
}
