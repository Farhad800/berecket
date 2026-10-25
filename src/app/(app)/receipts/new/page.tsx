import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { canSeeMoney, pageUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import LayoutEditor from "../layout-editor";
import { previewSamples } from "../data";

export const metadata = { title: "New receipt layout" };

export default async function NewLayoutPage() {
  const me = await pageUser("receipts:manage");
  const t = await getTranslations();
  return (
    <>
      <Link href="/receipts" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.receipts")}</Link>
      <PageHeader title={t("rc2.new")} />
      <LayoutEditor layout={null} samples={canSeeMoney(me) ? await previewSamples() : {}} />
    </>
  );
}
