import { getTranslations } from "next-intl/server";
import { Construction } from "lucide-react";
import { PageHeader, EmptyState } from "./ui";

/** Honest placeholder for modules scheduled in a later build stage — no fake data, no dead buttons. */
export default async function StagePlaceholder({ titleKey, stage }: { titleKey: string; stage: number }) {
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t(`nav.${titleKey}`)} />
      <EmptyState>
        <Construction className="mx-auto mb-2 size-6" aria-hidden />
        {t("common.notAvailableYet")} <span dir="ltr">(Stage {stage})</span>
      </EmptyState>
    </>
  );
}
