import { dateRange, istInstant, weekdayOf } from "@/lib/time";

export type SlotTemplate = {
  projectId: string;
  weekday: number;
  startTime: string; // "HH:MM" or "HH:MM:SS"
  durationMin: number;
  capacity: number;
  active: boolean;
};

export type Blackout = { projectId: string | null; date: string };

export type GeneratedSlot = {
  projectId: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
};

/**
 * Expands weekly templates into concrete slots for a date range (IST calendar dates, inclusive).
 * Blackout dates remove every slot for that project (or for all projects when projectId is null).
 * Pure, so the same rules drive the seed, the admin "publish slots" action and the tests.
 */
export function generateSlots(
  templates: SlotTemplate[],
  blackouts: Blackout[],
  from: string,
  to: string,
): GeneratedSlot[] {
  const blocked = new Set(blackouts.map((b) => `${b.projectId ?? "*"}|${b.date}`));
  const out: GeneratedSlot[] = [];

  for (const date of dateRange(from, to)) {
    const weekday = weekdayOf(date);
    for (const t of templates) {
      if (!t.active || t.weekday !== weekday) continue;
      if (blocked.has(`*|${date}`) || blocked.has(`${t.projectId}|${date}`)) continue;
      const startsAt = istInstant(date, t.startTime);
      out.push({
        projectId: t.projectId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + t.durationMin * 60_000),
        capacity: t.capacity,
      });
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
