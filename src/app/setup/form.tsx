"use client";

import { createFirstAdminAction } from "@/app/actions/setup";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function SetupForm() {
  const { onSubmit, pending, error, fieldErrors: fe } = useFormAction(createFirstAdminAction);
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
      <div className="sm:col-span-2">
        <Field label="Setup code" name="token" error={fe.token}>
          <Input name="token" required autoComplete="off" dir="ltr" />
        </Field>
      </div>
      <Field label="Employee ID" name="employeeId" error={fe.employeeId}>
        <Input name="employeeId" required dir="ltr" />
      </Field>
      <Field label="Full name" name="fullName" error={fe.fullName}>
        <Input name="fullName" required />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Username" name="username" error={fe.username}>
          <Input name="username" required autoCapitalize="none" dir="ltr" />
        </Field>
      </div>
      <Field label="Password" name="password" hint="At least 10 characters, letters and numbers." error={fe.password}>
        <Input name="password" type="password" minLength={10} required autoComplete="new-password" dir="ltr" />
      </Field>
      <Field label="Confirm password" name="confirm" error={fe.confirm}>
        <Input name="confirm" type="password" minLength={10} required autoComplete="new-password" dir="ltr" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Creating…" : "Create administrator"}</Button>
      </div>
    </form>
  );
}
