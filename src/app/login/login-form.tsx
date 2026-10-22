"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { loginAction } from "@/app/actions/auth";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function LoginForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <form action={action} className="mt-6 space-y-4" key={state.attempt ?? 0}>
      {state.error && <Alert>{t(state.error)}</Alert>}
      <Field label={t("username")} name="username">
        <Input
          name="username"
          defaultValue={state.username}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          dir="ltr"
          autoFocus={!state.username}
        />
      </Field>
      <Field label={t("password")} name="password">
        <Input name="password" type="password" autoComplete="current-password" required dir="ltr" autoFocus={!!state.username} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("signingIn") : t("signIn")}
      </Button>
    </form>
  );
}
