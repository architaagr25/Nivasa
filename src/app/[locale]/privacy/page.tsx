import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return { title: t("title") };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations("privacy");

  return (
    <article className="mx-auto max-w-2xl px-5 pt-12 pb-20 sm:px-8">
      <h1 className="text-4xl font-light sm:text-5xl">{t("title")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("updated")}</p>
      <div className="mt-10 space-y-6 text-lg leading-relaxed">
        {(["p1", "p2", "p3", "p4"] as const).map((k) => (
          <p key={k}>{t(k)}</p>
        ))}
      </div>
    </article>
  );
}
