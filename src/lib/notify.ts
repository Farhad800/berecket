import "server-only";
import { db, type Tx } from "./db";
import type { Permission } from "./permissions";

/**
 * In-app notifications. Recipients are chosen by permission, so a notification only
 * reaches people allowed to open the record it links to. The sender is never notified.
 */
export async function notify(
  n: {
    type: string;
    title: string;
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
  await tx.notification.createMany({
    data: recipients.map((userId) => ({ userId, type: n.type, title: n.title.slice(0, 200), body: n.body?.slice(0, 1000) ?? null, link: n.link ?? null })),
  });
}
