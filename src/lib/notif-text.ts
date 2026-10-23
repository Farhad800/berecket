import "server-only";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import tr from "../../messages/tr.json";

const MESSAGES = { en, ar, tr } as const;
type Loc = keyof typeof MESSAGES;
export type NotifData = Record<string, string | number>;

/**
 * Notification text in the reader's language, built from messages "nt.<type>.title/body".
 * Returns null when the type has no translation (older notifications keep their stored text).
 */
export function notifText(type: string, data: unknown, locale: string): { title: string; body: string | null } | null {
  if (!data || typeof data !== "object") return null; // older notifications: keep their stored text
  const loc: Loc = (locale in MESSAGES ? locale : "en") as Loc;
  const t = createTranslator({ locale: loc, messages: MESSAGES[loc] as never, onError: () => { throw new Error("nt"); } }) as unknown as {
    (k: string, v?: object): string;
    has: (k: string) => boolean;
  };
  const key = `nt.${type}`;
  if (!t.has(`${key}.title`)) return null;
  const d = data as NotifData;
  const vals = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === "number" ? v.toLocaleString("en") : String(v)]));
  try {
    return {
      title: t(`${key}.title`, vals),
      body: t.has(`${key}.body`) ? t(`${key}.body`, vals) : null,
    };
  } catch {
    return null;
  }
}
