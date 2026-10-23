import "server-only";
import webpush from "web-push";
import { db } from "./db";
import { notifText } from "./notif-text";

/**
 * Web Push: sends the notification to every phone/computer the employee turned
 * notifications on for — it arrives even when the app is closed.
 * Keys come from the server environment only (VAPID_PRIVATE_KEY never reaches the browser).
 */
let ready: boolean | null = null;
function configure() {
  if (ready !== null) return ready;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (ready = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:noreply@bereket-fms.app", pub, priv);
  return (ready = true);
}
export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;
export const pushEnabled = () => configure();

/** Sends one push per device for each saved notification id (only ids that really exist — i.e. committed). */
export async function pushNotifications(ids: string[]) {
  if (!ids.length || !configure()) return;
  const rows = await db.notification.findMany({ where: { id: { in: ids } }, select: { id: true, userId: true, type: true, title: true, body: true, link: true, data: true, user: { select: { locale: true } } } });
  if (!rows.length) return;
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const [subs, unread] = await Promise.all([
    db.pushSubscription.findMany({ where: { userId: { in: userIds }, user: { active: true } } }),
    db.notification.groupBy({ by: ["userId"], where: { userId: { in: userIds }, readAt: null }, _count: true }),
  ]);
  await Promise.all(
    rows.flatMap((n) =>
      subs.filter((s) => s.userId === n.userId).map((s) =>
        sendOne(s, {
          ...(() => {
            const tx = notifText(n.type, n.data, n.user.locale);
            return { title: tx?.title ?? n.title, body: tx?.body ?? n.body ?? "" };
          })(),
          url: `/notifications/open/${n.id}`,
          tag: n.id,
          badge: unread.find((u) => u.userId === n.userId)?._count ?? 1,
        }),
      ),
    ),
  );
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; failures: number };
export async function sendOne(s: Sub, payload: Record<string, unknown>) {
  if (!configure()) return false;
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: "high" });
    await db.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date(), failures: 0 } }).catch(() => {});
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    // 404/410: the browser dropped this subscription (app uninstalled, permission removed).
    if (code === 404 || code === 410 || s.failures >= 5) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
    else await db.pushSubscription.update({ where: { id: s.id }, data: { failures: { increment: 1 } } }).catch(() => {});
    console.error("[push] send failed", code ?? (e as Error).message);
    return false;
  }
}
