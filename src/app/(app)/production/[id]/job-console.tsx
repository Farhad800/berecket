"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCheck, Layers, Pause, Play, PlusCircle, TimerReset, Wrench } from "lucide-react";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, Card, Field, Input, Select, Textarea, cn } from "@/components/ui";
import {
  completeJobAction, correctProductionAction, logDowntimeAction, newBatchAction, pauseJobAction,
  reportProductionAction, resumeJobAction, startJobAction,
} from "@/app/actions/production";

type Props = {
  jobId: string;
  status: string;
  shift: "A" | "B" | "C";
  openBatch: string | null;
  batches: { id: string; number: string }[];
  can: { start: boolean; report: boolean; edit: boolean; maintenance: boolean };
  categories: readonly string[];
};

export default function JobConsole({ jobId, status, shift, openBatch, batches, can, categories }: Props) {
  const t = useTranslations();
  const [panel, setPanel] = useState<"none" | "pause" | "downtime" | "correct" | "complete">("none");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const running = status === "IN_PROGRESS";
  const paused = status === "PAUSED";
  const active = running || paused;

  const doAction = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? t("common.error") });
      if (r.ok) setPanel("none");
    });

  const report = useFormAction(reportProductionAction, { resetOnSuccess: true, onSuccess: () => setMsg({ ok: true, text: t("prod.reported") }) });
  const pause = useFormAction(pauseJobAction, { onSuccess: () => { setPanel("none"); setMsg({ ok: true, text: t("prod.pausedMsg") }); } });
  const downtime = useFormAction(logDowntimeAction, { resetOnSuccess: true, onSuccess: () => { setPanel("none"); setMsg({ ok: true, text: t("common.saved") }); } });
  const correct = useFormAction(correctProductionAction, { resetOnSuccess: true, onSuccess: () => { setPanel("none"); setMsg({ ok: true, text: t("common.saved") }); } });
  const [completeNote, setCompleteNote] = useState("");

  if (!can.start && !can.report && !can.edit) {
    return <Alert tone="blue">{t("common.readOnly")}</Alert>;
  }

  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}

      {status === "PLANNED" && can.start && (
        <Button className="min-h-14 w-full text-base" disabled={pending} onClick={() => doAction(() => startJobAction(jobId), t("prod.startedMsg"))}>
          <Play className="size-5" /> {t("prod.start")}
        </Button>
      )}

      {active && can.report && (
        <Card className={cn(paused && "border-amber-300 dark:border-amber-800")}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{t("prod.reportTitle")}</h2>
            {openBatch && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs" dir="ltr">{t("prod.batch")}: <b>{openBatch}</b></span>}
          </div>
          <form onSubmit={report.onSubmit} className="space-y-3">
            <input type="hidden" name="jobId" value={jobId} />
            {report.error && <Alert>{report.error}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("prod.good")} name="qtyGood" error={report.fieldErrors.qtyGood}>
                <Input name="qtyGood" type="number" inputMode="numeric" min={0} step={1} required className="min-h-14 text-xl font-bold" dir="ltr" />
              </Field>
              <Field label={t("prod.defective")} name="qtyDefective" error={report.fieldErrors.qtyDefective}>
                <Input name="qtyDefective" type="number" inputMode="numeric" min={0} step={1} defaultValue={0} className="min-h-14 text-xl" dir="ltr" />
              </Field>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <Field label={t("sched.shift")} name="shift">
                <Select name="shift" defaultValue={shift}>
                  {(["A", "B", "C"] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label={t("md.notes")} name="notes">
                <Input name="notes" />
              </Field>
            </div>
            <Button type="submit" disabled={report.pending} className="min-h-12 w-full">
              <PlusCircle className="size-5" /> {report.pending ? t("common.saving") : t("prod.addQuantity")}
            </Button>
          </form>
        </Card>
      )}

      {active && can.edit && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {running && (
            <Button variant="secondary" onClick={() => setPanel(panel === "pause" ? "none" : "pause")}><Pause className="size-4" /> {t("prod.pause")}</Button>
          )}
          {paused && (
            <Button onClick={() => doAction(() => resumeJobAction(jobId), t("prod.resumedMsg"))} disabled={pending}><Play className="size-4" /> {t("prod.resume")}</Button>
          )}
          {can.report && (
            <Button variant="secondary" disabled={pending} onClick={() => doAction(() => newBatchAction(jobId, shift), t("prod.newBatchMsg"))}>
              <Layers className="size-4" /> {t("prod.newBatch")}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setPanel(panel === "downtime" ? "none" : "downtime")}><TimerReset className="size-4" /> {t("prod.logDowntime")}</Button>
          <Button variant="secondary" onClick={() => setPanel(panel === "complete" ? "none" : "complete")}><CheckCheck className="size-4" /> {t("prod.complete")}</Button>
        </div>
      )}

      {panel === "pause" && (
        <Card className="border-amber-300 dark:border-amber-800">
          <h3 className="mb-2 font-semibold">{t("prod.pauseTitle")}</h3>
          <form onSubmit={pause.onSubmit} className="space-y-3">
            <input type="hidden" name="jobId" value={jobId} />
            {pause.error && <Alert>{pause.error}</Alert>}
            <Field label={t("prod.category")} name="category">
              <Select name="category" required defaultValue="">
                <option value="" disabled>—</option>
                {categories.map((c) => <option key={c} value={c}>{t(`prod.cat.${c}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("prod.whatHappened")} name="reason" error={pause.fieldErrors.reason}>
              <Textarea name="reason" rows={2} required minLength={3} />
            </Field>
            {can.maintenance && (
              <div className="space-y-2 rounded-lg bg-surface-2 p-3 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" name="machineProblem" className="size-5 accent-brand-600" /> <Wrench className="size-4" /> {t("prod.createMaintenance")}</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="machineDown" className="size-5 accent-red-600" /> {t("prod.machineDown")}</label>
                <p className="text-xs text-muted">{t("prod.breakdownHint")}</p>
              </div>
            )}
            <Button type="submit" disabled={pause.pending}>{t("prod.pauseConfirm")}</Button>
          </form>
        </Card>
      )}

      {panel === "downtime" && (
        <Card>
          <h3 className="mb-1 font-semibold">{t("prod.logDowntime")}</h3>
          <p className="mb-3 text-xs text-muted">{t("prod.logDowntimeHint")}</p>
          <form onSubmit={downtime.onSubmit} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="jobId" value={jobId} />
            {downtime.error && <div className="sm:col-span-2"><Alert>{downtime.error}</Alert></div>}
            <Field label={t("prod.category")} name="category">
              <Select name="category" required defaultValue="">
                <option value="" disabled>—</option>
                {categories.map((c) => <option key={c} value={c}>{t(`prod.cat.${c}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("prod.whatHappened")} name="reason"><Input name="reason" required minLength={3} /></Field>
            <Field label={t("sched.start")} name="startedAt"><Input name="startedAt" type="datetime-local" required /></Field>
            <Field label={t("sched.finish")} name="endedAt"><Input name="endedAt" type="datetime-local" required /></Field>
            <div className="sm:col-span-2"><Button type="submit" disabled={downtime.pending}>{t("common.save")}</Button></div>
          </form>
        </Card>
      )}

      {panel === "complete" && (
        <Card>
          <h3 className="mb-1 font-semibold">{t("prod.completeTitle")}</h3>
          <p className="mb-3 text-xs text-muted">{t("prod.completeHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Input value={completeNote} onChange={(e) => setCompleteNote(e.target.value)} placeholder={t("prod.completeNote")} className="flex-1" />
            <Button disabled={pending} onClick={() => doAction(() => completeJobAction(jobId, completeNote), t("prod.completedMsg"))}>{t("prod.complete")}</Button>
          </div>
        </Card>
      )}

      {can.edit && batches.length > 0 && (
        <div>
          <button type="button" onClick={() => setPanel(panel === "correct" ? "none" : "correct")} className="text-sm font-semibold text-brand-600 hover:underline">
            {t("prod.correctLink")}
          </button>
          {panel === "correct" && (
            <Card className="mt-2">
              <p className="mb-3 text-xs text-muted">{t("prod.correctHint")}</p>
              <form onSubmit={correct.onSubmit} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="jobId" value={jobId} />
                {correct.error && <div className="sm:col-span-2"><Alert>{correct.error}</Alert></div>}
                <Field label={t("prod.batch")} name="batchId">
                  <Select name="batchId" required defaultValue={batches[0]?.id}>
                    {batches.map((b) => <option key={b.id} value={b.id}>{b.number}</option>)}
                  </Select>
                </Field>
                <Field label={t("prod.reason")} name="reason" error={correct.fieldErrors.reason}><Input name="reason" required minLength={3} /></Field>
                <Field label={t("prod.goodDelta")} name="goodDelta" hint={t("prod.deltaHint")}><Input name="goodDelta" type="number" step={1} defaultValue={0} dir="ltr" /></Field>
                <Field label={t("prod.defectiveDelta")} name="defectiveDelta"><Input name="defectiveDelta" type="number" step={1} defaultValue={0} dir="ltr" /></Field>
                <div className="sm:col-span-2"><Button type="submit" variant="secondary" disabled={correct.pending}>{t("prod.saveCorrection")}</Button></div>
              </form>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
