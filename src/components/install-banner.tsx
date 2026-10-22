"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
const SEEN_KEY = "bfms-install-dismissed";

export default function InstallBanner() {
  const t = useTranslations("install");
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

    const standalone =
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    if (standalone || seen) return;

    const isIos =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIos(isIos);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BIPEvent);
      timer = setTimeout(() => setOpen(true), 2500);
    };
    const onInstalled = () => setOpen(false);
    addEventListener("beforeinstallprompt", onPrompt);
    addEventListener("appinstalled", onInstalled);
    if (isIos) timer = setTimeout(() => setOpen(true), 2500);
    return () => {
      removeEventListener("beforeinstallprompt", onPrompt);
      removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  };

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-labelledby="install-title"
      className="fixed inset-x-3 z-50 mx-auto flex print:hidden max-w-[520px] items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-xl"
      style={{ bottom: "calc(12px + env(safe-area-inset-bottom))" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="size-11 shrink-0 rounded-xl" />
      <p className="min-w-0 flex-1 text-sm">
        <b id="install-title" className="block">{t("title")}</b>
        <span className="text-muted">{ios ? t("ios") : t("other")}</span>
      </p>
      {prompt && !ios && (
        <button
          className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
            setOpen(false);
          }}
        >
          {t("button")}
        </button>
      )}
      <button aria-label="close" onClick={dismiss} className="rounded-lg p-2 text-muted hover:bg-surface-2">
        <X className="size-4" />
      </button>
    </div>
  );
}
