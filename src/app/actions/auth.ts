"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { currentSessionId, login, logout, requireUser, hashPassword, validatePasswordStrength } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, UserError, type ActionResult } from "@/lib/action";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});

export async function loginAction(
  _: unknown,
  fd: FormData,
): Promise<{ error?: "invalid" | "locked" | "disabled"; username?: string; attempt?: number }> {
  const username = String(fd.get("username") ?? "").slice(0, 64);
  const attempt = Date.now(); // remounts the form so the kept username is shown again
  const parsed = loginSchema.safeParse({ username, password: fd.get("password") });
  if (!parsed.success) return { error: "invalid", username, attempt };
  const res = await login(parsed.data.username, parsed.data.password);
  if (!res.ok) return { error: res.error, username, attempt };
  redirect(res.mustChangePassword ? "/change-password" : "/dashboard");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

const changeSchema = z
  .object({
    current: z.string().min(1),
    next: z.string().min(1),
    confirm: z.string().min(1),
  })
  .refine((v) => v.next === v.confirm, { message: "mismatch", path: ["confirm"] });

export async function changePasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const result = await run(async () => {
    const me = await requireUser({ allowPasswordChange: true });
    const v = changeSchema.parse(Object.fromEntries(fd));
    const strength = validatePasswordStrength(v.next);
    if (strength) throw new UserError(strength);
    const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await bcrypt.compare(v.current, user.passwordHash))) throw new UserError("Current password is incorrect.");
    if (await bcrypt.compare(v.next, user.passwordHash)) throw new UserError("Choose a password different from the current one.");
    await db.user.update({
      where: { id: me.id },
      data: { passwordHash: await hashPassword(v.next), mustChangePassword: false },
    });
    await audit({ userId: me.id, action: "auth.password_change", entityType: "User", entityId: me.id });
    // Sign out other devices but keep this session (the one making the change).
    const keep = await currentSessionId();
    await db.session.deleteMany({ where: { userId: me.id, ...(keep ? { id: { not: keep } } : {}) } });
  });
  if (result.ok) redirect("/dashboard");
  return result;
}

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  try {
    const me = await requireUser({ allowPasswordChange: true });
    await db.user.update({ where: { id: me.id }, data: { locale } });
  } catch {
    // signed out (login page) — cookie alone is enough
  }
}
