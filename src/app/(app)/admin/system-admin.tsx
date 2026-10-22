"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Trash2, UserMinus } from "lucide-react";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { removeDemoUsersAction, resetDataAction } from "@/app/actions/system";

type Counts = Record<string, number>;

export default function SystemAdmin({ ops, master, demoUsers }: { ops: Counts; master: Counts; demoUsers: number }) {
  const t = useTranslations("sys");
  const [scope, setScope] = useState<"operations" | "everything">("operations");
  const reset = useFormAction(resetDataAction, { resetOnSuccess: true });
  const demo = useFormAction(removeDemoUsersAction, { resetOnSuccess: true });
  const opsTotal = Object.values(ops).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="flex items-center gap-2 font-bold"><Trash2 className="size-5 text-red-600" /> {t("resetTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("resetIntro")}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          {Object.entries(ops).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-line py-1"><dt className="text-muted">{t(`count.${k}`)}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-sm"><b>{t("kept")}</b> {t("keptList")}</p>

        {reset.state?.ok ? (
          <div className="mt-4"><Alert tone="green">{t("resetDone")}</Alert></div>
        ) : (
          <form onSubmit={reset.onSubmit} className="mt-4 space-y-3">
            {reset.error && <Alert>{reset.error}</Alert>}
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">{t("scope")}</legend>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="scope" value="operations" checked={scope === "operations"} onChange={() => setScope("operations")} className="mt-1" />
                <span><b>{t("scopeOps")}</b><br /><span className="text-muted">{t("scopeOpsHint")}</span></span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="scope" value="everything" checked={scope === "everything"} onChange={() => setScope("everything")} className="mt-1" />
                <span>
                  <b>{t("scopeAll")}</b><br />
                  <span className="text-muted">{t("scopeAllHint", { customers: master.customers, products: master.products, machines: master.machines, molds: master.molds })}</span>
                </span>
              </label>
            </fieldset>
            <Alert tone="amber"><AlertTriangle className="me-1 inline size-4" /> {t("warning")}</Alert>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("typeReset")} name="confirm"><Input name="confirm" id="confirm" autoComplete="off" dir="ltr" required /></Field>
              <Field label={t("yourPassword")} name="reset-password"><Input name="password" id="reset-password" type="password" autoComplete="current-password" required /></Field>
            </div>
            <Button type="submit" variant="danger" disabled={reset.pending || (opsTotal === 0 && scope === "operations")}>
              {reset.pending ? t("working") : scope === "everything" ? t("resetAllButton") : t("resetButton")}
            </Button>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="flex items-center gap-2 font-bold"><UserMinus className="size-5" /> {t("demoTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("demoIntro", { n: demoUsers })}</p>
        {demo.state?.ok ? (
          <div className="mt-3"><Alert tone="green">{t("demoDone")}</Alert></div>
        ) : demoUsers > 0 ? (
          <form onSubmit={demo.onSubmit} className="mt-3 flex flex-wrap items-end gap-3">
            {demo.error && <div className="w-full"><Alert>{demo.error}</Alert></div>}
            <Field label={t("yourPassword")} name="demo-password"><Input name="password" id="demo-password" type="password" autoComplete="current-password" required /></Field>
            <Button type="submit" variant="secondary" disabled={demo.pending}>{t("demoButton")}</Button>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
