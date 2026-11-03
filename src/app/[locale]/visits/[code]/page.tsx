import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import QRCode from "qrcode";
import { CalendarPlus, CircleCheck, Clock, MapPin, Navigation, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CancelVisitButton } from "@/components/booking/cancel-visit";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { mapsLink } from "@/lib/format";
import { getSession } from "@/lib/session";
import { slotDayLong, slotDay, slotTime } from "@/lib/slot-format";
import { cn } from "@/lib/utils";
import { getBuyerVisit } from "@/server/visits/queries";

export const metadata: Metadata = { robots: { index: false } };

export default function VisitPassPage(props: PageProps<"/[locale]/visits/[code]">) {
  return (
    <div className="mx-auto max-w-xl px-5 pt-10 pb-20 sm:px-8">
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-3xl bg-muted" />}>
        <VisitPass {...props} />
      </Suspense>
    </div>
  );
}

async function VisitPass({ params }: PageProps<"/[locale]/visits/[code]">) {
  const { locale, code } = (await params) as { locale: Locale; code: string };
  setRequestLocale(locale);
  const [t, session] = await Promise.all([getTranslations("pass"), getSession()]);
  if (!session) redirect({ href: "/visits", locale });

  const visit = await getBuyerVisit(session!.user, code);
  if (!visit) notFound();

  const upcoming = visit.status === "booked" && visit.startsAt > new Date();
  const checkinUrl = `${process.env.BETTER_AUTH_URL}/staff/check-in/${visit.checkinToken}`;
  const qr = await QRCode.toString(checkinUrl, {
    type: "svg",
    margin: 0,
    color: { dark: "#2a2724", light: "#0000" },
  });

  const status = {
    booked: { label: t("confirmed"), cls: "bg-sage-soft text-accent-foreground" },
    visited: { label: t("visited"), cls: "bg-sage-soft text-accent-foreground" },
    no_show: { label: t("noShow"), cls: "bg-ochre-soft" },
    cancelled: { label: t("cancelled"), cls: "bg-clay-soft text-destructive" },
  }[visit.status];
  const reminderLabel = { day_before: t("remDay"), two_hours_before: t("remTwo") };
  const reminderStatus = {
    scheduled: t("remScheduled"),
    sent: t("remSent"),
    skipped: t("remSkipped"),
    cancelled: t("remCancelled"),
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-light">{t("title")}</h1>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm",
            status.cls,
          )}
        >
          {visit.status === "booked" && <CircleCheck className="size-4" aria-hidden />}
          {status.label}
        </span>
      </div>

      <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_40px_-24px_rgba(40,30,20,0.25)]">
        <div className="space-y-1 bg-primary px-6 py-6 text-primary-foreground">
          <p className="text-xs tracking-[0.14em] uppercase opacity-70">{visit.projectName}</p>
          <p className="font-heading text-4xl font-light">{slotTime(visit.startsAt, locale)}</p>
          <p className="opacity-80">{slotDayLong(visit.startsAt, locale)}</p>
        </div>

        <dl className="grid gap-5 px-6 py-6 text-sm">
          <div className="flex gap-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden />
            <div>
              <dt className="text-muted-foreground">{t("where")}</dt>
              <dd>{visit.address}</dd>
            </div>
          </div>
          <div className="flex gap-3">
            <UserRound className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden />
            <div>
              <dt className="text-muted-foreground">{t("meet")}</dt>
              <dd>{visit.executiveName}</dd>
            </div>
          </div>
        </dl>

        {visit.status !== "cancelled" && (
          <div className="flex flex-wrap gap-2 px-6 pb-6">
            <Button asChild variant="outline" size="xl" className="flex-1">
              <a href={mapsLink(visit.latitude, visit.longitude)} target="_blank" rel="noreferrer">
                <Navigation data-icon="inline-start" /> {t("openMap")}
              </a>
            </Button>
            <Button asChild variant="outline" size="xl" className="flex-1">
              <a href={`/api/visits/${visit.code}/ics`}>
                <CalendarPlus data-icon="inline-start" /> {t("calendar")}
              </a>
            </Button>
          </div>
        )}

        {upcoming && (
          <div className="flex items-center gap-5 border-t border-dashed border-border px-6 py-6">
            <div
              className="size-28 shrink-0 rounded-lg bg-background p-2"
              role="img"
              aria-label={t("checkin")}
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <div className="space-y-1 text-sm">
              <p>{t("checkin")}</p>
              <p className="font-mono text-muted-foreground">{visit.code}</p>
            </div>
          </div>
        )}

        <p className="border-t border-border px-6 py-3 font-mono text-[0.7rem] text-muted-foreground">
          RERA {visit.reraNumber}
        </p>
      </article>

      {visit.status === "cancelled" ? (
        <div className="mt-6 space-y-3 rounded-2xl bg-secondary/70 p-5 text-sm">
          <p>{t("cancelledNote")}</p>
          <Button asChild size="xl">
            <Link href={`/projects/${visit.projectId}#visit`}>{t("bookAgain")}</Link>
          </Button>
        </div>
      ) : (
        visit.reminders.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-normal">
              <Clock className="size-4 text-sage" aria-hidden /> {t("reminders")}
            </h2>
            <ol className="relative ml-2 space-y-5 border-l border-border pl-6">
              {visit.reminders.map((r) => (
                <li key={r.kind} className="relative">
                  <span
                    className={cn(
                      "absolute top-1.5 -left-[1.82rem] size-2.5 rounded-full ring-4 ring-background",
                      r.status === "sent"
                        ? "bg-sage"
                        : r.status === "scheduled"
                          ? "bg-foreground/40"
                          : "bg-border",
                    )}
                    aria-hidden
                  />
                  <p className="text-sm">
                    {reminderLabel[r.kind]} · {slotDay(r.sendAt, locale)},{" "}
                    {slotTime(r.sendAt, locale)}
                  </p>
                  <p className="text-xs text-muted-foreground">{reminderStatus[r.status]}</p>
                </li>
              ))}
            </ol>
          </section>
        )
      )}

      {upcoming && (
        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" size="xl" className="sm:flex-1">
            <Link href={{ pathname: "/book", query: { reschedule: visit.code } }}>
              {t("change")}
            </Link>
          </Button>
          <CancelVisitButton code={visit.code} />
        </div>
      )}

      <Link
        href="/visits"
        className="mt-8 inline-block min-h-11 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        {t("allVisits")}
      </Link>
    </>
  );
}
