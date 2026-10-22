export const FACTORY_TZ = process.env.FACTORY_TIMEZONE ?? "Asia/Baghdad";

/** Offset in minutes of `tz` from UTC at instant `d` (e.g. +180 for Baghdad). */
function tzOffsetMinutes(d: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - d.getTime()) / 60000);
}

/** Start/end (UTC instants) of the factory's calendar day containing `d`. */
export function factoryDay(d = new Date(), tz = FACTORY_TZ) {
  const off = tzOffsetMinutes(d, tz);
  const local = new Date(d.getTime() + off * 60000);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = new Date(startLocal - off * 60000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/** "2026-10-30" (a date picked in the factory) → that day's start as a UTC instant. */
export function parseFactoryDate(s: string, tz = FACTORY_TZ): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Invalid date");
  return factoryDay(new Date(`${s}T12:00:00Z`), tz).start;
}

/** "2026-10-30T07:00" from a datetime-local input, read as factory local time → UTC instant. */
export function parseFactoryDateTime(s: string, tz = FACTORY_TZ): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) throw new Error("Invalid date/time");
  const guess = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return new Date(guess.getTime() - tzOffsetMinutes(guess, tz) * 60000);
}

/** UTC instant → "YYYY-MM-DD" in factory time (for date inputs). */
export function toFactoryDateInput(d: Date | null | undefined, tz = FACTORY_TZ) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** UTC instant → "YYYY-MM-DDTHH:mm" in factory time (for datetime-local inputs). */
export function toFactoryDateTimeInput(d: Date | null | undefined, tz = FACTORY_TZ) {
  if (!d) return "";
  const local = new Date(d.getTime() + tzOffsetMinutes(d, tz) * 60000);
  return local.toISOString().slice(0, 16);
}

/** Shift boundaries: A 07–15, B 15–23, C 23–07 (factory local time). */
export function currentShift(d = new Date(), tz = FACTORY_TZ): "A" | "B" | "C" {
  const hour = +new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(d);
  if (hour >= 7 && hour < 15) return "A";
  if (hour >= 15 && hour < 23) return "B";
  return "C";
}

export function formatDateTime(d: Date | string | null | undefined, locale = "en", tz = FACTORY_TZ) {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ-u-nu-latn" : locale, {
    timeZone: tz, dateStyle: "medium", timeStyle: "short",
  }).format(new Date(d));
}

export function formatDate(d: Date | string | null | undefined, locale = "en", tz = FACTORY_TZ) {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ-u-nu-latn" : locale, { timeZone: tz, dateStyle: "medium" }).format(new Date(d));
}

export const formatNumber = (n: number, locale = "en") =>
  new Intl.NumberFormat(locale === "ar" ? "ar-IQ-u-nu-latn" : locale).format(n);
