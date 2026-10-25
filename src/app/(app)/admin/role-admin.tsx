"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Lock, Plus, Trash2 } from "lucide-react";
import { createRoleAction, deleteRoleAction, saveRolePermissionsAction } from "@/app/actions/admin";
import { Alert, Badge, Button, Card, Field, Input, cn } from "@/components/ui";

type RoleRow = { id: string; name: string; description: string | null; isSystem: boolean; userCount: number; permissions: string[] };
type MatrixRow = { resource: string; actions: string[] };
const ALL_ACTIONS = ["view", "create", "edit", "approve", "export", "archive", "manage", "input", "output", "buy", "sell", "in", "out", "exchange"];

export default function RoleAdmin({ roles, matrix }: { roles: RoleRow[]; matrix: MatrixRow[] }) {
  const t = useTranslations();
  const [selected, setSelected] = useState(roles[0]?.id);
  const role = roles.find((r) => r.id === selected);
  const [checked, setChecked] = useState<Set<string>>(new Set(role?.permissions));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [showNew, setShowNew] = useState(false);

  const pick = (r: RoleRow) => {
    setSelected(r.id);
    setChecked(new Set(r.permissions));
    setMsg(null);
  };
  const flip = (p: string) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  const dirty = role && (checked.size !== role.permissions.length || role.permissions.some((p) => !checked.has(p)));

  const [newState, newAction, newPending] = useActionState(async (prev: unknown, fd: FormData) => {
    const res = await createRoleAction(prev, fd);
    if (res.ok) setShowNew(false);
    return res;
  }, null);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="space-y-2">
        {roles.map((r) => (
          <button
            key={r.id}
            onClick={() => pick(r)}
            className={cn(
              "w-full rounded-xl border p-3 text-start transition",
              r.id === selected ? "border-brand-500 bg-brand-50 dark:bg-brand-900" : "border-line bg-surface hover:border-brand-300",
            )}
          >
            <span className="flex items-center gap-2 font-semibold">
              {r.isSystem && <Lock className="size-3.5 text-muted" aria-label={t("admin.systemRole")} />}
              {r.name}
            </span>
            <span className="text-xs text-muted">{r.userCount} {t("admin.users")} · {r.permissions.length} {t("admin.permissions").toLowerCase()}</span>
          </button>
        ))}
        {showNew ? (
          <Card>
            <form action={newAction} className="space-y-3">
              {newState && !newState.ok && <Alert>{newState.error}</Alert>}
              <Field label={t("admin.roleName")} name="name"><Input name="name" required /></Field>
              <Field label={t("admin.description")} name="description"><Input name="description" /></Field>
              <div className="flex gap-2">
                <Button size="sm" disabled={newPending}>{t("common.create")}</Button>
                <Button size="sm" type="button" variant="ghost" onClick={() => setShowNew(false)}>{t("common.cancel")}</Button>
              </div>
            </form>
          </Card>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setShowNew(true)}>
            <Plus className="size-4" /> {t("admin.newRole")}
          </Button>
        )}
      </div>

      {role && (
        <Card className="p-0 sm:p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
            <div>
              <h2 className="font-semibold">{role.name}</h2>
              {role.description && <p className="text-sm text-muted">{role.description}</p>}
            </div>
            <div className="flex gap-2">
              {!role.isSystem && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      if (!confirm(`Delete ${role.name}?`)) return;
                      const res = await deleteRoleAction(role.id);
                      setMsg(res.ok ? null : { ok: false, text: res.error });
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
              <Button
                size="sm"
                disabled={!dirty || pending}
                onClick={() =>
                  start(async () => {
                    const res = await saveRolePermissionsAction(role.id, [...checked]);
                    setMsg(res.ok ? { ok: true, text: t("common.saved") } : { ok: false, text: res.error });
                  })
                }
              >
                {pending ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </div>
          {msg && <div className="p-4 pb-0"><Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert></div>}
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="sticky start-0 bg-surface px-4 py-2 text-start">{t("admin.permissions")}</th>
                  {ALL_ACTIONS.map((a) => <th key={a} className="px-2 py-2 text-center font-medium">{t(`perm.actions.${a}`)}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {matrix.map((m) => (
                  <tr key={m.resource}>
                    <td className="sticky start-0 bg-surface px-4 py-2 font-medium whitespace-nowrap">{t(`perm.resources.${m.resource}`)}</td>
                    {ALL_ACTIONS.map((a) => {
                      const p = `${m.resource}:${a}`;
                      return (
                        <td key={a} className="px-2 py-2 text-center">
                          {m.actions.includes(a) ? (
                            <input
                              type="checkbox"
                              aria-label={`${m.resource} ${a}`}
                              checked={checked.has(p)}
                              onChange={() => flip(p)}
                              className="size-5 accent-brand-600"
                            />
                          ) : (
                            <span className="text-line">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line p-4 text-xs text-muted">
            <Badge tone="amber">!</Badge> Changes apply on each employee&apos;s next click — permissions are checked on the server every time.
          </p>
        </Card>
      )}
    </div>
  );
}
