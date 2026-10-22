import { getTranslations } from "next-intl/server";
import { WifiOff } from "lucide-react";
import { LinkButton, Logo } from "@/components/ui";

export const metadata = { title: "Offline" };

export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo size={96} />
      <WifiOff className="size-8 text-muted" aria-hidden />
      <h1 className="text-xl font-bold">{t("title")}</h1>
      <p className="max-w-sm text-sm text-muted">{t("body")}</p>
      <LinkButton href="/dashboard">{t("retry")}</LinkButton>
    </main>
  );
}
