"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import RecordForm, { type FieldDef } from "./record-form";
import { setArchivedAction } from "@/app/actions/masterdata";
import { Alert, Badge, Button, Card, EmptyState, type Tone } from "./ui";

export type MasterRow = {
  id: string;
  title: string;
  code?: string;
  subtitle?: string;
  badges?: { label: string; tone?: Tone }[];
  facts?: { label: string; value: string }[];
  archived?: boolean;
  initial: Record<string, unknown>;
};

type Result = { ok: boolean; error?: string; fieldErrors?: Record<string, string> };

export default function MasterList({
  kind,
  rows,
  fields,
  editFields,
  action,
  canCreate,
  canEdit,
  canArchive,
  newLabel,
}: {
  kind: "customer" | "product" | "machine" | "mold";
  rows: MasterRow[];
  fields: FieldDef[];
  editFields?: FieldDef[];
  action: (prev: unknown, fd: FormData) => Promise<Result>;
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  newLabel: string;
}) {
  const t = useTranslations("common");
  const [mode, setMode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggleArchive = (r: MasterRow) =>
    start(async () => {
      const res = await setArchivedAction(kind, r.id, !r.archived);
      setError(res.ok ? null : res.error);
    });

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {canCreate &&
        (mode === "new" ? (
          <Card>
            <h2 className="mb-3 font-semibold">{newLabel}</h2>
            <RecordForm fields={fields} action={action} onDone={() => setMode(null)} />
          </Card>
        ) : (
          <Button onClick={() => setMode("new")}><Plus className="size-4" /> {newLabel}</Button>
        ))}

      {rows.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) =>
            mode === r.id ? (
              <Card key={r.id} className="md:col-span-2 xl:col-span-3">
                <RecordForm fields={editFields ?? fields} action={action} initial={r.initial} hidden={{ id: r.id }} onDone={() => setMode(null)} />
              </Card>
            ) : (
              <Card key={r.id} className={r.archived ? "opacity-60" : ""}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.title}</p>
                    {r.code && <p className="text-xs text-muted" dir="ltr">{r.code}</p>}
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {r.badges?.map((b) => <Badge key={b.label} tone={b.tone}>{b.label}</Badge>)}
                  </div>
                </div>
                {r.subtitle && <p className="mt-2 line-clamp-2 text-sm text-muted">{r.subtitle}</p>}
                {r.facts && r.facts.length > 0 && (
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {r.facts.map((f) => (
                      <div key={f.label} className="min-w-0">
                        <dt className="text-muted">{f.label}</dt>
                        <dd className="truncate font-medium">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {(canEdit || canArchive) && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                    {canEdit && !r.archived && (
                      <Button size="sm" variant="secondary" onClick={() => setMode(r.id)} disabled={pending}>
                        <Pencil className="size-3.5" /> {t("edit")}
                      </Button>
                    )}
                    {canArchive && (
                      <Button size="sm" variant="ghost" onClick={() => toggleArchive(r)} disabled={pending}>
                        {r.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                        {r.archived ? t("restore") : t("archive")}
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            ),
          )}
        </div>
      )}
    </div>
  );
}
