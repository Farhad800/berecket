import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { can, canSeeMoney, pageUser } from "@/lib/auth";
import { productCosts } from "@/lib/product-costs";
import Batches from "./batches";
import ItemDetails from "./item-details";
import { formatDateTime } from "@/lib/time";
import { getLocale } from "next-intl/server";
import ItemCost from "./item-cost";
import ProductCostCard from "./product-cost";
import { db } from "@/lib/db";
import { getStock } from "@/lib/stock";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import RecipeEditor, { type Item } from "./recipe-editor";
import UnitWeight from "./unit-weight";

export const metadata = { title: "Product" };

/** One item: for products, its label, what it is made of and how it is packed. */
export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const me = await pageUser("products:view");
  const t = await getTranslations();
  const { id } = await params;
  const created = (await searchParams).created === "1";
  const p = await db.product.findUnique({
    where: { id },
    include: {
      mold: { select: { code: true, name: true } },
      label: { select: { id: true, code: true, name: true, unit: true } },
      components: { include: { component: { select: { id: true, code: true, name: true, name2: true, unit: true, unitWeightKg: true, kind: true } } }, orderBy: { createdAt: "asc" } },
      usedIn: { include: { product: { select: { id: true, code: true, name: true } } }, take: 50 },
      labelledProducts: { select: { id: true, code: true, name: true }, take: 50 },
    },
  });
  if (!p) notFound();
  const back = p.kind === "PRODUCT" ? "/products" : `/inventory?tab=${p.kind === "STICKER" ? "stickers" : p.kind === "PACKAGING" ? "packaging" : "materials"}`;
  const kindLabel = t(`md.kind.${p.kind}`);
  const money = canSeeMoney(me); // costs only for people who see money (Buy, Sell or Safe)

  if (p.kind !== "PRODUCT") {
    const stock = (await getStock([p.id])).get(p.id) ?? 0;
    const users = p.kind === "STICKER" ? p.labelledProducts : p.usedIn.map((u) => u.product);
    return (
      <>
        <Link href={back} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {kindLabel}</Link>
        <PageHeader title={p.name} subtitle={<span dir="ltr">{[p.name2, p.code].filter(Boolean).join(" · ")}</span>} />
        {created && <div className="mb-4"><Alert tone="green">{t("item.created", { code: p.code })}</Alert></div>}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted">{t("md.kindLabel")}</dt><dd><Badge>{kindLabel}</Badge></dd></div>
              <div><dt className="text-xs text-muted">{t("order.inStock")}</dt><dd className={stock < 0 ? "font-bold text-red-600" : "font-bold"} dir="ltr">{stock.toLocaleString("en", { maximumFractionDigits: 3 })} {p.unit}</dd></div>
            </dl>
            <ItemDetails id={p.id} canEdit={can(me, "products:edit")} unitLocked={(await db.stockMovement.count({ where: { productId: p.id } })) > 0}
              value={{ kind: p.kind as "STICKER" | "MATERIAL" | "PACKAGING", name: p.name, name2: p.name2 ?? "", code: p.code, unit: p.unit.toLowerCase() === "kg" ? "kg" : "pcs", bag: p.unitWeightKg ? String(Number(p.unitWeightKg)) : "" }} />
            {p.unit.toLowerCase() === "kg" && (
              <div className="mt-4"><UnitWeight itemId={p.id} value={p.unitWeightKg ? Number(p.unitWeightKg) : null} canEdit={can(me, "products:edit")} /></div>
            )}
            {money && (
              <div className="mt-4 border-t border-line pt-4">
                <ItemCost id={p.id} unit={p.unit.toLowerCase() === "kg" ? "kg" : "pcs"} canEdit={can(me, "products:edit")}
                  saved={p.costIqd === null ? null : { price: Number(p.costPrice), currency: p.costCurrency ?? "IQD", rate: Number(p.costRate ?? 1), iqd: Number(p.costIqd), at: p.costUpdatedAt ? formatDateTime(p.costUpdatedAt, await getLocale()) : "—" }} />
              </div>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">{t(p.kind === "STICKER" ? "md.labelUsedBy" : "md.usedBy")}</h2>
            {users.length === 0 ? <p className="text-sm text-muted">{t("md.notUsedYet")}</p> : (
              <ul className="divide-y divide-line text-sm">{users.map((u) => <li key={u.id} className="py-1.5"><Link href={`/products/${u.id}`} className="text-brand-600 hover:underline">{u.name}</Link> <span className="text-xs text-muted" dir="ltr">{u.code}</span></li>)}</ul>
            )}
          </Card>
        </div>
        {money && <Batches itemId={p.id} unit={p.unit} />}
      </>
    );
  }

  /** Plain numbers only go to the browser (and only for money roles). */
  async function costCard() {
    const c = (await productCosts([p!.id])).get(p!.id)!;
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const it = (i: { id: string; code: string; name: string; unit: string; unitWeightKg: unknown; costIqd: unknown; lots?: { left: number; unit: number | null }[] }) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit, unitWeightKg: num(i.unitWeightKg), costIqd: num(i.costIqd), lots: i.lots });
    const recipe = { label: c.recipe.label ? it(c.recipe.label) : null, components: c.recipe.components.map((l) => ({ qty: Number(l.qty), per: l.per, component: it(l.component) })) };
    return <ProductCostCard recipe={recipe} initialPieces={c.pieces} fromProduction={c.fromProduction} />;
  }

  const [labels, made, packs, molds] = await Promise.all([
    db.product.findMany({ where: { archivedAt: null, kind: "STICKER" }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, name2: true, unit: true, unitWeightKg: true, kind: true } }),
    db.product.findMany({ where: { archivedAt: null, OR: [{ kind: "MATERIAL" }, { kind: "PRODUCT", id: { not: p.id } }] }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, name2: true, unit: true, unitWeightKg: true, kind: true } }),
    db.product.findMany({ where: { archivedAt: null, kind: "PACKAGING" }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, name2: true, unit: true, unitWeightKg: true, kind: true } }),
    db.mold.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  const ids = [...new Set([...labels, ...made, ...packs].map((i) => i.id))];
  const stock = await getStock(ids);
  const item = (i: (typeof labels)[number]): Item => ({ id: i.id, code: i.code, name: i.name, name2: i.name2, unit: i.unit, kind: i.kind, unitWeightKg: i.unitWeightKg ? Number(i.unitWeightKg) : null, stock: stock.get(i.id) ?? 0 });

  return (
    <>
      <Link href={back} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.products")}</Link>
      <PageHeader title={p.name} subtitle={<span dir="ltr">{[p.name2, p.code, p.mold && `${t("md.mold")}: ${p.mold.code}`].filter(Boolean).join(" · ")}</span>} />
      {created && <div className="mb-4"><Alert tone="green">{t("rc.created")}</Alert></div>}
      {money && await costCard()}
      {money && <div className="mb-4"><Batches itemId={p.id} unit={p.unit} /></div>}
      <RecipeEditor
        productId={p.id}
        canEdit={can(me, "products:edit")}
        labels={labels.map(item)}
        madeOf={made.map(item)}
        packaging={packs.map(item)}
        molds={molds}
        details={{ code: p.code, name: p.name, name2: p.name2 ?? "", moldId: p.moldId ?? "", qcRequired: p.qcRequired }}
        initial={{
          labelId: p.labelId,
          lines: p.components.map((c) => ({ componentId: c.componentId, qty: Number(c.qty), per: c.per })),
        }}
      />
    </>
  );
}
