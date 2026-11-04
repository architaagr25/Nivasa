import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listProjects } from "@/server/projects/queries";

export async function SiteFooter() {
  const [t, tp, tn, projects] = await Promise.all([
    getTranslations("footer"),
    getTranslations("project"),
    getTranslations("nav"),
    listProjects(),
  ]);
  const link = "block text-muted-foreground hover:text-foreground";

  return (
    <footer className="site-footer mt-24 border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 text-sm sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <p className="font-heading text-xl">Nivasa</p>
          <p className="text-muted-foreground">{t("company")}</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{t("priceNote")}</p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            {tp("rera")}
          </p>
          <ul className="space-y-1.5">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="text-foreground hover:underline">
                  {p.name}
                </Link>
                <span className="block font-mono text-xs break-all text-muted-foreground">
                  {p.reraNumber}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <ul className="space-y-2">
          <li>
            <Link href="/chat" className={link}>
              {tn("ask")}
            </Link>
          </li>
          <li>
            <Link href="/book" className={link}>
              {tn("book")}
            </Link>
          </li>
          <li>
            <Link href="/visits" className={link}>
              {tn("myVisits")}
            </Link>
          </li>
          <li>
            <Link href="/privacy" className={link}>
              {t("privacy")}
            </Link>
          </li>
          <li className="pt-2">
            <NextLink href="/staff" className={link}>
              {t("staff")}
            </NextLink>
          </li>
        </ul>
      </div>
    </footer>
  );
}
