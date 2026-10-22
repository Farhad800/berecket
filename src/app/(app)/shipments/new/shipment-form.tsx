"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { createShipmentAction } from "@/app/actions/warehouse";

type Line = {
  id: string; lineNo: number; product: string; ordered: number; shipped: number; inDrafts: number; open: number;
  batches: { id: string; number: string; qc: string; available: number; blocked: number; shippable: boolean }[];
};

export default function ShipmentForm({ orderId, lines, today }: { orderId: string; lines: Line[]; today: string }) {
  const t = useTranslations();
  const [qty, setQty] = useState<Record<string, string>>({});
  const { onSubmit, pending, error } = useFormAction(createShipmentAction);
  const lineTotal = (l: Line) => l.batches.reduce((s, b) => s + (Number(qty[b.id]) || 0), 0);
  const nf = (n: number) => n.toLocaleString("en");
  const fill = (l: Line) => {
    // Suggest oldest batches first (first-in, first-out) up to what's still to deliver.
    let left = l.open;
    const next: Record<string, string> = {};
    for (const b of l.batches.filter((x) => x.shippable)) {
      const take = Math.min(left, b.available);
      next[b.id] = take > 0 ? String(take) : "";
      left -= take;
    }
    setQty((q) => ({ ...q, ...next }));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />
      {error && <Alert>{error}</Alert>}
      {lines.map((l) => {
        const tot = lineTotal(l);
        const over = tot > l.open;
        return (
          <Card key={l.id}>
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{l.lineNo}. {l.product}</p>
                <p className="text-xs text-muted">{t("ship.lineFacts", { ordered: nf(l.ordered), shipped: nf(l.shipped), drafts: nf(l.inDrafts), open: nf(l.open) })}</p>
              </div>
              {l.open > 0 && l.batches.some((b) => b.shippable && b.available > 0) && (
                <Button type="button" size="sm" variant="secondary" onClick={() => fill(l)}>{t("ship.fillFifo")}</Button>
              )}
            </div>
            {l.batches.length === 0 ? <p className="text-sm text-muted">{t("ship.noStockLine")}</p> : (
              <ul className="divide-y divide-line">
                {l.batches.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="text-sm">
                      <span className="font-semibold" dir="ltr">{b.number}</span>
                      <span className="ms-2 text-xs text-muted">{t("ship.availableN", { n: nf(b.available) })}</span>
                      {b.blocked > 0 && <Badge tone="red" className="ms-2"><Lock className="me-1 size-3" />{t("ship.blockedN", { n: nf(b.blocked) })}</Badge>}
                      {!b.shippable && <Badge tone="red" className="ms-2">{t(`status.qc.${b.qc}`)}</Badge>}
                    </div>
                    <Input
                      name={`qty_${b.id}`} type="number" min={0} max={b.available} step={1} disabled={!b.shippable || b.available === 0}
                      value={qty[b.id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [b.id]: e.target.value }))}
                      className="w-32 text-end" dir="ltr" aria-label={`${b.number} ${t("order.quantity")}`}
                    />
                  </li>
                ))}
              </ul>
            )}
            {tot > 0 && <p className={`mt-2 text-end text-sm font-semibold ${over ? "text-red-600" : ""}`}>{t("ship.lineTotal", { n: nf(tot) })}{over && ` — ${t("ship.overOpen", { n: nf(l.open) })}`}</p>}
          </Card>
        );
      })}
      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("ship.plannedDate")} name="plannedDate"><Input name="plannedDate" type="date" defaultValue={today} /></Field>
          <Field label={t("ship.vehicle")} name="vehicle"><Input name="vehicle" dir="ltr" /></Field>
          <Field label={t("ship.driver")} name="driver"><Input name="driver" /></Field>
          <div className="sm:col-span-3"><Field label={t("md.notes")} name="notes"><Textarea name="notes" rows={2} /></Field></div>
        </div>
        <p className="mt-3 text-xs text-muted">{t("ship.reserveHint")}</p>
        <Button type="submit" disabled={pending} className="mt-3 w-full">{pending ? t("common.saving") : t("ship.createDraft")}</Button>
      </Card>
    </form>
  );
}
