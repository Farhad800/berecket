import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/** Marks one of MY notifications read, then opens the record it points to (same-site paths only). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  const base = new URL(req.url);
  if (!me) return NextResponse.redirect(new URL("/login", base));
  if (me.mustChangePassword) return NextResponse.redirect(new URL("/change-password", base));
  const { id } = await params;
  const n = await db.notification.findFirst({ where: { id, userId: me.id } });
  if (!n) return NextResponse.redirect(new URL("/notifications", base));
  if (!n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  const target = n.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : "/notifications";
  return NextResponse.redirect(new URL(target, base));
}
