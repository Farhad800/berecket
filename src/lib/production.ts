import "server-only";
import { factoryDay, toFactoryDateInput } from "./time";

/** "YYYY-MM-DD" of a factory calendar day → the value stored in ProductionEntry.day (a DATE). */
export function dayValue(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Invalid date");
  return new Date(`${ymd}T00:00:00Z`);
}
export const todayYmd = () => toFactoryDateInput(new Date());
export const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

export { factoryDay };
