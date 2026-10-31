// Central permission catalogue. Permissions are "resource:action" strings stored on roles.
// Every server action checks one of these on the server — the UI only mirrors it.

export const RESOURCES = [
  "orders",
  "production",
  "maintenance",
  "service",
  "qc",
  "warehouse",
  "stock", // stock movement documents: input, output, buy, sell
  "receipts", // printed receipts: saved layouts
  "customers", // customer accounts: balances, sales, payments
  "cash", // the safes: money in, money out (expenses), currency exchange, transfers between safes, expense categories
  "workers", // factory workers on the three shifts (no login): list, shifts, salaries, departures
  "attendance", // daily attendance reports (absences only), excuses, extra deduction days
  "penalties", // money penalties given by team leaders
  "blacklist", // the shared blacklist of all shifts
  "payroll", // monthly salary calculation, salary sheets, approval, finalization
  "products",
  "assets", // machines & molds
  "reports",
  "users",
  "roles",
  "settings",
  "audit",
] as const;

export const ACTIONS = ["view", "create", "edit", "approve", "export", "archive", "manage", "input", "output", "buy", "sell", "in", "out", "exchange", "transfer", "salary"] as const;

export type Resource = (typeof RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];
export type Permission = `${Resource}:${Action}`;

/** Which actions are meaningful for each resource (drives the admin permission matrix). */
export const RESOURCE_ACTIONS: Record<Resource, Action[]> = {
  orders: ["view", "create", "edit", "approve", "export", "archive"],
  production: ["view", "create", "edit", "export"],
  maintenance: ["view", "create", "edit", "approve", "export"],
  service: ["view", "create", "edit", "export"],
  qc: ["view", "create", "edit", "approve", "export"],
  warehouse: ["view", "create", "edit", "approve", "export"],
  stock: ["view", "input", "output", "buy", "sell"],
  cash: ["view", "in", "out", "exchange", "transfer", "manage", "export"],
  receipts: ["manage"],
  customers: ["view", "manage"],
  // view = own shift (team leader); manage = all shifts, add workers, transfer, leaders, confirm departures;
  // edit = record a departure; salary = change salaries (see salaries: payroll:view)
  workers: ["view", "edit", "manage", "salary"],
  attendance: ["create", "edit", "approve"], // submit (own shift) · correct with a reason · approve excuses and extra days
  penalties: ["create"], // give, change or cancel penalties for the own shift
  blacklist: ["view", "create", "manage"], // manage = approve removals
  payroll: ["view", "create", "approve", "manage"], // see salaries · work out, print, submit · approve (manager) · finalize, correct
  products: ["view", "create", "edit", "archive", "export"],
  assets: ["view", "create", "edit", "archive", "export"],
  reports: ["view", "export"],
  users: ["view", "manage"],
  roles: ["view", "manage"],
  settings: ["view", "manage"],
  audit: ["view", "export"],
};

export const ALL_PERMISSIONS: Permission[] = RESOURCES.flatMap((r) =>
  RESOURCE_ACTIONS[r].map((a) => `${r}:${a}` as Permission),
);

/** Global visibility rule: every active employee can read all factory business records. */
export const BUSINESS_VIEW: Permission[] = [
  "orders:view",
  "production:view",
  "maintenance:view",
  "service:view",
  "qc:view",
  "warehouse:view",
  "stock:view",
  "products:view",
  "assets:view",
  "reports:view",
  "users:view",
];

const p = (...list: Permission[]) => list;

/** Permissions that let someone see salaries and payroll (team leaders never have them). */
export const SALARY_PERMS: Permission[] = ["payroll:view"];

export const DEFAULT_ROLES: { name: string; description: string; permissions: Permission[] }[] = [
  {
    name: "Administrator",
    description: "Full control of the system, employees, roles and settings.",
    permissions: ALL_PERMISSIONS,
  },
  {
    name: "Sales Manager",
    description: "Gives production the order sheets: products and amounts.",
    permissions: p(
      ...BUSINESS_VIEW,
      "orders:create", "orders:edit", "orders:approve", "orders:export", "orders:archive",
      "products:create", "products:edit",
      "reports:export",
    ),
  },
  {
    name: "Production Team",
    description: "Enters each day's production (product, quantity, shift) and reports machine problems.",
    permissions: p(
      ...BUSINESS_VIEW,
      "production:create", "production:edit",
      "maintenance:create",
    ),
  },
  {
    name: "Technical Service Team",
    description: "Records mold changes, repairs and maintenance work.",
    permissions: p(
      ...BUSINESS_VIEW,
      "service:create", "service:edit",
      "maintenance:create", "maintenance:edit",
      "assets:edit",
    ),
  },
  {
    name: "Quality Control Team",
    description: "Inspects daily production, rejects defective pieces and tracks quality issues.",
    permissions: p(
      ...BUSINESS_VIEW,
      "qc:create", "qc:edit", "qc:approve", "qc:export",
      "maintenance:create", "maintenance:approve",
    ),
  },
  {
    name: "Warehouse Team",
    description: "Keeps product stock: records goods going out and count corrections.",
    permissions: p(
      ...BUSINESS_VIEW,
      "warehouse:create", "warehouse:edit", "warehouse:export",
      "stock:input", "stock:output",
    ),
  },
  {
    name: "Team Leader",
    description: "Leads one shift: daily attendance (absences only), penalties, excuse requests, departures; sees the shared blacklist. Never sees salaries.",
    permissions: p(
      ...BUSINESS_VIEW,
      "workers:view", "workers:edit",
      "attendance:create", "attendance:edit",
      "penalties:create",
      "blacklist:view", "blacklist:create",
    ),
  },
  {
    name: "Accountant",
    description: "Works out monthly payroll, prints each shift's salary sheet and submits it to the manager.",
    permissions: p(
      ...BUSINESS_VIEW,
      "workers:view", "blacklist:view",
      "payroll:view", "payroll:create",
      "cash:view", // the "see money" rule: salaries are only shown with it (owner, 31 Oct 2026)
    ),
  },
  {
    name: "Manager",
    description: "Reviews and approves (or rejects) the monthly payroll.",
    permissions: p(
      ...BUSINESS_VIEW,
      "workers:view", "blacklist:view",
      "payroll:view", "payroll:approve",
      "cash:view", // the "see money" rule: salaries are only shown with it
    ),
  },
];

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}
