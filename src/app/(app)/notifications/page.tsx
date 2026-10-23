import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { Card, EmptyState, PageHeader, cn } from "@/components/ui";
import MarkAllRead from "./mark-all-read";
import PushSettings from "@/components/push/push-settings";
import { pushPublicKey } from "@/lib/push";
import { notifText } from "@/lib/notif-text";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const me = await pageUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const items = await db.notification.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((i) => !i.readAt).length;
  const devices = await db.pushSubscription.count({ where: { userId: me.id } });

  return (
    <>
      <PageHeader title={t("nav.notifications")} subtitle={t("notif.unread", { n: unread })} actions={unread > 0 && <MarkAllRead />} />
      <Card className="mb-4"><PushSettings publicKey={pushPublicKey()} devices={devices} /></Card>
      {items.length === 0 ? (
        <EmptyState>{t("notif.none")}</EmptyState>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const txt = notifText(n.type, n.data, locale);
              const title = txt?.title ?? n.title, body = txt ? txt.body : n.body;
              const inner = (
                <>
                  <p className={cn("text-sm", !n.readAt && "font-semibold")}>
                    {!n.readAt && <span className="me-2 inline-block size-2 rounded-full bg-brand-500 align-middle" />}
                    {title}
                  </p>
                  {body && <p className="mt-0.5 text-sm text-muted">{body}</p>}
                  <p className="mt-1 text-xs text-muted">{formatDateTime(n.createdAt, locale)}</p>
                </>
              );
              return (
                <li key={n.id} className={cn(!n.readAt && "bg-brand-50/60 dark:bg-brand-900/30")}>
                  {n.link ? (
                    <Link href={`/notifications/open/${n.id}`} className="block px-4 py-3 hover:bg-surface-2">{inner}</Link>
                  ) : (
                    <div className="px-4 py-3">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
