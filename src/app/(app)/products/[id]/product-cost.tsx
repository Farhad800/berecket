import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { fmtIqd, type ProductCost } from "@/lib/cost";

/** What one piece costs, line by line (server component; only rendered for money roles). */
export default async function ProductCostCard({ cost }: { cost: ProductCost }) {
  const t = await getTranslations();
  const qty = (p: ProductCost["parts"][number]) => p.unit.toLowerCase() === "kg"
    ? `${(p.perPiece * 1000).toLocaleString("en", { maximumFractionDigits: 3 })} g`
    : p.perPiece >= 1 ? `${p.perPiece.toLocaleString("en", { maximumFractionDigits: 3 })} ${t("md.pcs")}` : `1/${Math.round(1 / p.perPiece).toLocaleString("en")}`;
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{t("cost.productTitle")}</h2>
        <p className="text-2xl font-bold tabular-nums" dir="ltr" data-testid="product-cost">{fmtIqd(cost.total)} IQD</p>
      </div>
      <p className="text-xs text-muted">{t("cost.productHint")}</p>
      {cost.missing.length > 0 && <p className="mt-2 text-sm font-semibold text-amber-600" data-testid="cost-missing">{t("cost.missing", { items: cost.missing.map((m) => m.name).join(", ") })}</p>}
      {cost.noRecipe ? <p className="mt-2 text-sm text-muted">{t("cost.noRecipe")}</p> : (
        <div className="table-wrap mt-3">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-1 text-start">{t("wh.item")}</th><th className="py-1 text-end">{t("cost.perPiece")}</th><th className="py-1 text-end">{t("cost.unitCost")}</th><th className="py-1 text-end">{t("cost.cost")}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {cost.parts.map((p, i) => (
                <tr key={p.id + i}>
                  <td className="py-1.5"><Link href={`/products/${p.id}`} className="text-brand-600 hover:underline">{p.name}</Link> <span className="text-xs text-muted">· {t(`cost.why.${p.why}`)}</span></td>
                  <td className="py-1.5 text-end tabular-nums" dir="ltr">{qty(p)}</td>
                  <td className="py-1.5 text-end tabular-nums" dir="ltr">{p.unitCost === null ? "—" : `${fmtIqd(p.unitCost)} / ${p.unit.toLowerCase() === "kg" ? "kg" : t("md.pcs")}`}</td>
                  <td className="py-1.5 text-end font-semibold tabular-nums" dir="ltr">{p.cost === null ? <span className="text-amber-600">?</span> : fmtIqd(p.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
