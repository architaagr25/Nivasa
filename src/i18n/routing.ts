import { defineRouting } from "next-intl/routing";

// English lives at the root, Hindi under /hi and Gujarati under /gu. Links sent on
// WhatsApp carry the language, so a buyer lands on the page in the language they chose.
export const routing = defineRouting({
  locales: ["en", "hi", "gu"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

/** Each language named in its own script, so a buyer can find theirs whatever the page is in. */
export const languageNames: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  gu: "ગુજરાતી",
};

/**
 * A few words of Hindi or Gujarati on a page in another language aren't worth a 100 KB web
 * font; the phone's own font draws them just as well.
 */
export function systemFontFor(lang: Locale, pageLocale: string) {
  return lang !== "en" && lang !== pageLocale ? "font-[system-ui]" : undefined;
}
