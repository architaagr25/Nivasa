"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

// Each option is written in its own script so a buyer can find their language
// even if they can't read the one the page is currently in.
const OPTIONS: { locale: Locale; label: string; name: string }[] = [
  { locale: "en", label: "EN", name: "English" },
  { locale: "hi", label: "हिं", name: "हिन्दी" },
  { locale: "gu", label: "ગુ", name: "ગુજરાતી" },
];

// Read the address only when a language is tapped. Reading it during render would make every
// dynamic page wait on the URL, and this way the query (e.g. the chosen slot) is kept too.
function currentPathWithoutLocale() {
  const { pathname, search } = window.location;
  const prefix = routing.locales.find((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  const path = prefix ? pathname.slice(prefix.length + 1) || "/" : pathname;
  return path + search;
}

export function LanguageSwitcher({ label }: { label: string }) {
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex rounded-full border border-border bg-card p-0.5 transition-opacity",
        pending && "opacity-60",
      )}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.locale}
          type="button"
          lang={o.locale}
          title={o.name}
          aria-label={o.name}
          aria-pressed={current === o.locale}
          onClick={() =>
            startTransition(() =>
              router.replace(currentPathWithoutLocale(), { locale: o.locale, scroll: false }),
            )
          }
          className={cn(
            "min-w-10 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors",
            current === o.locale
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
