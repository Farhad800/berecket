import type { Permission } from "./permissions";

export type NavItem = { href: string; key: string; icon: string; perm: Permission };
export type NavGroup = { key: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { key: "main", items: [
    { href: "/dashboard", key: "dashboard", icon: "LayoutDashboard", perm: "orders:view" },
    { href: "/notifications", key: "notifications", icon: "Bell", perm: "orders:view" },
  ]},
  { key: "sales", items: [
    { href: "/orders", key: "orders", icon: "ClipboardList", perm: "orders:view" },
    { href: "/schedule", key: "schedule", icon: "CalendarRange", perm: "schedule:view" },
  ]},
  { key: "operations", items: [
    { href: "/production", key: "production", icon: "Factory", perm: "production:view" },
    { href: "/service", key: "service", icon: "Wrench", perm: "service:view" },
    { href: "/history", key: "history", icon: "History", perm: "maintenance:view" },
    { href: "/qc", key: "qc", icon: "ShieldCheck", perm: "qc:view" },
    { href: "/inventory", key: "inventory", icon: "Warehouse", perm: "warehouse:view" },
    { href: "/shipments", key: "shipments", icon: "Truck", perm: "shipments:view" },
  ]},
  { key: "masterData", items: [
    { href: "/customers", key: "customers", icon: "Building2", perm: "customers:view" },
    { href: "/products", key: "products", icon: "Package", perm: "products:view" },
    { href: "/assets", key: "assets", icon: "Cog", perm: "assets:view" },
  ]},
  { key: "insights", items: [
    { href: "/reports", key: "reports", icon: "BarChart3", perm: "reports:view" },
    { href: "/employees", key: "employees", icon: "Users", perm: "users:view" },
  ]},
  { key: "admin", items: [
    { href: "/admin", key: "administration", icon: "KeyRound", perm: "roles:manage" },
  ]},
];
