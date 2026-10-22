import { describe, expect, it } from "vitest";
import { deriveStatus, type LineProgress } from "@/lib/orders";

const line = (q: Partial<LineProgress> = {}): LineProgress => ({
  lineId: "l", quantity: 100, planned: 0, produced: 0, defective: 0, pendingQc: 0, blocked: 0,
  released: 0, received: 0, shipped: 0, remainingToProduce: 100, remainingToDeliver: 100, ...q,
});

describe("deriveStatus", () => {
  it("keeps statuses people set on purpose", () => {
    for (const s of ["DRAFT", "ON_HOLD", "CANCELLED"] as const) expect(deriveStatus(s, [line({ shipped: 100 })], [], false)).toBe(s);
  });
  it("waits for planning until every line is planned", () => {
    expect(deriveStatus("CONFIRMED", [line({ planned: 100 }), line({ planned: 40 })], [], false)).toBe("WAITING_PLANNING");
    expect(deriveStatus("CONFIRMED", [line({ planned: 100 }), line({ planned: 100 })], [], false)).toBe("SCHEDULED");
  });
  it("is in production while a job runs", () => {
    expect(deriveStatus("SCHEDULED", [line({ planned: 100, produced: 20, released: 20 })], [{ status: "IN_PROGRESS" }], false)).toBe("IN_PRODUCTION");
  });
  it("is partially produced when stopped midway", () => {
    expect(deriveStatus("SCHEDULED", [line({ planned: 100, produced: 20, released: 20 })], [{ status: "PLANNED" }], false)).toBe("PARTIALLY_PRODUCED");
  });
  it("is NOT delivered just because production finished", () => {
    expect(deriveStatus("IN_PRODUCTION", [line({ planned: 100, produced: 100, released: 100 })], [], false)).toBe("COMPLETED");
  });
  it("waits for QC when the rest is pending inspection", () => {
    expect(deriveStatus("IN_PRODUCTION", [line({ produced: 100, released: 60, pendingQc: 40 })], [], false)).toBe("AWAITING_QC");
  });
  it("held or rejected pieces don't count as complete", () => {
    expect(deriveStatus("IN_PRODUCTION", [line({ produced: 100, released: 70, blocked: 30 })], [], false)).toBe("PARTIALLY_PRODUCED");
  });
  it("is ready for dispatch only when accepted AND received", () => {
    expect(deriveStatus("COMPLETED", [line({ produced: 100, released: 100, received: 50 })], [], false)).toBe("COMPLETED");
    expect(deriveStatus("COMPLETED", [line({ produced: 100, released: 100, received: 100 })], [], false)).toBe("READY_FOR_DISPATCH");
  });
  it("partial then full delivery comes from shipments", () => {
    expect(deriveStatus("READY_FOR_DISPATCH", [line({ released: 100, received: 100, shipped: 40 })], [], false)).toBe("PARTIALLY_DELIVERED");
    expect(deriveStatus("PARTIALLY_DELIVERED", [line({ released: 100, received: 100, shipped: 100 }), line({ released: 100, received: 100, shipped: 100 })], [], false)).toBe("DELIVERED");
  });
  it("an authorised exception closes the order", () => {
    expect(deriveStatus("PARTIALLY_DELIVERED", [line({ shipped: 90 })], [], true)).toBe("DELIVERED");
  });
});
