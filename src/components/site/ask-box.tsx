import Form from "next/form";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowUp } from "lucide-react";
import { getPathname, Link } from "@/i18n/navigation";

/**
 * The home page's question box. It is a plain form that opens the chat with the question
 * already asked, so it works before any script has loaded.
 */
export async function AskBox() {
  const [t, locale] = await Promise.all([getTranslations("chat"), getLocale()]);
  const suggestions = [t("s1"), t("s2"), t("s4")];

  return (
    <div className="max-w-lg space-y-3">
      <Form
        action={getPathname({ href: "/chat", locale })}
        className="flex items-center gap-2 rounded-full border border-border bg-card p-1.5 pl-5 shadow-sm transition-colors focus-within:border-foreground/40 focus-within:ring-2 focus-within:ring-ring/30"
      >
        <label htmlFor="ask-box" className="sr-only">
          {t("askHero")}
        </label>
        <input
          id="ask-box"
          name="q"
          required
          maxLength={800}
          autoComplete="off"
          enterKeyHint="send"
          placeholder={t("askHero")}
          className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          aria-label={t("send")}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
        >
          <ArrowUp className="size-5" aria-hidden />
        </button>
      </Form>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("tryAsking")}</span>
        {suggestions.map((q) => (
          <Link
            key={q}
            href={{ pathname: "/chat", query: { q } }}
            className="inline-flex min-h-9 items-center rounded-full border border-border px-3 transition-colors hover:border-foreground/40 hover:bg-secondary"
          >
            {q}
          </Link>
        ))}
      </div>
    </div>
  );
}
