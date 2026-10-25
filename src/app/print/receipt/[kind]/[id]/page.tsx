import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can, canSeeMoney, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { docReceipt, paymentReceipt } from "@/lib/receipt-data";
import { normalize, type ReceiptLang } from "@/lib/receipt-layout";
import Receipt from "@/components/receipt";
import PrintButton from "@/components/print-button";

export const metadata = { title: "Receipt" };

/** A receipt for a Buy / Sell document (kind=doc) or a later sale payment (kind=payment), in a saved layout. */
export default async function PrintReceipt({ params, searchParams }: { params: Promise<{ kind: string; id: string }>; searchParams: Promise<{ layout?: string }> }) {
  const { kind, id } = await params;
  if (kind !== "doc" && kind !== "payment") notFound();
  const me = await pageUser("stock:view");
  if (kind === "payment" && !(can(me, "cash:view") || can(me, "stock:sell"))) notFound();
  if (!canSeeMoney(me)) notFound(); // receipts show prices and payments (M3)
  const t = await getTranslations();
  const data = kind === "doc" ? await docReceipt(id) : await paymentReceipt(id);
  if (!data) notFound();
  const layouts = await db.receiptLayout.findMany({ where: { docType: data.kind }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  const wanted = (await searchParams).layout;
  const chosen = layouts.find((l) => l.id === wanted) ?? layouts[0];
  const settings = normalize(chosen?.settings ?? {});
  await audit({ userId: me.id, action: "receipt.print", entityType: kind === "doc" ? "StockDoc" : "CashEntry", entityId: id, after: { number: data.number, layout: chosen?.name ?? "standard" } });

  return (
    <main className="min-h-screen bg-slate-200 py-6 print:bg-white print:py-0">
      <style>{`@page { size: ${settings.paper} portrait; margin: 0 } @media print { body { background: white } .no-print { display: none !important } .receipt-page { box-shadow: none !important; margin: 0 !important } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{t("rc2.layout")}:</span>
          {layouts.length === 0 && <span className="text-gray-700">{t("rc2.standard")} {can(me, "receipts:manage") && <Link href="/receipts/new" className="text-[#294680] underline">{t("rc2.new")}</Link>}</span>}
          {layouts.map((l) => (
            <Link key={l.id} href={`?layout=${l.id}`} replace className={`rounded-lg border px-3 py-1.5 ${l.id === chosen?.id ? "border-[#294680] bg-[#294680] text-white" : "border-gray-400 bg-white text-black"}`} aria-current={l.id === chosen?.id ? "true" : undefined}>
              {l.name}{l.isDefault ? " ★" : ""}
            </Link>
          ))}
        </div>
        <PrintButton label={t("rc2.print")} />
      </div>
      <div className="mx-auto w-fit shadow-xl print:shadow-none">
        <Receipt settings={settings} banner={chosen?.banner ?? null} lang={(chosen?.language as ReceiptLang) ?? "ar"} data={data} />
      </div>
    </main>
  );
}
