"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, Send } from "lucide-react";
import { Alert, Button, Card, Input, cn } from "@/components/ui";
import { correctAttendanceAction, submitAttendanceAction } from "@/app/actions/attendance";

type W = { id: string; number: string; name: string };
type Mark = { status: "ABSENT" | "EXCUSED"; reason: string };
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-x`);

/**
 * Absence-only daily report: everyone is present unless tapped Absent or Excused.
 * The same screen corrects a submitted report (then a reason is required).
 */
export default function AttendanceForm({ shift, day, workers, initial, reportId }: {
  shift: string; day: string; workers: W[]; initial?: Record<string, Mark>; reportId?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, Mark>>(initial ?? {});
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const key = useRef<string | null>(null);
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return s ? workers.filter((w) => w.name.toLowerCase().includes(s) || w.number.toLowerCase().includes(s)) : workers; }, [q, workers]);
  const absent = Object.values(marks).filter((m) => m.status === "ABSENT").length;
  const excused = Object.values(marks).filter((m) => m.status === "EXCUSED").length;
  const present = workers.length - absent - excused;
  const toggle = (id: string, status: Mark["status"]) => setMarks((m) => {
    const n = { ...m };
    if (n[id]?.status === status) delete n[id]; else n[id] = { status, reason: n[id]?.reason ?? "" };
    return n;
  });
  const missingReason = Object.values(marks).some((m) => m.status === "EXCUSED" && m.reason.trim().length < 3);
  const send = () => start(async () => {
    setMsg(null);
    const list = Object.entries(marks).map(([workerId, m]) => ({ workerId, status: m.status, reason: m.status === "EXCUSED" ? m.reason : undefined }));
    if (!reportId) key.current ??= newId();
    const r = reportId
      ? await correctAttendanceAction({ reportId, marks: list, reason })
      : await submitAttendanceAction({ shift, day, marks: list, submissionId: key.current });
    if (!r.ok) { setMsg({ ok: false, text: r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error }); return; }
    key.current = null;
    setMsg({ ok: true, text: t(reportId ? "wk.corrected" : "wk.submitted") });
    router.refresh();
  });
  return (
    <div className="space-y-3 pb-24">
      <Card className="flex flex-wrap items-center gap-4 text-sm" data-testid="att-counts">
        <span>{t("wk.att.PRESENT")}: <b className="text-green-700 dark:text-green-400">{present}</b></span>
        <span>{t("wk.att.ABSENT")}: <b className="text-red-600">{absent}</b></span>
        <span>{t("wk.att.EXCUSED")}: <b className="text-amber-600">{excused}</b></span>
        <span>{t("wk.total")}: <b>{workers.length}</b></span>
      </Card>
      <p className="text-sm text-muted">{t("wk.attHint")}</p>
      <label className="relative block">
        <Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("wk.search")} className="ps-9" aria-label={t("wk.search")} />
      </label>
      <Card className="p-0 sm:p-0">
        <ul className="divide-y divide-line">
          {shown.map((w) => {
            const m = marks[w.id];
            return (
              <li key={w.id} className={cn("px-4 py-2.5", m?.status === "ABSENT" && "bg-red-50 dark:bg-red-950/40", m?.status === "EXCUSED" && "bg-amber-50 dark:bg-amber-950/40")} data-testid={`att-${w.number}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0"><span className="block truncate font-medium">{w.name}</span><span className="text-xs text-muted" dir="ltr">{w.number}</span></span>
                  <span className="flex shrink-0 gap-1.5">
                    <button type="button" onClick={() => toggle(w.id, "ABSENT")} aria-pressed={m?.status === "ABSENT"} className={cn("min-h-10 rounded-lg border px-3 text-sm font-semibold", m?.status === "ABSENT" ? "border-red-600 bg-red-600 text-white" : "border-line bg-surface")}>{t("wk.att.ABSENT")}</button>
                    <button type="button" onClick={() => toggle(w.id, "EXCUSED")} aria-pressed={m?.status === "EXCUSED"} className={cn("min-h-10 rounded-lg border px-3 text-sm font-semibold", m?.status === "EXCUSED" ? "border-amber-500 bg-amber-500 text-white" : "border-line bg-surface")}>{t("wk.att.EXCUSED")}</button>
                  </span>
                </div>
                {m?.status === "EXCUSED" && <Input value={m.reason} onChange={(e) => setMarks({ ...marks, [w.id]: { ...m, reason: e.target.value } })} placeholder={t("wk.excuseReason")} className="mt-2" aria-label={`${w.number} ${t("wk.excuseReason")}`} />}
              </li>
            );
          })}
        </ul>
      </Card>
      {reportId && <label className="block text-sm font-medium">{t("wk.correctReason")} *<Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" aria-label={t("wk.correctReason")} /></label>}
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-3 py-3 backdrop-blur lg:start-64" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <p className="text-sm">{t("wk.countLine", { present, absent, excused, total: workers.length })}</p>
          <Button onClick={send} disabled={pending || missingReason || (!!reportId && reason.trim().length < 3)}><Send className="size-4" /> {pending ? t("common.saving") : t(reportId ? "wk.saveCorrection" : "wk.submit")}</Button>
        </div>
      </div>
    </div>
  );
}
