import "server-only";
import { after } from "next/server";
import { db, type Tx } from "./db";
import { pushNotifications } from "./push";
import { notifText, type NotifData } from "./notif-text";
import type { Permission } from "./permissions";

/**
 * In-app notifications. Recipients are chosen by permission, so a notification only
 * reaches people allowed to open the record it links to. The sender is never notified.
 */
export async function notify(
  n: {
    type: string;
    /** Values for the translated text nt.<type>; the stored English title/body are a fallback. */
    data?: NotifData;
    title?: string;
    body?: string;
    link?: string;
    toPermission?: Permission;
    toUserIds?: (string | null | undefined)[];
    exceptUserId?: string;
    /** Recipients must ALSO have this permission (e.g. view rights for the linked page). */
    requires?: Permission;
  },
  tx: Tx = db,
) {
  const ids = new Set<string>();
  if (n.toPermission) {
    const users = await tx.user.findMany({
      where: { active: true, role: { permissions: { some: { permission: n.toPermission } } } },
      select: { id: true },
    });
    users.forEach((u) => ids.add(u.id));
  }
  n.toUserIds?.forEach((id) => id && ids.add(id));
  if (n.exceptUserId) ids.delete(n.exceptUserId);
  if (ids.size === 0) return;

  let recipients = [...ids];
  if (n.requires) {
    const ok = await tx.user.findMany({
      where: { id: { in: recipients }, active: true, role: { permissions: { some: { permission: n.requires } } } },
      select: { id: true },
    });
    recipients = ok.map((u) => u.id);
  }
  if (recipients.length === 0) return;
  const en = n.data ? notifText(n.type, n.data, "en") : null;
  const title = (en?.title ?? n.title ?? n.type).slice(0, 200);
  const body = (en?.body ?? n.body)?.slice(0, 1000) ?? null;
  const created = await tx.notification.createManyAndReturn({
    data: recipients.map((userId) => ({ userId, type: n.type, title, body, link: n.link ?? null, data: n.data ?? undefined })),
    select: { id: true },
  });
  // Push to phones/computers once the request has finished (and the transaction has committed).
  const newIds = created.map((c) => c.id);
  const send = () => pushNotifications(newIds).catch((e) => console.error("[push]", e));
  try {
    after(send);
  } catch {
    void send(); // outside a request (scripts)
  }
}
