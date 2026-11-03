import type { Metadata } from "next";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/db";
import { projects, slots } from "@/db/schema";
import { BookingFlow } from "@/components/booking/booking-flow";
import { WeekPicker, WeekPickerSkeleton } from "@/components/site/week-picker";
import type { Locale } from "@/i18n/routing";
import { getSession } from "@/lib/session";
import { slotDay, slotDayLong, slotTime } from "@/lib/slot-format";
import { isBookable } from "@/server/bookings/service";
import { listProjects } from "@/server/projects/queries";
import { getBuyerVisit } from "@/server/visits/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/book">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "book" });
  return { title: t("title"), robots: { index: false } };
}

export default function BookPage(props: PageProps<"/[locale]/book">) {
  return (
    <div className="mx-auto max-w-xl px-5 pt-10 pb-20 sm:px-8">
      <Suspense fallback={<WeekPickerSkeleton />}>
        <BookContent {...props} />
      </Suspense>
    </div>
  );
}

async function BookContent({ params, searchParams }: PageProps<"/[locale]/book">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const sp = await searchParams;
  const slotId = typeof sp.slot === "string" ? sp.slot : null;
  const rescheduleCode = typeof sp.reschedule === "string" ? sp.reschedule : null;
  const [t, session] = await Promise.all([getTranslations("book"), getSession()]);

  const buyer = session?.user.role === "buyer" ? session.user : null;
  const reschedule = buyer && rescheduleCode ? await getBuyerVisit(buyer, rescheduleCode) : null;
  const carry = reschedule ? { reschedule: reschedule.code } : undefined;

  const slot =
    slotId && /^[0-9a-f-]{36}$/i.test(slotId)
      ? (
          await db
            .select({
              id: slots.id,
              startsAt: slots.startsAt,
              capacity: slots.capacity,
              booked: slots.booked,
              blocked: slots.blocked,
              projectId: projects.id,
              projectName: projects.name,
              locality: projects.locality,
            })
            .from(slots)
            .innerJoin(projects, eq(projects.id, slots.projectId))
            .where(eq(slots.id, slotId))
        )[0]
      : undefined;
  const bookable = slot && isBookable(slot);

  if (slot && bookable) {
    return (
      <>
        <h1 className="mb-8 text-4xl font-light">{t("title")}</h1>
        <BookingFlow
          slot={{
            id: slot.id,
            day: slotDayLong(slot.startsAt, locale),
            time: slotTime(slot.startsAt, locale),
            projectId: slot.projectId,
            projectName: slot.projectName,
            locality: slot.locality,
          }}
          signedInPhone={buyer?.phoneNumber ?? null}
          defaultName={buyer && buyer.name !== "Home buyer" ? buyer.name : ""}
          demo={process.env.DEMO_MODE === "true"}
          reschedule={
            reschedule
              ? {
                  code: reschedule.code,
                  from: `${slotDay(reschedule.startsAt, locale)} · ${slotTime(reschedule.startsAt, locale)}`,
                }
              : undefined
          }
        />
      </>
    );
  }

  // No time chosen yet, or the chosen one has gone: show what is free right now.
  const all = await listProjects();
  const shown = slot
    ? all.filter((p) => p.id === slot.projectId)
    : reschedule
      ? all.filter((p) => p.id === reschedule.projectId)
      : all;
  return (
    <>
      <h1 className="mb-3 text-4xl font-light">{t("title")}</h1>
      {slot && (
        <p role="alert" className="mb-6 rounded-xl bg-ochre-soft p-4 text-sm">
          {t("slotGone")}
        </p>
      )}
      <p className="mb-8 text-muted-foreground">{t("chooseTime")}</p>
      <div className="space-y-10">
        {shown.map((p) => (
          <section key={p.id} className="space-y-4">
            <h2 className="text-2xl font-light">
              {p.name} <span className="text-base text-muted-foreground">· {p.locality}</span>
            </h2>
            <Suspense fallback={<WeekPickerSkeleton />}>
              <WeekPicker projectId={p.id} locale={locale} query={carry} />
            </Suspense>
          </section>
        ))}
      </div>
    </>
  );
}
