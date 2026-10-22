import { getTranslations } from "next-intl/server";
import { ShieldOff } from "lucide-react";
import { LinkButton, Logo } from "@/components/ui";

export const metadata = { title: "No access" };

export default async function ForbiddenPage() {
  const t = await getTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo size={80} />
      <ShieldOff className="size-8 text-muted" aria-hidden />
      <h1 className="text-xl font-bold">{t("auth.forbiddenTitle")}</h1>
      <p className="max-w-sm text-sm text-muted">{t("auth.forbiddenBody")}</p>
      <LinkButton href="/dashboard" variant="secondary">{t("nav.dashboard")}</LinkButton>
    </main>
  );
}
