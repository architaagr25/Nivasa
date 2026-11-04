import "server-only";
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blackoutDates, leads, slots, slotTemplates, visits } from "@/db/schema";
import { addDays, istDate, istInstant } from "@/lib/time";
import { generateSlots } from "./generate";

/** How far ahead buyers can book. */
export const HORIZON_DAYS = 56;

export type AffectedVisit = {
  code: string;
  startsAt: Date;
  leadCode: string;
  buyerName: string | null;
};

/**
 * Brings a project's future slots in line with its weekly templates and closed days, from
 * tomorrow to the booking horizon. Today is left alone, since people may already be on their way.
 *
 * - A slot the templates want and that doesn't exist yet is created.
 * - A slot that exists and is still wanted takes the new capacity (never below what's booked)
 *   and length, and is reopened if it had been closed.
 * - A slot that's no longer wanted is deleted if nobody ever booked it. Otherwise it's closed
 *   to new bookings and kept, and its booked visits are returned so someone can move them.
 */
export async function syncSlots(projectId: string, now = new Date()) {
  const from = addDays(istDate(now), 1);
  const to = addDays(istDate(now), HORIZON_DAYS);

  return db.transaction(async (tx) => {
    // One sync per project at a time; the reminder job and an admin edit can overlap.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`slots:${projectId}`}))`);
    const [templates, closed, existing] = await Promise.all([
      tx.select().from(slotTemplates).where(eq(slotTemplates.projectId, projectId)),
      tx
        .select({ projectId: blackoutDates.projectId, date: blackoutDates.date })
        .from(blackoutDates)
        .where(
          and(
            or(eq(blackoutDates.projectId, projectId), isNull(blackoutDates.projectId)),
            gte(blackoutDates.date, from),
          ),
        ),
      tx
        .select()
        .from(slots)
        .where(
          and(
            eq(slots.projectId, projectId),
            gte(slots.startsAt, istInstant(from, "00:00")),
            lt(slots.startsAt, istInstant(addDays(to, 1), "00:00")),
          ),
        )
        .for("update"),
    ]);

    const wanted = generateSlots(templates, closed, from, to);
    const have = new Map(existing.map((s) => [s.startsAt.getTime(), s]));
    const want = new Map(wanted.map((s) => [s.startsAt.getTime(), s]));
    const result = { added: 0, updated: 0, removed: 0, closed: 0, affected: [] as AffectedVisit[] };

    const toInsert = wanted.filter((w) => !have.has(w.startsAt.getTime()));
    if (toInsert.length) {
      await tx.insert(slots).values(toInsert).onConflictDoNothing();
      result.added = toInsert.length;
    }

    for (const s of existing) {
      const w = want.get(s.startsAt.getTime());
      if (w) {
        const capacity = Math.max(w.capacity, s.booked);
        if (capacity !== s.capacity || s.blocked || w.endsAt.getTime() !== s.endsAt.getTime()) {
          await tx
            .update(slots)
            .set({ capacity, endsAt: w.endsAt, blocked: false })
            .where(eq(slots.id, s.id));
          result.updated++;
        }
        continue;
      }
      if (s.blocked) continue;
      // Cancelled visits still point at their slot, so a slot anyone ever booked is kept.
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(visits)
        .where(eq(visits.slotId, s.id));
      if (n === 0) {
        await tx.delete(slots).where(eq(slots.id, s.id));
        result.removed++;
      } else {
        await tx.update(slots).set({ blocked: true }).where(eq(slots.id, s.id));
        result.closed++;
      }
    }

    const closedIds = existing
      .filter((s) => !want.has(s.startsAt.getTime()) && s.booked > 0)
      .map((s) => s.id);
    if (closedIds.length) {
      result.affected = await tx
        .select({
          code: visits.code,
          startsAt: visits.startsAt,
          leadCode: leads.code,
          buyerName: leads.name,
        })
        .from(visits)
        .innerJoin(leads, eq(leads.id, visits.leadId))
        .where(and(inArray(visits.slotId, closedIds), eq(visits.status, "booked")))
        .orderBy(visits.startsAt);
    }
    return result;
  });
}

/**
 * Keeps the booking window rolling forward. Cheap to call often: it only syncs a project
 * whose furthest slot is more than a day short of the horizon.
 */
export async function extendSlotHorizon(now = new Date()) {
  const rows = await db.execute<{ project_id: string }>(sql`
    select t.project_id from slot_templates t
    left join slots s on s.project_id = t.project_id
    where t.active
    group by t.project_id
    having coalesce(max(s.starts_at), now()) < ${istInstant(addDays(istDate(now), HORIZON_DAYS - 1), "00:00").toISOString()}::timestamptz
  `);
  for (const r of rows) await syncSlots(r.project_id, now);
  return rows.length;
}
