import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, DEFAULT_ROLES, isPermission } from "@/lib/permissions";
import { dayValue, ymdOf } from "@/lib/production";

const role = (name: string) => DEFAULT_ROLES.find((r) => r.name === name)!.permissions;

describe("permissions after the simplification", () => {
  it("has no schedule or shipment permissions", () => {
    expect(ALL_PERMISSIONS.some((p) => /^(schedule|shipments):/.test(p))).toBe(false);
  });
  it("customer accounts (26 Oct 2026) are their own permission, not given to anyone by default except the Administrator", () => {
    expect(isPermission("customers:view") && isPermission("customers:manage")).toBe(true);
    for (const r of ["Sales Manager", "Production Team", "Warehouse Team", "Quality Control Team", "Technical Service Team"]) expect(role(r).some((p) => p.startsWith("customers:"))).toBe(false);
  });
  it("lets the sales manager create, edit and delete orders", () => {
    expect(role("Sales Manager")).toEqual(expect.arrayContaining(["orders:create", "orders:edit", "orders:archive"]));
  });
  it("lets production enter daily quantities but not touch orders", () => {
    expect(role("Production Team")).toContain("production:create");
    expect(role("Production Team")).not.toContain("orders:create");
  });
  it("lets the warehouse take goods out but leaves adjustments to supervisors", () => {
    expect(role("Warehouse Team")).toContain("warehouse:create");
    expect(role("Warehouse Team")).not.toContain("warehouse:approve");
  });
});

describe("production days", () => {
  it("stores a factory day as midnight UTC of that date", () => {
    expect(dayValue("2026-10-23").toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect(ymdOf(dayValue("2026-02-28"))).toBe("2026-02-28");
  });
  it("rejects anything that isn't YYYY-MM-DD", () => {
    expect(() => dayValue("23/10/2026")).toThrow();
    expect(() => dayValue("2026-10-23'; DROP")).toThrow();
  });
});
