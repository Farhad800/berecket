"use client";

import { useTranslations } from "next-intl";
import { useFormAction } from "./use-form-action";
import Combobox, { type ComboOption } from "./combobox";
import { Alert, Button, Field, Input, Select, Textarea, cn } from "./ui";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select" | "combo" | "checkbox" | "email" | "tel" | "date" | "datetime-local";
  required?: boolean;
  options?: ComboOption[];
  hint?: string;
  wide?: boolean;
  ltr?: boolean; // codes, numbers, emails read left-to-right even in Arabic
  step?: string;
  min?: number;
};

type Result = { ok: boolean; error?: string; fieldErrors?: Record<string, string>; data?: unknown };

/** Generic form for simple master-data records. Keeps typed values on server-side errors. */
export default function RecordForm({
  fields,
  action,
  initial,
  hidden,
  onDone,
  submitLabel,
}: {
  fields: FieldDef[];
  action: (prev: unknown, fd: FormData) => Promise<Result>;
  initial?: Record<string, unknown>;
  hidden?: Record<string, string>;
  onDone?: () => void;
  submitLabel?: string;
}) {
  const t = useTranslations("common");
  const { onSubmit, pending, error, fieldErrors: fe } = useFormAction(action, { onSuccess: () => onDone?.() });
  const val = (n: string) => (initial?.[n] ?? "") as string;

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
      {fields.map((f) => (
        <div key={f.name} className={cn((f.wide || f.type === "textarea") && "sm:col-span-2")}>
          {f.type === "checkbox" ? (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name={f.name} value="on" defaultChecked={!!initial?.[f.name]} className="size-5 accent-brand-600" />
              <span>{f.label}</span>
              {f.hint && <span className="text-xs text-muted">{f.hint}</span>}
            </label>
          ) : (
            <Field label={f.label + (f.required ? " *" : "")} name={f.name} hint={f.hint} error={fe[f.name]}>
              {f.type === "textarea" ? (
                <Textarea name={f.name} defaultValue={val(f.name)} required={f.required} />
              ) : f.type === "select" ? (
                <Select name={f.name} defaultValue={val(f.name)} required={f.required}>
                  {!f.required && <option value="">—</option>}
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : f.type === "combo" ? (
                <Combobox name={f.name} options={f.options ?? []} defaultValue={val(f.name)} required={f.required} invalid={!!fe[f.name]} />
              ) : (
                <Input
                  name={f.name}
                  type={f.type ?? "text"}
                  defaultValue={val(f.name)}
                  required={f.required}
                  step={f.step}
                  min={f.min}
                  dir={f.ltr ? "ltr" : undefined}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                />
              )}
            </Field>
          )}
        </div>
      ))}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? t("saving") : submitLabel ?? t("save")}</Button>
        {onDone && <Button type="button" variant="secondary" onClick={onDone}>{t("cancel")}</Button>}
      </div>
    </form>
  );
}
