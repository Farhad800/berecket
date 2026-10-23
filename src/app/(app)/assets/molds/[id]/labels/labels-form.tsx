"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { addLabelsAction, type LabelsResult } from "@/app/actions/masterdata";

export default function LabelsForm({ moldId, moldCode }: { moldId: string; moldCode: string }) {
  const t = useTranslations();
  const [text, setText] = useState("");
  const { onSubmit, pending, error, state } = useFormAction(addLabelsAction, { onSuccess: () => setText("") });
  const result = state?.ok ? (state.data as LabelsResult) : null;
  const count = text.split(/\r?\n/).filter((l) => l.trim()).length;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="moldId" value={moldId} />
      {error && <Alert>{error}</Alert>}
      {result && (
        <Alert tone="green">
          {t("md.labelsSaved", { n: result.created })}
          {result.skipped.length > 0 && <> {t("md.labelsSkipped", { n: result.skipped.length })} <span className="text-xs">({result.skipped.slice(0, 10).join(", ")}{result.skipped.length > 10 ? "…" : ""})</span></>}
        </Alert>
      )}
      <Field label={t("md.pasteLabels")} name="labels" hint={t("md.pasteLabelsHint", { code: moldCode })}>
        <Textarea id="labels" name="labels" rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Zakho Water 500 ml\nDuhok Juice 500 ml\nBRK-0101\tAsia Cola 330 ml"} required />
      </Field>
      <p className="text-xs text-muted">{t("md.sameForAll")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("md.material")} name="material"><Input id="material" name="material" placeholder="PP, HDPE…" /></Field>
        <Field label={t("md.color")} name="color"><Input id="color" name="color" /></Field>
        <Field label={t("md.weightGrams")} name="weightGrams"><Input id="weightGrams" name="weightGrams" type="number" step="0.01" min={0} dir="ltr" /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="qcRequired" className="size-5 accent-brand-600" /> {t("md.qcRequired")}</label>
      <Button type="submit" disabled={pending || count === 0}><Save className="size-4" /> {pending ? t("common.saving") : t("md.saveLabels", { n: count })}</Button>
    </form>
  );
}
