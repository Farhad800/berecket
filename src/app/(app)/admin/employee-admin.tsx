"use client";

import { useState, useTransition } from "react";
import { useFormAction } from "@/components/use-form-action";
import { useTranslations } from "next-intl";
import { Copy, KeyRound, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import {
  createEmployeeAction, updateEmployeeAction, resetPasswordAction, setEmployeeActiveAction,
} from "@/app/actions/admin";
import { Alert, Badge, Button, Card, Field, Input, Select } from "@/components/ui";

type Opt = { id: string; name: string };
type Row = {
  id: string; employeeId: string; fullName: string; username: string; email: string | null;
  departmentId: string | null; departmentName: string | null; roleId: string; roleName: string;
  active: boolean; lastLogin: string | null; created: string;
};

function SecretBox({ username, password, onClose }: { username: string; password: string; onClose: () => void }) {
  const t = useTranslations("admin");
  return (
    <Alert tone="green">
      <p className="font-semibold">{t("temporaryPassword")}</p>
      <p className="mt-1 text-xs">{t("temporaryPasswordHelp")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2" dir="ltr">
        <code className="rounded bg-white/70 px-2 py-1 text-sm dark:bg-black/30">{username}</code>
        <code className="rounded bg-white/70 px-2 py-1 text-base font-bold tracking-wider dark:bg-black/30">{password}</code>
        <Button size="sm" variant="secondary" type="button" onClick={() => navigator.clipboard?.writeText(password)}>
          <Copy className="size-3.5" />
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onClose}>OK</Button>
      </div>
    </Alert>
  );
}

function EmployeeForm({
  roles, departments, initial, onDone,
}: { roles: Opt[]; departments: Opt[]; initial?: Row; onDone: (secret?: { username: string; password: string }) => void }) {
  const t = useTranslations();
  const { onSubmit, pending, fieldErrors: fe, error } = useFormAction(
    (prev: unknown, fd: FormData) =>
      (initial ? updateEmployeeAction(prev, fd) : createEmployeeAction(prev, fd)) as Promise<{
        ok: boolean; error?: string; fieldErrors?: Record<string, string>; data?: unknown;
      }>,
    { onSuccess: (res) => onDone(initial ? undefined : (res.data as { username: string; password: string })) },
  );
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
      <Field label={t("admin.employeeId")} name="employeeId" error={fe.employeeId}>
        <Input name="employeeId" defaultValue={initial?.employeeId} required dir="ltr" />
      </Field>
      <Field label={t("admin.fullName")} name="fullName" error={fe.fullName}>
        <Input name="fullName" defaultValue={initial?.fullName} required />
      </Field>
      <Field label={t("auth.username")} name="username" error={fe.username}>
        <Input name="username" defaultValue={initial?.username} required autoCapitalize="none" dir="ltr" />
      </Field>
      <Field label={t("admin.email")} name="email" error={fe.email}>
        <Input name="email" type="email" defaultValue={initial?.email ?? ""} dir="ltr" />
      </Field>
      <Field label={t("admin.department")} name="departmentId">
        <Select name="departmentId" defaultValue={initial?.departmentId ?? ""}>
          <option value="">—</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </Field>
      <Field label={t("admin.role")} name="roleId" error={fe.roleId}>
        <Select name="roleId" defaultValue={initial?.roleId ?? ""} required>
          <option value="" disabled>—</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</Button>
        <Button type="button" variant="secondary" onClick={() => onDone()}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}

export default function EmployeeAdmin({ users, roles, departments }: { users: Row[]; roles: Opt[]; departments: Opt[] }) {
  const t = useTranslations();
  const [mode, setMode] = useState<"none" | "new" | string>("none");
  const [secret, setSecret] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reset = (u: Row) =>
    start(async () => {
      if (!confirm(`${t("admin.resetPassword")}: ${u.fullName}?`)) return;
      const res = await resetPasswordAction(u.id);
      if (res.ok) setSecret({ username: u.username, password: res.data.password });
      else setError(res.error);
    });
  const toggle = (u: Row) =>
    start(async () => {
      if (u.active && !confirm(t("admin.disableConfirm"))) return;
      const res = await setEmployeeActiveAction(u.id, !u.active);
      if (!res.ok) setError(res.error);
    });

  return (
    <div className="space-y-4">
      {secret && <SecretBox {...secret} onClose={() => setSecret(null)} />}
      {error && <Alert>{error}</Alert>}

      {mode === "new" ? (
        <Card>
          <h2 className="mb-3 font-semibold">{t("admin.newEmployee")}</h2>
          <EmployeeForm roles={roles} departments={departments} onDone={(s) => { setMode("none"); if (s) setSecret(s); }} />
        </Card>
      ) : (
        <Button onClick={() => setMode("new")}><Plus className="size-4" /> {t("admin.newEmployee")}</Button>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {users.map((u) =>
          mode === u.id ? (
            <Card key={u.id} className="md:col-span-2 xl:col-span-3">
              <EmployeeForm roles={roles} departments={departments} initial={u} onDone={() => setMode("none")} />
            </Card>
          ) : (
            <Card key={u.id} className={u.active ? "" : "opacity-60"}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.fullName}</p>
                  <p className="text-xs text-muted" dir="ltr">#{u.employeeId} · @{u.username}</p>
                </div>
                <Badge tone={u.active ? "green" : "gray"}>{u.active ? t("common.active") : t("common.disabled")}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="blue">{u.roleName}</Badge>
                {u.departmentName && <Badge>{u.departmentName}</Badge>}
              </div>
              <p className="mt-3 text-xs text-muted">{t("admin.lastLogin")}: {u.lastLogin ?? t("admin.never")}</p>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                <Button size="sm" variant="secondary" onClick={() => setMode(u.id)} disabled={pending}>
                  <Pencil className="size-3.5" /> {t("common.edit")}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => reset(u)} disabled={pending}>
                  <KeyRound className="size-3.5" /> {t("admin.resetPassword")}
                </Button>
                <Button size="sm" variant={u.active ? "ghost" : "secondary"} onClick={() => toggle(u)} disabled={pending}>
                  {u.active ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
                  {u.active ? t("admin.disable") : t("admin.enable")}
                </Button>
              </div>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
