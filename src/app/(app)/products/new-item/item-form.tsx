"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { Alert, Button, Card, Input, Select, cn } from "@/components/ui";
import { createItemAction } from "@/app/actions/items";
import CostFields, { costPayload, emptyCost } from "../cost-fields";

type Kind = "STICKER" | "MATERIAL" | "PACKAGING";
const KINDS: Kind[] = ["STICKER", "MATERIAL", "PACKAGING"];

/** A label, raw material or packaging item, typed by hand, with its cost. */
export default function ItemForm({ initialKind, canCost }: { initialKind: Kind | null; canCost: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(initialKind);
  const [name, setName] = useState("");
  const [name2, setName2] = useState("");
  const [code, setCode] = useState("");
  const [unit, setUnit] = useState<"pcs" | "kg">(initialKind === "MATERIAL" ? "kg" : "pcs");
  const [bag, setBag] = useState("");
  const [cost, setCost] = useState(emptyCost);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pick = (k: Kind) => { setKind(k); setUnit(k === "MATERIAL" ? "kg" : "pcs"); };

  const save = () => start(async () => {
    setError(null);
    const r = await createItemAction({ kind, name, name2: name2 || undefined, code: code || undefined, unit, unitWeightKg: unit === "kg" && bag ? bag : undefined, cost: canCost ? costPayload(cost) : undefined });
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error); return; }
    router.push(`/products/${r.data.id}?created=1`);
  });

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <p className="mb-2 text-sm font-medium">{t("item.whatIsIt")} *</p>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("item.whatIsIt")}>
          {KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => pick(k)}
              className={cn("min-h-12 rounded-lg border px-4 text-sm font-semibold", kind === k ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface hover:bg-surface-2")}>
              {t(`md.kind.${k}`)}
            </button>
          ))}
        </div>
      </Card>
      {kind && (
        <>
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">{t("item.name")} *<Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" aria-label={t("item.name")} maxLength={160} /></label>
              <label className="text-sm font-medium">{t("item.name2")}<Input value={name2} onChange={(e) => setName2(e.target.value)} className="mt-1" aria-label={t("item.name2")} maxLength={160} /></label>
              <label className="text-sm font-medium">{t("item.code")}<Input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1" dir="ltr" aria-label={t("item.code")} placeholder={kind === "STICKER" ? "LBL-…" : kind === "MATERIAL" ? "MAT-…" : "PKG-…"} maxLength={40} />
                <span className="text-xs font-normal text-muted">{t("item.codeHint")}</span></label>
              <label className="text-sm font-medium">{t("item.unit")}
                <Select value={unit} onChange={(e) => setUnit(e.target.value as "pcs" | "kg")} className="mt-1" aria-label={t("item.unit")}>
                  <option value="pcs">{t("item.unitPcs")}</option><option value="kg">{t("item.unitKg")}</option>
                </Select>
              </label>
              {unit === "kg" && kind === "PACKAGING" && (
                <label className="text-sm font-medium">{t("item.bagWeight")}<Input type="number" inputMode="decimal" min={0} step="any" value={bag} onChange={(e) => setBag(e.target.value)} dir="ltr" className="mt-1 text-end" aria-label={t("item.bagWeight")} />
                  <span className="text-xs font-normal text-muted">{t("item.bagWeightHint")}</span></label>
              )}
            </div>
          </Card>
          {canCost && (
            <Card>
              <h2 className="mb-1 font-semibold">{t("cost.title")}</h2>
              <p className="mb-3 text-xs text-muted">{t("cost.hint")}</p>
              <CostFields value={cost} onChange={setCost} unit={unit} />
            </Card>
          )}
          {error && <Alert>{error}</Alert>}
          <Button onClick={save} disabled={pending || name.trim().length < 2 || (canCost && cost.price !== "" && cost.currency !== "IQD" && !(Number(cost.rate) > 0))}>
            <Save className="size-4" /> {pending ? t("common.saving") : t("item.save")}
          </Button>
        </>
      )}
    </div>
  );
}
