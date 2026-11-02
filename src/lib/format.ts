export type Lang = "en" | "hi" | "gu";

const LOCALES: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", gu: "gu-IN" };

/** "Sun, 1 Nov, 11:00 am" in IST, in the buyer's language. */
export function formatVisitTime(instant: Date, lang: Lang = "en"): string {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

/** "11:00 am" in IST. */
export function formatClock(instant: Date, lang: Lang = "en"): string {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

/** 7_800_000 -> "₹78 lakh", 10_200_000 -> "₹1.02 crore" */
export function formatInr(amount: number): string {
  if (amount >= 10_000_000) return `₹${+(amount / 10_000_000).toFixed(2)} crore`;
  if (amount >= 100_000) return `₹${+(amount / 100_000).toFixed(1)} lakh`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function mapsLink(latitude: string, longitude: string): string {
  return `https://maps.google.com/?q=${latitude},${longitude}`;
}
