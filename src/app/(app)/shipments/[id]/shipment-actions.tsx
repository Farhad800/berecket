"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Printer, Truck, XCircle } from "lucide-react";
import { cancelShipmentAction, confirmShipmentAction } from "@/app/actions/warehouse";
import { Alert, Button, Card, Field, Input, LinkButton } from "@/components/ui";

export default function ShipmentActions({ id, status, canConfirm, canCancel }: { id: string; status: string; canConfirm: boolean; canCancel: boolean }) {
  const t = useTranslations("ship");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
      {status === "DRAFT" && canConfirm && (
        <Card className="border-emerald-300 dark:border-emerald-800">
          <h3 className="mb-2 font-semibold">{t("confirmTitle")}</h3>
          <p className="mb-3 text-xs text-muted">{t("confirmHint")}</p>
          <Field label={t("deliveryNote")} name="dn" hint={t("deliveryNoteHint")}><Input value={note} onChange={(e) => setNote(e.target.value)} dir="ltr" /></Field>
          <Button className="mt-3 min-h-12 w-full" disabled={pending} onClick={() => start(async () => {
            const r = await confirmShipmentAction(id, note);
            setMsg(r.ok ? { ok: true, text: t("confirmedMsg") } : { ok: false, text: r.error });
          })}>
            <Truck className="size-5" /> {t("confirmDispatch")}
          </Button>
        </Card>
      )}
      {status === "DRAFT" && canCancel && (
        cancelling ? (
          <div className="flex gap-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("cancelReason")} className="flex-1" autoFocus />
            <Button variant="danger" size="sm" disabled={pending || reason.trim().length < 3} onClick={() => start(async () => {
              const r = await cancelShipmentAction(id, reason);
              setMsg(r.ok ? { ok: true, text: t("cancelledMsg") } : { ok: false, text: r.error });
            })}>{t("cancel")}</Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setCancelling(true)}><XCircle className="size-4" /> {t("cancel")}</Button>
        )
      )}
      {status === "CONFIRMED" && <LinkButton href={`/print/shipments/${id}`} target="_blank" variant="secondary" className="w-full"><Printer className="size-4" /> {t("printNote")}</LinkButton>}
    </div>
  );
}
