"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BellOff, BellRing, Send } from "lucide-react";
import { Alert, Badge, Button } from "@/components/ui";
import { testPushAction } from "@/app/actions/push";
import { currentState, getEndpoint, turnOff, turnOn, type PushState } from "./client";

/** "This device" card on the Notifications page: on/off, test, and help when blocked. */
export default function PushSettings({ publicKey, devices }: { publicKey: string | null; devices: number }) {
  const t = useTranslations("push");
  const [state, setState] = useState<PushState>("loading");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { currentState().then(setState); }, []);

  const on = async () => {
    if (!publicKey) return;
    setBusy(true); setMsg(null);
    const r = await turnOn(publicKey).catch((e: Error) => ({ ok: false, error: `${t("failed")}${e?.message ? ` (${e.message})` : ""}` }));
    const s = await currentState();
    setState(s); setBusy(false);
    if (r.ok) setMsg({ ok: true, text: t("nowOn") });
    else if (s !== "denied") setMsg({ ok: false, text: r.error === "dismissed" ? t("dismissed") : (r.error ?? t("failed")) });
  };
  const off = async () => { setBusy(true); await turnOff(); setState(await currentState()); setBusy(false); setMsg(null); };
  const test = async () => {
    setBusy(true);
    const ep = await getEndpoint();
    const r = ep ? await testPushAction(ep, t("testTitle"), t("testBody")) : { ok: false as const, error: t("failed") };
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: t("testSent") } : { ok: false, text: r.error });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            {t("thisDevice")}
            {state === "on" ? <Badge tone="green">{t("on")}</Badge> : state !== "loading" && <Badge tone="gray">{t("off")}</Badge>}
          </p>
          <p className="text-sm text-muted">{t("explain")}{devices > 0 && ` ${t("devicesN", { n: devices })}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state === "off" && publicKey && <Button onClick={on} disabled={busy}><BellRing className="size-4" /> {t("turnOn")}</Button>}
          {state === "on" && <Button variant="secondary" onClick={test} disabled={busy}><Send className="size-4" /> {t("test")}</Button>}
          {state === "on" && <Button variant="ghost" onClick={off} disabled={busy}><BellOff className="size-4" /> {t("turnOff")}</Button>}
        </div>
      </div>
      {!publicKey && <Alert tone="amber">{t("notConfigured")}</Alert>}
      {state === "denied" && <Alert tone="amber">{t("blocked")}</Alert>}
      {state === "ios-install" && <Alert tone="blue">{t("iosInstall")}</Alert>}
      {state === "unsupported" && <Alert tone="amber">{t("unsupported")}</Alert>}
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
    </div>
  );
}
