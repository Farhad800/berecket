import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { canSeeMoney, pageUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ItemForm from "./item-form";

export const metadata = { title: "New item" };

/** Add a label, raw material or packaging item by hand. */
export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const me = await pageUser("products:create");
  const t = await getTranslations();
  const k = (await searchParams).kind;
  const kind = k === "STICKER" || k === "MATERIAL" || k === "PACKAGING" ? k : null;
  return (
    <>
      <Link href="/inventory" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.inventory")}</Link>
      <PageHeader title={t("item.newTitle")} subtitle={t("item.intro")} />
      <ItemForm initialKind={kind} canCost={canSeeMoney(me)} />
    </>
  );
}
