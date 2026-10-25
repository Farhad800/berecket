import "server-only";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AuthError } from "./auth";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** A business-rule failure with a message safe to show the user. */
export class UserError extends Error {}

/**
 * Wraps a server action body so every action returns a predictable result
 * and never leaks stack traces or database details to the browser.
 */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data } as ActionResult<T>;
  } catch (e) {
    if (e instanceof AuthError) {
      return {
        ok: false,
        error: e.code === "UNAUTHENTICATED" ? "Your session has ended. Please sign in again."
          : e.code === "PASSWORD_CHANGE" ? "Change your temporary password first (open the Change password page)."
          : "You don't have permission to do this.",
      };
    }
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
    }
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target as string[] | undefined)?.join(", ") ?? "value";
      return { ok: false, error: `That ${target} is already in use.` };
    }
    // Someone else changed or deleted the record meanwhile, or a linked record is missing / still in use.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return { ok: false, error: "That record no longer exists. Reload the page and try again." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") return { ok: false, error: "This is linked to other records, so it can't be changed this way. Reload the page, or archive it instead of deleting." };
    // Next.js uses thrown errors for redirect()/notFound() — let them through.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error("[action error]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Reads a FormData into a plain object, turning empty strings into undefined. */
export function formObject(fd: FormData) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    const val = v.trim() === "" ? undefined : v;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      ((out[key] as unknown[]) ??= []).push(val);
    } else out[k] = val;
  }
  return out;
}
