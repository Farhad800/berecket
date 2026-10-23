import { getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import RecordForm from "@/components/record-form";
import { createRequestAction } from "@/app/actions/service";

export const metadata = { title: "New maintenance request" };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ machine?: string }> }) {
  await pageUser("maintenance:create");
  const t = await getTranslations();
  const sp = await searchParams;
  const [machines, molds] = await Promise.all([
    db.machine.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    db.mold.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title={t("svc.newRequest")} subtitle={t("svc.newRequestHint")} />
      <Card>
        <RecordForm
          action={createRequestAction}
          submitLabel={t("svc.sendRequest")}
          initial={{ machineId: sp.machine ?? "", priority: "NORMAL" }}
          fields={[
            { name: "machineId", label: t("sched.machine"), type: "combo", required: true, options: machines.map((m) => ({ value: m.id, label: m.code, hint: m.name })) },
            { name: "moldId", label: t("sched.mold"), type: "combo", options: molds.map((m) => ({ value: m.id, label: m.code, hint: m.name })) },
            { name: "title", label: t("svc.problem"), required: true, wide: true, hint: t("svc.problemHint") },
            { name: "description", label: t("svc.details"), type: "textarea" },
            { name: "priority", label: t("order.priority"), type: "select", required: true, options: ["URGENT", "HIGH", "NORMAL", "LOW"].map((p) => ({ value: p, label: t(`status.priority.${p}`) })) },
            { name: "machineDown", label: t("prod.machineDown"), type: "checkbox", wide: true, hint: t("svc.machineDownHint") },
          ]}
        />
      </Card>
    </>
  );
}
