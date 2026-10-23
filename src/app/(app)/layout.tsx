import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NAV } from "@/lib/nav";
import Sidebar from "@/components/shell/sidebar";
import UserMenu from "@/components/shell/user-menu";
import AutoRefresh from "@/components/shell/auto-refresh";
import GlobalSearch from "@/components/shell/global-search";
import { Logo } from "@/components/ui";
import PushAgent from "@/components/push/push-agent";
import { pushPublicKey } from "@/lib/push";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await pageUser();
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => me.permissions.has(i.perm)) })).filter(
    (g) => g.items.length > 0,
  );
  const unread = await db.notification.count({ where: { userId: me.id, readAt: null } });

  return (
    <div className="flex min-h-dvh">
      <Sidebar groups={groups} unread={unread} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6">
          <div className="flex min-h-16 flex-1 items-center gap-3 ps-12 lg:ps-0">
            <Logo size={36} className="lg:hidden" />
            <div className="flex flex-1 justify-end md:justify-start">
              <GlobalSearch />
            </div>
          </div>
          <UserMenu name={me.fullName} role={me.roleName} />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 pb-24 sm:px-6">{children}</main>
      </div>
      <AutoRefresh seconds={30} />
      <PushAgent publicKey={pushPublicKey()} unread={unread} />
    </div>
  );
}
