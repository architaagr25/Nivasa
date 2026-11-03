import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { istDate } from "@/lib/time";
import { slotDay, slotTime } from "@/lib/slot-format";
import { findFreeSlots } from "@/server/bookings/service";
import { WeekTabs } from "./week-tabs";

/** Every free slot in the next 7 days, grouped by day. */
export async function WeekPicker({
  projectId,
  locale,
  query,
}: {
  projectId: string;
  locale: Locale;
  /** Carried onto every slot link, e.g. the visit being rescheduled. */
  query?: Record<string, string>;
}) {
  await connection();
  const [t, slots] = await Promise.all([
    getTranslations("slots"),
    findFreeSlots({ projectId, days: 7, limit: 80 }),
  ]);
  if (!slots.length) return <p className="text-muted-foreground">{t("none")}</p>;

  const days = new Map<
    string,
    { label: string; slots: { id: string; time: string; left: string }[] }
  >();
  for (const s of slots) {
    const key = istDate(s.startsAt);
    const day = days.get(key) ?? { label: slotDay(s.startsAt, locale), slots: [] };
    day.slots.push({
      id: s.id,
      time: slotTime(s.startsAt, locale),
      left: t("left", { count: s.remaining }),
    });
    days.set(key, day);
  }
  return <WeekTabs days={[...days.entries()].map(([key, d]) => ({ key, ...d }))} query={query} />;
}

export function WeekPickerSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="h-14 w-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-11 w-28 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
    </div>
  );
}
