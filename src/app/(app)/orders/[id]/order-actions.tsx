"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, RotateCcw, XCircle, Trash2 } from "lucide-react";
import { deleteOrderAction, orderTransitionAction } from "@/app/actions/orders";
import { Alert, Button, Card, Input } from "@/components/ui";

type Act = "complete" | "cancel" | "reopen" | "delete";
const NEEDS_REASON: Act[] = ["cancel", "reopen", "delete"];

export default function OrderActions({ orderId, allowed }: { orderId: string; allowed: Act[] }) {
  const t = useTranslations("order");
  const [asking, setAsking] = useState<Act | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const go = (a: Act, why?: string) =>
    start(async () => {
      const res = a === "delete" ? await deleteOrderAction(orderId, why) : await orderTransitionAction(orderId, a, why);
      if (res.ok) { setAsking(null); setReason(""); setError(null); }
      else setError(res.error);
    });

  if (allowed.length === 0) return null;
  const icon = { complete: CheckCircle2, cancel: XCircle, reopen: RotateCcw, delete: Trash2 };

  return (
    <div className="space-y-2">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {allowed.map((a) => {
          const Icon = icon[a];
          return (
            <Button
              key={a}
              size="sm"
              variant={a === "complete" ? "primary" : a === "delete" ? "danger" : "secondary"}
              disabled={pending}
              onClick={() => (NEEDS_REASON.includes(a) ? setAsking(a) : go(a))}
            >
              <Icon className="size-4" /> {t(`act.${a}`)}
            </Button>
          );
        })}
      </div>
      {asking && (
        <Card className="border-amber-300 dark:border-amber-800">
          <p className="mb-2 text-sm font-semibold">{t(`act.${asking}`)}</p>
          <p className="mb-2 text-xs text-muted">{t(`act.${asking}Help`)}</p>
          <div className="flex flex-wrap gap-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} className="flex-1" autoFocus />
            <Button size="sm" disabled={pending || reason.trim().length < 3} onClick={() => go(asking, reason)} variant={asking === "cancel" || asking === "delete" ? "danger" : "primary"}>
              {t("act.confirmAction")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>✕</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
