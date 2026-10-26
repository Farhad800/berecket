"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil, Save, X } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { saveItemCostAction } from "@/app/actions/items";
import { fmtIqd } from "@/lib/cost";
import CostFields, { costPayload, type CostInput } from "../cost-fields";

type Saved = { price: number; currency: "IQD" | "USD" | "EUR"; rate: number; iqd: number; at: string } | null;

/** The cost of one unit of a label / material / packaging item; shown and changed only by money roles. */
export default function ItemCost({ id, unit, saved, canEdit }: { id: string; unit: string; saved: Saved; canEdit: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState<CostInput>(() => ({ price: saved ? String(saved.price) : "", currency: saved?.currency ?? "IQD", rate: saved && saved.currency !== "IQD" ? String(saved.rate) : "" }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const per = unit === "kg" ? "1 kg" : t("cost.onePiece");
  const save = () => start(async () => {
    setError(null);
    const r = await saveItemCostAction({ id, cost: costPayload(v) });
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error); return; }
    setEdit(false); router.refresh();
  });
  return (
    <div>
      <h2 className="mb-2 font-semibold">{t("cost.title")}</h2>
      {!edit ? (
        <>
          {saved ? (
            <p className="text-sm" data-testid="item-cost">
              <b className="text-lg" dir="ltr">{fmtIqd(saved.iqd)} IQD</b> / {per}
              {saved.currency !== "IQD" && <span className="block text-xs text-muted" dir="ltr">{saved.price.toLocaleString("en", { maximumFractionDigits: 6 })} {saved.currency} × {saved.rate.toLocaleString("en", { maximumFractionDigits: 6 })} ({t("cost.rateShort", { cur: saved.currency })})</span>}
              <span className="block text-xs text-muted">{t("cost.updated", { at: saved.at })}</span>
            </p>
          ) : <p className="text-sm text-amber-600">{t("cost.none")}</p>}
          {canEdit && <Button variant="secondary" className="mt-2" onClick={() => setEdit(true)}><Pencil className="size-4" /> {saved ? t("cost.change") : t("cost.set")}</Button>}
        </>
      ) : (
        <div className="space-y-3">
          <CostFields value={v} onChange={setV} unit={unit} />
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <Button onClick={save} disabled={pending || v.price === "" || (v.currency !== "IQD" && !(Number(v.rate) > 0))}><Save className="size-4" /> {pending ? t("common.saving") : t("cost.save")}</Button>
            <Button variant="secondary" onClick={() => setEdit(false)}><X className="size-4" /> {t("common.cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
