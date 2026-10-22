"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { changePasswordAction } from "@/app/actions/auth";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function ChangePasswordForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && <Alert>{fe?.confirm === "mismatch" ? t("mismatch") : state.error}</Alert>}
      <Field label={t("currentPassword")} name="current">
        <Input name="current" type="password" autoComplete="current-password" required dir="ltr" />
      </Field>
      <Field label={t("newPassword")} name="next" hint={t("rules")}>
        <Input name="next" type="password" autoComplete="new-password" minLength={10} required dir="ltr" />
      </Field>
      <Field label={t("confirmPassword")} name="confirm">
        <Input name="confirm" type="password" autoComplete="new-password" minLength={10} required dir="ltr" />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? tc("saving") : tc("save")}
      </Button>
    </form>
  );
}
