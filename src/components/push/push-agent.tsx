"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui";
import { currentState, subscribe, turnOn, type PushState } from "./client";

const DISMISS_KEY = "bfms-push-dismissed";

/**
 * Runs on every page: keeps this device's subscription linked to the signed-in employee,
 * refreshes the bell when a push arrives, sets the app icon badge, and once asks to turn
 * notifications on.
 */
export default function PushAgent({ publicKey, unread }: { publicKey: string | null; unread: number }) {
  const t = useTranslations("push");
  const router = useRouter();
  const [state, setState] = useState<PushState>("loading");
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!publicKey) return;
    let alive = true;
    currentState().then(async (s) => {
      if (!alive) return;
      setState(s);
      // Already allowed: make sure the server knows this device belongs to whoever is signed in now.
      if (Notification?.permission === "granted") await subscribe(publicKey).catch(() => {});
      let dismissed = false;
      try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch {}
      if ((s === "off" || s === "ios-install") && !dismissed) setTimeout(() => alive && setAsk(true), 4000);
    });
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "push") router.refresh();
      if (e.data?.type === "resubscribe") subscribe(publicKey).catch(() => {});
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => { alive = false; navigator.serviceWorker?.removeEventListener("message", onMsg); };
  }, [publicKey, router]);

  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread > 0) nav.setAppBadge?.(unread).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [unread]);

  const dismiss = () => {
    setAsk(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
  };
  const enable = async () => {
    if (!publicKey) return;
    setBusy(true);
    const r = await turnOn(publicKey).catch(() => ({ ok: false }));
    if (!r.ok) location.assign("/notifications"); // the device card there explains what to do
    setBusy(false);
    setState(r.ok ? "on" : await currentState());
    setAsk(false);
    if (!r.ok) try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
  };

  if (!ask || !publicKey || state === "on") return null;
  return (
    <div role="dialog" aria-label={t("askTitle")} className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-line bg-surface p-4 shadow-xl sm:inset-x-auto sm:end-6 sm:bottom-6" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900 dark:text-brand-200"><BellRing className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t("askTitle")}</p>
          <p className="mt-0.5 text-sm text-muted">{state === "ios-install" ? t("iosInstall") : t("askBody")}</p>
          {state !== "ios-install" && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={enable} disabled={busy}>{t("turnOn")}</Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>{t("later")}</Button>
            </div>
          )}
        </div>
        <button onClick={dismiss} aria-label={t("later")} className="rounded-md p-1 text-muted hover:text-ink"><X className="size-4" /></button>
      </div>
    </div>
  );
}
