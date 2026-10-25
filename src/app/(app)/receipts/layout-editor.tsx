"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ImagePlus, Save, Trash2, X } from "lucide-react";
import Receipt from "@/components/receipt";
import { Alert, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { deleteLayoutAction, saveLayoutAction } from "@/app/actions/receipts";
import {
  FIELD_KEYS, RECEIPT_FOR, RECEIPT_LANGS, SAMPLE, normalize,
  type ReceiptData, type ReceiptForType, type ReceiptLang, type ReceiptSettings,
} from "@/lib/receipt-layout";

export type LayoutRow = { id: string; name: string; docType: ReceiptForType; language: ReceiptLang; isDefault: boolean; banner: string | null; settings: ReceiptSettings };

/** Make / change one receipt layout with a live A4 preview of a real (or sample) receipt. */
export default function LayoutEditor({ layout, samples }: { layout: LayoutRow | null; samples: Partial<Record<ReceiptForType, ReceiptData>> }) {
  const t = useTranslations();
  const router = useRouter();
  const [name, setName] = useState(layout?.name ?? "");
  const [docType, setDocType] = useState<ReceiptForType>(layout?.docType ?? "SELL");
  const [language, setLanguage] = useState<ReceiptLang>(layout?.language ?? "ar");
  const [isDefault, setIsDefault] = useState(layout?.isDefault ?? false);
  const [banner, setBanner] = useState<string | null>(layout?.banner ?? null);
  const [s, setS] = useState<ReceiptSettings>(() => normalize(layout?.settings ?? {}));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ReceiptSettings>(k: K, v: ReceiptSettings[K]) => setS((x) => ({ ...x, [k]: v }));

  const data = useMemo<ReceiptData>(() => {
    const real = samples[docType];
    if (real) return real;
    if (docType === "PAYMENT") return { ...SAMPLE, kind: "PAYMENT", number: "RCV-2026-0001", lines: [], payment: { amount: 200000, docNumber: "SAL-2026-0001", docTotal: 700000 }, paid: 700000, owed: 0 };
    return { ...SAMPLE, kind: docType, party: docType === "BUY" ? "Gulf Polymers" : SAMPLE.party };
  }, [docType, samples]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setError(null);
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      // Shrink big photos so the layout stays small; keep PNG for sharp logos/text.
      const scale = Math.min(1, 2400 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      let out = c.toDataURL(f.type === "image/png" ? "image/png" : "image/jpeg", 0.9);
      if (out.length > 1_400_000) out = c.toDataURL("image/jpeg", 0.8);
      if (out.length > 1_400_000) { setError(t("rc2.bannerTooBig")); return; }
      setBanner(out); URL.revokeObjectURL(url);
    };
    img.onerror = () => setError(t("rc2.bannerBad"));
    img.src = url;
  };

  const move = (i: number, d: -1 | 1) => setS((x) => {
    const cols = [...x.columns]; const j = i + d;
    if (j < 0 || j >= cols.length) return x;
    [cols[i], cols[j]] = [cols[j], cols[i]];
    return { ...x, columns: cols };
  });

  const save = () => start(async () => {
    setError(null);
    const r = await saveLayoutAction({ id: layout?.id, name, docType, language, isDefault, banner, settings: s });
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error); return; }
    router.push(`/receipts?saved=${r.data.id}`); router.refresh();
  });
  const remove = () => start(async () => {
    if (!layout) return;
    const r = await deleteLayoutAction({ id: layout.id });
    if (!r.ok) { setError(r.error); return; }
    router.push("/receipts"); router.refresh();
  });

  const fieldsFor = FIELD_KEYS.filter((k) => !(docType === "PAYMENT" && k === "order"));
  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <div className="space-y-4">
        <Card className="space-y-3">
          <label className="block text-sm font-medium">{t("rc2.name")} *<Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" aria-label={t("rc2.name")} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">{t("rc2.for")}<Select value={docType} onChange={(e) => setDocType(e.target.value as ReceiptForType)} className="mt-1" aria-label={t("rc2.for")}>{RECEIPT_FOR.map((d) => <option key={d} value={d}>{t(`rc2.type.${d}`)}</option>)}</Select></label>
            <label className="text-sm font-medium">{t("rc2.language")}<Select value={language} onChange={(e) => setLanguage(e.target.value as ReceiptLang)} className="mt-1" aria-label={t("rc2.language")}>{RECEIPT_LANGS.map((l) => <option key={l} value={l}>{t(`rc2.lang.${l}`)}</option>)}</Select></label>
            <label className="text-sm font-medium">{t("rc2.paper")}<Select value={s.paper} onChange={(e) => set("paper", e.target.value as "A4" | "A5")} className="mt-1" aria-label={t("rc2.paper")}><option value="A4">A4</option><option value="A5">A5</option></Select></label>
            <label className="text-sm font-medium">{t("rc2.fontSize")}<Input type="number" min={8} max={18} value={s.fontSize} onChange={(e) => set("fontSize", Number(e.target.value) || 11)} className="mt-1" dir="ltr" aria-label={t("rc2.fontSize")} /></label>
            <label className="text-sm font-medium">{t("rc2.margin")}<Input type="number" min={3} max={30} value={s.margin} onChange={(e) => set("margin", Number(e.target.value) || 10)} className="mt-1" dir="ltr" aria-label={t("rc2.margin")} /></label>
            <label className="text-sm font-medium">{t("rc2.color")}<Input type="color" value={s.accent} onChange={(e) => set("accent", e.target.value)} className="mt-1 h-11 p-1" aria-label={t("rc2.color")} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="size-5 accent-brand-600" /> {t("rc2.default")}</label>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">{t("rc2.banner")}</h2>
          <p className="text-xs text-muted">{t("rc2.bannerHint")}</p>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} aria-label={t("rc2.uploadBanner")} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => file.current?.click()}><ImagePlus className="size-4" /> {banner ? t("rc2.changeBanner") : t("rc2.uploadBanner")}</Button>
            {banner && <Button type="button" variant="ghost" size="sm" onClick={() => setBanner(null)}><X className="size-4" /> {t("rc2.removeBanner")}</Button>}
          </div>
          {banner && <label className="block text-sm font-medium">{t("rc2.bannerHeight")}<Input type="range" min={10} max={120} value={s.bannerHeight} onChange={(e) => set("bannerHeight", Number(e.target.value))} className="mt-1" aria-label={t("rc2.bannerHeight")} /></label>}
          {!banner && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.showLogo} onChange={(e) => set("showLogo", e.target.checked)} className="size-5 accent-brand-600" /> {t("rc2.showLogo")}</label>}
          <label className="block text-sm font-medium">{t("rc2.title")}<Input value={s.title} onChange={(e) => set("title", e.target.value)} placeholder={t("rc2.titleHint")} className="mt-1" aria-label={t("rc2.title")} /></label>
          <label className="block text-sm font-medium">{t("rc2.header")}<Textarea value={s.headerText} onChange={(e) => set("headerText", e.target.value)} rows={2} className="mt-1" aria-label={t("rc2.header")} /></label>
          <label className="block text-sm font-medium">{t("rc2.footer")}<Textarea value={s.footerText} onChange={(e) => set("footerText", e.target.value)} rows={2} className="mt-1" aria-label={t("rc2.footer")} /></label>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">{t("rc2.fields")}</h2>
          <div className="grid grid-cols-2 gap-2">
            {fieldsFor.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.fields[k] ?? false} onChange={(e) => set("fields", { ...s.fields, [k]: e.target.checked })} className="size-5 accent-brand-600" /> {t(`rc2.f.${k}`)}</label>
            ))}
          </div>
          {s.fields.signatures && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[0, 1].map((i) => <Input key={i} value={s.signatures[i]} onChange={(e) => set("signatures", (i === 0 ? [e.target.value, s.signatures[1]] : [s.signatures[0], e.target.value]) as [string, string])} placeholder={t(`rc2.sign${i + 1}`)} aria-label={t(`rc2.sign${i + 1}`)} />)}
            </div>
          )}
        </Card>

        {docType !== "PAYMENT" && (
          <Card>
            <h2 className="mb-1 font-semibold">{t("rc2.columns")}</h2>
            <p className="mb-2 text-xs text-muted">{t("rc2.columnsHint")}</p>
            <ul className="divide-y divide-line">
              {s.columns.map((c, i) => (
                <li key={c.key} className="flex items-center justify-between gap-2 py-1.5">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.show} onChange={(e) => set("columns", s.columns.map((x) => (x.key === c.key ? { ...x, show: e.target.checked } : x)))} className="size-5 accent-brand-600" aria-label={t(`rc2.c.${c.key}`)} /> {t(`rc2.c.${c.key}`)}</label>
                  <span className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${t(`rc2.c.${c.key}`)} ${t("rc2.up")}`}><ArrowUp className="size-4" /></Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === s.columns.length - 1} aria-label={`${t(`rc2.c.${c.key}`)} ${t("rc2.down")}`}><ArrowDown className="size-4" /></Button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={pending || name.trim().length < 2}><Save className="size-4" /> {pending ? t("common.saving") : t("rc2.save")}</Button>
          {layout && <Button variant="ghost" onClick={remove} disabled={pending}><Trash2 className="size-4" /> {t("rc2.delete")}</Button>}
        </div>
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-sm text-muted">{samples[docType] ? t("rc2.previewReal", { number: samples[docType]!.number }) : t("rc2.previewSample")}</p>
        <div className="overflow-auto rounded-xl border border-line bg-slate-200 p-4 dark:bg-slate-800" data-testid="receipt-preview">
          <div className="mx-auto w-fit origin-top shadow-lg" style={{ zoom: 0.75 }}>
            <Receipt settings={s} banner={banner} lang={language} data={data} />
          </div>
        </div>
      </div>
    </div>
  );
}
