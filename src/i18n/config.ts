export const LOCALES = ["en", "ar", "tr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "bfms_locale";
export const RTL_LOCALES: Locale[] = ["ar"];
export const LOCALE_LABELS: Record<Locale, string> = { en: "English", ar: "العربية", tr: "Türkçe" };

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);
export const dirOf = (l: Locale) => (RTL_LOCALES.includes(l) ? "rtl" : "ltr");
