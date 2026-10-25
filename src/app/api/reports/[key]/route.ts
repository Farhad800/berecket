import { getTranslations } from "next-intl/server";
import { apiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { REPORT_BY_KEY, parseQuery, queryParams, reportAllowed } from "@/lib/reports/registry";
import { cellCsv, toCsv, totalsRow, type T } from "@/lib/reports/format";

/** CSV download of a report, with exactly the filters shown on screen. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const me = await apiUser();
  if (me instanceof Response) return me;
  if (!me.permissions.has("reports:export")) return new Response("Forbidden", { status: 403 });
  const { key } = await params;
  const def = REPORT_BY_KEY.get(key);
  if (!def || !reportAllowed(def, me.permissions)) return new Response("Not found", { status: 404 });

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const q = parseQuery(def, sp);
  const t = (await getTranslations()) as unknown as T;
  const result = await def.run(q);

  const header = result.columns.map((c) => {
    const label = t(c.label);
    if (c.type === "pct") return `${label} (%)`;
    if (c.type === "hours") return `${label} (${t("rep.unit.hShort")})`;
    if (c.type === "days") return `${label} (${t("rep.unit.dShort")})`;
    return label;
  });
  const rows = result.rows.map((r) => result.columns.map((c) => cellCsv(c, r[c.key], t)));
  if (result.totals && result.rows.length > 1) {
    const tot = totalsRow(result.columns, result.rows);
    rows.push(result.columns.map((c, i) => (i === 0 ? t("rep.total") : c.total ? Number(tot[c.key]) : "")));
  }

  await audit({ userId: me.id, action: "report.export", entityType: "Report", entityId: key, after: { format: "csv", ...Object.fromEntries(queryParams(def, q)), rows: result.rows.length } });

  const name = def.filters.includes("range") ? `bereket-${key}-${q.from}_${q.to}.csv` : `bereket-${key}-${q.to}.csv`;
  return new Response(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
