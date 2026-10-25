import { apiUser } from "@/lib/auth";
import { buildTemplate } from "@/lib/import";

/** The empty Excel template for importing machines, molds and products. */
export async function GET() {
  const me = await apiUser();
  if (me instanceof Response) return me;
  if (!me.permissions.has("products:create") && !me.permissions.has("assets:create")) return new Response("Forbidden", { status: 403 });
  const buf = await buildTemplate();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="bereket-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
