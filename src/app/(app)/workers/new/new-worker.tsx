"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Save, TriangleAlert } from "lucide-react";
import { Alert, Button, Card, Input, Select } from "@/components/ui";
import { createWorkerAction, type Match } from "@/app/actions/workers";

const SHIFTS = ["A", "B", "C"] as const;
const NO = { A: 1, B: 2, C: 3 } as const;

/** The five fields; a name or phone that matches someone earlier (or the blacklist) must be reviewed first. */
export default function NewWorker({ today, canSalary }: { today: string; canSalary: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [v, setV] = useState({ fullName: "", shift: "", salary: "400000", startDate: today, phone: "" });
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, val: string) => { setV({ ...v, [k]: val }); setMatches(null); setReviewed(false); };
  const save = () => start(async () => {
    setError(null);
    const r = await createWorkerAction({ ...v, reviewed });
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error); return; }
    if (!r.data.saved) { setMatches(r.data.matches); return; }
    router.push(`/workers/${r.data.id}?saved=1`);
  });
  const black = matches?.some((m) => m.kind === "blacklist");
  return (
    <Card className="max-w-2xl space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">{t("wk.fullName")} *<Input value={v.fullName} onChange={(e) => set("fullName", e.target.value)} className="mt-1" aria-label={t("wk.fullName")} maxLength={160} /></label>
        <label className="text-sm font-medium">{t("wk.shift")} *
          <Select value={v.shift} onChange={(e) => set("shift", e.target.value)} className="mt-1" aria-label={t("wk.shift")}>
            <option value="">—</option>
            {SHIFTS.map((s) => <option key={s} value={s}>{t("wk.shiftN", { n: NO[s] })}</option>)}
          </Select>
        </label>
        <label className="text-sm font-medium">{t("wk.salary")} *
          <Input type="number" inputMode="numeric" min={0} value={v.salary} onChange={(e) => set("salary", e.target.value)} className="mt-1 text-end" dir="ltr" aria-label={t("wk.salary")} readOnly={!canSalary} />
          <span className="text-xs font-normal text-muted">{t(canSalary ? "wk.salaryHint" : "wk.salaryFixed")}</span>
        </label>
        <label className="text-sm font-medium">{t("wk.startDate")} *<Input type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} className="mt-1" dir="ltr" aria-label={t("wk.startDate")} /></label>
        <label className="text-sm font-medium">{t("wk.phone")} *<Input type="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1" dir="ltr" aria-label={t("wk.phone")} /></label>
      </div>
      <p className="text-xs text-muted">{t("wk.numberAuto")}</p>
      {matches && (
        <div className={`rounded-lg border-2 p-3 ${black ? "border-red-500 bg-red-50 dark:bg-red-950" : "border-amber-500 bg-amber-50 dark:bg-amber-950"}`} data-testid="matches">
          <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="size-4" /> {t(black ? "wk.matchBlack" : "wk.matchFound")}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {matches.map((m) => (
              <li key={m.kind + m.id}>
                <b>{m.name}</b> <span dir="ltr">{m.phone}</span> · {m.shift ? t("wk.shiftN", { n: NO[m.shift] }) : "—"} · {m.kind === "blacklist" ? <b className="text-red-700 dark:text-red-300">{t("wk.blacklisted")}</b> : t(`wk.status.${m.status}`)}
                {" · "}{t("wk.sameAs", { what: m.why.map((w) => t(`wk.same.${w}`)).join(" + ") })}
                {m.reason && <span className="block text-xs">{t("wk.blackReason")}: {m.reason}</span>}
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="size-5 accent-brand-600" /> {t("wk.reviewed")}</label>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      <Button onClick={save} disabled={pending || v.fullName.trim().length < 3 || !v.shift || !v.startDate || v.phone.trim().length < 6 || (!!matches && !reviewed)}><Save className="size-4" /> {pending ? t("common.saving") : t("wk.save")}</Button>
    </Card>
  );
}
