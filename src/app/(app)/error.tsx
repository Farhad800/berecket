"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button, LinkButton } from "@/components/ui";

/** Friendly message instead of a blank page if something fails while loading. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations();
  useEffect(() => console.error(error), [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <AlertTriangle className="size-10 text-amber-500" aria-hidden />
      <h1 className="text-lg font-bold">{t("ui.errorTitle")}</h1>
      <p className="text-sm text-muted">{t("ui.errorBody")}</p>
      {error.digest && <p className="font-mono text-xs text-muted" dir="ltr">ref: {error.digest}</p>}
      <div className="flex gap-2">
        <Button onClick={reset}><RotateCcw className="size-4" /> {t("ui.tryAgain")}</Button>
        <LinkButton href="/dashboard" variant="secondary">{t("nav.dashboard")}</LinkButton>
      </div>
    </div>
  );
}
