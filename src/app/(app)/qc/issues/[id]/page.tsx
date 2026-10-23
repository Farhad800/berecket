import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/time";
import { ISSUE_TONE, ENTRY_QC_TONE, SEVERITY_TONE } from "@/lib/tones";
import { Badge, Card, PageHeader } from "@/components/ui";
import Comments from "@/components/comments";
import Attachments from "@/components/attachments";
import IssueConsole from "./issue-console";

const DEPT_PERMS: Record<string, string[]> = {
  PRODUCTION: ["production:edit"],
  SERVICE: ["maintenance:edit", "service:create"],
  QC: ["qc:edit"],
  WAREHOUSE: ["warehouse:edit"],
};

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageUser("qc:view");
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const i = await db.qualityIssue.findUnique({
    where: { id },
    include: {
      category: true,
      entry: { include: { product: true } },
      inspection: true,
      actions: { orderBy: { performedAt: "asc" } },
    },
  });
  if (!i) notFound();
  const [users, comments, files, history, mr, machines] = await Promise.all([
    db.user.findMany({ select: { id: true, fullName: true } }),
    db.comment.findMany({ where: { entityType: "QualityIssue", entityId: id }, orderBy: { createdAt: "asc" } }),
    db.attachment.findMany({ where: { entityType: "QualityIssue", entityId: id }, orderBy: { createdAt: "asc" } }),
    db.auditLog.findMany({ where: { entityType: "QualityIssue", entityId: id }, orderBy: { createdAt: "desc" }, include: { user: { select: { fullName: true } } } }),
    i.maintenanceRequestId ? db.maintenanceRequest.findUnique({ where: { id: i.maintenanceRequestId }, select: { id: true, number: true, status: true } }) : null,
    db.machine.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true } }),
  ]);
  const name = (uid: string | null) => users.find((u) => u.id === uid)?.fullName ?? "—";
  const canAct = [...(DEPT_PERMS[i.responsibleDept] ?? []), "qc:edit"].some((p) => me.permissions.has(p));

  return (
    <>
      <PageHeader title={i.number} subtitle={i.category.name} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <Card className={i.severity === "CRITICAL" && i.status !== "RESOLVED" ? "border-red-400" : ""}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={SEVERITY_TONE[i.severity]}>{t(`status.severity.${i.severity}`)}</Badge>
              <Badge tone={ISSUE_TONE[i.status]}>{t(`status.issue.${i.status}`)}</Badge>
              <Badge>{t(`qc.dept.${i.responsibleDept}`)}</Badge>
            </div>
            <p className="whitespace-pre-wrap">{i.description}</p>
            {i.recommendedAction && <p className="mt-2 rounded-lg bg-surface-2 p-3 text-sm"><b>{t("qc.recommendedAction")}:</b> {i.recommendedAction}</p>}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <F label={t("md.product")} v={<Link href={`/qc/entries/${i.entry.id}`} className="text-brand-600 hover:underline">{i.entry.product.code} · {i.entry.product.name}</Link>} />
              <F label={t("prod.day")} v={`${formatDate(i.entry.day, locale)} · ${t("rep.col.shift")} ${i.entry.shift}`} />
              <F label={t("rep.col.qc")} v={<Badge tone={ENTRY_QC_TONE[i.entry.qcStatus]}>{t(`status.entryQc.${i.entry.qcStatus}`)}</Badge>} />
              <F label={t("svc.reportedBy")} v={`${name(i.createdById)} · ${formatDateTime(i.createdAt, locale)}`} />
              {mr && <F label={t("svc.relatedRequest")} v={<Link href={`/service/requests/${mr.id}`} className="text-brand-600 hover:underline" dir="ltr">{mr.number} · {t(`status.maint.${mr.status}`)}</Link>} />}
              {i.resolvedAt && <F label={t("status.issue.RESOLVED")} v={`${name(i.verifiedById)} · ${formatDateTime(i.resolvedAt, locale)}`} />}
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">{t("qc.correctiveActions")}</h2>
            {i.actions.length === 0 ? <p className="text-sm text-muted">{t("qc.noActions")}</p> : (
              <ol className="space-y-3">
                {i.actions.map((a, idx) => (
                  <li key={a.id} className="rounded-xl bg-surface-2 p-3 text-sm">
                    <p className="text-xs text-muted">{idx + 1}. {name(a.performedById)} · {formatDateTime(a.performedAt, locale)}</p>
                    <p className="mt-1 whitespace-pre-wrap">{a.description}</p>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-4">
              <IssueConsole issueId={i.id} status={i.status} canAct={canAct} canVerify={can(me, "qc:approve")} canMaint={can(me, "maintenance:create")} hasMaint={!!i.maintenanceRequestId} machines={machines} />
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">{t("files.title")}</h2>
            <Attachments entityType="QualityIssue" entityId={i.id} canAdd={canAct || can(me, "qc:create")}
              files={files.map((f) => ({ id: f.id, filename: f.filename, mimeType: f.mimeType, when: formatDateTime(f.createdAt, locale), by: name(f.uploadedById) }))} />
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold">{t("comments.title")}</h2>
            <Comments entityType="QualityIssue" entityId={i.id} comments={comments.map((c) => ({ id: c.id, author: name(c.authorId), when: formatDateTime(c.createdAt, locale), body: c.body }))} />
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

function F({ label, v }: { label: string; v: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="font-medium">{v}</dd></div>;
}
