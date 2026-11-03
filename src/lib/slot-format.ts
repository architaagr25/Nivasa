import type { Lang } from "./format";

const LOCALES: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", gu: "gu-IN" };
const IST = "Asia/Kolkata";

/** "Sat, 7 Nov" */
export function slotDay(instant: Date, lang: Lang) {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(instant);
}

/** "11:00 am" */
export function slotTime(instant: Date, lang: Lang) {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

/** "Saturday, 7 November" */
export function slotDayLong(instant: Date, lang: Lang) {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: IST,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(instant);
}
