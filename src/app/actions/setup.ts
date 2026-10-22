"use server";

import { z } from "zod";
import { timingSafeEqual, createHash } from "crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, login, validatePasswordStrength } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, UserError, formObject } from "@/lib/action";

/** True only while the system has no active administrator. */
export async function setupOpen() {
  const role = await db.role.findUnique({ where: { name: "Administrator" } });
  if (!role) return false;
  const admins = await db.user.count({ where: { roleId: role.id, active: true } });
  return admins === 0 && !!process.env.SETUP_TOKEN;
}

function tokenMatches(given: string) {
  const expected = process.env.SETUP_TOKEN ?? "";
  // Compare hashes so lengths always match and timing reveals nothing.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return expected.length >= 16 && timingSafeEqual(a, b);
}

const schema = z
  .object({
    token: z.string().min(1, "Required"),
    employeeId: z.string().trim().min(1, "Required").max(32),
    fullName: z.string().trim().min(2, "Required").max(120),
    username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9._-]+$/, "Use letters, numbers, dot, dash or underscore"),
    password: z.string().min(1),
    confirm: z.string().min(1),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] });

export async function createFirstAdminAction(_: unknown, fd: FormData) {
  const res = await run(async () => {
    if (!(await setupOpen())) throw new UserError("Setup is already complete.");
    const v = schema.parse(formObject(fd));
    if (!tokenMatches(v.token)) throw new UserError("Setup code is incorrect.");
    const weak = validatePasswordStrength(v.password);
    if (weak) throw new UserError(weak);

    const role = await db.role.findUniqueOrThrow({ where: { name: "Administrator" } });
    const dept = await db.department.findUnique({ where: { code: "ADMIN" } });
    const user = await db.$transaction(async (tx) => {
      // Re-check inside the transaction so two simultaneous submissions can't both succeed.
      const count = await tx.user.count({ where: { roleId: role.id, active: true } });
      if (count > 0) throw new UserError("Setup is already complete.");
      return tx.user.create({
        data: {
          employeeId: v.employeeId,
          fullName: v.fullName,
          username: v.username,
          passwordHash: await hashPassword(v.password),
          mustChangePassword: false, // they just chose it themselves
          roleId: role.id,
          departmentId: dept?.id,
        },
      });
    });
    await audit({ userId: user.id, action: "setup.first_admin", entityType: "User", entityId: user.id });
    await login(v.username, v.password);
  });
  if (res.ok) redirect("/dashboard");
  return res;
}
