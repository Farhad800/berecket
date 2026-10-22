import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { LinkButton, Logo } from "@/components/ui";

export const metadata = { title: "Not found" };

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo size={80} />
      <SearchX className="size-8 text-muted" aria-hidden />
      <h1 className="text-xl font-bold">{t("ui.notFoundTitle")}</h1>
      <p className="max-w-sm text-sm text-muted">{t("ui.notFoundBody")}</p>
      <div className="flex gap-2">
        <LinkButton href="/dashboard">{t("nav.dashboard")}</LinkButton>
        <LinkButton href="/search" variant="secondary">{t("search.title")}</LinkButton>
      </div>
    </main>
  );
}
