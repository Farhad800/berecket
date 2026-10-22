import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "./config";

export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  const fallback = locale === "en" ? messages : (await import(`../../messages/en.json`)).default;
  return {
    locale,
    messages,
    timeZone: process.env.FACTORY_TIMEZONE ?? "Asia/Baghdad",
    // Untranslated keys fall back to English instead of showing raw keys.
    getMessageFallback: ({ namespace, key }) => {
      const path = [namespace, key].filter(Boolean).join(".").split(".");
      let node: unknown = fallback;
      for (const p of path) node = (node as Record<string, unknown> | undefined)?.[p];
      return typeof node === "string" ? node : key;
    },
    onError: () => {},
  };
});
