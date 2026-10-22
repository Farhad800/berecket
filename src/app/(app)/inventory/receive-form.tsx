"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Combobox from "@/components/combobox";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { receiveAction } from "@/app/actions/warehouse";

type Option = { value: string; label: string; hint: string; remaining: number; qc: string };

export default function ReceiveForm({
  batches, locations, preselect, canOver,
}: { batches: Option[]; locations: { id: string; label: string }[]; preselect?: string; canOver: boolean }) {
  const t = useTranslations();
  const [batchId, setBatchId] = useState(preselect ?? "");
  const [qty, setQty] = useState(() => String(batches.find((b) => b.value === preselect)?.remaining ?? ""));
  // A fresh key per form: if the same submission arrives twice, the server returns the first receipt.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [done, setDone] = useState<string | null>(null);
  const { onSubmit, pending, error, fieldErrors: fe } = useFormAction(receiveAction, {
    onSuccess: (r) => {
      const d = (r as { data: { number: string; quarantine: number } }).data;
      setDone(d.quarantine ? t("wh.receivedQuarantine", { number: d.number, n: d.quarantine }) : t("wh.received", { number: d.number }));
      setKey(crypto.randomUUID());
      setBatchId("");
      setQty("");
    },
  });
  const b = useMemo(() => batches.find((x) => x.value === batchId), [batches, batchId]);
  const over = b && Number(qty) > b.remaining;

  return (
    <Card>
      <h2 className="mb-3 font-semibold">{t("wh.receiveTitle")}</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="idempotencyKey" value={key} />
        {error && <Alert>{error}</Alert>}
        {done && <Alert tone="green">{done}</Alert>}
        <Field label={`${t("prod.batch")} *`} name="batchId" error={fe.batchId}>
          <Combobox key={batchId === "" ? key : undefined} name="batchId" options={batches} defaultValue={batchId} required
            onChange={(v) => { setBatchId(v); setDone(null); const x = batches.find((o) => o.value === v); if (x) setQty(String(x.remaining)); }} />
        </Field>
        {b && (
          <p className="-mt-1 text-xs text-muted">
            {t("wh.waiting", { n: b.remaining })} · {t("prod.qc")}: {t(`status.qc.${b.qc}`)}
            {["PENDING", "HOLD"].includes(b.qc) && <b className="text-amber-700"> · {t("wh.willQuarantine")}</b>}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t("wh.qtyReceived")} *`} name="qtyReceived" error={fe.qtyReceived}>
            <Input name="qtyReceived" type="number" min={1} step={1} required value={qty} onChange={(e) => setQty(e.target.value)} dir="ltr" className="min-h-12 text-lg font-semibold" />
          </Field>
          <Field label={`${t("wh.location")} *`} name="locationId">
            <Select name="locationId" required defaultValue={locations[0]?.id}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </Select>
          </Field>
        </div>
        {over && (
          canOver ? (
            <Field label={t("wh.overReason")} name="overReason" hint={t("wh.overHint", { n: b!.remaining })}>
              <Input name="overReason" required minLength={3} />
            </Field>
          ) : (
            <Alert tone="amber">{t("wh.overBlocked", { n: b!.remaining })}</Alert>
          )
        )}
        <Field label={t("md.notes")} name="notes"><Input name="notes" /></Field>
        <Button type="submit" disabled={pending || (!!over && !canOver)} className="min-h-12 w-full">{pending ? t("common.saving") : t("wh.confirmReceipt")}</Button>
      </form>
    </Card>
  );
}
