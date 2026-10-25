"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Input } from "@/components/ui";
import { saveUnitWeightAction } from "@/app/actions/masterdata";

/** Weight of one bag/piece of an item kept in kg (needed to turn "30 nylon per carton" into kg). */
export default function UnitWeight({ itemId, value, canEdit }: { itemId: string; value: number | null; canEdit: boolean }) {
  const t = useTranslations("md");
  const [v, setV] = useState(value?.toString() ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <p className="text-sm font-semibold">{t("unitWeight")}</p>
      <p className="mb-2 text-xs text-muted">{t("unitWeightHint")}</p>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input type="number" step="0.000001" min={0} value={v} onChange={(e) => setV(e.target.value)} aria-label={t("unitWeight")} className="w-40" dir="ltr" />
          <span className="text-sm text-muted">kg</span>
          <Button size="sm" disabled={pending || !(Number(v) > 0)} onClick={() => start(async () => { const r = await saveUnitWeightAction(itemId, Number(v)); setMsg(r.ok ? { ok: true, text: t("saved") } : { ok: false, text: r.error }); })}>{t("save")}</Button>
        </div>
      ) : <p dir="ltr">{value ? `${value} kg` : "—"}</p>}
      {msg && <div className="mt-2"><Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert></div>}
    </div>
  );
}
