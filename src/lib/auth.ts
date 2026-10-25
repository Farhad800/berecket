import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import type { Permission } from "./permissions";

export const SESSION_COOKIE = "bfms_session";
const SESSION_HOURS = 12; // one long shift plus margin
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
let DUMMY_HASH: string | undefined;

export class AuthError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "FORBIDDEN" | "PASSWORD_CHANGE", message?: string) {
    super(message ?? code);
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must contain letters and numbers.";
  return null;
}

export type LoginResult =
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; error: "invalid" | "locked" | "disabled" };

export async function login(username: string, password: string): Promise<LoginResult> {
  const user = await db.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  // Compare against a dummy hash when the user doesn't exist, so timing doesn't reveal usernames.
  const hash = user?.passwordHash ?? (DUMMY_HASH ??= bcrypt.hashSync("no-such-user-placeholder", 12));
  const valid = await bcrypt.compare(password, hash);

  if (!user) return { ok: false, error: "invalid" };
  if (!user.active) return { ok: false, error: "disabled" };
  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, error: "locked" };

  if (!valid) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    return { ok: false, error: failed >= MAX_FAILED ? "locked" : "invalid" };
  }

  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  await db.$transaction([
    db.session.create({
      data: {
        id: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000),
        ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: h.get("user-agent")?.slice(0, 250) ?? null,
      },
    }),
    db.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    }),
    db.auditLog.create({ data: { userId: user.id, action: "auth.login", entityType: "User", entityId: user.id } }),
  ]);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return { ok: true, mustChangePassword: user.mustChangePassword };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = {
  id: string;
  employeeId: string;
  fullName: string;
  username: string;
  locale: string;
  roleName: string;
  departmentName: string | null;
  mustChangePassword: boolean;
  permissions: Set<string>;
};

/** Resolves the session cookie to an active user. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { include: { role: { include: { permissions: true } }, department: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  const u = session.user;
  return {
    id: u.id,
    employeeId: u.employeeId,
    fullName: u.fullName,
    username: u.username,
    locale: u.locale,
    roleName: u.role.name,
    departmentName: u.department?.name ?? null,
    mustChangePassword: u.mustChangePassword,
    permissions: new Set(u.role.permissions.map((p) => p.permission)),
  };
});

export function can(user: CurrentUser | null, perm: Permission) {
  return !!user && user.permissions.has(perm);
}

/** Permissions that let someone see money: prices, totals, payments, what is owed (code review M3). */
export const MONEY_PERMS: Permission[] = ["stock:buy", "stock:sell", "cash:view"];

/** True for people who buy, sell or look after the safe. Everyone else sees quantities only. */
export function canSeeMoney(user: { permissions: Set<string> } | null) {
  return !!user && MONEY_PERMS.some((p) => user.permissions.has(p));
}

/**
 * For server actions: throws instead of redirecting.
 * Someone still on a temporary password can do nothing until they choose their own (code review M4) —
 * only the password change itself and the language switch pass `allowPasswordChange`.
 */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("UNAUTHENTICATED");
  if (user.mustChangePassword && !opts.allowPasswordChange) throw new AuthError("PASSWORD_CHANGE");
  return user;
}

/** For API route handlers (downloads, files): the user, or the response to send instead. */
export async function apiUser(): Promise<CurrentUser | Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.mustChangePassword) return new Response("Change your temporary password first", { status: 403 });
  return user;
}

export async function requirePermission(perm: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.permissions.has(perm)) throw new AuthError("FORBIDDEN", `Missing permission ${perm}`);
  return user;
}

/** For pages: redirects to login when signed out, shows 403 when forbidden. */
export async function pageUser(perm?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (perm && !user.permissions.has(perm)) redirect("/forbidden");
  return user;
}

/** Id of the session making this request (to keep it when signing out the person's other devices). */
export async function currentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

export async function revokeAllSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}
