import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Wrench } from "lucide-react";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { MAINT_TONE } from "@/lib/tones";
import { Alert, Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import Comments from "@/components/comments";
import Attachments from "@/components/attachments";
import RequestActions from "./request-actions";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageUser("maintenance:view");
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const r = await db.maintenanceRequest.findUnique({
    where: { id },
    include: {
      machine: true,
      mold: true,
      serviceReports: { orderBy: { startTime: "desc" }, select: { id: true, number: true, startTime: true, workPerformed: true, technicianId: true } },
    },
  });
  if (!r) notFound();

  const [users, comments, files, history] = await Promise.all([
    db.user.findMany({ select: { id: true, fullName: true, active: true, role: { select: { permissions: { where: { permission: "maintenance:edit" }, select: { permission: true } } } } } }),
    db.comment.findMany({ where: { entityType: "MaintenanceRequest", entityId: id }, orderBy: { createdAt: "asc" } }),
    db.attachment.findMany({ where: { entityType: "MaintenanceRequest", entityId: id }, orderBy: { createdAt: "asc" } }),
    db.auditLog.findMany({ where: { entityType: "MaintenanceRequest", entityId: id }, orderBy: { createdAt: "desc" }, include: { user: { select: { fullName: true } } } }),
  ]);
  const name = (uid: string | null) => users.find((u) => u.id === uid)?.fullName ?? "—";
  const technicians = users.filter((u) => u.active && u.role.permissions.length > 0).map((u) => ({ id: u.id, name: u.fullName }));

  const allowed: ("start" | "waitParts" | "complete" | "verify" | "reopen" | "cancel")[] = [];
  if (can(me, "maintenance:edit")) {
    if (["OPEN", "WAITING_PARTS"].includes(r.status)) allowed.push("start");
    if (r.status === "IN_PROGRESS") allowed.push("waitParts");
    if (["OPEN", "IN_PROGRESS", "WAITING_PARTS"].includes(r.status)) allowed.push("complete");
    if (r.status === "OPEN") allowed.push("cancel");
  }
  if (can(me, "maintenance:approve")) {
    if (r.status === "COMPLETED") allowed.push("verify");
    if (["COMPLETED", "VERIFIED"].includes(r.status)) allowed.push("reopen");
  }

  return (
    <>
      <PageHeader
        title={r.number}
        subtitle={r.title}
        actions={can(me, "service:create") && ["OPEN", "IN_PROGRESS", "WAITING_PARTS"].includes(r.status) && (
          <LinkButton href={`/service/reports/new?request=${r.id}&machine=${r.machineId}`}><Wrench className="size-4" /> {t("svc.newReport")}</LinkButton>
        )}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={MAINT_TONE[r.status]}>{t(`status.maint.${r.status}`)}</Badge>
              <Badge tone={r.priority === "URGENT" ? "red" : r.priority === "HIGH" ? "amber" : "gray"}>{t(`status.priority.${r.priority}`)}</Badge>
              {r.machineDown && <Badge tone="red">{t("svc.machineDown")}</Badge>}
              {r.isPreventive && <Badge tone="purple">{t("svc.preventive")}</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Fact label={t("sched.machine")} value={`${r.machine.code} · ${t(`status.machine.${r.machine.status}`)}`} />
              <Fact label={t("sched.mold")} value={r.mold?.code ?? "—"} />
              <Fact label={t("svc.reportedBy")} value={`${name(r.reportedById)} · ${formatDateTime(r.createdAt, locale)}`} />
              <Fact label={t("svc.assignedTo")} value={name(r.assignedToId)} />
              {r.readyAt && <Fact label={t("svc.readyAt")} value={formatDateTime(r.readyAt, locale)} />}
              {r.verifiedAt && <Fact label={t("svc.verified")} value={`${name(r.verifiedById)} · ${formatDateTime(r.verifiedAt, locale)}`} />}
            </dl>
            {r.description && <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{r.description}</p>}
            {r.resolution && <div className="mt-3"><Alert tone="green"><b>{t("svc.resolution")}:</b> {r.resolution}</Alert></div>}
            <div className="mt-4">
              <RequestActions id={r.id} allowed={allowed} technicians={technicians} assignedTo={r.assignedToId} canAssign={can(me, "maintenance:edit") && !["VERIFIED", "CANCELLED"].includes(r.status)} />
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">{t("files.title")}</h2>
            <Attachments
              entityType="MaintenanceRequest"
              entityId={r.id}
              canAdd={can(me, "maintenance:create") || can(me, "maintenance:edit")}
              files={files.map((f) => ({ id: f.id, filename: f.filename, mimeType: f.mimeType, when: formatDateTime(f.createdAt, locale), by: name(f.uploadedById) }))}
            />
          </Card>

          {r.serviceReports.length > 0 && (
            <Card>
              <h2 className="mb-2 font-semibold">{t("svc.tab.reports")}</h2>
              <ul className="divide-y divide-line">
                {r.serviceReports.map((s) => (
                  <li key={s.id} className="py-2 text-sm">
                    <Link href={`/service/reports/${s.id}`} className="font-semibold text-brand-600 hover:underline" dir="ltr">{s.number}</Link>
                    <span className="text-xs text-muted"> · {name(s.technicianId)} · {formatDateTime(s.startTime, locale)}</span>
                    <p className="line-clamp-2">{s.workPerformed}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold">{t("comments.title")}</h2>
            <Comments entityType="MaintenanceRequest" entityId={r.id} comments={comments.map((c) => ({ id: c.id, author: name(c.authorId), when: formatDateTime(c.createdAt, locale), body: c.body }))} />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{t("order.history")}</h2>
            <ol className="space-y-3 border-s-2 border-line ps-4 text-sm">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full bg-brand-400" aria-hidden />
                  <p className="font-medium">{t.has(`history.${h.action}`) ? t(`history.${h.action}`) : h.action}</p>
                  <p className="text-xs text-muted">{h.user?.fullName ?? "System"} · {formatDateTime(h.createdAt, locale)}</p>
                  {h.reason && <p className="mt-0.5 text-xs">“{h.reason}”</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="font-medium">{value}</dd></div>;
}
