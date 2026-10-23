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

  // Demo master data so orders can be tried straight away. All codes start with DEMO-.
  const products = [
    ["DEMO-PF500", "500 ml PET preform (demo)", 12, true],
    ["DEMO-CAP28", "28 mm bottle cap (demo)", 6, false],
    ["DEMO-JAR1L", "1 L food jar (demo)", 18, true],
  ] as const;
  for (const [code, name, cycle, qc] of products) {
    await db.product.upsert({ where: { code }, update: {}, create: { code, name, cycleTimeSec: cycle, qcRequired: qc, material: "PET / PP" } });
  }
  for (const [code, model, tonnage] of [["DEMO-M01", "Si-180", 180], ["DEMO-M02", "Si-250", 250], ["DEMO-M03", "Si-350", 350]] as const) {
    await db.machine.upsert({ where: { code }, update: {}, create: { code, name: `Toyo ${model} (demo)`, manufacturer: "Toyo", model, tonnage } });
  }
  for (const [code, product, cav] of [["DEMO-MD-PF500", "DEMO-PF500", 32], ["DEMO-MD-CAP28", "DEMO-CAP28", 48], ["DEMO-MD-JAR1L", "DEMO-JAR1L", 4]] as const) {
    const m = await db.mold.upsert({ where: { code }, update: {}, create: { code, name: `${product} mold (demo)`, cavities: cav } });
    await db.product.update({ where: { code: product }, data: { moldId: m.id } });
  }
  console.log("Demo products, machines and molds ready (codes start with DEMO-).");
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
  // Demo master data — only if nothing real refers to it any more.
  const tryDelete = async (label: string, fn: () => Promise<{ count: number }>) => {
    try {
      const r = await fn();
      if (r.count) console.log(`Removed ${r.count} demo ${label}.`);
    } catch {
      console.log(`Kept demo ${label}: orders or history still use them. Clear test data first (Administration → System).`);
    }
  };
  await tryDelete("molds", () => db.mold.deleteMany({ where: { code: { startsWith: "DEMO-" } } }));
  await tryDelete("machines", () => db.machine.deleteMany({ where: { code: { startsWith: "DEMO-" } } }));
  await tryDelete("products", () => db.product.deleteMany({ where: { code: { startsWith: "DEMO-" } } }));
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
