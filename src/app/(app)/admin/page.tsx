import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { can, pageUser } from "@/lib/auth";
import { resetPreview, itemsPreview } from "@/lib/data-reset";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { RESOURCES, RESOURCE_ACTIONS } from "@/lib/permissions";
import { PageHeader, cn } from "@/components/ui";
import EmployeeAdmin from "./employee-admin";
import RoleAdmin from "./role-admin";
import SystemAdmin from "./system-admin";

export const metadata = { title: "Administration" };

const TABS = ["employees", "roles", "audit", "system"] as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await pageUser("roles:manage");
  const sp = await searchParams;
  if (sp.tab === "audit") redirect("/audit");
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "employees";
  const t = await getTranslations();
  const locale = await getLocale();

  const tabLabel = { employees: t("admin.employees"), roles: t("admin.roles"), audit: t("admin.audit"), system: t("sys.tab") } as const;
  const tabs = TABS.filter((k) => k !== "system" || can(me, "settings:manage"));

  return (
    <>
      <PageHeader title={t("nav.administration")} />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {tabs.map((k) => (
          <Link
            key={k}
            href={k === "audit" ? "/audit" : `/admin?tab=${k}`}
            role="tab"
            aria-selected={tab === k}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap",
              tab === k ? "border-brand-600 text-brand-700 dark:text-brand-200" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {tabLabel[k]}
          </Link>
        ))}
      </div>

      {tab === "employees" && <EmployeesTab locale={locale} />}
      {tab === "roles" && <RolesTab />}
      {tab === "system" && can(me, "settings:manage") && <SystemTab />}
    </>
  );
}

async function EmployeesTab({ locale }: { locale: string }) {
  const [users, roles, departments] = await Promise.all([
    db.user.findMany({ orderBy: [{ active: "desc" }, { fullName: "asc" }], include: { role: true, department: true } }),
    db.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <EmployeeAdmin
      roles={roles}
      departments={departments}
      users={users.map((u) => ({
        id: u.id,
        employeeId: u.employeeId,
        fullName: u.fullName,
        username: u.username,
        email: u.email,
        departmentId: u.departmentId,
        departmentName: u.department?.name ?? null,
        roleId: u.roleId,
        roleName: u.role.name,
        active: u.active,
        lastLogin: u.lastLoginAt ? formatDateTime(u.lastLoginAt, locale) : null,
        created: formatDateTime(u.createdAt, locale),
      }))}
    />
  );
}

async function RolesTab() {
  const roles = await db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { permissions: true, _count: { select: { users: true } } },
  });
  return (
    <RoleAdmin
      matrix={RESOURCES.map((r) => ({ resource: r, actions: RESOURCE_ACTIONS[r] }))}
      roles={roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        userCount: r._count.users,
        permissions: r.permissions.map((p) => p.permission),
      }))}
    />
  );
}

async function SystemTab() {
  const [p, items] = await Promise.all([resetPreview(db), itemsPreview(db)]);
  return <SystemAdmin ops={p.operations} master={p.master} demoUsers={p.demoUsers} items={items} />;
}
