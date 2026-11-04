import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { Briefcase } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { listProjects } from "@/server/projects/queries";
import { LanguageSwitcher } from "./language-switcher";
import { SiteMenu } from "./site-menu";

export async function SiteHeader() {
  const [t, tf, projects] = await Promise.all([
    getTranslations("nav"),
    getTranslations("footer"),
    listProjects(),
  ]);
  const link = "text-muted-foreground transition-colors hover:text-foreground";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="font-heading text-2xl font-normal tracking-tight">
          Nivasa
        </Link>
        <nav className="hidden items-center gap-6 text-sm lg:flex" aria-label={t("menu")}>
          <Link href="/#projects" className={link}>
            {t("projects")}
          </Link>
          <Link href="/chat" className={link}>
            {t("ask")}
          </Link>
          <Link href="/visits" className={link}>
            {t("myVisits")}
          </Link>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher label={t("language")} />
          <Link
            href="/book"
            className="hidden min-h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:inline-flex"
          >
            {t("book")}
          </Link>
          <NextLink
            href="/staff"
            className="hidden min-h-10 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground lg:inline-flex"
          >
            <Briefcase className="size-4" aria-hidden />
            {t("staff")}
          </NextLink>
          <SiteMenu
            projects={projects.map((p) => ({ id: p.id, name: p.name, locality: p.locality }))}
            labels={{
              menu: t("menu"),
              close: t("close"),
              projects: t("projectsHeading"),
              ask: t("ask"),
              book: t("book"),
              myVisits: t("myVisits"),
              privacy: tf("privacy"),
              staff: tf("staff"),
              language: t("language"),
            }}
          />
        </div>
      </div>
    </header>
  );
}
