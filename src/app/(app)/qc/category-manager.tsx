"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import RecordForm from "@/components/record-form";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { saveDefectCategoryAction, toggleDefectCategoryAction } from "@/app/actions/qc";

type Cat = { id: string; code: string; name: string; active: boolean; uses: number };

export default function CategoryManager({ categories }: { categories: Cat[] }) {
  const t = useTranslations();
  const [mode, setMode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t("qc.categoriesHelp")}</p>
      {error && <Alert>{error}</Alert>}
      {mode === "new" ? (
        <Card>
          <RecordForm action={saveDefectCategoryAction} onDone={() => setMode(null)} fields={[
            { name: "code", label: t("md.code"), required: true, ltr: true, hint: "WARP, BURN…" },
            { name: "name", label: t("qc.categoryName"), required: true },
          ]} />
        </Card>
      ) : (
        <Button onClick={() => setMode("new")}><Plus className="size-4" /> {t("qc.newCategory")}</Button>
      )}
      <Card className="p-0 sm:p-0">
        <ul className="divide-y divide-line">
          {categories.map((c) =>
            mode === c.id ? (
              <li key={c.id} className="p-4">
                <RecordForm action={saveDefectCategoryAction} onDone={() => setMode(null)} hidden={{ id: c.id, code: c.code }} initial={{ name: c.name }} fields={[{ name: "name", label: t("qc.categoryName"), required: true }]} />
              </li>
            ) : (
              <li key={c.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${c.active ? "" : "opacity-60"}`}>
                <span><b>{c.name}</b> <span className="text-xs text-muted" dir="ltr">{c.code}</span> {c.uses > 0 && <Badge className="ms-1">{c.uses}</Badge>}</span>
                <span className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setMode(c.id)}>{t("common.edit")}</Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await toggleDefectCategoryAction(c.id, !c.active); setError(r.ok ? null : r.error); })}>
                    {c.active ? t("admin.disable") : t("admin.enable")}
                  </Button>
                </span>
              </li>
            ),
          )}
        </ul>
      </Card>
    </div>
  );
}
