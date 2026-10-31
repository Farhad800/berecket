"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, Button, Input, Select, Textarea, cn } from "@/components/ui";

type Result = { ok: boolean; error?: string; fieldErrors?: Record<string, string> };
export type ActField = {
  name: string; label: string; type?: "text" | "number" | "date" | "select" | "textarea" | "checkbox";
  options?: { value: string; label: string }[]; required?: boolean; defaultValue?: string; hint?: string; wide?: boolean; max?: string;
};
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-x`);

/**
 * A small form (or a single button) that calls one server action with `payload` + the typed fields,
 * shows the error in place, and reloads the page's data when it succeeds. Numbers and checkboxes are sent as such.
 */
export default function ActForm({ action, payload = {}, fields = [], submit, variant = "primary", open: startOpen = true, openLabel, done, once = false, testid }: {
  action: (input: unknown) => Promise<Result>;
  payload?: Record<string, unknown>;
  fields?: ActField[];
  submit: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** false = shows only `openLabel` until pressed */
  open?: boolean;
  openLabel?: string;
  done?: string;
  once?: boolean;
  testid?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ""])));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const key = useRef<string | null>(null);
  const missing = fields.some((f) => f.required && f.type !== "checkbox" && !String(vals[f.name] ?? "").trim());
  const go = () => start(async () => {
    setMsg(null);
    if (once) key.current ??= newId();
    const body: Record<string, unknown> = { ...payload };
    for (const f of fields) {
      const v = vals[f.name];
      if (f.type === "checkbox") body[f.name] = v === "1";
      else if (v !== "" && v !== undefined) body[f.name] = v;
    }
    if (once) body.submissionId = key.current;
    const r = await action(body);
    if (!r.ok) { setMsg({ ok: false, text: r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error ?? "" : r.error ?? "" }); return; }
    key.current = null;
    setVals(Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ""])));
    if (done) setMsg({ ok: true, text: done });
    if (!startOpen) setOpen(false);
    router.refresh();
  });
  if (!open) return <Button type="button" variant={variant === "primary" ? "secondary" : variant === "danger" ? "secondary" : variant} size="sm" onClick={() => setOpen(true)} data-testid={testid}>{openLabel ?? submit}</Button>;
  return (
    <div className={cn(fields.length ? "space-y-2" : "inline-flex flex-col gap-1")} data-testid={testid}>
      {fields.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.name} className={cn("text-sm font-medium", (f.wide || f.type === "textarea") && "sm:col-span-2", f.type === "checkbox" && "flex items-center gap-2 sm:col-span-2")}>
              {f.type === "checkbox" ? (
                <><input type="checkbox" checked={vals[f.name] === "1"} onChange={(e) => setVals({ ...vals, [f.name]: e.target.checked ? "1" : "" })} className="size-5 accent-brand-600" aria-label={f.label} /> {f.label}</>
              ) : (
                <>
                  {f.label}{f.required && " *"}
                  {f.type === "select" ? (
                    <Select value={vals[f.name]} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} className="mt-1" aria-label={f.label}>
                      {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  ) : f.type === "textarea" ? (
                    <Textarea value={vals[f.name]} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} className="mt-1" rows={2} aria-label={f.label} />
                  ) : (
                    <Input type={f.type ?? "text"} value={vals[f.name]} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} className={cn("mt-1", f.type === "number" && "text-end")}
                      inputMode={f.type === "number" ? "numeric" : undefined} dir={f.type === "number" || f.type === "date" ? "ltr" : undefined} aria-label={f.label} max={f.max} />
                  )}
                  {f.hint && <span className="block text-xs font-normal text-muted">{f.hint}</span>}
                </>
              )}
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={variant} size={fields.length ? "md" : "sm"} onClick={go} disabled={pending || missing}>{pending ? t("common.saving") : submit}</Button>
        {!startOpen && <Button type="button" variant="ghost" size={fields.length ? "md" : "sm"} onClick={() => { setOpen(false); setMsg(null); }}>{t("common.cancel")}</Button>}
      </div>
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
    </div>
  );
}
