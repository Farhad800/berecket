import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { FileSpreadsheet } from "lucide-react";
import { LinkButton, PageHeader, cn, type Tone } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import MasterList from "@/components/master-list";
import { saveMachineAction, saveMoldAction } from "@/app/actions/masterdata";

export const metadata = { title: "Machines & Molds" };

const MACHINE_TONE: Record<string, Tone> = { AVAILABLE: "green", RUNNING: "blue", DOWN: "red", MAINTENANCE: "amber", RETIRED: "gray" };
const MOLD_TONE: Record<string, Tone> = { AVAILABLE: "green", IN_USE: "blue", IN_REPAIR: "amber", RETIRED: "gray" };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; archived?: string; status?: string }> }) {
  const me = await pageUser("assets:view");
  const t = await getTranslations();
  const sp = await searchParams;
  const tab = sp.tab === "molds" ? "molds" : "machines";
  const q = sp.q?.trim();
  const archived = sp.archived === "1" ? { not: null } : null;
  const canImport = can(me, "assets:create") || can(me, "products:create");
  const perms = { canCreate: can(me, "assets:create"), canEdit: can(me, "assets:edit"), canArchive: can(me, "assets:archive") };

  const tabs = (
    <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
      {(["machines", "molds"] as const).map((k) => (
        <Link
          key={k}
          href={`/assets?tab=${k}`}
          role="tab"
          aria-selected={tab === k}
          className={cn(
            "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold",
            tab === k ? "border-brand-600 text-brand-700 dark:text-brand-200" : "border-transparent text-muted",
          )}
        >
          {t(`md.${k}`)}
        </Link>
      ))}
    </div>
  );

  if (tab === "machines") {
    const statusFilter =
      sp.status === "down" ? { in: ["DOWN", "MAINTENANCE"] as const } : sp.status ? { equals: sp.status as never } : undefined;
    const where: Prisma.MachineWhereInput = {
      archivedAt: archived,
      ...(statusFilter ? { status: statusFilter as never } : {}),
      ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    };
    const machines = await db.machine.findMany({
      where,
      orderBy: { code: "asc" },
      include: {
        molds: { where: { archivedAt: null }, select: { code: true } },
        maintenance: { where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_PARTS"] } }, select: { id: true } },
      },
    });
    const statuses = ["AVAILABLE", "RUNNING", "DOWN", "MAINTENANCE", "RETIRED"];
    const fields = [
      { name: "code", label: t("md.machineCode"), required: true, ltr: true, hint: "M-01" },
      { name: "name", label: t("md.machineName"), required: true },
      { name: "manufacturer", label: t("md.manufacturer") },
      { name: "model", label: t("md.model"), ltr: true },
      { name: "tonnage", label: t("md.tonnage"), type: "number" as const, min: 0, ltr: true },
      { name: "status", label: t("common.status"), type: "select" as const, required: true, options: statuses.map((s) => ({ value: s, label: t(`status.machine.${s}`) })) },
      { name: "notes", label: t("md.notes"), type: "textarea" as const },
    ];
    return (
      <>
        <PageHeader title={t("nav.assets")} subtitle={`${machines.length}`} actions={canImport ? <LinkButton href="/import" variant="secondary"><FileSpreadsheet className="size-4" /> {t("imp.button")}</LinkButton> : undefined} />
        {tabs}
        <ListToolbar
          filters={[
            { name: "status", label: t("common.status"), options: statuses.map((s) => ({ value: s, label: t(`status.machine.${s}`) })) },
            { name: "archived", label: t("common.active"), options: [{ value: "1", label: t("common.archived") }] },
          ]}
        />
        <MasterList
          kind="machine"
          newLabel={t("md.newMachine")}
          fields={fields}
          action={saveMachineAction}
          {...perms}
          rows={machines.map((m) => ({
            id: m.id,
            title: `${m.code} · ${m.name}`,
            archived: !!m.archivedAt,
            subtitle: m.notes ?? undefined,
            badges: [
              { label: t(`status.machine.${m.status}`), tone: MACHINE_TONE[m.status] },
              ...(m.maintenance.length ? [{ label: t("md.openMaintenance", { n: m.maintenance.length }), tone: "amber" as const }] : []),
            ],
            facts: [
              ...(m.manufacturer || m.model ? [{ label: t("md.model"), value: [m.manufacturer, m.model].filter(Boolean).join(" ") }] : []),
              ...(m.tonnage ? [{ label: t("md.tonnage"), value: `${m.tonnage} t` }] : []),
              ...(m.molds.length ? [{ label: t("md.moldsMounted"), value: m.molds.map((x) => x.code).join(", ") }] : []),
            ],
            initial: { ...m, tonnage: m.tonnage ?? "" },
          }))}
        />
      </>
    );
  }

  const canAddLabels = can(me, "products:create");
  const [molds, machines] = await Promise.all([
    db.mold.findMany({
      where: {
        archivedAt: archived,
        ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: { code: "asc" },
      include: { _count: { select: { products: { where: { archivedAt: null } } } }, currentMachine: { select: { code: true } } },
    }),
    db.machine.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  const statuses = ["AVAILABLE", "IN_USE", "IN_REPAIR", "RETIRED"];
  const fields = [
    { name: "code", label: t("md.moldCode"), required: true, ltr: true },
    { name: "name", label: t("md.moldName"), required: true },
    { name: "cavities", label: t("md.cavities"), type: "number" as const, required: true, min: 1, ltr: true },
    { name: "currentMachineId", label: t("md.currentMachine"), type: "combo" as const, options: machines.map((m) => ({ value: m.id, label: m.code, hint: m.name })) },
    { name: "status", label: t("common.status"), type: "select" as const, required: true, options: statuses.map((s) => ({ value: s, label: t(`status.mold.${s}`) })) },
    { name: "notes", label: t("md.notes"), type: "textarea" as const },
  ];
  return (
    <>
      <PageHeader title={t("nav.assets")} subtitle={`${molds.length}`} actions={canImport ? <LinkButton href="/import" variant="secondary"><FileSpreadsheet className="size-4" /> {t("imp.button")}</LinkButton> : undefined} />
      {tabs}
      <ListToolbar filters={[{ name: "archived", label: t("common.active"), options: [{ value: "1", label: t("common.archived") }] }]} />
      <MasterList
        kind="mold"
        newLabel={t("md.newMold")}
        fields={fields}
        action={saveMoldAction}
        {...perms}
        rows={molds.map((m) => ({
          id: m.id,
          title: `${m.code} · ${m.name}`,
          archived: !!m.archivedAt,
          subtitle: m.notes ?? undefined,
          badges: [{ label: t(`status.mold.${m.status}`), tone: MOLD_TONE[m.status] }],
          facts: [
            { label: t("md.cavities"), value: String(m.cavities) },
            { label: t("md.labels"), value: m._count.products.toLocaleString("en") },
            ...(m.currentMachine ? [{ label: t("md.currentMachine"), value: m.currentMachine.code }] : []),
            { label: t("md.shots"), value: m.shotCount.toLocaleString("en") },
          ],
          links: [
            { href: `/products?mold=${m.id}`, label: t("md.viewLabels") },
            ...(canAddLabels ? [{ href: `/assets/molds/${m.id}/labels`, label: t("md.addLabels") }] : []),
          ],
          initial: { ...m },
        }))}
      />
    </>
  );
}
