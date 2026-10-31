import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { todayYmd } from "@/lib/production";
import NewWorker from "./new-worker";

export const metadata = { title: "New employee" };

export default async function NewWorkerPage() {
  const me = await pageUser("workers:manage");
  const t = await getTranslations();
  return (
    <>
      <Link href="/workers" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.workers")}</Link>
      <PageHeader title={t("wk.add")} subtitle={t("wk.addIntro")} />
      <NewWorker today={todayYmd()} canSalary={can(me, "workers:salary")} />
    </>
  );
}
