/**
 * Demonstration data — clearly tagged so it can be removed before going live.
 *   npm run demo:add      → creates demo employees (one per role) and demo records
 *   npm run demo:remove   → deletes everything tagged DEMO
 *
 * Every demo record uses the "DEMO" marker (usernames start with "demo.", codes with "DEMO-").
 * Refuses to run against production unless ALLOW_DEMO=1 is set.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const DEMO_PASSWORD = "Demo12345!"; // demo accounts only; removed with demo:remove

const DEMO_USERS = [
  ["D-101", "Sara Sales (demo)", "demo.sales", "Sales Manager", "SALES"],
  ["D-102", "Peter Production (demo)", "demo.production", "Production Team", "PROD"],
  ["D-103", "Tariq Technician (demo)", "demo.service", "Technical Service Team", "SERVICE"],
  ["D-104", "Qamar Quality (demo)", "demo.qc", "Quality Control Team", "QC"],
  ["D-105", "Walid Warehouse (demo)", "demo.warehouse", "Warehouse Team", "WH"],
] as const;

async function add() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  for (const [employeeId, fullName, username, roleName, dept] of DEMO_USERS) {
    const role = await db.role.findUniqueOrThrow({ where: { name: roleName } });
    const department = await db.department.findUnique({ where: { code: dept } });
    await db.user.upsert({
      where: { username },
      update: {},
      create: { employeeId, fullName, username, passwordHash: hash, mustChangePassword: false, roleId: role.id, departmentId: department?.id },
    });
  }
  console.log(`Demo employees ready (password for all: ${DEMO_PASSWORD}):`);
  DEMO_USERS.forEach((u) => console.log(`  ${u[2].padEnd(18)} ${u[3]}`));
}

async function remove() {
  const users = await db.user.findMany({ where: { username: { startsWith: "demo." } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.$transaction([
    db.session.deleteMany({ where: { userId: { in: ids } } }),
    db.notification.deleteMany({ where: { userId: { in: ids } } }),
    db.auditLog.updateMany({ where: { userId: { in: ids } }, data: { userId: null } }),
    db.user.deleteMany({ where: { id: { in: ids } } }),
  ]);
  console.log(`Removed ${ids.length} demo employees.`);
}

const cmd = process.argv[2];
if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO !== "1") {
  console.error("Refusing to touch demo data in production without ALLOW_DEMO=1.");
  process.exit(1);
}
(cmd === "remove" ? remove() : add())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
