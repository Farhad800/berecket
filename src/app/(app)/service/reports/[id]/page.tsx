import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/time";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import Attachments from "@/components/attachments";

export default async function ServiceReportPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageUser("service:view");
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const r = await db.serviceReport.findUnique({
    where: { id },
    include: {
      machine: true, mold: true, moldRemoved: true, moldInstalled: true,
      maintenanceRequest: { select: { id: true, number: true, title: true } },
    },
  });
  if (!r) notFound();
  const [users, files] = await Promise.all([
    db.user.findMany({ select: { id: true, fullName: true } }),
    db.attachment.findMany({ where: { entityType: "ServiceReport", entityId: id }, orderBy: { createdAt: "asc" } }),
  ]);
  const name = (uid: string) => users.find((u) => u.id === uid)?.fullName ?? "—";

  const rows: [string, React.ReactNode][] = [
    [t("svc.date"), `${formatDate(r.date, locale)} · ${t("sched.shift")} ${r.shift}`],
    [t("svc.technician"), name(r.technicianId)],
    [t("sched.machine"), <span key="m" dir="ltr">{r.machine.code} · {r.machine.name}</span>],
    [t("svc.moldOnMachine"), r.mold?.code ?? "—"],
    [t("svc.startTime"), formatDateTime(r.startTime, locale)],
    [t("svc.endTime"), formatDateTime(r.endTime, locale)],
    [t("svc.downtimeMinutes"), t("prod.minutes", { n: r.downtimeMinutes })],
    [t("svc.relatedRequest"), r.maintenanceRequest ? <Link key="r" href={`/service/requests/${r.maintenanceRequest.id}`} className="text-brand-600 hover:underline">{r.maintenanceRequest.number} · {r.maintenanceRequest.title}</Link> : "—"],
  ];
  const texts: [string, string | null][] = [
    [t("svc.workPerformed"), r.workPerformed],
    [t("svc.breakdown"), r.breakdown],
    [t("svc.spareParts"), r.spareParts],
    [t("svc.repairsCompleted"), r.repairsCompleted],
    [t("svc.outstanding"), r.outstandingWork],
    [t("svc.followUp"), r.followUp],
    [t("md.notes"), r.notes],
  ];

  return (
    <>
      <PageHeader title={r.number} subtitle={t("svc.reportSubtitle")} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {(r.moldRemoved || r.moldInstalled) && (
            <Alert tone="blue">
              <b>{t("svc.moldChange")}:</b> <span dir="ltr">{r.moldRemoved?.code ?? "—"} → {r.moldInstalled?.code ?? "—"}</span>
              {r.moldChangeReason && <> · {r.moldChangeReason}</>}
            </Alert>
          )}
          <Card>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
            </dl>
          </Card>
          <Card>
            <dl className="space-y-3 text-sm">
              {texts.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div>)}
            </dl>
            {r.outstandingWork && <Badge tone="amber" className="mt-3">{t("svc.hasOutstanding")}</Badge>}
          </Card>
        </div>
        <Card className="self-start">
          <h2 className="mb-3 font-semibold">{t("files.title")}</h2>
          <Attachments
            entityType="ServiceReport"
            entityId={r.id}
            canAdd={can(me, "service:create") || can(me, "service:edit")}
            files={files.map((f) => ({ id: f.id, filename: f.filename, mimeType: f.mimeType, when: formatDateTime(f.createdAt, locale), by: name(f.uploadedById) }))}
          />
        </Card>
      </div>
    </>
  );
}
