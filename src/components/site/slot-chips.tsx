import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { findFreeSlots } from "@/server/bookings/service";
import { slotDay, slotTime } from "@/lib/slot-format";

/** The next few free visit times for a project, each one tap away from booking. */
export async function NextSlotChips({ projectId, locale }: { projectId: string; locale: Locale }) {
  await connection(); // free seats change by the minute, so this is never cached
  const [t, slots] = await Promise.all([
    getTranslations("slots"),
    findFreeSlots({ projectId, limit: 3 }),
  ]);
  if (!slots.length) return <p className="text-sm text-muted-foreground">{t("none")}</p>;

  return (
    <ul className="flex flex-wrap gap-2" aria-label={t("next")}>
      {slots.map((s) => (
        <li key={s.id}>
          <Link
            href={{ pathname: "/book", query: { slot: s.id } }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm transition-colors hover:border-foreground/40 hover:bg-secondary"
          >
            <span>
              {slotDay(s.startsAt, locale)} · {slotTime(s.startsAt, locale)}
            </span>
            <span className="text-xs text-sage">{t("left", { count: s.remaining })}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SlotChipsSkeleton() {
  return (
    <div className="flex gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-11 w-36 animate-pulse rounded-full bg-muted" />
      ))}
    </div>
  );
}
