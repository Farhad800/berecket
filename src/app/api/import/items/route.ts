import { apiUser, canSeeMoney } from "@/lib/auth";
import { buildItemsWorkbook } from "@/lib/items-workbook";
import { audit } from "@/lib/audit";

/** The accountant's items workbook, filled with every item in the system (costs only for money roles). */
export async function GET() {
  const me = await apiUser();
  if (me instanceof Response) return me;
  if (!me.permissions.has("products:create") || !me.permissions.has("products:edit")) return new Response("Forbidden", { status: 403 });
  const money = canSeeMoney(me);
  const buf = await buildItemsWorkbook(money);
  await audit({ userId: me.id, action: "items.workbookDownload", entityType: "System", after: { withCost: money } });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bereket-items-${day}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
