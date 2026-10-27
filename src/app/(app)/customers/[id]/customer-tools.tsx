"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore, Banknote, HandCoins, Pencil, Save } from "lucide-react";
import { Alert, Button, Card, Input, Select } from "@/components/ui";
import { archiveCustomerAction, payToCustomerAction, receiveFromCustomerAction, updateCustomerAction } from "@/app/actions/customers";
import SafeSelect, { fitSafe, type SafeOpt } from "../../cash/safe-select";
import type { CurCode } from "../../cash/types";

type C = { id: string; code: string; name: string; phone: string; address: string; note: string; archived: boolean };
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-x`);

/** Edit the customer, archive it, receive money from it (into the safe) or pay money to it (out of the safe). */
export default function CustomerTools({ customer, canEdit, canReceive, canPay = false, safes = [] }: { customer: C; canEdit: boolean; canReceive: boolean; canPay?: boolean; safes?: SafeOpt[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(customer);
  const [pay, setPay] = useState({ currency: "IQD", amount: "", note: "", safe: "" });
  const safeId = fitSafe(safes, pay.currency as CurCode, pay.safe);
  const [out, setOut] = useState({ currency: "IQD", amount: "", note: "", safe: "" });
  const outSafeId = fitSafe(safes, out.currency as CurCode, out.safe);
  const outKey = useRef<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const key = useRef<string | null>(null);
  const fail = (r: { error: string; fieldErrors?: Record<string, string> }) => setMsg({ ok: false, text: r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error });

  const save = () => start(async () => {
    const r = await updateCustomerAction({ id: v.id, code: v.code, name: v.name, phone: v.phone || undefined, address: v.address || undefined, note: v.note || undefined });
    if (!r.ok) return fail(r);
    setEdit(false); setMsg({ ok: true, text: t("cust.saved") }); router.refresh();
  });
  const archive = () => start(async () => {
    const r = await archiveCustomerAction({ id: v.id, archived: !customer.archived });
    if (!r.ok) return fail(r);
    router.refresh();
  });
  const receive = () => start(async () => {
    key.current ??= newId(); // same number on a retry → saved once
    const r = await receiveFromCustomerAction({ customerId: v.id, currency: pay.currency, safeId: safeId || undefined, amount: pay.amount, note: pay.note || undefined, submissionId: key.current });
    if (!r.ok) return fail(r);
    key.current = null;
    setPay({ ...pay, amount: "", note: "" }); setMsg({ ok: true, text: t("cust.received", { number: r.data.number }) }); router.refresh();
  });

  const payOut = () => start(async () => {
    outKey.current ??= newId();
    const r = await payToCustomerAction({ customerId: v.id, currency: out.currency, safeId: outSafeId || undefined, amount: out.amount, note: out.note || undefined, submissionId: outKey.current });
    if (!r.ok) return fail(r);
    outKey.current = null;
    setOut({ ...out, amount: "", note: "" }); setMsg({ ok: true, text: t("cust.paid", { number: r.data.number }) }); router.refresh();
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {canReceive && !customer.archived && (
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><HandCoins className="size-4" /> {t("cust.receive")}</h2>
          <p className="mb-2 text-xs text-muted">{t("cust.receiveHint")}</p>
          <div className="grid gap-2 sm:grid-cols-[7rem_1fr]">
            <Select value={pay.currency} onChange={(e) => setPay({ ...pay, currency: e.target.value })} aria-label={t("cash.currency")}><option>IQD</option><option>USD</option><option>EUR</option></Select>
            <Input type="number" inputMode="decimal" min={0} step="any" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder={t("cash.amount")} aria-label={t("cust.receiveAmount")} dir="ltr" className="text-end" />
            {safes.length > 0 && <div className="sm:col-span-2"><SafeSelect safes={safes} currency={pay.currency as CurCode} value={safeId} onChange={(id) => setPay({ ...pay, safe: id })} label={t("safe.intoSafe")} /></div>}
            <Input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder={t("sd.note")} aria-label={t("cust.receiveNote")} className="sm:col-span-2" />
          </div>
          <Button className="mt-2" onClick={receive} disabled={pending || !(Number(pay.amount) > 0)}><HandCoins className="size-4" /> {t("cust.receiveSave")}</Button>
        </Card>
      )}
      {canPay && !customer.archived && (
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><Banknote className="size-4" /> {t("cust.pay")}</h2>
          <p className="mb-2 text-xs text-muted">{t("cust.payHint")}</p>
          <div className="grid gap-2 sm:grid-cols-[7rem_1fr]">
            <Select value={out.currency} onChange={(e) => setOut({ ...out, currency: e.target.value })} aria-label={t("cust.payCurrency")}><option>IQD</option><option>USD</option><option>EUR</option></Select>
            <Input type="number" inputMode="decimal" min={0} step="any" value={out.amount} onChange={(e) => setOut({ ...out, amount: e.target.value })} placeholder={t("cash.amount")} aria-label={t("cust.payAmount")} dir="ltr" className="text-end" />
            {safes.length > 0 && <div className="sm:col-span-2"><SafeSelect safes={safes} currency={out.currency as CurCode} value={outSafeId} onChange={(id) => setOut({ ...out, safe: id })} label={t("safe.outOfSafe")} /></div>}
            <Input value={out.note} onChange={(e) => setOut({ ...out, note: e.target.value })} placeholder={t("sd.note")} aria-label={t("cust.payNote")} className="sm:col-span-2" />
          </div>
          <Button className="mt-2" onClick={payOut} disabled={pending || !(Number(out.amount) > 0)}><Banknote className="size-4" /> {t("cust.paySave")}</Button>
        </Card>
      )}
      {canEdit && (
        <Card>
          {!edit ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="size-4" /> {t("cust.edit")}</Button>
              <Button variant="ghost" onClick={archive} disabled={pending}>{customer.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} {customer.archived ? t("common.restore") : t("common.archive")}</Button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm font-medium">{t("cust.code")}<Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} className="mt-1" dir="ltr" aria-label={t("cust.code")} /></label>
              <label className="text-sm font-medium">{t("cust.name")}<Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="mt-1" aria-label={t("cust.name")} /></label>
              <label className="text-sm font-medium">{t("sd.phone")}<Input type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} className="mt-1" dir="ltr" aria-label={t("sd.phone")} /></label>
              <label className="text-sm font-medium">{t("cust.address")}<Input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} className="mt-1" aria-label={t("cust.address")} /></label>
              <label className="text-sm font-medium sm:col-span-2">{t("sd.note")}<Input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} className="mt-1" aria-label={t("sd.note")} /></label>
              <div className="flex gap-2 sm:col-span-2"><Button onClick={save} disabled={pending}><Save className="size-4" /> {t("common.save")}</Button><Button variant="ghost" onClick={() => { setEdit(false); setV(customer); }}>{t("common.cancel")}</Button></div>
            </div>
          )}
        </Card>
      )}
      {msg && <div className="lg:col-span-2"><Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert></div>}
    </div>
  );
}
