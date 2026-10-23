import { getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentShift, toFactoryDateInput, toFactoryDateTimeInput } from "@/lib/time";
import { Card, PageHeader } from "@/components/ui";
import RecordForm from "@/components/record-form";
import { createServiceReportAction } from "@/app/actions/service";

export const metadata = { title: "Service report" };

export default async function NewServiceReportPage({ searchParams }: { searchParams: Promise<{ request?: string; machine?: string }> }) {
  await pageUser("service:create");
  const t = await getTranslations();
  const sp = await searchParams;
  const [machines, molds, requests] = await Promise.all([
    db.machine.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    db.mold.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, currentMachineId: true, currentMachine: { select: { code: true } } } }),
    db.maintenanceRequest.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_PARTS"] } }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, title: true, machineId: true } }),
  ]);
  const req = requests.find((r) => r.id === sp.request);
  const machineId = sp.machine ?? req?.machineId ?? "";
  const mounted = molds.find((m) => m.currentMachineId === machineId);
  const moldOpts = molds.map((m) => ({ value: m.id, label: m.code, hint: m.currentMachine ? `${m.name} · @${m.currentMachine.code}` : m.name }));
  const now = new Date();

  return (
    <>
      <PageHeader title={t("svc.newReport")} subtitle={t("svc.newReportHint")} />
      <Card>
        <RecordForm
          action={createServiceReportAction}
          submitLabel={t("svc.saveReport")}
          initial={{
            date: toFactoryDateInput(now),
            shift: currentShift(),
            machineId,
            maintenanceRequestId: req?.id ?? "",
            moldId: mounted?.id ?? "",
            startTime: toFactoryDateTimeInput(now),
          }}
          fields={[
            { name: "date", label: t("svc.date"), type: "date", required: true },
            { name: "shift", label: t("sched.shift"), type: "select", required: true, options: ["A", "B", "C"].map((s) => ({ value: s, label: s })) },
            { name: "machineId", label: t("sched.machine"), type: "combo", required: true, options: machines.map((m) => ({ value: m.id, label: m.code, hint: m.name })) },
            { name: "moldId", label: t("svc.moldOnMachine"), type: "combo", options: moldOpts },
            { name: "maintenanceRequestId", label: t("svc.relatedRequest"), type: "combo", options: requests.map((r) => ({ value: r.id, label: r.number, hint: r.title })) },
            { name: "workPerformed", label: t("svc.workPerformed"), type: "textarea", required: true },
            { name: "moldRemovedId", label: t("svc.moldRemoved"), type: "combo", options: moldOpts },
            { name: "moldInstalledId", label: t("svc.moldInstalled"), type: "combo", options: moldOpts },
            { name: "moldChangeReason", label: t("svc.moldChangeReason"), wide: true, hint: t("svc.moldChangeReasonHint") },
            { name: "breakdown", label: t("svc.breakdown"), type: "textarea" },
            { name: "startTime", label: t("svc.startTime"), type: "datetime-local", required: true },
            { name: "endTime", label: t("svc.endTime"), type: "datetime-local" },
            { name: "downtimeMinutes", label: t("svc.downtimeMinutes"), type: "number", min: 0, ltr: true, hint: t("svc.downtimeHint") },
            { name: "spareParts", label: t("svc.spareParts"), type: "textarea" },
            { name: "repairsCompleted", label: t("svc.repairsCompleted"), type: "textarea" },
            { name: "outstandingWork", label: t("svc.outstanding"), type: "textarea" },
            { name: "followUp", label: t("svc.followUp"), type: "textarea" },
            { name: "notes", label: t("md.notes"), type: "textarea" },
          ]}
        />
      </Card>
    </>
  );
}
