import type { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { FileSpreadsheet, Plus, Tags, PackagePlus } from "lucide-react";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, LinkButton, PageHeader } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import MasterList from "@/components/master-list";
import { saveProductAction } from "@/app/actions/masterdata";

export const metadata = { title: "Products" };
const LIMIT = 300;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string; mold?: string }> }) {
  const me = await pageUser("products:view");
  const t = await getTranslations();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const [molds, labels] = await Promise.all([
    db.mold.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    db.product.findMany({ where: { archivedAt: null, kind: "STICKER" }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, name2: true } }),
  ]);
  const mold = sp.mold === "none" ? "none" : molds.find((m) => m.id === sp.mold);
  const where: Prisma.ProductWhereInput = {
    kind: "PRODUCT",
    archivedAt: sp.archived === "1" ? { not: null } : null,
    ...(mold === "none" ? { moldId: null } : mold ? { moldId: mold.id } : {}),
    ...(q ? { OR: [
      { name: { contains: q, mode: "insensitive" } },
      { name2: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { material: { contains: q, mode: "insensitive" } },
      { mold: { code: { contains: q, mode: "insensitive" } } },
    ] } : {}),
  };
  const [products, total] = await Promise.all([
    db.product.findMany({ where, orderBy: [{ mold: { code: "asc" } }, { code: "asc" }], take: LIMIT, include: { mold: { select: { code: true, name: true } }, label: { select: { code: true, name: true } }, _count: { select: { components: true } } } }),
    db.product.count({ where }),
  ]);

  const moldOptions = molds.map((m) => ({ value: m.id, label: m.code, hint: m.name }));
  const fields = [
    { name: "labelId", label: t("md.label"), type: "combo" as const, wide: true, options: labels.map((l) => ({ value: l.id, label: l.name, hint: [l.code, l.name2].filter(Boolean).join(" · ") })), hint: t("md.labelHint") },
    { name: "moldId", label: t("md.mold"), type: "combo" as const, options: moldOptions, hint: t("md.moldOfProductHint") },
    { name: "code", label: t("md.productCode"), required: true, ltr: true },
    { name: "name", label: t("md.productName"), hint: t("md.productNameFromLabel") },
    { name: "name2", label: t("md.name2"), hint: t("md.name2Hint") },
    { name: "material", label: t("md.material"), hint: "PP, HDPE, ABS…" },
    { name: "color", label: t("md.color") },
    { name: "weightGrams", label: t("md.weightGrams"), type: "number" as const, step: "0.01", min: 0, ltr: true },
    { name: "cycleTimeSec", label: t("md.cycleTime"), type: "number" as const, step: "0.1", min: 0, ltr: true, hint: t("md.cycleTimeHint") },
    { name: "unit", label: t("md.unit"), type: "select" as const, required: true, options: [{ value: "pcs", label: t("md.pcs") }] },
    { name: "qcRequired", label: t("md.qcRequired"), type: "checkbox" as const, hint: t("md.qcRequiredHint") },
    { name: "specifications", label: t("md.specifications"), type: "textarea" as const },
  ];
  const canCreate = can(me, "products:create");

  return (
    <>
      <PageHeader
        title={t("nav.products")}
        subtitle={mold && mold !== "none" ? `${mold.code} · ${mold.name} — ${t("md.labelsN", { n: total })}` : t("md.productsN", { n: total })}
        actions={canCreate ? (
          <>
            {mold && mold !== "none" && <LinkButton href={`/assets/molds/${mold.id}/labels`}><Tags className="size-4" /> {t("md.addLabels")}</LinkButton>}
            <LinkButton href="/products/new"><Plus className="size-4" /> {t("md.newProduct")}</LinkButton>
            <LinkButton href="/products/new-item" variant="secondary"><PackagePlus className="size-4" /> {t("item.newButton")}</LinkButton>
            <LinkButton href="/import" variant="secondary"><FileSpreadsheet className="size-4" /> {t("imp.button")}</LinkButton>
            {can(me, "products:edit") && <LinkButton href="/import/items" variant="secondary"><FileSpreadsheet className="size-4" /> {t("iw.button")}</LinkButton>}
          </>
        ) : undefined}
      />
      <ListToolbar
        placeholder={t("md.searchProducts")}
        filters={[
          { name: "mold", label: t("md.allMolds"), options: [...molds.map((m) => ({ value: m.id, label: `${m.code} · ${m.name}` })), { value: "none", label: t("md.noMold") }] },
          { name: "archived", label: t("common.active"), options: [{ value: "1", label: t("common.archived") }] },
        ]}
      />
      {total > LIMIT && <div className="mb-3"><Alert tone="blue">{t("md.showingFirst", { n: LIMIT, total })}</Alert></div>}
      <MasterList
        kind="product"
        newLabel={t("md.newProduct")}
        fields={fields}
        action={saveProductAction}
        canCreate={false}
        canEdit={can(me, "products:edit")}
        canArchive={can(me, "products:archive")}
        rows={products.map((p) => ({
          id: p.id,
          title: p.name,
          code: p.code,
          subtitle: [p.name2, p.specifications].filter(Boolean).join(" — ") || undefined,
          archived: !!p.archivedAt,
          badges: p.qcRequired ? [{ label: t("md.qcRequiredShort"), tone: "amber" as const }] : [],
          links: [{ href: `/products/${p.id}`, label: t("md.recipeLink") }],
          editHref: `/products/${p.id}#edit`,
          facts: [
            { label: t("md.label"), value: p.label ? `${p.label.code} · ${p.label.name}` : t("md.noLabel") },
            ...(p._count.components ? [{ label: t("md.recipe"), value: t("md.recipeLines", { n: p._count.components }) }] : []),
            ...(p.mold ? [{ label: t("md.mold"), value: `${p.mold.code} · ${p.mold.name}` }] : []),
            ...(p.material ? [{ label: t("md.material"), value: [p.material, p.color].filter(Boolean).join(" · ") }] : []),
            ...(p.weightGrams ? [{ label: t("md.weightGrams"), value: `${p.weightGrams} g` }] : []),
            ...(p.cycleTimeSec ? [{ label: t("md.cycleTime"), value: `${p.cycleTimeSec} s` }] : []),
          ],
          initial: { ...p, name2: p.name2 ?? "", labelId: p.labelId ?? "", moldId: p.moldId ?? "", weightGrams: p.weightGrams?.toString() ?? "", cycleTimeSec: p.cycleTimeSec?.toString() ?? "" },
        }))}
      />
    </>
  );
}
