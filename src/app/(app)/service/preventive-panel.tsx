"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarCheck, CheckCircle2, Plus, Power, Wrench } from "lucide-react";
import RecordForm from "@/components/record-form";
import type { ComboOption } from "@/components/combobox";
import { Alert, Badge, Button, Card, EmptyState } from "@/components/ui";
import { preventiveDoneAction, preventiveToRequestAction, savePreventiveAction, setPreventiveActiveAction } from "@/app/actions/service";

type Task = { id: string; title: string; target: string; every: number; active: boolean; last: string | null; next: string; state: "ok" | "soon" | "overdue" | "off" };

export default function PreventivePanel({
  tasks, machines, molds, canEdit, canDo, canRequest,
}: { tasks: Task[]; machines: ComboOption[]; molds: ComboOption[]; canEdit: boolean; canDo: boolean; canRequest: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tone = { ok: "green", soon: "amber", overdue: "red", off: "gray" } as const;

  const act = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, then?: (d: unknown) => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { setError(null); then?.(r.data); } else setError(r.error ?? null);
    });

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {canEdit && (adding ? (
        <Card>
          <h2 className="mb-3 font-semibold">{t("svc.newPreventive")}</h2>
          <RecordForm
            action={savePreventiveAction}
            onDone={() => setAdding(false)}
            fields={[
              { name: "title", label: t("svc.pmTitle"), required: true, wide: true, hint: t("svc.pmTitleHint") },
              { name: "machineId", label: t("sched.machine"), type: "combo", options: machines },
              { name: "moldId", label: t("sched.mold"), type: "combo", options: molds },
              { name: "intervalDays", label: t("svc.everyDays"), type: "number", required: true, min: 1, ltr: true },
              { name: "nextDueAt", label: t("svc.nextDue"), type: "date", required: true },
            ]}
          />
        </Card>
      ) : (
        <Button onClick={() => setAdding(true)}><Plus className="size-4" /> {t("svc.newPreventive")}</Button>
      ))}
      {tasks.length === 0 ? <EmptyState>{t("svc.noPreventive")}</EmptyState> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((x) => (
            <Card key={x.id} className={x.active ? "" : "opacity-60"}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{x.title}</p>
                  <p className="text-xs text-muted" dir="ltr">{x.target} · {t("svc.everyN", { n: x.every })}</p>
                </div>
                <Badge tone={tone[x.state]}>{t(`svc.pm.${x.state}`)}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-muted">{t("svc.nextDue")}</dt><dd className="font-semibold">{x.next}</dd></div>
                <div><dt className="text-muted">{t("svc.lastDone")}</dt><dd>{x.last ?? "—"}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                {canDo && x.active && <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => preventiveDoneAction(x.id))}><CheckCircle2 className="size-3.5" /> {t("svc.markDone")}</Button>}
                {canRequest && x.active && (
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => preventiveToRequestAction(x.id), (d) => router.push(`/service/requests/${(d as { id: string }).id}`))}>
                    <Wrench className="size-3.5" /> {t("svc.makeRequest")}
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setPreventiveActiveAction(x.id, !x.active))}>
                    {x.active ? <Power className="size-3.5" /> : <CalendarCheck className="size-3.5" />} {x.active ? t("svc.pause") : t("svc.enable")}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
