import { getTranslations } from "next-intl/server";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Employee Directory" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await pageUser("users:view");
  const t = await getTranslations();
  const q = (await searchParams).q?.trim();
  const users = await db.user.findMany({
    where: {
      active: true,
      ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { employeeId: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { fullName: "asc" },
    // Directory is visible to everyone, so it shows work details only — never login or security data.
    select: { id: true, employeeId: true, fullName: true, email: true, role: { select: { name: true } }, department: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader title={t("nav.employees")} subtitle={`${users.length}`} />
      <form className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder={t("common.search")}
          className="min-h-11 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-sm"
        />
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((u) => (
          <Card key={u.id}>
            <p className="font-semibold">{u.fullName}</p>
            <p className="text-xs text-muted" dir="ltr">#{u.employeeId}{u.email ? ` · ${u.email}` : ""}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="blue">{u.role.name}</Badge>
              {u.department && <Badge>{u.department.name}</Badge>}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
