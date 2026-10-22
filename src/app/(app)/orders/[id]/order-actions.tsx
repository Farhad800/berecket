"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Pause, Play, XCircle, PackageCheck } from "lucide-react";
import { orderTransitionAction } from "@/app/actions/orders";
import { Alert, Button, Card, Input } from "@/components/ui";

type Act = "confirm" | "hold" | "resume" | "cancel" | "close";
const NEEDS_REASON: Act[] = ["hold", "cancel", "close"];

export default function OrderActions({ orderId, allowed }: { orderId: string; allowed: Act[] }) {
  const t = useTranslations("order");
  const [asking, setAsking] = useState<Act | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const go = (a: Act, why?: string) =>
    start(async () => {
      const res = await orderTransitionAction(orderId, a, why);
      if (res.ok) { setAsking(null); setReason(""); setError(null); }
      else setError(res.error);
    });

  if (allowed.length === 0) return null;
  const icon = { confirm: CheckCircle2, hold: Pause, resume: Play, cancel: XCircle, close: PackageCheck };

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
              variant={a === "confirm" || a === "resume" ? "primary" : a === "cancel" ? "danger" : "secondary"}
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
            <Button size="sm" disabled={pending || reason.trim().length < 3} onClick={() => go(asking, reason)} variant={asking === "cancel" ? "danger" : "primary"}>
              {t("act.confirmAction")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>✕</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
