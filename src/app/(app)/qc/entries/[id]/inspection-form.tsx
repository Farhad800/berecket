"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { recordInspectionAction } from "@/app/actions/qc";

/** QC check of one production entry: pieces checked, pieces rejected, and the defect if any. */
export default function InspectionForm({
  entryId, produced, alreadyRejected, categories, openIssue,
}: { entryId: string; produced: number; alreadyRejected: number; categories: { id: string; name: string }[]; openIssue: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const [rejected, setRejected] = useState(0);
  const [showDefect, setShowDefect] = useState(false);
  const [done, setDone] = useState(false);
  const { onSubmit, pending, error, fieldErrors: fe } = useFormAction(recordInspectionAction, {
    once: true,
    resetOnSuccess: true,
    onSuccess: () => { setDone(true); setShowDefect(false); setRejected(0); router.refresh(); },
  });
  const needsDefect = showDefect || (rejected > 0 && !openIssue);
  const left = produced - alreadyRejected;

  return (
    <Card>
      <h2 className="mb-1 font-semibold">{t("qc.recordInspection")}</h2>
      <p className="mb-3 text-xs text-muted">{t("qc.producedInEntry", { n: produced.toLocaleString("en") })}{alreadyRejected > 0 && ` · ${t("qc.alreadyRejected", { n: alreadyRejected.toLocaleString("en") })}`}</p>
      <form onSubmit={(e) => { setDone(false); onSubmit(e); }} className="space-y-4">
        <input type="hidden" name="entryId" value={entryId} />
        {error && <Alert>{error}</Alert>}
        {done && <Alert tone="green">{t("qc.saved")}</Alert>}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sampleOnly" defaultChecked className="size-5 accent-brand-600" /> {t("qc.sampleOnly")}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("qc.inspected")} name="qtyInspected" error={fe.qtyInspected}>
            <Input name="qtyInspected" type="number" min={1} max={produced} required dir="ltr" />
          </Field>
          <Field label={t("qc.rejectedShort")} name="qtyRejected">
            <Input name="qtyRejected" type="number" min={0} max={left} value={rejected || ""} placeholder="0" onChange={(e) => setRejected(Number(e.target.value) || 0)} dir="ltr" />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-muted">{rejected > 0 ? t("qc.effectReject", { n: rejected.toLocaleString("en") }) : t("qc.effectApprove")}</p>
        {!needsDefect && rejected > 0 && openIssue && <p className="rounded-lg bg-surface-2 p-2 text-xs">{t("qc.continuesIssue", { issue: openIssue })}</p>}
        {!needsDefect && (
          <button type="button" onClick={() => setShowDefect(true)} className="text-sm font-semibold text-brand-600 hover:underline">
            {rejected > 0 ? t("qc.addNewDefect") : t("qc.addMinorDefect")}
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
                <Select name="severity" required defaultValue={rejected > 0 ? "MAJOR" : "MINOR"}>
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
        <Button type="submit" disabled={pending} variant={rejected > 0 ? "danger" : "primary"} className="w-full">
          {pending ? t("common.saving") : rejected > 0 ? t("qc.saveReject", { n: rejected.toLocaleString("en") }) : t("qc.saveApprove")}
        </Button>
      </form>
    </Card>
  );
}
