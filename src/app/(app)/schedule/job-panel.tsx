"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Ban, X } from "lucide-react";
import Combobox, { type ComboOption } from "@/components/combobox";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { cancelJobAction, saveJobAction, type SaveJobResult } from "@/app/actions/schedule";

type Conflict = SaveJobResult["conflicts"][number];

export type JobPanelProps = {
  mode: "new" | "edit";
  lineOptions: (ComboOption & { remaining: number; productId: string })[];
  machines: ComboOption[];
  molds: (ComboOption & { productId: string | null })[];
  initial: {
    jobId?: string;
    number?: string;
    status?: string;
    orderLineId?: string;
    machineId?: string;
    moldId?: string;
    plannedQty?: string;
    plannedStart?: string;
    plannedEnd?: string;
    priority?: string;
    notes?: string;
    actualStart?: string;
    actualEnd?: string;
  };
  canEdit: boolean;
  closeHref: string;
};

export default function JobPanel({ mode, lineOptions, machines, molds, initial, canEdit, closeHref }: JobPanelProps) {
  const t = useTranslations();
  const router = useRouter();
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [lineId, setLineId] = useState(initial.orderLineId ?? "");
  const [qty, setQty] = useState(initial.plannedQty ?? "");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const locked = mode === "edit" && !canEdit;

  const { onSubmit, pending: saving, error, fieldErrors: fe } = useFormAction(saveJobAction, {
    onSuccess: (res) => {
      const d = (res as { data: SaveJobResult }).data;
      if (d.saved) {
        setConflicts([]);
        router.replace(closeHref);
      } else setConflicts(d.conflicts);
    },
  });

  const line = lineOptions.find((l) => l.value === lineId);
  const blocks = conflicts.filter((c) => c.severity === "block");
  const warns = conflicts.filter((c) => c.severity === "warn");
  // Suggest molds made for this product first.
  const moldOpts = [...molds].sort((a, b) => Number(b.productId === line?.productId) - Number(a.productId === line?.productId));

  return (
    <Card className="border-brand-300 dark:border-brand-700">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{mode === "new" ? t("sched.newJob") : `${t("sched.job")} ${initial.number}`}</h2>
          {initial.status && <p className="text-xs text-muted">{t(`status.job.${initial.status}`)}</p>}
        </div>
        <Button size="sm" variant="ghost" type="button" aria-label={t("nav.close")} onClick={() => router.replace(closeHref)}><X className="size-4" /></Button>
      </div>

      {(initial.actualStart || initial.actualEnd) && (
        <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-xs">
          {t("sched.actual")}: {initial.actualStart ?? "—"} → {initial.actualEnd ?? "—"}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        {initial.jobId && <input type="hidden" name="jobId" value={initial.jobId} />}
        {error && <Alert>{error}</Alert>}

        <Field label={`${t("sched.orderLine")} *`} name="orderLineId" error={fe.orderLineId}>
          {mode === "edit" ? (
            <>
              <input type="hidden" name="orderLineId" value={lineId} />
              <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm">{line?.label} <span className="text-xs text-muted">{line?.hint}</span></div>
            </>
          ) : (
            <Combobox
              name="orderLineId"
              options={lineOptions}
              defaultValue={lineId}
              required
              onChange={(v) => {
                setLineId(v);
                const l = lineOptions.find((x) => x.value === v);
                if (l && !qty) setQty(String(l.remaining));
              }}
            />
          )}
        </Field>
        {line && mode === "new" && <p className="-mt-1 text-xs text-muted">{t("sched.remainingToPlan", { n: line.remaining })}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`${t("sched.machine")} *`} name="machineId" error={fe.machineId}>
            <Combobox name="machineId" options={machines} defaultValue={initial.machineId} required />
          </Field>
          <Field label={t("sched.mold")} name="moldId">
            <Combobox name="moldId" options={moldOpts} defaultValue={initial.moldId} />
          </Field>
          <Field label={`${t("sched.start")} *`} name="plannedStart" error={fe.plannedStart}>
            <Input name="plannedStart" type="datetime-local" required defaultValue={initial.plannedStart} disabled={locked} />
          </Field>
          <Field label={`${t("sched.finish")} *`} name="plannedEnd" error={fe.plannedEnd}>
            <Input name="plannedEnd" type="datetime-local" required defaultValue={initial.plannedEnd} disabled={locked} />
          </Field>
          <Field label={`${t("sched.plannedQty")} (${t("md.pcs")}) *`} name="plannedQty" error={fe.plannedQty}>
            <Input name="plannedQty" type="number" min={1} step={1} required value={qty} onChange={(e) => setQty(e.target.value)} dir="ltr" disabled={locked} />
          </Field>
          <Field label={t("order.priority")} name="priority">
            <Select name="priority" defaultValue={initial.priority ?? ""} disabled={locked}>
              <option value="">{t("sched.sameAsOrder")}</option>
              {["URGENT", "HIGH", "NORMAL", "LOW"].map((p) => <option key={p} value={p}>{t(`status.priority.${p}`)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t("md.notes")} name="notes">
          <Textarea name="notes" rows={2} defaultValue={initial.notes} disabled={locked} />
        </Field>

        {conflicts.length > 0 && (
          <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm font-semibold">{t("sched.conflictsTitle")}</p>
            <ul className="space-y-1 text-sm">
              {conflicts.map((c, i) => (
                <li key={i} className="flex gap-2">
                  {c.severity === "block" ? <Ban className="mt-0.5 size-4 shrink-0 text-red-600" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />}
                  <span>{t(`sched.conflict.${c.type}`, c.params as Record<string, string>)}</span>
                </li>
              ))}
            </ul>
            {warns.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="acknowledge" className="size-5 accent-brand-600" /> {t("sched.acknowledge")}
              </label>
            )}
            {blocks.length > 0 && (
              <label className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
                <input type="checkbox" name="override" className="size-5 accent-red-600" /> {t("sched.override")}
              </label>
            )}
          </div>
        )}

        {(mode === "edit" || conflicts.some((c) => c.severity === "block")) && (
          <Field label={mode === "edit" ? t("sched.rescheduleReason") : t("sched.overrideReason")} name="reason" hint={mode === "edit" ? t("sched.rescheduleReasonHint") : undefined}>
            <Input name="reason" disabled={locked} />
          </Field>
        )}

        {!locked && (
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? t("common.saving") : conflicts.length ? t("sched.saveAnyway") : mode === "new" ? t("sched.schedule") : t("common.save")}
          </Button>
        )}
      </form>

      {mode === "edit" && canEdit && initial.status === "PLANNED" && (
        <div className="mt-4 space-y-2 border-t border-line pt-3">
          {cancelErr && <Alert>{cancelErr}</Alert>}
          <div className="flex gap-2">
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder={t("order.reasonPlaceholder")} className="flex-1" />
            <Button
              variant="danger"
              size="sm"
              disabled={pending || cancelReason.trim().length < 3}
              onClick={() =>
                start(async () => {
                  const res = await cancelJobAction(initial.jobId!, cancelReason);
                  if (res.ok) router.replace(closeHref);
                  else setCancelErr(res.error);
                })
              }
            >
              {t("sched.cancelJob")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
