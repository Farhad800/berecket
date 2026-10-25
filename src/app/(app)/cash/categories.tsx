"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Alert, Badge, Button, Card, Input } from "@/components/ui";
import { addCategoryAction, archiveCategoryAction } from "@/app/actions/cash";

/** Expense categories: add new ones, hide ones no longer used. */
export default function Categories({ rows }: { rows: { id: string; name: string; archived: boolean; used: number }[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }>) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error ?? null : r.error ?? null); return; }
    setName(""); router.refresh();
  });
  return (
    <Card>
      <form onSubmit={(e) => { e.preventDefault(); act(() => addCategoryAction({ name })); }} className="flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("cash.newCategory")} aria-label={t("cash.newCategory")} className="max-w-sm" />
        <Button type="submit" disabled={pending || name.trim().length < 2}><Plus className="size-4" /> {t("cash.addCategory")}</Button>
      </form>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
      <ul className="mt-3 divide-y divide-line">
        {rows.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2">
            <span className={c.archived ? "text-muted line-through" : ""}>{c.name} <span className="text-xs text-muted">· {t("cash.usedN", { n: c.used })}</span></span>
            <span className="flex items-center gap-2">
              {c.archived && <Badge>{t("common.archived")}</Badge>}
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => archiveCategoryAction({ id: c.id, archived: !c.archived }))}>{c.archived ? t("cash.restore") : t("cash.hide")}</Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
