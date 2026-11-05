import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { listProjects } from "@/server/projects/queries";

// Only the pages worth finding in a search. Booking, chat and visit passes are personal
// and already ask not to be indexed.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.BETTER_AUTH_URL;
  const projects = await listProjects();
  const paths = ["", ...projects.map((p) => `/projects/${p.id}`), "/privacy"];
  const url = (locale: string, path: string) =>
    `${base}${locale === routing.defaultLocale ? "" : `/${locale}`}${path}`;

  return paths.map((path) => ({
    url: url(routing.defaultLocale, path),
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, url(l, path)])),
    },
  }));
}
