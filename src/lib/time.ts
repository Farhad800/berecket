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
