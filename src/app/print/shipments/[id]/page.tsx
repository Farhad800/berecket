import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/time";
import PrintButton from "./print-button";

export const metadata = { title: "Delivery note" };

/** Printable delivery note (A4) with the official logo. */
export default async function DeliveryNotePage({ params }: { params: Promise<{ id: string }> }) {
  await pageUser("shipments:view");
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const s = await db.shipment.findUnique({
    where: { id },
    include: { customer: true, order: true, lines: { include: { orderLine: { include: { product: true } }, batch: true } } },
  });
  if (!s || s.status !== "CONFIRMED") notFound();
  const n = (v: number) => formatNumber(v, locale);
  const total = s.lines.reduce((a, l) => a + l.qty, 0);

  return (
    <main className="mx-auto max-w-[210mm] bg-white p-8 text-black print:p-0">
      <style>{`@page { size: A4; margin: 14mm } @media print { body { background: white } .no-print { display: none } }`}</style>
      <div className="no-print mb-4 flex justify-end"><PrintButton label={t("ship.print")} /></div>
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#294680] pb-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bereket-logo.jpg" alt="Bereket Plastic" width={90} height={84} className="rounded-lg" />
          <div>
            <p className="text-xl font-bold text-[#294680]">Bereket Plastic</p>
            <p className="text-sm text-gray-600">{t("app.system")}</p>
          </div>
        </div>
        <div className="text-end">
          <p className="text-2xl font-bold">{t("ship.deliveryNoteTitle")}</p>
          <p className="font-mono text-lg">{s.deliveryNote}</p>
          <p className="text-sm text-gray-600">{formatDate(s.shippedAt, locale)}</p>
        </div>
      </header>
      <section className="mt-5 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase">{t("order.customer")}</p>
          <p className="font-semibold">{s.customer.name}</p>
          {s.customer.address && <p className="whitespace-pre-wrap">{s.customer.address}</p>}
          {s.customer.phone && <p dir="ltr">{s.customer.phone}</p>}
        </div>
        <div className="space-y-1">
          <p><span className="text-gray-500">{t("ship.shipment")}:</span> <span dir="ltr">{s.number}</span></p>
          <p><span className="text-gray-500">{t("ship.orderNo")}:</span> <span dir="ltr">{s.order.number}</span>{s.order.customerReference && <> · {s.order.customerReference}</>}</p>
          {s.vehicle && <p><span className="text-gray-500">{t("ship.vehicle")}:</span> <span dir="ltr">{s.vehicle}</span></p>}
          {s.driver && <p><span className="text-gray-500">{t("ship.driver")}:</span> {s.driver}</p>}
        </div>
      </section>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead><tr className="bg-[#eef2fa] text-start">
          <th className="border border-gray-300 px-2 py-1.5 text-start">#</th>
          <th className="border border-gray-300 px-2 py-1.5 text-start">{t("md.productCode")}</th>
          <th className="border border-gray-300 px-2 py-1.5 text-start">{t("md.product")}</th>
          <th className="border border-gray-300 px-2 py-1.5 text-start">{t("prod.batch")}</th>
          <th className="border border-gray-300 px-2 py-1.5 text-end">{t("order.quantity")} ({t("md.pcs")})</th>
        </tr></thead>
        <tbody>
          {s.lines.map((l, i) => (
            <tr key={l.id}>
              <td className="border border-gray-300 px-2 py-1.5">{i + 1}</td>
              <td className="border border-gray-300 px-2 py-1.5 font-mono" dir="ltr">{l.orderLine.product.code}</td>
              <td className="border border-gray-300 px-2 py-1.5">{l.orderLine.product.name}</td>
              <td className="border border-gray-300 px-2 py-1.5 font-mono" dir="ltr">{l.batch.number}</td>
              <td className="border border-gray-300 px-2 py-1.5 text-end tabular-nums">{n(l.qty)}</td>
            </tr>
          ))}
          <tr className="font-bold"><td colSpan={4} className="border border-gray-300 px-2 py-1.5 text-end">{t("ship.total")}</td><td className="border border-gray-300 px-2 py-1.5 text-end tabular-nums">{n(total)}</td></tr>
        </tbody>
      </table>
      {s.order.packaging && <p className="mt-4 text-sm"><b>{t("order.packaging")}:</b> {s.order.packaging}</p>}
      <section className="mt-16 grid grid-cols-3 gap-6 text-center text-sm">
        {[t("ship.signWarehouse"), t("ship.signDriver"), t("ship.signCustomer")].map((x) => (
          <div key={x}><div className="h-12 border-b border-gray-400" /><p className="mt-1 text-gray-600">{x}</p></div>
        ))}
      </section>
    </main>
  );
}
