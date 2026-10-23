import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatNumber } from "@/lib/time";
import { ENTRY_QC_TONE, ISSUE_TONE, SEVERITY_TONE } from "@/lib/tones";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import Attachments from "@/components/attachments";
import InspectionForm from "./inspection-form";

/** One day's production of one product on one shift, as QC sees it. */
export default async function EntryQcPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await pageUser("qc:view");
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const e = await db.productionEntry.findUnique({
    where: { id },
    include: {
      product: true,
      inspections: { orderBy: { inspectedAt: "desc" } },
      issues: { orderBy: { createdAt: "desc" }, include: { category: true } },
    },
  });
  if (!e) notFound();
  const [users, categories, files] = await Promise.all([
    db.user.findMany({ select: { id: true, fullName: true } }),
    db.defectCategory.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.attachment.findMany({ where: { entityType: "QcInspection", entityId: { in: e.inspections.map((i) => i.id) } }, orderBy: { createdAt: "asc" } }),
  ]);
  const name = (uid: string) => users.find((u) => u.id === uid)?.fullName ?? "—";
  const n = (v: number) => formatNumber(v, locale);
  const rejected = e.inspections.reduce((s, i) => s + i.qtyRejected, 0);

  return (
    <>
      <PageHeader
        title={`${e.product.code} · ${e.product.name}`}
        subtitle={<>{formatDate(e.day, locale)} · {t(`rep.shift.${e.shift}`)} · <Link href={`/production?day=${e.day.toISOString().slice(0, 10)}`} className="text-brand-600 hover:underline">{t("nav.production")}</Link></>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={ENTRY_QC_TONE[e.qcStatus]} className="text-sm">{t(`status.entryQc.${e.qcStatus}`)}</Badge>
              {e.product.qcRequired && <Badge tone="amber">{t("md.qcRequiredShort")}</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <F label={t("daily.produced")} v={n(e.quantity)} />
              <F label={t("rep.col.rejected")} v={n(rejected)} />
              <F label={t("rep.col.good")} v={n(e.quantity - rejected)} />
              <F label={t("rep.col.by")} v={name(e.createdById)} />
            </dl>
            {e.product.specifications && <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap"><b>{t("md.specifications")}:</b> {e.product.specifications}</p>}
          </Card>

          <Card className="p-0 sm:p-0">
            <h2 className="p-4 pb-2 font-semibold">{t("qc.tab.inspections")}</h2>
            {e.inspections.length === 0 ? <p className="px-4 pb-4 text-sm text-muted">{t("qc.noInspections")}</p> : (
              <ul className="divide-y divide-line">
                {e.inspections.map((i) => (
                  <li key={i.id} className="space-y-2 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold" dir="ltr">{i.number}</span>
                      <Badge tone={i.decision === "APPROVE" ? "green" : "red"}>{t(`qc.dec.${i.decision}`)}</Badge>
                      <span className="text-xs text-muted">{i.sampleOnly ? t("qc.sample") : t("qc.full")}</span>
                    </div>
                    <p className="tabular-nums">{t("qc.countsSimple", { inspected: n(i.qtyInspected), rejected: n(i.qtyRejected) })}</p>
                    {i.notes && <p className="text-muted">{i.notes}</p>}
                    <p className="text-xs text-muted">{name(i.inspectorId)} · {formatDateTime(i.inspectedAt, locale)}</p>
                    <Attachments
                      entityType="QcInspection" entityId={i.id} canAdd={can(me, "qc:create")}
                      files={files.filter((f) => f.entityId === i.id).map((f) => ({ id: f.id, filename: f.filename, mimeType: f.mimeType, when: formatDateTime(f.createdAt, locale), by: name(f.uploadedById) }))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {e.issues.length > 0 && (
            <Card className="p-0 sm:p-0">
              <h2 className="p-4 pb-2 font-semibold">{t("qc.tab.issues")}</h2>
              <ul className="divide-y divide-line">
                {e.issues.map((i) => (
                  <li key={i.id}>
                    <Link href={`/qc/issues/${i.id}`} className="block px-4 py-3 hover:bg-surface-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold" dir="ltr">{i.number}</span>
                        <Badge tone={SEVERITY_TONE[i.severity]}>{t(`status.severity.${i.severity}`)}</Badge>
                        <Badge tone={ISSUE_TONE[i.status]}>{t(`status.issue.${i.status}`)}</Badge>
                        <span className="text-sm">{i.category.name}</span>
                      </div>
                      <p className="mt-1 text-sm">{i.description}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          {can(me, "qc:create") ? (
            <InspectionForm entryId={e.id} produced={e.quantity} alreadyRejected={rejected} categories={categories} openIssue={e.issues.find((x) => x.status !== "RESOLVED")?.number ?? null} />
          ) : (
            <Alert tone="blue">{t("common.readOnly")}</Alert>
          )}
        </div>
      </div>
    </>
  );
}

function F({ label, v }: { label: string; v: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="font-medium">{v}</dd></div>;
}
