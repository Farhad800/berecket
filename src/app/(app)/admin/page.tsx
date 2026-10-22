import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { RESOURCES, RESOURCE_ACTIONS } from "@/lib/permissions";
import { Badge, Card, PageHeader, cn } from "@/components/ui";
import EmployeeAdmin from "./employee-admin";
import RoleAdmin from "./role-admin";

export const metadata = { title: "Administration" };

const TABS = ["employees", "roles", "audit"] as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  await pageUser("roles:manage");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "employees";
  const t = await getTranslations();
  const locale = await getLocale();

  const tabLabel = { employees: t("admin.employees"), roles: t("admin.roles"), audit: t("admin.audit") } as const;

  return (
    <>
      <PageHeader title={t("nav.administration")} />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((k) => (
          <Link
            key={k}
            href={`/admin?tab=${k}`}
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
      {tab === "audit" && <AuditTab locale={locale} page={Math.max(1, Number(sp.page) || 1)} />}
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

async function AuditTab({ locale, page }: { locale: string; page: number }) {
  const t = await getTranslations("admin");
  const size = 50;
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
      include: { user: { select: { fullName: true } } },
    }),
    db.auditLog.count(),
  ]);
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <Card className="p-0 sm:p-0">
      <div className="table-wrap">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-start text-xs text-muted">
            <tr>
              <th className="px-4 py-2 text-start">{t("when")}</th>
              <th className="px-4 py-2 text-start">{t("who")}</th>
              <th className="px-4 py-2 text-start">{t("what")}</th>
              <th className="px-4 py-2 text-start">{t("record")}</th>
              <th className="px-4 py-2 text-start">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-2 whitespace-nowrap text-muted">{formatDateTime(r.createdAt, locale)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{r.user?.fullName ?? "System"}</td>
                <td className="px-4 py-2"><Badge tone="blue">{r.action}</Badge></td>
                <td className="px-4 py-2 whitespace-nowrap text-xs">{r.entityType}</td>
                <td className="max-w-md px-4 py-2 text-xs break-words text-muted" dir="ltr">
                  {r.reason && <div><b>Reason:</b> {r.reason}</div>}
                  {r.after != null && <code>{JSON.stringify(r.after).slice(0, 240)}</code>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
        <span className="text-muted">{total} records</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="font-semibold text-brand-600" href={`/admin?tab=audit&page=${page - 1}`}>←</Link>}
          <span>{page} / {pages}</span>
          {page < pages && <Link className="font-semibold text-brand-600" href={`/admin?tab=audit&page=${page + 1}`}>→</Link>}
        </div>
      </div>
    </Card>
  );
}
