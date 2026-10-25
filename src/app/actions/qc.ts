"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, type Tx } from "@/lib/db";
import { requirePermission, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, formObject, UserError } from "@/lib/action";
import { nextNumber } from "@/lib/numbering";
import { getStock, lockProduct } from "@/lib/stock";
import { notify } from "@/lib/notify";
import { lockEntry, once, submissionKey } from "@/lib/submission";

function refreshQc(entryId?: string, issueId?: string) {
  revalidatePath("/qc");
  if (entryId) revalidatePath(`/qc/entries/${entryId}`);
  if (issueId) revalidatePath(`/qc/issues/${issueId}`);
  revalidatePath("/production");
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
  p: { entryId: string; inspectionId: string | null; categoryId: string; severity: "MINOR" | "MAJOR" | "CRITICAL"; description: string; recommendedAction?: string; responsibleDept: (typeof DEPTS)[number] },
) {
  const cat = await tx.defectCategory.findUnique({ where: { id: p.categoryId } });
  if (!cat || !cat.active) throw new UserError("Choose an active defect type.");
  const entry = await tx.productionEntry.findUniqueOrThrow({ where: { id: p.entryId }, include: { product: true } });
  const label = `${entry.product.code} · ${entry.day.toISOString().slice(0, 10)} · shift ${entry.shift}`;
  const issue = await tx.qualityIssue.create({
    data: {
      number: await nextNumber("issue", tx),
      entryId: p.entryId, inspectionId: p.inspectionId, categoryId: p.categoryId, severity: p.severity,
      description: p.description, recommendedAction: p.recommendedAction ?? null, responsibleDept: p.responsibleDept, createdById: me.id,
    },
  });
  await audit({ userId: me.id, action: "qc.issue_create", entityType: "QualityIssue", entityId: issue.id, after: { number: issue.number, severity: p.severity, entry: label, dept: p.responsibleDept } }, tx);
  const deptPerm = { PRODUCTION: "production:edit", SERVICE: "maintenance:edit", QC: "qc:edit", WAREHOUSE: "warehouse:edit" } as const;
  await notify({
    type: p.severity === "CRITICAL" ? "qc.critical" : "qc.issue",
    data: { number: issue.number, defect: cat.name, product: entry.product.code, entry: label, text: p.description.slice(0, 300) },
    link: `/qc/issues/${issue.id}`,
    toPermission: deptPerm[p.responsibleDept],
    exceptUserId: me.id,
    requires: "qc:view",
  }, tx);
  if (p.severity === "CRITICAL") {
    await notify({ type: "qc.critical", data: { number: issue.number, defect: cat.name, product: entry.product.code, entry: label, text: p.description.slice(0, 300) }, link: `/qc/issues/${issue.id}`, toPermission: "qc:approve", exceptUserId: me.id }, tx);
  }
  return issue;
}

// ───────── Inspections of daily production entries ─────────
const inspectionSchema = z.object({
  entryId: z.string().min(1),
  sampleOnly: z.string().optional(),
  qtyInspected: z.coerce.number().int().positive("Enter how many pieces were checked"),
  qtyRejected: z.coerce.number().int().min(0).default(0),
  notes: z.string().trim().max(4000).optional(),
  ...issueFields,
});

/**
 * QC checks a day's production entry. Rejected pieces are taken out of stock automatically
 * and a quality issue records the defect. An inspection with no rejects approves the entry.
 */
export async function recordInspectionAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("qc:create");
    const v = inspectionSchema.parse(formObject(fd));
    const sample = v.sampleOnly === "on";
    if (v.qtyRejected > v.qtyInspected) throw new UserError("Rejected pieces can't be more than the pieces checked.");

    const { result } = await once(submissionKey(fd.get("submissionId")), me.id, "qc.inspection", async (tx) => {
      // Hold the entry, then count earlier rejections: two inspectors at the same moment are applied
      // one after the other, so together they can never reject more pieces than were produced.
      if (!(await lockEntry(tx, v.entryId))) throw new UserError("This production entry no longer exists. Reload the page.");
      const entry = await tx.productionEntry.findUniqueOrThrow({ where: { id: v.entryId }, include: { product: true, inspections: { select: { qtyRejected: true } } } });
      if (v.qtyInspected > entry.quantity) throw new UserError(`Only ${entry.quantity.toLocaleString("en")} pieces were produced in this entry.`);
      const rejectedBefore = entry.inspections.reduce((s, i) => s + i.qtyRejected, 0);
      if (rejectedBefore + v.qtyRejected > entry.quantity) throw new UserError(`${rejectedBefore.toLocaleString("en")} of ${entry.quantity.toLocaleString("en")} pieces are already rejected.`);

      const wantsIssue = !!(v.categoryId || v.issueDescription);
      if (v.qtyRejected > 0 && !wantsIssue) {
        const open = await tx.qualityIssue.count({ where: { entryId: entry.id, status: { not: "RESOLVED" } } });
        if (!open) throw new UserError("Record the defect (type and description) for rejected pieces.");
      }
      if (v.qtyRejected > 0) {
        await lockProduct(entry.productId, tx);
        const stock = (await getStock([entry.productId], tx)).get(entry.productId) ?? 0;
        if (stock < v.qtyRejected) throw new UserError(`Only ${stock.toLocaleString("en")} pcs of ${entry.product.code} are still in stock — the rest has already left the warehouse.`);
      }

      const decision = v.qtyRejected > 0 ? "REJECT" : "APPROVE";
      const insp = await tx.qcInspection.create({
        data: {
          number: await nextNumber("inspection", tx), entryId: entry.id, inspectorId: me.id, sampleOnly: sample,
          qtyInspected: v.qtyInspected, qtyRejected: v.qtyRejected, decision, notes: v.notes ?? null,
        },
      });
      const status = rejectedBefore + v.qtyRejected > 0 ? "REJECTED" : "APPROVED";
      await tx.productionEntry.update({ where: { id: entry.id }, data: { qcStatus: status } });
      if (v.qtyRejected > 0) {
        await tx.stockMovement.create({ data: { productId: entry.productId, type: "QC_REJECT", qty: -v.qtyRejected, entryId: entry.id, reason: insp.number, createdById: me.id } });
      }

      let issueId: string | null = null;
      if (wantsIssue) {
        if (!v.categoryId || !v.severity || !v.issueDescription || !v.responsibleDept) throw new UserError("Complete the defect: type, severity, description and responsible department.");
        const issue = await createIssue(me, tx, {
          entryId: entry.id, inspectionId: insp.id, categoryId: v.categoryId, severity: v.severity,
          description: v.issueDescription, recommendedAction: v.recommendedAction, responsibleDept: v.responsibleDept,
        });
        issueId = issue.id;
      }
      const label = `${entry.product.code} · ${entry.day.toISOString().slice(0, 10)} · shift ${entry.shift}`;
      await audit({
        userId: me.id, action: decision === "REJECT" ? "qc.reject" : "qc.approve", entityType: "ProductionEntry", entityId: entry.id, reason: v.notes ?? null,
        before: { qcStatus: entry.qcStatus }, after: { qcStatus: status, inspection: insp.number, inspected: v.qtyInspected, rejected: v.qtyRejected, sample, entry: label },
      }, tx);
      const d = entry.day.toISOString().slice(0, 10);
      await notify(
        decision === "REJECT"
          ? { type: "qc.rejected", data: { pcs: v.qtyRejected, product: entry.product.code, day: d, shift: entry.shift, by: me.fullName }, link: `/qc/entries/${entry.id}`, toPermission: "production:view", exceptUserId: me.id, requires: "qc:view" }
          : { type: "qc.approved", data: { product: entry.product.code, day: d, shift: entry.shift, by: me.fullName }, link: `/qc/entries/${entry.id}`, toPermission: "production:view", exceptUserId: me.id, requires: "qc:view" },
        tx,
      );
      return { issueId };
    });
    refreshQc(v.entryId);
    return result;
  });
}

// ───────── Quality issues (non-conformances) ─────────
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
      const issue = await tx.qualityIssue.findUniqueOrThrow({ where: { id: issueId }, include: { _count: { select: { actions: true } }, entry: { select: { product: { select: { code: true } } } } } });
      if (action === "submit") {
        const allowed = [...(DEPT_PERMS[issue.responsibleDept] ?? []), "qc:edit"].some((p) => me.permissions.has(p as never));
        if (!allowed) throw new UserError("Only the responsible department can submit this for verification.");
        if (!["OPEN", "IN_PROGRESS", "REOPENED"].includes(issue.status)) throw new UserError("This issue can't be submitted now.");
        if (issue._count.actions === 0) throw new UserError("Record at least one corrective action first.");
        await tx.qualityIssue.update({ where: { id: issueId }, data: { status: "AWAITING_VERIFICATION" } });
        await notify({ type: "qc.verify", data: { number: issue.number, product: issue.entry.product.code, by: me.fullName }, link: `/qc/issues/${issueId}`, toPermission: "qc:approve", exceptUserId: me.id }, tx);
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

/** Links a quality issue to a maintenance request when the root cause is a machine or mold. */
export async function issueToMaintenanceAction(issueId: string, machineId: string) {
  return run(async () => {
    const me = await requirePermission("maintenance:create");
    const mrId = await db.$transaction(async (tx) => {
      const issue = await tx.qualityIssue.findUniqueOrThrow({ where: { id: issueId }, include: { category: true } });
      if (issue.maintenanceRequestId) return issue.maintenanceRequestId;
      const machine = await tx.machine.findFirst({ where: { id: machineId, archivedAt: null } });
      if (!machine) throw new UserError("Choose the machine.");
      const mold = await tx.mold.findFirst({ where: { currentMachineId: machine.id }, select: { id: true } });
      const mr = await tx.maintenanceRequest.create({
        data: {
          number: await nextNumber("maintenance", tx), machineId: machine.id, moldId: mold?.id ?? null,
          title: `Quality ${issue.number}: ${issue.category.name}`, description: issue.description,
          priority: issue.severity === "CRITICAL" ? "URGENT" : issue.severity === "MAJOR" ? "HIGH" : "NORMAL", reportedById: me.id,
        },
      });
      await tx.qualityIssue.update({ where: { id: issueId }, data: { maintenanceRequestId: mr.id } });
      await audit({ userId: me.id, action: "maintenance.create", entityType: "MaintenanceRequest", entityId: mr.id, after: { number: mr.number, fromIssue: issue.number } }, tx);
      await notify({ type: "maintenance.new", data: { number: mr.number, machine: machine.code, problem: mr.title, by: me.fullName }, link: `/service/requests/${mr.id}`, toPermission: "maintenance:edit", exceptUserId: me.id }, tx);
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
