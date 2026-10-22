"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, UserError } from "@/lib/action";
import { deleteFiles } from "@/lib/storage";
import { removeDemoUsers, resetData, resetPreview, type ResetScope } from "@/lib/data-reset";

/** Confirms the person at the keyboard is the signed-in administrator. */
async function confirmPassword(userId: string, password: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!password || !(await bcrypt.compare(password, u.passwordHash))) throw new UserError("Your password is not correct.");
}

/** Go-live reset: deletes test orders, production, maintenance, QC, stock and shipments. */
export async function resetDataAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("settings:manage");
    const scope = (fd.get("scope") === "everything" ? "everything" : "operations") as ResetScope;
    if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "RESET") throw new UserError('Type RESET in the box to confirm.');
    await confirmPassword(me.id, String(fd.get("password") ?? ""));
    const before = await resetPreview(db);
    const files = await resetData(db, scope);
    await deleteFiles(files);
    await audit({ userId: me.id, action: "system.reset", entityType: "System", reason: scope, before, after: { filesDeleted: files.length } });
    revalidatePath("/", "layout");
    return { scope, ...before.operations, ...(scope === "everything" ? before.master : {}) };
  });
}

export async function removeDemoUsersAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("settings:manage");
    await confirmPassword(me.id, String(fd.get("password") ?? ""));
    const n = await removeDemoUsers(db);
    await audit({ userId: me.id, action: "system.remove_demo_users", entityType: "System", after: { removed: n } });
    revalidatePath("/", "layout");
    return { removed: n };
  });
}
