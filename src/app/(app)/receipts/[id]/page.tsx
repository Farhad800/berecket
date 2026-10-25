import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { canSeeMoney, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import LayoutEditor from "../layout-editor";
import { previewSamples, toRow } from "../data";

export const metadata = { title: "Receipt layout" };

export default async function EditLayoutPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageUser("receipts:manage");
  const t = await getTranslations();
  const l = await db.receiptLayout.findUnique({ where: { id: (await params).id } });
  if (!l) notFound();
  return (
    <>
      <Link href="/receipts" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.receipts")}</Link>
      <PageHeader title={l.name} />
      <LayoutEditor layout={toRow(l)} samples={canSeeMoney(me) ? await previewSamples() : {}} />
    </>
  );
}
