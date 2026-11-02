import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";

export async function SiteHeader() {
  const t = await getTranslations("nav");
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="font-heading text-2xl font-normal tracking-tight">
          Nivasa
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-5">
          <Link
            href="/#projects"
            className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            {t("projects")}
          </Link>
          <Link
            href="/visits"
            className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            {t("myVisits")}
          </Link>
          <LanguageSwitcher label={t("language")} />
        </nav>
      </div>
    </header>
  );
}
