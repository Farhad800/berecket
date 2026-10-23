import "server-only";
import { db } from "./db";
import { factoryDay, toFactoryDateInput } from "./time";

/** "YYYY-MM-DD" of a factory calendar day → the value stored in ProductionEntry.day (a DATE). */
export function dayValue(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Invalid date");
  return new Date(`${ymd}T00:00:00Z`);
}
export const todayYmd = () => toFactoryDateInput(new Date());
export const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

/** Good pieces produced on a factory day, per shift. */
export async function producedOnDay(ymd: string) {
  const rows = await db.productionEntry.groupBy({ by: ["shift"], where: { day: dayValue(ymd) }, _sum: { quantity: true } });
  return Object.fromEntries((["A", "B", "C"] as const).map((s) => [s, rows.find((r) => r.shift === s)?._sum.quantity ?? 0])) as Record<"A" | "B" | "C", number>;
}

export { factoryDay };
