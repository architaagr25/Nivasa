import { defineRouting } from "next-intl/routing";

// English lives at the root, Hindi under /hi and Gujarati under /gu. Links sent on
// WhatsApp carry the language, so a buyer lands on the page in the language they chose.
export const routing = defineRouting({
  locales: ["en", "hi", "gu"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
