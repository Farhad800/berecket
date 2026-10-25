import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStock } from "@/lib/stock";
import { PageHeader } from "@/components/ui";
import RecipeEditor, { type Item } from "../[id]/recipe-editor";

export const metadata = { title: "New product" };

/** New product: label (name comes from it) or typed name, code, mold, and what it is made of and packed in. */
export default async function NewProductPage() {
  await pageUser("products:create");
  const t = await getTranslations();
  const sel = { id: true, code: true, name: true, name2: true, unit: true, unitWeightKg: true, kind: true } as const;
  const [labels, made, packs, molds] = await Promise.all([
    db.product.findMany({ where: { archivedAt: null, kind: "STICKER" }, orderBy: { name: "asc" }, select: sel }),
    db.product.findMany({ where: { archivedAt: null, kind: { in: ["MATERIAL", "PRODUCT"] } }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: sel }),
    db.product.findMany({ where: { archivedAt: null, kind: "PACKAGING" }, orderBy: { name: "asc" }, select: sel }),
    db.mold.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  const stock = await getStock([...labels, ...made, ...packs].map((i) => i.id));
  const item = (i: (typeof labels)[number]): Item => ({ ...i, unitWeightKg: i.unitWeightKg ? Number(i.unitWeightKg) : null, stock: stock.get(i.id) ?? 0 });
  return (
    <>
      <Link href="/products" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.products")}</Link>
      <PageHeader title={t("md.newProduct")} subtitle={t("rc.newIntro")} />
      <RecipeEditor canEdit labels={labels.map(item)} madeOf={made.map(item)} packaging={packs.map(item)} molds={molds} initial={{ labelId: null, lines: [] }} />
    </>
  );
}
