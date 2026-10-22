"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, PackageSearch, Play, RotateCcw, ShieldCheck, UserPlus, XCircle } from "lucide-react";
import { assignRequestAction, requestTransitionAction } from "@/app/actions/service";
import { Alert, Button, Card, Select, Textarea } from "@/components/ui";

type Act = "start" | "waitParts" | "complete" | "verify" | "reopen" | "cancel";
const NEEDS_TEXT: Act[] = ["complete", "reopen", "cancel"];

export default function RequestActions({
  id, allowed, technicians, assignedTo, canAssign,
}: { id: string; allowed: Act[]; technicians: { id: string; name: string }[]; assignedTo: string | null; canAssign: boolean }) {
  const t = useTranslations("svc");
  const [asking, setAsking] = useState<Act | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const icon = { start: Play, waitParts: PackageSearch, complete: CheckCircle2, verify: ShieldCheck, reopen: RotateCcw, cancel: XCircle };

  const go = (a: Act, note?: string) =>
    start(async () => {
      const r = await requestTransitionAction(id, a, note);
      setMsg(r.ok ? { ok: true, text: t(`done.${a}`) } : { ok: false, text: r.error });
      if (r.ok) { setAsking(null); setText(""); }
    });

  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
      {allowed.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allowed.map((a) => {
            const Icon = icon[a];
            return (
              <Button key={a} size="sm" variant={a === "complete" || a === "verify" || a === "start" ? "primary" : a === "cancel" ? "danger" : "secondary"} disabled={pending}
                onClick={() => (NEEDS_TEXT.includes(a) ? setAsking(a) : go(a))}>
                <Icon className="size-4" /> {t(`act.${a}`)}
              </Button>
            );
          })}
        </div>
      )}
      {asking && (
        <Card className="border-brand-300">
          <p className="mb-2 text-sm font-semibold">{t(`act.${asking}`)}</p>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={asking === "complete" ? t("resolutionPlaceholder") : t("reasonPlaceholder")} autoFocus />
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={pending || text.trim().length < 3} onClick={() => go(asking, text)}>{t("act.confirm")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>✕</Button>
          </div>
        </Card>
      )}
      {canAssign && (
        <label className="flex items-center gap-2 text-sm">
          <UserPlus className="size-4 text-muted" />
          <Select
            aria-label={t("assignedTo")}
            defaultValue={assignedTo ?? ""}
            disabled={pending}
            onChange={(e) => e.target.value && start(async () => {
              const r = await assignRequestAction(id, e.target.value);
              setMsg(r.ok ? { ok: true, text: t("assigned") } : { ok: false, text: r.error });
            })}
            className="min-h-10"
          >
            <option value="" disabled>{t("assignTo")}</option>
            {technicians.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </label>
      )}
    </div>
  );
}
