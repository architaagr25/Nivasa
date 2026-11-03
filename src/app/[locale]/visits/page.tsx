import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { BuyerAccount, BuyerSignIn } from "@/components/booking/buyer-account";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getSession } from "@/lib/session";
import { slotDay, slotTime } from "@/lib/slot-format";
import { cn } from "@/lib/utils";
import { buyerOptedOut, listBuyerVisits } from "@/server/visits/queries";

export const metadata: Metadata = { robots: { index: false } };

export default function MyVisitsPage(props: PageProps<"/[locale]/visits">) {
  return (
    <div className="mx-auto max-w-xl px-5 pt-10 pb-20 sm:px-8">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <MyVisits {...props} />
      </Suspense>
    </div>
  );
}

async function MyVisits({ params }: PageProps<"/[locale]/visits">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const [t, tp, session] = await Promise.all([
    getTranslations("visits"),
    getTranslations("pass"),
    getSession(),
  ]);

  if (!session || session.user.role !== "buyer") {
    return (
      <>
        <h1 className="mb-3 text-4xl font-light">{t("title")}</h1>
        <p className="mb-8 text-muted-foreground">{t("signInLead")}</p>
        <BuyerSignIn demo={process.env.DEMO_MODE === "true"} />
      </>
    );
  }

  const [visits, optedOut] = await Promise.all([
    listBuyerVisits(session.user),
    buyerOptedOut(session.user),
  ]);
  const now = new Date();
  const upcoming = visits.filter((v) => v.status === "booked" && v.startsAt > now).reverse();
  const past = visits.filter((v) => !upcoming.includes(v));
  const statusLabel = {
    booked: tp("confirmed"),
    visited: tp("visited"),
    no_show: tp("noShow"),
    cancelled: tp("cancelled"),
  };

  const list = (items: typeof visits, title: string) =>
    items.length > 0 && (
      <section className="space-y-3">
        <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {title}
        </h2>
        <ul className="space-y-3">
          {items.map((v) => (
            <li key={v.id}>
              <Link
                href={`/visits/${v.code}`}
                className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/30"
              >
                <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-secondary text-center">
                  <span className="text-[0.65rem] text-muted-foreground uppercase">
                    {slotDay(v.startsAt, locale).split(/,\s*/)[0]}
                  </span>
                  <span className="font-heading text-lg leading-none">
                    {slotDay(v.startsAt, locale).match(/\d+/)?.[0]}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{v.projectName}</p>
                  <p className="text-sm text-muted-foreground">
                    {slotTime(v.startsAt, locale)} · {v.executiveName}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs",
                    v.status === "cancelled" ? "bg-clay-soft text-destructive" : "bg-secondary",
                  )}
                >
                  {statusLabel[v.status]}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <>
      <h1 className="mb-8 text-4xl font-light">{t("title")}</h1>
      {visits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="mb-5 text-muted-foreground">{t("empty")}</p>
          <Button asChild size="xl">
            <Link href="/book">{tp("bookAgain")}</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-10">
          {list(upcoming, t("upcoming"))}
          {list(past, t("past"))}
        </div>
      )}
      <BuyerAccount optedOut={optedOut} />
    </>
  );
}
