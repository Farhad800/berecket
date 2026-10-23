"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RotateCcw, Send, ShieldCheck, Wrench } from "lucide-react";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, Card, Input, Textarea } from "@/components/ui";
import { addCorrectiveActionAction, issueToMaintenanceAction, issueTransitionAction } from "@/app/actions/qc";

export default function IssueConsole({
  issueId, status, canAct, canVerify, canMaint, hasMaint, machines,
}: { issueId: string; status: string; canAct: boolean; canVerify: boolean; canMaint: boolean; hasMaint: boolean; machines: { id: string; code: string }[] }) {
  const t = useTranslations("qc");
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [machine, setMachine] = useState("");
  const add = useFormAction(addCorrectiveActionAction, { resetOnSuccess: true, onSuccess: () => setMsg({ ok: true, text: t("actionSaved") }) });
  const resolved = status === "RESOLVED";

  const go = (a: "submit" | "resolve" | "reopen", note?: string) =>
    start(async () => {
      const r = await issueTransitionAction(issueId, a, note);
      setMsg(r.ok ? { ok: true, text: t(`issueDone.${a}`) } : { ok: false, text: r.error });
      if (r.ok) setReason("");
    });

  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
      {canAct && !resolved && (
        <Card>
          <h3 className="mb-2 font-semibold">{t("addAction")}</h3>
          <form onSubmit={add.onSubmit} className="space-y-2">
            <input type="hidden" name="issueId" value={issueId} />
            {add.error && <Alert>{add.error}</Alert>}
            <Textarea name="description" rows={3} required minLength={3} placeholder={t("actionPlaceholder")} />
            <Button type="submit" size="sm" disabled={add.pending}>{t("saveAction")}</Button>
          </form>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        {canAct && ["OPEN", "IN_PROGRESS", "REOPENED"].includes(status) && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => go("submit")}><Send className="size-4" /> {t("submit")}</Button>
        )}
        {canVerify && ["AWAITING_VERIFICATION", "IN_PROGRESS"].includes(status) && (
          <Button size="sm" disabled={pending} onClick={() => go("resolve")}><ShieldCheck className="size-4" /> {t("resolve")}</Button>
        )}
        {canMaint && !hasMaint && !resolved && (
          <span className="flex flex-wrap items-center gap-2">
            <select value={machine} onChange={(e) => setMachine(e.target.value)} aria-label={t("whichMachine")} className="min-h-9 rounded-lg border border-line bg-surface px-2 text-xs">
              <option value="">{t("whichMachine")}</option>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}
            </select>
            <Button size="sm" variant="secondary" disabled={pending || !machine} onClick={() => start(async () => {
              const r = await issueToMaintenanceAction(issueId, machine);
              if (r.ok) router.push(`/service/requests/${(r.data as { id: string }).id}`); else setMsg({ ok: false, text: r.error });
            })}>
              <Wrench className="size-4" /> {t("toMaintenance")}
            </Button>
          </span>
        )}
      </div>
      {canVerify && ["RESOLVED", "AWAITING_VERIFICATION"].includes(status) && (
        <div className="flex gap-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reopenReason")} className="flex-1" />
          <Button size="sm" variant="ghost" disabled={pending || reason.trim().length < 3} onClick={() => go("reopen", reason)}><RotateCcw className="size-4" /> {t("reopen")}</Button>
        </div>
      )}
    </div>
  );
}
