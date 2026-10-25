"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Box, Plus, Save, Tag, Trash2 } from "lucide-react";
import Combobox from "@/components/combobox";
import { Alert, Button, Card, Input, cn } from "@/components/ui";
import { saveRecipeAction } from "@/app/actions/masterdata";
import { needsFor } from "@/lib/recipe-math";

export type Item = { id: string; code: string; name: string; name2: string | null; unit: string; kind: string; unitWeightKg: number | null; stock: number };
type Line = { key: number; componentId: string; qty: string; per: "PIECE" | "CARTON" };
const fmt = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 3 });
const isKg = (u: string) => u.toLowerCase() === "kg";
let seq = 0;

/** Label, "made of" (per piece) and packaging (per carton) of one product, with a live preview of what N pieces use. */
export default function RecipeEditor({ productId, canEdit, labels, madeOf, packaging, initial }: {
  productId: string; canEdit: boolean; labels: Item[]; madeOf: Item[]; packaging: Item[];
  initial: { labelId: string | null; piecesPerCarton: number | null; lines: { componentId: string; qty: number; per: "PIECE" | "CARTON" }[] };
}) {
  const t = useTranslations();
  const [labelId, setLabelId] = useState(initial.labelId ?? "");
  const [ppc, setPpc] = useState(initial.piecesPerCarton?.toString() ?? "");
  const [lines, setLines] = useState<Line[]>(initial.lines.map((l) => ({ key: ++seq, componentId: l.componentId, qty: String(l.qty), per: l.per })));
  const [pieces, setPieces] = useState(initial.piecesPerCarton?.toString() ?? "1000");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const all = useMemo(() => new Map([...labels, ...madeOf, ...packaging].map((i) => [i.id, i])), [labels, madeOf, packaging]);

  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const add = (per: "PIECE" | "CARTON") => setLines((ls) => [...ls, { key: ++seq, componentId: "", qty: "", per }]);
  const remove = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));

  const preview = useMemo(() => {
    const n = Number(pieces);
    if (!(n > 0)) return [];
    const label = labelId ? all.get(labelId) : undefined;
    return needsFor({
      labelId: labelId || null,
      piecesPerCarton: Number(ppc) > 0 ? Number(ppc) : null,
      label: label ? { id: label.id, code: label.code, name: label.name, unit: label.unit } : null,
      components: lines.filter((l) => l.componentId && Number(l.qty) > 0 && all.get(l.componentId)).map((l) => {
        const c = all.get(l.componentId)!;
        return { qty: Number(l.qty), per: l.per, component: { id: c.id, code: c.code, name: c.name, unit: c.unit, unitWeightKg: c.unitWeightKg } };
      }),
    }, n);
  }, [pieces, labelId, ppc, lines, all]);

  const save = () => start(async () => {
    setMsg(null);
    const r = await saveRecipeAction({
      productId, labelId: labelId || undefined, piecesPerCarton: ppc ? Number(ppc) : undefined,
      lines: lines.filter((l) => l.componentId || l.qty).map((l) => ({ componentId: l.componentId, qty: l.qty, per: l.per })),
    });
    setMsg(r.ok ? { ok: true, text: t("rc.saved") } : { ok: false, text: r.error });
  });

  const opt = (list: Item[]) => list.map((i) => ({ value: i.id, label: i.name, hint: [i.code, i.name2].filter(Boolean).join(" · ") }));
  const unitText = (l: Line) => {
    const c = all.get(l.componentId);
    if (!c) return "";
    if (l.per === "PIECE") return isKg(c.unit) ? t("rc.gPerPiece") : t("rc.pcsPerPiece");
    return isKg(c.unit) ? t("rc.bagsPerCarton") : t("rc.pcsPerCarton");
  };
  const rows = (per: "PIECE" | "CARTON", list: Item[]) => lines.filter((l) => l.per === per).map((l) => {
    const c = all.get(l.componentId);
    return (
      <li key={l.key} className="grid gap-2 py-2 sm:grid-cols-[1fr_9rem_auto] sm:items-center">
        <div>
          {canEdit ? <Combobox name={`c_${l.key}`} options={opt(list)} defaultValue={l.componentId} onChange={(v) => set(l.key, { componentId: v })} placeholder={t("rc.chooseItem")} /> : <p className="text-sm">{c?.name}</p>}
          {c && <p className="mt-0.5 text-xs text-muted" dir="ltr">{c.code} · {t("order.inStock")}: {fmt(c.stock)} {c.unit}</p>}
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
        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><Tag className="size-4" /> {t("rc.label")}</h2>
          <p className="mb-2 text-xs text-muted">{t("rc.labelHint")}</p>
          {canEdit ? (
            <Combobox name="labelId" options={[{ value: "", label: t("md.noLabel") }, ...opt(labels)]} defaultValue={labelId} onChange={setLabelId} placeholder={t("md.noLabel")} />
          ) : <p className="text-sm">{all.get(labelId)?.name ?? t("md.noLabel")}</p>}
          {labelId && all.get(labelId) && <p className="mt-1 text-xs text-muted" dir="ltr">{all.get(labelId)!.code} · {t("order.inStock")}: {fmt(all.get(labelId)!.stock)}</p>}
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">{t("rc.madeOf")}</h2>
          <p className="text-xs text-muted">{t("rc.madeOfHint")}</p>
          <ul className="divide-y divide-line">{rows("PIECE", madeOf)}</ul>
          {canEdit && <Button type="button" size="sm" variant="secondary" onClick={() => add("PIECE")} className="mt-2"><Plus className="size-4" /> {t("rc.addMaterial")}</Button>}
        </Card>

        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><Box className="size-4" /> {t("rc.packaging")}</h2>
          <p className="mb-2 text-xs text-muted">{t("rc.packagingHint")}</p>
          <label className="block max-w-xs text-sm font-medium">{t("rc.piecesPerCarton")}
            <Input type="number" min={1} step={1} value={ppc} onChange={(e) => setPpc(e.target.value)} disabled={!canEdit} dir="ltr" className="mt-1" />
          </label>
          <ul className="divide-y divide-line">{rows("CARTON", packaging)}</ul>
          {canEdit && <Button type="button" size="sm" variant="secondary" onClick={() => add("CARTON")} className="mt-2"><Plus className="size-4" /> {t("rc.addPackaging")}</Button>}
        </Card>

        {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
        {canEdit && <Button onClick={save} disabled={pending}><Save className="size-4" /> {pending ? t("common.saving") : t("rc.save")}</Button>}
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
