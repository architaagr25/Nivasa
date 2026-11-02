import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, CalendarCheck, MessageCircle, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatInr } from "@/lib/format";
import { listProjects } from "@/server/projects/queries";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const [t, projects] = await Promise.all([getTranslations("home"), listProjects()]);

  const steps = [
    { n: "01", title: t("step1Title"), body: t("step1Body"), icon: MessageCircle },
    { n: "02", title: t("step2Title"), body: t("step2Body"), icon: CalendarCheck },
    { n: "03", title: t("step3Title"), body: t("step3Body"), icon: UserRound },
  ];

  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 pt-10 pb-16 sm:px-8 md:grid-cols-[1.05fr_1fr] md:items-center md:gap-14 md:pt-20 md:pb-24">
        <div className="order-2 space-y-7 md:order-1">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="text-[2.6rem] leading-[1.05] font-light sm:text-6xl">{t("title")}</h1>
          <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">{t("lead")}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="xl">
              <Link href="/chat">
                {t("ask")}
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild size="xl" variant="outline">
              <Link href={{ pathname: "/chat", query: { intent: "book" } }}>{t("book")}</Link>
            </Button>
          </div>
        </div>
        <div className="relative order-1 aspect-[4/3] overflow-hidden rounded-2xl md:order-2 md:aspect-[4/5]">
          <Image
            src="/images/home-hero.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 45vw, 100vw"
            className="object-cover"
          />
        </div>
      </section>

      <section id="projects" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-12 sm:px-8">
        <h2 className="mb-8 text-3xl font-light sm:text-4xl">{t("projectsTitle")}</h2>
        <div className="grid gap-8 md:grid-cols-2">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="group block">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                <Image
                  src={p.heroImage}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                />
              </div>
              <div className="mt-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-normal">{p.name}</h3>
                  <p className="mt-1 text-muted-foreground">
                    {p.locality} · {t("homes")}
                  </p>
                </div>
                <p className="shrink-0 pt-1 text-right text-sm">
                  {t("from", { price: formatInr(p.startingPriceInr, locale) })}
                  <span className="mt-1 flex items-center justify-end gap-1 text-muted-foreground transition-colors group-hover:text-foreground">
                    {t("view")} <ArrowRight className="size-3.5" />
                  </span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <h2 className="mb-10 text-3xl font-light sm:text-4xl">{t("howTitle")}</h2>
        <ol className="grid gap-10 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="space-y-3 border-t border-border pt-6">
              <div className="flex items-center justify-between">
                <span className="font-heading text-sm text-muted-foreground">{s.n}</span>
                <s.icon className="size-5 text-sage" aria-hidden />
              </div>
              <h3 className="text-xl font-normal">{s.title}</h3>
              <p className="leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col gap-6 rounded-2xl bg-sage-soft px-6 py-10 sm:px-10 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl space-y-2">
            <h2 className="text-2xl font-light sm:text-3xl">{t("personTitle")}</h2>
            <p className="text-accent-foreground/80">{t("personBody")}</p>
          </div>
          <Button asChild size="xl">
            <Link href={{ pathname: "/chat", query: { person: "1" } }}>{t("ask")}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
