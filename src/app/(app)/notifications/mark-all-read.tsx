"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCheck } from "lucide-react";
import { markReadAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui";

export default function MarkAllRead() {
  const t = useTranslations("notif");
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" disabled={pending} onClick={() => start(async () => { await markReadAction(); })}>
      <CheckCheck className="size-4" /> {t("markAll")}
    </Button>
  );
}
