// Central permission catalogue. Permissions are "resource:action" strings stored on roles.
// Every server action checks one of these on the server — the UI only mirrors it.

export const RESOURCES = [
  "orders",
  "schedule",
  "production",
  "maintenance",
  "service",
  "qc",
  "warehouse",
  "shipments",
  "customers",
  "products",
  "assets", // machines & molds
  "reports",
  "users",
  "roles",
  "settings",
  "audit",
] as const;

export const ACTIONS = ["view", "create", "edit", "approve", "export", "archive", "manage"] as const;

export type Resource = (typeof RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];
export type Permission = `${Resource}:${Action}`;

/** Which actions are meaningful for each resource (drives the admin permission matrix). */
export const RESOURCE_ACTIONS: Record<Resource, Action[]> = {
  orders: ["view", "create", "edit", "approve", "export", "archive"],
  schedule: ["view", "create", "edit", "export"],
  production: ["view", "create", "edit", "export"],
  maintenance: ["view", "create", "edit", "approve", "export"],
  service: ["view", "create", "edit", "export"],
  qc: ["view", "create", "edit", "approve", "export"],
  warehouse: ["view", "create", "edit", "approve", "export"],
  shipments: ["view", "create", "edit", "approve", "export"],
  customers: ["view", "create", "edit", "archive", "export"],
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
  "schedule:view",
  "production:view",
  "maintenance:view",
  "service:view",
  "qc:view",
  "warehouse:view",
  "shipments:view",
  "customers:view",
  "products:view",
  "assets:view",
  "reports:view",
  "users:view",
];

const p = (...list: Permission[]) => list;

export const DEFAULT_ROLES: { name: string; description: string; permissions: Permission[] }[] = [
  {
    name: "Administrator",
    description: "Full control of the system, employees, roles and settings.",
    permissions: ALL_PERMISSIONS,
  },
  {
    name: "Sales Manager",
    description: "Creates customer orders, sets deadlines and plans production.",
    permissions: p(
      ...BUSINESS_VIEW,
      "orders:create", "orders:edit", "orders:approve", "orders:export", "orders:archive",
      "schedule:create", "schedule:edit", "schedule:export",
      "customers:create", "customers:edit", "customers:export",
      "products:create", "products:edit",
      "shipments:approve",
      "reports:export",
    ),
  },
  {
    name: "Production Team",
    description: "Runs production jobs, reports quantities, downtime and machine problems.",
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
    description: "Inspects batches, approves, holds or rejects products and tracks defects.",
    permissions: p(
      ...BUSINESS_VIEW,
      "qc:create", "qc:edit", "qc:approve", "qc:export",
      "maintenance:create", "maintenance:approve",
    ),
  },
  {
    name: "Warehouse Team",
    description: "Receives finished goods, manages stock and dispatches shipments.",
    permissions: p(
      ...BUSINESS_VIEW,
      "warehouse:create", "warehouse:edit", "warehouse:export",
      "shipments:create", "shipments:edit", "shipments:approve", "shipments:export",
    ),
  },
];

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}
