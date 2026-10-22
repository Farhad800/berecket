"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, type Tx } from "@/lib/db";
import { requirePermission, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, formObject, UserError } from "@/lib/action";
import { nextNumber } from "@/lib/numbering";
import { recomputeOrderStatus } from "@/lib/orders";
import { syncBatchStock } from "@/lib/stock";
import { notify } from "@/lib/notify";

function refreshQc(batchId?: string, issueId?: string) {
  revalidatePath("/qc");
  if (batchId) revalidatePath(`/qc/batches/${batchId}`);
  if (issueId) revalidatePath(`/qc/issues/${issueId}`);
  revalidatePath("/orders");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

const DEPTS = ["PRODUCTION", "SERVICE", "QC", "WAREHOUSE"] as const;
const issueFields = {
  categoryId: z.string().optional(),
  severity: z.enum(["MINOR", "MAJOR", "CRITICAL"]).optional(),
  issueDescription: z.string().trim().max(4000).optional(),
  recommendedAction: z.string().trim().max(2000).optional(),
  responsibleDept: z.enum(DEPTS).optional(),
};

async function createIssue(
  me: CurrentUser,
  tx: Tx,
  p: { batchId: string; inspectionId: string | null; categoryId: string; severity: "MINOR" | "MAJOR" | "CRITICAL"; description: string; recommendedAction?: string; responsibleDept: (typeof DEPTS)[number] },
) {
  const cat = await tx.defectCategory.findUnique({ where: { id: p.categoryId } });
  if (!cat || !cat.active) throw new UserError("Choose an active defect type.");
  const batch = await tx.batch.findUniqueOrThrow({ where: { id: p.batchId }, include: { product: true } });
  const issue = await tx.qualityIssue.create({
    data: {
      number: await nextNumber("issue", tx),
      batchId: p.batchId, inspectionId: p.inspectionId, categoryId: p.categoryId, severity: p.severity,
      description: p.description, recommendedAction: p.recommendedAction ?? null, responsibleDept: p.responsibleDept, createdById: me.id,
    },
  });
  await audit({ userId: me.id, action: "qc.issue_create", entityType: "QualityIssue", entityId: issue.id, after: { number: issue.number, severity: p.severity, batch: batch.number, dept: p.responsibleDept } }, tx);
  const deptPerm = { PRODUCTION: "production:edit", SERVICE: "maintenance:edit", QC: "qc:edit", WAREHOUSE: "warehouse:edit" } as const;
  await notify({
    type: p.severity === "CRITICAL" ? "qc.critical" : "qc.issue",
    title: `${p.severity === "CRITICAL" ? "CRITICAL — " : ""}${issue.number}: ${cat.name} on ${batch.number}`,
    body: `${batch.product.code} · ${p.description}`.slice(0, 500),
    link: `/qc/issues/${issue.id}`,
    toPermission: deptPerm[p.responsibleDept],
    exceptUserId: me.id,
    requires: "qc:view",
  }, tx);
  if (p.severity === "CRITICAL") {
    await notify({ type: "qc.critical", title: `CRITICAL quality issue ${issue.number}`, body: `${cat.name} · ${batch.number}`, link: `/qc/issues/${issue.id}`, toPermission: "qc:approve", exceptUserId: me.id }, tx);
  }
  return issue;
}

// ───────── Inspections & batch decisions ─────────
const inspectionSchema = z.object({
  batchId: z.string().min(1),
  sampleOnly: z.string().optional(),
  qtyInspected: z.coerce.number().int().positive("Enter how many pieces were checked"),
  qtyAccepted: z.coerce.number().int().min(0),
  qtyRejected: z.coerce.number().int().min(0).default(0),
  qtyHold: z.coerce.number().int().min(0).default(0),
  decision: z.enum(["APPROVE", "PARTIAL", "HOLD", "REJECT"]),
  notes: z.string().trim().max(4000).optional(),
  ...issueFields,
});

export async function recordInspectionAction(_: unknown, fd: FormData) {
  return run(async () => {
    const v = inspectionSchema.parse(formObject(fd));
    // Holding is always allowed for QC; releasing, partial release or rejecting needs approval rights.
    const me = await requirePermission(v.decision === "HOLD" ? "qc:create" : "qc:approve");
    if (!me.permissions.has("qc:create")) throw new UserError("You don't have permission to record inspections.");
    const sample = v.sampleOnly === "on";

    const result = await db.$transaction(async (tx) => {
      const batch = await tx.batch.findUniqueOrThrow({ where: { id: v.batchId }, include: { orderLine: true } });
      const produced = (await tx.productionEntry.aggregate({ where: { batchId: batch.id }, _sum: { qtyGood: true } }))._sum.qtyGood ?? 0;
      if (produced <= 0) throw new UserError("Nothing has been produced in this batch yet.");
      if (v.qtyInspected > produced) throw new UserError(`Only ${produced} pieces were produced in ${batch.number}.`);

      let hold = 0;
      if (v.decision === "PARTIAL") {
        if (sample) throw new UserError("A partial release needs a full inspection (sorting) of the batch, not a sample.");
        if (v.qtyAccepted + v.qtyRejected + v.qtyHold !== v.qtyInspected) throw new UserError("Accepted + rejected + on hold must equal the pieces inspected.");
        if (v.qtyRejected + v.qtyHold === 0) throw new UserError("For a partial release, enter the pieces rejected or held.");
        hold = v.qtyHold;
      } else {
        if (v.qtyAccepted + v.qtyRejected > v.qtyInspected) throw new UserError("Accepted + rejected can't be more than the pieces inspected.");
      }
      const wantsIssue = !!(v.categoryId || v.issueDescription);
      if (["REJECT", "HOLD", "PARTIAL"].includes(v.decision) && !wantsIssue) {
        // A follow-up decision (e.g. sorting after a hold) continues the batch's open issue.
        const open = await tx.qualityIssue.count({ where: { batchId: batch.id, status: { not: "RESOLVED" } } });
        if (!open) throw new UserError("Record the defect (type and description) for a hold, rejection or partial release.");
      }

      const insp = await tx.qcInspection.create({
        data: {
          number: await nextNumber("inspection", tx),
          batchId: batch.id, inspectorId: me.id, sampleOnly: sample,
          qtyInspected: v.qtyInspected, qtyAccepted: v.qtyAccepted, qtyRejected: v.qtyRejected, qtyHold: hold,
          decision: v.decision, notes: v.notes ?? null,
        },
      });
      const newStatus = { APPROVE: "APPROVED", PARTIAL: "PARTIAL", HOLD: "HOLD", REJECT: "REJECTED" }[v.decision] as "APPROVED" | "PARTIAL" | "HOLD" | "REJECTED";
      await tx.batch.update({ where: { id: batch.id }, data: { qcStatus: newStatus } });

      let issueId: string | null = null;
      if (wantsIssue) {
        if (!v.categoryId || !v.severity || !v.issueDescription || !v.responsibleDept) throw new UserError("Complete the defect: type, severity, description and responsible department.");
        const issue = await createIssue(me, tx, {
          batchId: batch.id, inspectionId: insp.id, categoryId: v.categoryId, severity: v.severity,
          description: v.issueDescription, recommendedAction: v.recommendedAction, responsibleDept: v.responsibleDept,
        });
        issueId = issue.id;
      }

      const stock = await syncBatchStock(batch.id, me.id, `${insp.number}: ${v.decision}`, tx);
      await audit({
        userId: me.id, action: `qc.${v.decision.toLowerCase()}`, entityType: "Batch", entityId: batch.id, reason: v.notes ?? null,
        before: { qcStatus: batch.qcStatus },
        after: { qcStatus: newStatus, inspection: insp.number, inspected: v.qtyInspected, rejected: v.qtyRejected, hold, sample, stockMoved: stock.changed },
      }, tx);
      await recomputeOrderStatus(batch.orderLine.orderId, tx);

      // Who needs to know
      const label = `${batch.number}: ${newStatus.toLowerCase()}`;
      if (v.decision === "APPROVE" && batch.qcStatus !== "APPROVED") {
        await notify({ type: "qc.approved", title: `${batch.number} approved by QC`, link: `/qc/batches/${batch.id}`, toPermission: "warehouse:create", exceptUserId: me.id }, tx);
      }
      if (v.decision !== "APPROVE") {
        await notify({
          type: "qc.blocked", title: `Quality ${v.decision === "PARTIAL" ? "partial release" : v.decision.toLowerCase()} — ${label}`,
          body: stock.cancelledReservations ? `${stock.cancelledReservations} reserved pieces were moved to quarantine.` : undefined,
          link: `/qc/batches/${batch.id}`, toPermission: "warehouse:create", exceptUserId: me.id,
        }, tx);
        await notify({ type: "qc.blocked", title: `Quality ${v.decision.toLowerCase()} on ${batch.number}`, link: `/qc/batches/${batch.id}`, toPermission: "production:edit", exceptUserId: me.id, requires: "qc:view" }, tx);
      }
      return { issueId };
    });
    refreshQc(v.batchId);
    return result;
  });
}

// ───────── Quality issues (non-conformances) ─────────
const issueSchema = z.object({
  batchId: z.string().min(1),
  categoryId: z.string().min(1, "Choose the defect type"),
  severity: z.enum(["MINOR", "MAJOR", "CRITICAL"]),
  issueDescription: z.string().trim().min(3, "Describe the defect").max(4000),
  recommendedAction: z.string().trim().max(2000).optional(),
  responsibleDept: z.enum(DEPTS),
});

export async function createIssueAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("qc:create");
    const v = issueSchema.parse(formObject(fd));
    const issue = await db.$transaction((tx) =>
      createIssue(me, tx, { batchId: v.batchId, inspectionId: null, categoryId: v.categoryId, severity: v.severity, description: v.issueDescription, recommendedAction: v.recommendedAction, responsibleDept: v.responsibleDept }),
    );
    refreshQc(v.batchId, issue.id);
    return { id: issue.id };
  });
}

const DEPT_PERMS: Record<string, string[]> = {
  PRODUCTION: ["production:edit"],
  SERVICE: ["maintenance:edit", "service:create"],
  QC: ["qc:edit"],
  WAREHOUSE: ["warehouse:edit"],
};

/** The responsible department (or QC) records the corrective work done. */
export async function addCorrectiveActionAction(_: unknown, fd: FormData) {
  return run(async () => {
    const raw = formObject(fd);
    const issueId = String(raw.issueId ?? "");
    const description = z.string().trim().min(3, "Describe what was done").max(4000).parse(raw.description);
    const me = await requirePermission("qc:view");
    await db.$transaction(async (tx) => {
      const issue = await tx.qualityIssue.findUniqueOrThrow({ where: { id: issueId } });
      const allowed = [...(DEPT_PERMS[issue.responsibleDept] ?? []), "qc:edit"].some((p) => me.permissions.has(p as never));
      if (!allowed) throw new UserError("Only the responsible department or Quality Control can record corrective actions.");
      if (issue.status === "RESOLVED") throw new UserError("This issue is resolved. Reopen it first.");
      await tx.correctiveAction.create({ data: { issueId, description, performedById: me.id } });
      if (["OPEN", "REOPENED"].includes(issue.status)) await tx.qualityIssue.update({ where: { id: issueId }, data: { status: "IN_PROGRESS", assignedToId: issue.assignedToId ?? me.id } });
      await audit({ userId: me.id, action: "qc.corrective_action", entityType: "QualityIssue", entityId: issueId, after: { description } }, tx);
    });
    refreshQc(undefined, issueId);
  });
}

export async function issueTransitionAction(issueId: string, action: "submit" | "resolve" | "reopen", note?: string) {
  return run(async () => {
    const me = await requirePermission(action === "submit" ? "qc:view" : "qc:approve");
    const text = note?.trim();
    if (action === "reopen" && (!text || text.length < 3)) throw new UserError("Please give a reason.");
    await db.$transaction(async (tx) => {
      const issue = await tx.qualityIssue.findUniqueOrThrow({ where: { id: issueId }, include: { _count: { select: { actions: true } }, batch: { select: { number: true } } } });
      if (action === "submit") {
        const allowed = [...(DEPT_PERMS[issue.responsibleDept] ?? []), "qc:edit"].some((p) => me.permissions.has(p as never));
        if (!allowed) throw new UserError("Only the responsible department can submit this for verification.");
        if (!["OPEN", "IN_PROGRESS", "REOPENED"].includes(issue.status)) throw new UserError("This issue can't be submitted now.");
        if (issue._count.actions === 0) throw new UserError("Record at least one corrective action first.");
        await tx.qualityIssue.update({ where: { id: issueId }, data: { status: "AWAITING_VERIFICATION" } });
        await notify({ type: "qc.verify", title: `${issue.number} ready for QC verification`, body: issue.batch.number, link: `/qc/issues/${issueId}`, toPermission: "qc:approve", exceptUserId: me.id }, tx);
      } else if (action === "resolve") {
        if (issue.status !== "AWAITING_VERIFICATION" && !(issue._count.actions > 0 && ["IN_PROGRESS"].includes(issue.status))) {
          throw new UserError("Corrective action must be recorded before the issue can be resolved.");
        }
        await tx.qualityIssue.update({ where: { id: issueId }, data: { status: "RESOLVED", resolvedAt: new Date(), verifiedById: me.id } });
      } else {
        if (issue.status !== "RESOLVED" && issue.status !== "AWAITING_VERIFICATION") throw new UserError("Only resolved or submitted issues can be reopened.");
        await tx.qualityIssue.update({ where: { id: issueId }, data: { status: "REOPENED", resolvedAt: null, verifiedById: null } });
      }
      await audit({ userId: me.id, action: `qc.issue_${action}`, entityType: "QualityIssue", entityId: issueId, reason: text ?? null, before: { status: issue.status } }, tx);
    });
    refreshQc(undefined, issueId);
  });
}

/** Links a quality issue to a maintenance request when the root cause is the machine or mold. */
export async function issueToMaintenanceAction(issueId: string) {
  return run(async () => {
    const me = await requirePermission("maintenance:create");
    const mrId = await db.$transaction(async (tx) => {
      const issue = await tx.qualityIssue.findUniqueOrThrow({ where: { id: issueId }, include: { category: true, batch: { include: { job: true } } } });
      if (issue.maintenanceRequestId) return issue.maintenanceRequestId;
      const machineId = issue.batch.job.machineId;
      if (!machineId) throw new UserError("The batch's job has no machine.");
      const mr = await tx.maintenanceRequest.create({
        data: {
          number: await nextNumber("maintenance", tx), machineId, moldId: issue.batch.job.moldId, jobId: issue.batch.jobId,
          title: `Quality ${issue.number}: ${issue.category.name}`, description: issue.description,
          priority: issue.severity === "CRITICAL" ? "URGENT" : issue.severity === "MAJOR" ? "HIGH" : "NORMAL", reportedById: me.id,
        },
      });
      await tx.qualityIssue.update({ where: { id: issueId }, data: { maintenanceRequestId: mr.id } });
      await audit({ userId: me.id, action: "maintenance.create", entityType: "MaintenanceRequest", entityId: mr.id, after: { number: mr.number, fromIssue: issue.number } }, tx);
      await notify({ type: "maintenance.new", title: `${mr.number}: ${mr.title}`, link: `/service/requests/${mr.id}`, toPermission: "maintenance:edit", exceptUserId: me.id }, tx);
      return mr.id;
    });
    refreshQc(undefined, issueId);
    revalidatePath("/service");
    return { id: mrId };
  });
}

// ───────── Defect categories (configurable by the factory) ─────────
const catSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _"),
  name: z.string().trim().min(2).max(120),
});

export async function saveDefectCategoryAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("qc:approve");
    const v = catSchema.parse(formObject(fd));
    const c = v.id
      ? await db.defectCategory.update({ where: { id: v.id }, data: { name: v.name } })
      : await db.defectCategory.create({ data: { code: v.code.toUpperCase(), name: v.name } });
    await audit({ userId: me.id, action: v.id ? "qc.category_update" : "qc.category_create", entityType: "DefectCategory", entityId: c.id, after: { code: c.code, name: c.name } });
    revalidatePath("/qc");
  });
}

export async function toggleDefectCategoryAction(id: string, active: boolean) {
  return run(async () => {
    const me = await requirePermission("qc:approve");
    await db.defectCategory.update({ where: { id }, data: { active } });
    await audit({ userId: me.id, action: active ? "qc.category_enable" : "qc.category_disable", entityType: "DefectCategory", entityId: id });
    revalidatePath("/qc");
  });
}
