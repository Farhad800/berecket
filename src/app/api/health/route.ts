import { db } from "@/lib/db";

// Uptime monitors call this. Reports only up/down — no internal details.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
