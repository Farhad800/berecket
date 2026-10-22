"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, Card, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { recordInspectionAction } from "@/app/actions/qc";

type Decision = "APPROVE" | "PARTIAL" | "HOLD" | "REJECT";

export default function InspectionForm({
  batchId, produced, canApprove, categories, openIssue,
}: { batchId: string; produced: number; canApprove: boolean; categories: { id: string; name: string }[]; openIssue: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const [decision, setDecision] = useState<Decision>(canApprove ? "APPROVE" : "HOLD");
  const [sample, setSample] = useState(true);
  const [showDefect, setShowDefect] = useState(false);
  const [done, setDone] = useState(false);
  const { onSubmit, pending, error, fieldErrors: fe } = useFormAction(recordInspectionAction, {
    resetOnSuccess: true,
    onSuccess: () => { setDone(true); setShowDefect(false); router.refresh(); },
  });
  // With an open issue on this batch, a follow-up decision continues it unless a new defect is added.
  const needsDefect = showDefect || (decision !== "APPROVE" && !openIssue);
  const tones: Record<Decision, string> = {
    APPROVE: "peer-checked:border-emerald-500 peer-checked:bg-emerald-50 dark:peer-checked:bg-emerald-950",
    PARTIAL: "peer-checked:border-amber-500 peer-checked:bg-amber-50 dark:peer-checked:bg-amber-950",
    HOLD: "peer-checked:border-red-400 peer-checked:bg-red-50 dark:peer-checked:bg-red-950",
    REJECT: "peer-checked:border-red-600 peer-checked:bg-red-100 dark:peer-checked:bg-red-950",
  };

  return (
    <Card>
      <h2 className="mb-1 font-semibold">{t("qc.recordInspection")}</h2>
      <p className="mb-3 text-xs text-muted">{t("qc.producedInBatch", { n: produced })}</p>
      <form onSubmit={(e) => { setDone(false); onSubmit(e); }} className="space-y-4">
        <input type="hidden" name="batchId" value={batchId} />
        {error && <Alert>{error}</Alert>}
        {done && <Alert tone="green">{t("qc.saved")}</Alert>}

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("qc.decision")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["APPROVE", "PARTIAL", "HOLD", "REJECT"] as Decision[]).map((d) => {
              const disabled = !canApprove && d !== "HOLD";
              return (
                <label key={d} className={cn("relative", disabled && "opacity-40")}>
                  <input type="radio" name="decision" value={d} checked={decision === d} disabled={disabled} onChange={() => { setDecision(d); if (d === "PARTIAL") setSample(false); }} className="peer sr-only" />
                  <span className={cn("flex min-h-12 cursor-pointer items-center justify-center rounded-lg border-2 border-line px-2 text-center text-sm font-semibold", tones[d])}>{t(`qc.dec.${d}`)}</span>
                </label>
              );
            })}
          </div>
          {!canApprove && <p className="mt-1 text-xs text-muted">{t("qc.holdOnlyHint")}</p>}
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sampleOnly" checked={sample} disabled={decision === "PARTIAL"} onChange={(e) => setSample(e.target.checked)} className="size-5 accent-brand-600" />
          {t("qc.sampleOnly")}
        </label>

        <div className={cn("grid gap-3", decision === "PARTIAL" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
          <Field label={t("qc.inspected")} name="qtyInspected" error={fe.qtyInspected}>
            <Input name="qtyInspected" type="number" min={1} max={produced} required dir="ltr" defaultValue={decision === "PARTIAL" ? produced : undefined} />
          </Field>
          <Field label={t("qc.accepted")} name="qtyAccepted"><Input name="qtyAccepted" type="number" min={0} required dir="ltr" /></Field>
          <Field label={t("qc.rejectedShort")} name="qtyRejected"><Input name="qtyRejected" type="number" min={0} defaultValue={0} dir="ltr" /></Field>
          {decision === "PARTIAL" && <Field label={t("qc.hold")} name="qtyHold"><Input name="qtyHold" type="number" min={0} defaultValue={0} dir="ltr" /></Field>}
        </div>
        <p className="-mt-2 text-xs text-muted">{t(`qc.effect.${decision}`)}</p>

        {!needsDefect && decision !== "APPROVE" && openIssue && (
          <p className="rounded-lg bg-surface-2 p-2 text-xs">{t("qc.continuesIssue", { issue: openIssue })}</p>
        )}
        {!needsDefect && (
          <button type="button" onClick={() => setShowDefect(true)} className="text-sm font-semibold text-brand-600 hover:underline">
            {decision === "APPROVE" ? t("qc.addMinorDefect") : t("qc.addNewDefect")}
          </button>
        )}
        {needsDefect && (
          <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-3">
            <p className="text-sm font-semibold">{t("qc.defect")}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("qc.defectType")} name="categoryId">
                <Select name="categoryId" required defaultValue="">
                  <option value="" disabled>—</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label={t("qc.severity")} name="severity">
                <Select name="severity" required defaultValue={decision === "REJECT" ? "MAJOR" : "MINOR"}>
                  {["MINOR", "MAJOR", "CRITICAL"].map((s) => <option key={s} value={s}>{t(`status.severity.${s}`)}</option>)}
                </Select>
              </Field>
              <Field label={t("qc.responsible")} name="responsibleDept">
                <Select name="responsibleDept" required defaultValue="PRODUCTION">
                  {["PRODUCTION", "SERVICE", "QC", "WAREHOUSE"].map((d) => <option key={d} value={d}>{t(`qc.dept.${d}`)}</option>)}
                </Select>
              </Field>
            </div>
            <Field label={t("qc.defectDescription")} name="issueDescription"><Textarea name="issueDescription" rows={2} required /></Field>
            <Field label={t("qc.recommendedAction")} name="recommendedAction"><Input name="recommendedAction" /></Field>
          </div>
        )}
        <Field label={t("md.notes")} name="notes"><Input name="notes" /></Field>
        <Button type="submit" disabled={pending} variant={decision === "APPROVE" ? "primary" : "danger"} className="w-full">
          {pending ? t("common.saving") : t("qc.saveDecision", { decision: t(`qc.dec.${decision}`) })}
        </Button>
      </form>
    </Card>
  );
}
