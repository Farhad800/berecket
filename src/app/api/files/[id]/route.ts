import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { ATTACHABLE, isAttachable } from "@/lib/attachments";
import { getFile } from "@/lib/storage";

/** Serves private files only to signed-in employees allowed to view the record they belong to. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiUser();
  if (me instanceof Response) return me;
  const { id } = await params;
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a || !isAttachable(a.entityType)) return new Response("Not found", { status: 404 });
  if (!me.permissions.has(ATTACHABLE[a.entityType].view)) return new Response("Forbidden", { status: 403 });

  const file = await getFile(a.storageKey);
  if (!file) return new Response("Not found", { status: 404 });
  const body: BodyInit = Buffer.isBuffer(file.body) ? new Uint8Array(file.body) : (file.body as ReadableStream);
  return new Response(body, {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(a.filename)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
