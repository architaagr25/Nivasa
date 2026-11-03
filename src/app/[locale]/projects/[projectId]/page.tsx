import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ArrowLeft,
  Baby,
  Building2,
  Car,
  Dumbbell,
  ExternalLink,
  Footprints,
  Sparkles,
  Trees,
  Users,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { formatInr, mapsLink } from "@/lib/format";
import { amenities, homeTypes, type AmenityIcon } from "@/server/projects/present";
import { WeekPicker, WeekPickerSkeleton } from "@/components/site/week-picker";
import { getProject, listProjects, type ProjectFact } from "@/server/projects/queries";

export async function generateStaticParams() {
  const projects = await listProjects();
  return routing.locales.flatMap((locale) => projects.map((p) => ({ locale, projectId: p.id })));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/projects/[projectId]">): Promise<Metadata> {
  const { projectId } = await params;
  const project = await getProject(projectId);
  return project ? { title: project.name, description: project.locality } : {};
}

const GALLERY: Record<string, string[]> = {
  "project-1": ["/images/p1-living.webp", "/images/p1-interior.webp"],
  "project-2": ["/images/p2-living.webp", "/images/p2-interior.webp"],
};

// The order sections appear in. Prices sit right after the homes they belong to.
const SECTIONS: ProjectFact["category"][] = ["overview", "possession", "payment"];

const AMENITY_ICONS: Record<AmenityIcon, LucideIcon> = {
  pool: Waves,
  gym: Dumbbell,
  clubhouse: Building2,
  kids: Baby,
  garden: Trees,
  track: Footprints,
  hall: Users,
  parking: Car,
  other: Sparkles,
};

export default function ProjectPage({ params }: PageProps<"/[locale]/projects/[projectId]">) {
  return (
    <Suspense fallback={<ProjectSkeleton />}>
      <ProjectContent params={params} />
    </Suspense>
  );
}

function ProjectSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-5 pt-12 sm:px-8" aria-busy="true">
      <div className="h-3 w-32 rounded bg-muted" />
      <div className="mt-4 h-12 w-64 rounded bg-muted" />
      <div className="mt-10 aspect-[16/10] rounded-2xl bg-muted md:aspect-[21/9]" />
    </div>
  );
}

async function ProjectContent({
  params,
}: Pick<PageProps<"/[locale]/projects/[projectId]">, "params">) {
  const { locale, projectId } = (await params) as { locale: Locale; projectId: string };
  setRequestLocale(locale);
  const [t, th, ts, project] = await Promise.all([
    getTranslations("project"),
    getTranslations("homes"),
    getTranslations("slots"),
    getProject(projectId),
  ]);
  if (!project) notFound();

  const byCategory = (c: ProjectFact["category"]) => project.facts.filter((f) => f.category === c);
  const heading: Record<ProjectFact["category"], string> = {
    overview: t("overview"),
    configuration: t("homes"),
    pricing: t("pricing"),
    amenities: t("amenities"),
    possession: t("possession"),
    payment: t("payment"),
    location: t("location"),
    legal: t("legal"),
  };
  const lat = Number(project.latitude);
  const lng = Number(project.longitude);
  const bbox = [lng - 0.012, lat - 0.008, lng + 0.012, lat + 0.008].join(",");

  return (
    <article className="pb-28 md:pb-0">
      <div className="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
        <Link
          href="/#projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {t("back")}
        </Link>
      </div>

      <header className="mx-auto max-w-6xl px-5 pt-6 pb-10 sm:px-8">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          {project.locality}
        </p>
        <h1 className="mt-3 text-5xl font-light sm:text-6xl">{project.name}</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("rera")} <span className="font-mono text-foreground">{project.reraNumber}</span>
        </p>
      </header>

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-muted md:aspect-[21/9]">
          <Image
            src={project.heroImage}
            alt=""
            fill
            priority
            sizes="(min-width: 1152px) 1152px, 100vw"
            className="object-cover"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(GALLERY[project.id] ?? []).map((src) => (
            <div key={src} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
              <Image src={src} alt="" fill sizes="50vw" className="object-cover" />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("photosNote")}</p>
      </div>

      <div className="mx-auto mt-14 grid max-w-6xl gap-12 px-5 sm:px-8 md:grid-cols-[1fr_320px]">
        <div className="space-y-12">
          <section className="border-t border-border pt-6">
            <h2 className="mb-5 text-2xl font-light">{th("title")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {homeTypes(project.facts).map((h) => (
                <div key={h.bhk} className="rounded-2xl border border-border bg-card p-6">
                  <p className="font-heading text-3xl font-light">{h.bhk.replace("BHK", " BHK")}</p>
                  {h.carpetSqFt && (
                    <p className="tabular mt-3 text-lg">
                      {h.carpetSqFt.toLocaleString("en-IN")} sq ft
                      <span className="ml-1.5 text-sm text-muted-foreground">{th("carpet")}</span>
                    </p>
                  )}
                  {h.startingPriceInr && (
                    <p className="mt-1">
                      {th("from", { price: formatInr(h.startingPriceInr, locale) })}
                      <span className="block text-xs text-muted-foreground">
                        {th("indicative")}
                      </span>
                    </p>
                  )}
                  <a
                    href="#visit"
                    className="mt-5 inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {th("seeTimes")} →
                  </a>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-5 text-2xl font-light">{t("amenities")}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {amenities(project.facts).map((a) => {
                const Icon = AMENITY_ICONS[a.icon];
                return (
                  <li
                    key={a.name}
                    className="flex items-center gap-3 rounded-xl bg-secondary/70 px-4 py-3.5 text-sm"
                  >
                    <Icon className="size-5 shrink-0 text-sage" aria-hidden />
                    {a.name}
                  </li>
                );
              })}
            </ul>
            {byCategory("amenities")
              .filter((f) => /park/i.test(f.label))
              .map((f) => (
                <p
                  key={f.code}
                  className="mt-4 flex items-start gap-3 text-sm text-muted-foreground"
                >
                  <Car className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {f.value}
                </p>
              ))}
          </section>

          {SECTIONS.map((c) => {
            const items = byCategory(c);
            if (!items.length) return null;
            return (
              <section key={c} className="border-t border-border pt-6">
                <h2 className="mb-5 text-2xl font-light">{heading[c]}</h2>
                <dl className="space-y-4">
                  {items.map((f) => (
                    <div
                      key={f.code}
                      className={
                        items.length > 1 ? "grid gap-1 sm:grid-cols-[180px_1fr] sm:gap-6" : ""
                      }
                    >
                      {/* A lone fact under its own heading doesn't need a label repeating it. */}
                      <dt
                        className={items.length > 1 ? "text-sm text-muted-foreground" : "sr-only"}
                      >
                        {f.label}
                      </dt>
                      <dd className="leading-relaxed">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}

          <section id="visit" className="scroll-mt-24 rounded-2xl bg-sage-soft p-6 sm:p-8">
            <h2 className="text-2xl font-light">{ts("weekTitle")}</h2>
            <p className="mt-1 mb-6 text-sm text-accent-foreground/80">{ts("weekLead")}</p>
            <Suspense fallback={<WeekPickerSkeleton />}>
              <WeekPicker projectId={project.id} locale={locale} />
            </Suspense>
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="mb-5 text-2xl font-light">{t("location")}</h2>
            {byCategory("location").map((f) => (
              <p key={f.code} className="mb-2 leading-relaxed">
                {f.value}
              </p>
            ))}
            <div className="mt-5 overflow-hidden rounded-xl border border-border">
              <iframe
                title={`${project.name} – ${t("location")}`}
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`}
                className="h-72 w-full"
                loading="lazy"
              />
            </div>
            <a
              href={mapsLink(project.latitude, project.longitude)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
            >
              {t("openMap")} <ExternalLink className="size-3.5" />
            </a>
          </section>
        </div>

        <aside className="hidden md:block">
          <div className="sticky top-24 space-y-3 rounded-2xl border border-border bg-card p-6">
            <p className="font-heading text-xl">{project.name}</p>
            <p className="text-sm text-muted-foreground">{project.locality}</p>
            <div className="space-y-2 pt-3">
              <Button asChild size="xl" className="w-full">
                <a href="#visit">{t("book")}</a>
              </Button>
              <Button asChild size="xl" variant="outline" className="w-full">
                <Link href={{ pathname: "/chat", query: { project: project.id } }}>{t("ask")}</Link>
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {/* On phones the two actions stay within thumb reach at the bottom of the screen. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md gap-2">
          <Button asChild size="xl" variant="outline" className="min-w-0 flex-1">
            <Link href={{ pathname: "/chat", query: { project: project.id } }}>
              {t("askShort")}
            </Link>
          </Button>
          <Button asChild size="xl" className="min-w-0 flex-1">
            <a href="#visit">{t("bookShort")}</a>
          </Button>
        </div>
      </div>
    </article>
  );
}
