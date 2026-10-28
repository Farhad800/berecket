"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Box, Plus, Save, Tag, Trash2 } from "lucide-react";
import Combobox from "@/components/combobox";
import { Alert, Button, Card, Input, cn } from "@/components/ui";
import { createProductAction, saveProductPageAction } from "@/app/actions/masterdata";
import { needsFor } from "@/lib/recipe-math";

export type Item = { id: string; code: string; name: string; name2: string | null; unit: string; kind: string; unitWeightKg: number | null; stock: number };
type Line = { key: number; componentId: string; qty: string; per: "PIECE" | "CARTON" };
const fmt = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 3 });
const isKg = (u: string) => u.toLowerCase() === "kg";

export type Details = { code: string; name: string; name2: string; moldId: string; qcRequired: boolean };

/**
 * A product's details (label or typed name, second name, code, mold, QC), "made of" (per piece) and packaging
 * (per carton), with a live preview of what N pieces use. The same boxes when adding and when editing a product.
 */
export default function RecipeEditor({ productId, canEdit, labels, madeOf, packaging, initial, molds, details }: {
  productId?: string; canEdit: boolean; labels: Item[]; madeOf: Item[]; packaging: Item[];
  initial: { labelId: string | null; lines: { componentId: string; qty: number; per: "PIECE" | "CARTON" }[] };
  molds?: { id: string; code: string; name: string }[];
  /** Editing: the product's current details (shown in the same boxes as when it was added). */
  details?: Details;
}) {
  const creating = !productId;
  const [code, setCode] = useState(details?.code ?? "");
  const [name, setName] = useState(details?.name ?? "");
  const [name2, setName2] = useState(details?.name2 ?? "");
  const [moldId, setMoldId] = useState(details?.moldId ?? "");
  const [qc, setQc] = useState(details?.qcRequired ?? false);
  const showDetails = creating || (!!details && canEdit);
  const t = useTranslations();
  const [labelId, setLabelId] = useState(initial.labelId ?? "");
  // Keys are per editor (not module-wide), so server and browser HTML match.
  const seq = useRef(initial.lines.length);
  const [lines, setLines] = useState<Line[]>(() => initial.lines.map((l, i) => ({ key: i, componentId: l.componentId, qty: String(l.qty), per: l.per })));
  const [pieces, setPieces] = useState("1000");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const all = useMemo(() => new Map([...labels, ...madeOf, ...packaging].map((i) => [i.id, i])), [labels, madeOf, packaging]);

  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const add = (per: "PIECE" | "CARTON") => setLines((ls) => [...ls, { key: ++seq.current, componentId: "", qty: "", per }]);
  const remove = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));

  const preview = useMemo(() => {
    const n = Number(pieces);
    if (!(n > 0)) return [];
    const label = labelId ? all.get(labelId) : undefined;
    return needsFor({
      labelId: labelId || null,
      label: label ? { id: label.id, code: label.code, name: label.name, unit: label.unit } : null,
      components: lines.filter((l) => l.componentId && Number(l.qty) > 0 && all.get(l.componentId)).map((l) => {
        const c = all.get(l.componentId)!;
        return { qty: Number(l.qty), per: l.per, component: { id: c.id, code: c.code, name: c.name, unit: c.unit, unitWeightKg: c.unitWeightKg } };
      }),
    }, n);
  }, [pieces, labelId, lines, all]);

  const save = () => start(async () => {
    setMsg(null);
    const payloadLines = lines.filter((l) => l.componentId || l.qty).map((l) => ({ componentId: l.componentId, qty: l.qty, per: l.per }));
    const r = creating
      ? await createProductAction({ code, labelId: labelId || undefined, name: name || undefined, name2: name2 || undefined, moldId: moldId || undefined, qcRequired: qc, lines: payloadLines })
      : await saveProductPageAction({ productId, labelId: labelId || undefined, lines: payloadLines, ...(details ? { code, name: name || undefined, name2: name2 || undefined, moldId: moldId || undefined, qcRequired: qc } : {}) });
    if (r && !r.ok) setMsg({ ok: false, text: r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error });
    else setMsg({ ok: true, text: t("rc.saved") });
  });

  const opt = (list: Item[]) => list.map((i) => ({ value: i.id, label: i.name, hint: [i.code, i.name2].filter(Boolean).join(" · ") }));
  const unitText = (l: Line) => {
    const c = all.get(l.componentId);
    if (!c) return "";
    if (l.per === "PIECE") return isKg(c.unit) ? t("rc.gPerPiece") : t("rc.pcsPerPiece");
    return t("rc.productsInOne");
  };
  const rows = (per: "PIECE" | "CARTON", list: Item[]) => lines.filter((l) => l.per === per).map((l) => {
    const c = all.get(l.componentId);
    return (
      <li key={l.key} className="grid gap-2 py-2 sm:grid-cols-[1fr_9rem_auto] sm:items-center">
        <div>
          {canEdit ? <Combobox name={`c_${l.key}`} options={opt(list)} defaultValue={l.componentId} onChange={(v) => set(l.key, { componentId: v })} placeholder={t("rc.chooseItem")} /> : <p className="text-sm">{c?.name}</p>}
          {c && <p className="mt-0.5 text-xs text-muted" dir="ltr">{c.code} · {t("order.inStock")}: {fmt(c.stock)} {c.unit}</p>}
          {c && per === "CARTON" && <p className="mt-0.5 text-xs text-muted">{t("rc.packExample", { n: Number(l.qty) > 0 ? fmt(Number(l.qty)) : "…" })}</p>}
          {c && per === "CARTON" && isKg(c.unit) && !c.unitWeightKg && <p className="mt-0.5 text-xs font-semibold text-amber-600"><Link href={`/products/${c.id}`} className="underline">{t("rc.needWeight")}</Link></p>}
        </div>
        <label className="text-xs text-muted">
          <Input type="number" step="any" min={0} value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} disabled={!canEdit} aria-label={`${c?.code ?? ""} ${unitText(l)}`} dir="ltr" className="text-end" />
          <span className="mt-0.5 block">{unitText(l)}</span>
        </label>
        {canEdit && <Button type="button" size="sm" variant="ghost" onClick={() => remove(l.key)} aria-label={t("order.removeLine")}><Trash2 className="size-4" /></Button>}
      </li>
    );
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {showDetails && (
          <Card id="edit">
            <h2 className="mb-1 font-semibold">{t("rc.details")}</h2>
            <p className="mb-2 text-xs text-muted">{t("rc.nameTyped")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">{t("md.productName")} *<Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" aria-label={t("md.productName")} maxLength={160} /></label>
              <label className="text-sm font-medium">{t("md.name2")}<Input value={name2} onChange={(e) => setName2(e.target.value)} className="mt-1" dir="ltr" aria-label={t("md.name2")} maxLength={160} /></label>
              <label className="text-sm font-medium">{t("md.productCode")} *<Input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1" dir="ltr" required /></label>
              <div className="text-sm font-medium">{t("md.mold")}<div className="mt-1"><Combobox name="moldId" options={[{ value: "", label: "—" }, ...(molds ?? []).map((m) => ({ value: m.id, label: m.code, hint: m.name }))]} defaultValue={moldId} onChange={setMoldId} /></div></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={qc} onChange={(e) => setQc(e.target.checked)} className="size-5 accent-brand-600" /> {t("md.qcRequired")}</label>
            </div>
          </Card>
        )}

        <Card>
          <h2 className="mb-1 font-semibold">{t("rc.madeOf")}</h2>
          <p className="text-xs text-muted">{t("rc.madeOfHint")}</p>
          <div className="mt-3 rounded-lg border border-line p-3">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><Tag className="size-4" /> {t("rc.label")}</p>
            <p className="mb-2 text-xs text-muted">{t("rc.labelHint")}</p>
            {canEdit ? (
              <Combobox name="labelId" options={[{ value: "", label: t("md.noLabel") }, ...opt(labels)]} defaultValue={labelId} onChange={setLabelId} placeholder={t("md.noLabel")} />
            ) : <p className="text-sm">{all.get(labelId)?.name ?? t("md.noLabel")}</p>}
            {labelId && all.get(labelId) && <p className="mt-1 text-xs text-muted" dir="ltr">{all.get(labelId)!.code} · {t("order.inStock")}: {fmt(all.get(labelId)!.stock)} · {t("rc.onePerPiece")}</p>}
          </div>
          <ul className="divide-y divide-line">{rows("PIECE", madeOf)}</ul>
          {canEdit && <Button type="button" size="sm" variant="secondary" onClick={() => add("PIECE")} className="mt-2"><Plus className="size-4" /> {t("rc.addMaterial")}</Button>}
        </Card>

        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><Box className="size-4" /> {t("rc.packaging")}</h2>
          <p className="mb-2 text-xs text-muted">{t("rc.packagingHint")}</p>
          <ul className="divide-y divide-line">{rows("CARTON", packaging)}</ul>
          {canEdit && <Button type="button" size="sm" variant="secondary" onClick={() => add("CARTON")} className="mt-2"><Plus className="size-4" /> {t("rc.addPackaging")}</Button>}
        </Card>

        {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
        {canEdit && <Button onClick={save} disabled={pending}><Save className="size-4" /> {pending ? t("common.saving") : creating ? t("rc.create") : t("rc.save")}</Button>}
      </div>

      <Card className="h-fit lg:sticky lg:top-20">
        <h2 className="font-semibold">{t("rc.preview")}</h2>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <Input type="number" min={1} step={1} value={pieces} onChange={(e) => setPieces(e.target.value)} className="w-32" dir="ltr" aria-label={t("rc.previewPieces")} /> {t("rc.previewPieces")}
        </label>
        {preview.length === 0 ? <p className="mt-3 text-sm text-muted">{t("rc.nothingUsed")}</p> : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {preview.map((n) => {
              const c = all.get(n.componentId);
              const short = c && c.stock < n.qty;
              return (
                <li key={n.componentId} className="flex items-start justify-between gap-3 py-1.5">
                  <span className="min-w-0"><span className="block truncate">{n.name}</span><span className="text-xs text-muted" dir="ltr">{n.code}</span></span>
                  <span className={cn("text-end font-semibold tabular-nums", short && "text-amber-600")} dir="ltr">
                    {n.missingWeight ? "?" : fmt(n.qty)} {n.unit}
                    {short && <span className="block text-xs font-normal">{t("rc.inStockOnly", { n: fmt(c!.stock) })}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">{t("rc.previewNote")}</p>
      </Card>
    </div>
  );
}
