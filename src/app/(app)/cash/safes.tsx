"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Alert, Badge, Button, Card, Input } from "@/components/ui";
import { createSafeAction, deleteSafeAction, updateSafeAction } from "@/app/actions/cash";
import { CURS, fmtMoney, type CurCode } from "./types";

type Row = { id: string; name: string; currencies: CurCode[]; isMain: boolean; used: number; balance: Record<CurCode, number> };

/** Add safes (own name + the currencies each holds), rename them, change currencies, delete unused ones. */
export default function Safes({ rows }: { rows: Row[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [form, setForm] = useState<{ id?: string; name: string; currencies: CurCode[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const call = (fn: () => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }>, after?: () => void) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error ?? null : r.error ?? null); return; }
    after?.(); router.refresh();
  });
  const toggle = (c: CurCode) => form && setForm({ ...form, currencies: form.currencies.includes(c) ? form.currencies.filter((x) => x !== c) : [...form.currencies, c] });
  const save = () => form && call(() => (form.id ? updateSafeAction(form) : createSafeAction(form)), () => setForm(null));

  const editor = form && (
    <Card className="space-y-3">
      <h2 className="font-semibold">{form.id ? t("safe.edit") : t("safe.new")}</h2>
      <label className="block text-sm font-medium">{t("safe.name")} *
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" aria-label={t("safe.name")} maxLength={60} />
      </label>
      <fieldset>
        <legend className="text-sm font-medium">{t("safe.holds")} *</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {CURS.map((c) => (
            <label key={c} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm">
              <input type="checkbox" checked={form.currencies.includes(c)} onChange={() => toggle(c)} className="size-4" aria-label={`${c} — ${t(`cash.cur.${c}`)}`} />
              {c} — {t(`cash.cur.${c}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-2">
        <Button onClick={save} disabled={pending || form.name.trim().length < 2 || form.currencies.length === 0}><Save className="size-4" /> {pending ? t("common.saving") : t("safe.save")}</Button>
        <Button variant="secondary" onClick={() => { setForm(null); setError(null); }}><X className="size-4" /> {t("common.cancel")}</Button>
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("safe.manageHint")}</p>
      {!form && <Button onClick={() => setForm({ name: "", currencies: ["IQD"] })}><Plus className="size-4" /> {t("safe.new")}</Button>}
      {form && !form.id && editor}
      {error && <Alert>{error}</Alert>}
      <Card className="p-0 sm:p-0">
        <ul className="divide-y divide-line">
          {rows.map((s) => (
            <li key={s.id} className="px-4 py-3">
              {form?.id === s.id ? editor : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">{s.name}{s.isMain && <Badge tone="blue">{t("safe.main")}</Badge>}</p>
                    <p className="text-sm text-muted" dir="ltr">{s.currencies.map((c) => `${fmtMoney(s.balance[c])} ${c}`).join(" · ")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => { setError(null); setForm({ id: s.id, name: s.name, currencies: s.currencies }); }} aria-label={`${t("safe.edit")}: ${s.name}`}><Pencil className="size-4" /> {t("safe.edit")}</Button>
                    {!s.isMain && s.used === 0 && (
                      <Button variant="secondary" disabled={pending} onClick={() => call(() => deleteSafeAction({ id: s.id }))} aria-label={`${t("safe.delete")}: ${s.name}`}><Trash2 className="size-4" /> {t("safe.delete")}</Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
