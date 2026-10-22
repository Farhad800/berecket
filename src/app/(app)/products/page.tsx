import type { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import MasterList from "@/components/master-list";
import { saveProductAction } from "@/app/actions/masterdata";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string }> }) {
  const me = await pageUser("products:view");
  const t = await getTranslations();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const where: Prisma.ProductWhereInput = {
    archivedAt: sp.archived === "1" ? { not: null } : null,
    ...(q ? { OR: [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { material: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };
  const products = await db.product.findMany({
    where,
    orderBy: { code: "asc" },
    take: 300,
    include: { molds: { where: { archivedAt: null }, select: { code: true } } },
  });

  const fields = [
    { name: "code", label: t("md.productCode"), required: true, ltr: true },
    { name: "name", label: t("md.productName"), required: true },
    { name: "material", label: t("md.material"), hint: "PP, HDPE, ABS…" },
    { name: "color", label: t("md.color") },
    { name: "weightGrams", label: t("md.weightGrams"), type: "number" as const, step: "0.01", min: 0, ltr: true },
    { name: "cycleTimeSec", label: t("md.cycleTime"), type: "number" as const, step: "0.1", min: 0, ltr: true, hint: t("md.cycleTimeHint") },
    { name: "unit", label: t("md.unit"), type: "select" as const, required: true, options: [{ value: "pcs", label: t("md.pcs") }] },
    { name: "qcRequired", label: t("md.qcRequired"), type: "checkbox" as const, hint: t("md.qcRequiredHint") },
    { name: "specifications", label: t("md.specifications"), type: "textarea" as const },
  ];

  return (
    <>
      <PageHeader title={t("nav.products")} subtitle={`${products.length}`} />
      <ListToolbar filters={[{ name: "archived", label: t("common.active"), options: [{ value: "1", label: t("common.archived") }] }]} />
      <MasterList
        kind="product"
        newLabel={t("md.newProduct")}
        fields={fields}
        action={saveProductAction}
        canCreate={can(me, "products:create")}
        canEdit={can(me, "products:edit")}
        canArchive={can(me, "products:archive")}
        rows={products.map((p) => ({
          id: p.id,
          title: p.name,
          code: p.code,
          subtitle: p.specifications ?? undefined,
          archived: !!p.archivedAt,
          badges: p.qcRequired ? [{ label: t("md.qcRequiredShort"), tone: "amber" as const }] : [],
          facts: [
            ...(p.material ? [{ label: t("md.material"), value: [p.material, p.color].filter(Boolean).join(" · ") }] : []),
            ...(p.weightGrams ? [{ label: t("md.weightGrams"), value: `${p.weightGrams} g` }] : []),
            ...(p.cycleTimeSec ? [{ label: t("md.cycleTime"), value: `${p.cycleTimeSec} s` }] : []),
            ...(p.molds.length ? [{ label: t("md.molds"), value: p.molds.map((m) => m.code).join(", ") }] : []),
          ],
          initial: { ...p, weightGrams: p.weightGrams?.toString() ?? "", cycleTimeSec: p.cycleTimeSec?.toString() ?? "" },
        }))}
      />
    </>
  );
}
