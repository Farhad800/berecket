import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { fifoState, FIFO_START } from "@/lib/fifo";
import { fmtIqd } from "@/lib/cost";
import { formatDate } from "@/lib/time";

const q3 = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 3 });

/** The batches of one item (oldest first): what is left of each and what one unit of it cost. Money roles only. */
export default async function Batches({ itemId, unit }: { itemId: string; unit: string }) {
  const t = await getTranslations();
  const locale = await getLocale();
  const fifo = await fifoState();
  const all = (fifo.lots.get(itemId) ?? []).filter((l) => l.qtyIn > 0.0005);
  const open = all.filter((l) => l.left > 0.0005);
  const usedUp = all.filter((l) => l.left <= 0.0005).slice(-5);
  const rows = [...usedUp, ...open];
  const entries = await db.productionEntry.findMany({ where: { id: { in: rows.map((l) => l.entryId).filter((x): x is string => !!x) } }, select: { id: true, day: true, shift: true } });
  const entry = new Map(entries.map((e) => [e.id, e]));
  const v = fifo.value(itemId);
  const per = unit.toLowerCase() === "kg" ? "kg" : t("md.pcs");

  const from = (l: (typeof rows)[number]) => {
    if (l.source === "OPENING") return t("lot.opening", { date: formatDate(FIFO_START, locale) });
    if (l.source === "PRODUCTION") {
      const e = l.entryId ? entry.get(l.entryId) : null;
      return e ? <Link href={`/production?day=${e.day.toISOString().slice(0, 10)}`} className="text-brand-600 hover:underline">{t("lot.production", { day: e.day.toISOString().slice(0, 10), shift: e.shift })}</Link> : t("lot.productionGone");
    }
    if (l.docId) return <Link href={`/stock/${l.docId}`} className="text-brand-600 hover:underline" dir="ltr">{l.docNumber}</Link>;
    return t(`lot.src.${l.source}`);
  };

  return (
    <Card className="mt-4" data-testid="batches">
      <h2 className="font-semibold">{t("lot.title")}</h2>
      <p className="max-w-2xl text-xs text-muted">{t("lot.hint")}</p>
      {v.qty > 0.0005 && (
        <p className="mt-2 text-sm" data-testid="batches-value">
          {t("lot.inStock", { qty: `${q3(v.qty)} ${per}` })}: <b dir="ltr">{fmtIqd(v.value)} IQD</b>
          {v.noCost > 0 && <span className="text-amber-600"> · {t("lot.noCost", { qty: `${q3(v.noCost)} ${per}` })}</span>}
        </p>
      )}
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted">{t("lot.none")}</p> : (
        <div className="table-wrap mt-3">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 text-start">{t("lot.date")}</th><th className="py-1 text-start">{t("lot.from")}</th>
                <th className="py-1 text-end">{t("lot.qtyIn")}</th><th className="py-1 text-end">{t("lot.left")}</th>
                <th className="py-1 text-end">{t("lot.price")}</th><th className="py-1 text-end">{t("lot.unitCost", { per })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((l, i) => {
                const u = l.unit();
                const next = l === open[0];
                return (
                  <tr key={l.id} className={l.left <= 0.0005 ? "text-muted" : ""} data-testid={`lot-${i}`}>
                    <td className="py-1.5 whitespace-nowrap">{formatDate(l.at, locale)}</td>
                    <td className="py-1.5">{from(l)}{next && <span className="ms-2 rounded bg-brand-50 px-1.5 text-xs font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-200">{t("lot.next")}</span>}</td>
                    <td className="py-1.5 text-end tabular-nums" dir="ltr">{q3(l.qtyIn)}</td>
                    <td className="py-1.5 text-end font-semibold tabular-nums" dir="ltr" data-testid={`lot-left-${i}`}>{l.left <= 0.0005 ? t("lot.usedUp") : q3(l.left)}</td>
                    <td className="py-1.5 text-end text-xs tabular-nums" dir="ltr">{l.price === null ? "—" : `${l.price.toLocaleString("en", { maximumFractionDigits: 6 })} ${l.currency}${l.rate ? ` × ${l.rate.toLocaleString("en", { maximumFractionDigits: 6 })}` : ""}`}</td>
                    <td className="py-1.5 text-end font-semibold tabular-nums" dir="ltr" data-testid={`lot-cost-${i}`}>{u === null ? <span className="text-amber-600">?</span> : fmtIqd(u)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
