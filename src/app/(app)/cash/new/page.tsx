import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { can, pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listSafes } from "@/lib/cash";
import { PageHeader } from "@/components/ui";
import { catName } from "../types";
import CashForm, { type CashType } from "./cash-form";

export const metadata = { title: "Safe" };
const PERM = { IN: "cash:in", OUT: "cash:out", EXCHANGE: "cash:exchange", TRANSFER: "cash:transfer" } as const;

export default async function NewCashPage({ searchParams }: { searchParams: Promise<{ type?: string; safe?: string }> }) {
  const me = await pageUser("cash:view");
  const t = await getTranslations();
  const [cats, safes] = await Promise.all([db.expenseCategory.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } }), listSafes(true)]);
  // A transfer needs two safes.
  const allowed = (["IN", "OUT", "EXCHANGE", "TRANSFER"] as CashType[]).filter((k) => can(me, PERM[k]) && (k !== "TRANSFER" || safes.length > 1));
  if (allowed.length === 0) redirect("/forbidden");
  const sp = await searchParams;
  const type = allowed.includes(sp.type as CashType) ? (sp.type as CashType) : allowed[0];
  return (
    <>
      <Link href="/cash" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.cash")}</Link>
      <PageHeader title={t("cash.newTitle")} />
      <CashForm allowed={allowed} initialType={type} initialSafe={sp.safe ?? ""} safes={safes} categories={cats.map((c) => ({ id: c.id, name: catName(t, c) }))} />
    </>
  );
}
