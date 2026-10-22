"use server";

import { z } from "zod";
import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, hashPassword, revokeAllSessions } from "@/lib/auth";
import { audit, diff } from "@/lib/audit";
import { run, UserError, formObject } from "@/lib/action";
import { isPermission } from "@/lib/permissions";

/** Readable temporary password without look-alike characters (no 0/O, 1/l/I). */
function tempPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  let pw = letters[randomInt(letters.length)] + digits[randomInt(digits.length)];
  while (pw.length < 12) pw += all[randomInt(all.length)];
  return pw.split("").sort(() => randomInt(3) - 1).join("");
}

const userSchema = z.object({
  employeeId: z.string().trim().min(1, "Required").max(32),
  fullName: z.string().trim().min(2, "Required").max(120),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "At least 3 characters")
    .max(32)
    .regex(/^[a-z0-9._-]+$/, "Use letters, numbers, dot, dash or underscore"),
  email: z.string().trim().email("Invalid email").optional(),
  departmentId: z.string().optional(),
  roleId: z.string().min(1, "Choose a role"),
});

export async function createEmployeeAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("users:manage");
    const v = userSchema.parse(formObject(fd));
    const password = tempPassword();
    const user = await db.user.create({
      data: {
        employeeId: v.employeeId,
        fullName: v.fullName,
        username: v.username,
        email: v.email ?? null,
        departmentId: v.departmentId ?? null,
        roleId: v.roleId,
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
      },
    });
    await audit({ userId: me.id, action: "user.create", entityType: "User", entityId: user.id, after: { ...v } });
    revalidatePath("/admin");
    // Shown once to the admin; never stored in readable form.
    return { username: user.username, password };
  });
}

export async function updateEmployeeAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("users:manage");
    const raw = formObject(fd);
    const id = z.string().parse(raw.id);
    const v = userSchema.parse(raw);
    const before = await db.user.findUniqueOrThrow({ where: { id } });
    if (id === me.id && v.roleId !== before.roleId) {
      throw new UserError("You can't change your own role. Ask another administrator.");
    }
    const data = {
      employeeId: v.employeeId,
      fullName: v.fullName,
      username: v.username,
      email: v.email ?? null,
      departmentId: v.departmentId ?? null,
      roleId: v.roleId,
    };
    await db.user.update({ where: { id }, data });
    const d = diff(before as unknown as Record<string, unknown>, data);
    if (d.changed) await audit({ userId: me.id, action: "user.update", entityType: "User", entityId: id, before: d.before, after: d.after });
    // A role change takes effect on the next request — sessions read permissions live.
    revalidatePath("/admin");
  });
}

export async function resetPasswordAction(userId: string) {
  return run(async () => {
    const me = await requirePermission("users:manage");
    const password = tempPassword();
    await db.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null },
    });
    await revokeAllSessions(userId);
    await audit({ userId: me.id, action: "user.password_reset", entityType: "User", entityId: userId });
    return { password };
  });
}

export async function setEmployeeActiveAction(userId: string, active: boolean) {
  return run(async () => {
    const me = await requirePermission("users:manage");
    if (userId === me.id && !active) throw new UserError("You can't disable your own account.");
    await db.user.update({ where: { id: userId }, data: { active } });
    if (!active) await revokeAllSessions(userId); // signed out everywhere, immediately
    await audit({ userId: me.id, action: active ? "user.enable" : "user.disable", entityType: "User", entityId: userId });
    revalidatePath("/admin");
  });
}

// ───────── Roles ─────────

const roleSchema = z.object({
  name: z.string().trim().min(2, "Required").max(60),
  description: z.string().trim().max(300).optional(),
});

export async function createRoleAction(_: unknown, fd: FormData) {
  return run(async () => {
    const me = await requirePermission("roles:manage");
    const v = roleSchema.parse(formObject(fd));
    const role = await db.role.create({
      data: { name: v.name, description: v.description ?? null, permissions: { create: [{ permission: "orders:view" }] } },
    });
    await audit({ userId: me.id, action: "role.create", entityType: "Role", entityId: role.id, after: v });
    revalidatePath("/admin");
    return { id: role.id };
  });
}

export async function saveRolePermissionsAction(roleId: string, permissions: string[]) {
  return run(async () => {
    const me = await requirePermission("roles:manage");
    const clean = [...new Set(permissions)].filter(isPermission);
    const role = await db.role.findUniqueOrThrow({ where: { id: roleId }, include: { permissions: true } });

    // Guard against locking everyone out of administration.
    if (me.roleName === role.name && (!clean.includes("roles:manage") || !clean.includes("users:manage"))) {
      throw new UserError("You can't remove administration rights from your own role.");
    }

    const before = role.permissions.map((p) => p.permission).sort();
    await db.$transaction([
      db.rolePermission.deleteMany({ where: { roleId } }),
      db.rolePermission.createMany({ data: clean.map((permission) => ({ roleId, permission })) }),
    ]);
    await audit({
      userId: me.id,
      action: "role.permissions",
      entityType: "Role",
      entityId: roleId,
      before: { added: [], removed: before.filter((p) => !clean.includes(p as never)) },
      after: { added: clean.filter((p) => !before.includes(p)) },
    });
    revalidatePath("/admin");
  });
}

export async function deleteRoleAction(roleId: string) {
  return run(async () => {
    const me = await requirePermission("roles:manage");
    const role = await db.role.findUniqueOrThrow({ where: { id: roleId }, include: { _count: { select: { users: true } } } });
    if (role.isSystem) throw new UserError("Built-in roles can't be deleted.");
    if (role._count.users > 0) throw new UserError("Move the employees in this role to another role first.");
    await db.role.delete({ where: { id: roleId } });
    await audit({ userId: me.id, action: "role.delete", entityType: "Role", entityId: roleId, before: { name: role.name } });
    revalidatePath("/admin");
  });
}
