import type { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { pageUser, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import ListToolbar from "@/components/list-toolbar";
import MasterList from "@/components/master-list";
import { saveCustomerAction } from "@/app/actions/masterdata";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string }> }) {
  const me = await pageUser("customers:view");
  const t = await getTranslations();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const where: Prisma.CustomerWhereInput = {
    archivedAt: sp.archived === "1" ? { not: null } : null,
    ...(q ? { OR: [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { contactName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ] } : {}),
  };
  const customers = await db.customer.findMany({
    where,
    orderBy: { name: "asc" },
    take: 300,
    include: { _count: { select: { orders: { where: { status: { notIn: ["DELIVERED", "CANCELLED"] } } } } } },
  });

  const fields = [
    { name: "name", label: t("md.customerName"), required: true, wide: true },
    { name: "code", label: t("md.code"), hint: t("md.codeAuto"), ltr: true },
    { name: "contactName", label: t("md.contactName") },
    { name: "phone", label: t("md.phone"), type: "tel" as const, ltr: true },
    { name: "email", label: t("md.email"), type: "email" as const, ltr: true },
    { name: "address", label: t("md.address"), wide: true },
    { name: "notes", label: t("md.notes"), type: "textarea" as const },
  ];

  return (
    <>
      <PageHeader title={t("nav.customers")} subtitle={`${customers.length}`} />
      <ListToolbar
        filters={[{ name: "archived", label: t("common.active"), options: [{ value: "1", label: t("common.archived") }] }]}
      />
      <MasterList
        kind="customer"
        newLabel={t("md.newCustomer")}
        fields={fields}
        editFields={fields.filter((f) => f.name !== "code")}
        action={saveCustomerAction}
        canCreate={can(me, "customers:create")}
        canEdit={can(me, "customers:edit")}
        canArchive={can(me, "customers:archive")}
        rows={customers.map((c) => ({
          id: c.id,
          title: c.name,
          code: c.code,
          subtitle: c.address ?? undefined,
          archived: !!c.archivedAt,
          badges: c._count.orders > 0 ? [{ label: t("md.openOrders", { n: c._count.orders }), tone: "blue" as const }] : [],
          facts: [
            ...(c.contactName ? [{ label: t("md.contactName"), value: c.contactName }] : []),
            ...(c.phone ? [{ label: t("md.phone"), value: c.phone }] : []),
            ...(c.email ? [{ label: t("md.email"), value: c.email }] : []),
          ],
          initial: { ...c },
        }))}
      />
    </>
  );
}
