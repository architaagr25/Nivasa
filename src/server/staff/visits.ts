import "server-only";
import { and, asc, eq, gte, inArray, lt, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { leads, projects, slots, staffProfiles, visits } from "@/db/schema";
import type { StaffViewer } from "@/lib/session";
import { addDays, istDate, istInstant } from "@/lib/time";
import { EARLY_CHECKIN_MS } from "@/server/bookings/service";

export type CalendarSlot = {
  id: string;
  projectId: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  booked: number;
  blocked: boolean;
};

export type CalendarVisit = {
  code: string;
  slotId: string;
  projectId: string;
  startsAt: Date;
  status: "booked" | "visited" | "no_show" | "cancelled";
  checkedInAt: Date | null;
  executiveId: string;
  executiveName: string | null;
  leadCode: string;
  buyerName: string | null;
  wantsBhk: string | null;
  mine: boolean;
};

/**
 * Executives see the visits they are meeting and visits for their own leads; the sales head
 * sees every visit. Slot occupancy is shown for every project the viewer works on, so an
 * executive can still tell how busy a time is without seeing other people's buyers.
 */
function visibleVisits(viewer: StaffViewer): SQL | undefined {
  if (viewer.role === "sales_head") return undefined;
  return or(eq(visits.executiveId, viewer.id), eq(leads.ownerId, viewer.id));
}

/** Slots and visits for the IST dates [fromDate, toDate], both inclusive. */
export async function visitCalendar(
  viewer: StaffViewer,
  fromDate: string,
  toDate: string,
  projectId: string | null,
) {
  const from = istInstant(fromDate, "00:00");
  const to = istInstant(addDays(toDate, 1), "00:00");
  const projectIds =
    viewer.role === "sales_head" || !viewer.projectIds.length ? null : viewer.projectIds;

  const [slotRows, visitRows, projectRows] = await Promise.all([
    db
      .select({
        id: slots.id,
        projectId: slots.projectId,
        startsAt: slots.startsAt,
        endsAt: slots.endsAt,
        capacity: slots.capacity,
        booked: slots.booked,
        blocked: slots.blocked,
      })
      .from(slots)
      .where(
        and(
          gte(slots.startsAt, from),
          lt(slots.startsAt, to),
          projectId ? eq(slots.projectId, projectId) : undefined,
          projectIds ? inArray(slots.projectId, projectIds) : undefined,
        ),
      )
      .orderBy(asc(slots.startsAt), asc(slots.projectId)),
    db
      .select({
        code: visits.code,
        slotId: visits.slotId,
        projectId: visits.projectId,
        startsAt: visits.startsAt,
        status: visits.status,
        checkedInAt: visits.checkedInAt,
        executiveId: visits.executiveId,
        executiveName: staffProfiles.displayName,
        leadCode: leads.code,
        buyerName: leads.name,
        wantsBhk: leads.wantsBhk,
      })
      .from(visits)
      .innerJoin(leads, eq(leads.id, visits.leadId))
      .leftJoin(staffProfiles, eq(staffProfiles.userId, visits.executiveId))
      .where(
        and(
          gte(visits.startsAt, from),
          lt(visits.startsAt, to),
          // A cancelled visit has freed its place; the lead page still shows it.
          ne(visits.status, "cancelled"),
          projectId ? eq(visits.projectId, projectId) : undefined,
          visibleVisits(viewer),
        ),
      )
      .orderBy(asc(visits.startsAt), asc(leads.name)),
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.id)),
  ]);

  return {
    slots: slotRows as CalendarSlot[],
    visits: visitRows.map((v) => ({ ...v, mine: v.executiveId === viewer.id })) as CalendarVisit[],
    projectNames: Object.fromEntries(projectRows.map((p) => [p.id, p.name])) as Record<
      string,
      string
    >,
  };
}

/**
 * Scanning a pass means the buyer is standing at the site office, so it only counts on the day
 * of the visit, from half an hour before. Anything recorded later goes through the calendar.
 */
export function checkInWindow(startsAt: Date, now = new Date()): "early" | "open" | "past_day" {
  if (istDate(now) > istDate(startsAt)) return "past_day";
  return startsAt.getTime() - now.getTime() > EARLY_CHECKIN_MS ? "early" : "open";
}

export type CheckInVisit = NonNullable<Awaited<ReturnType<typeof visitByCheckinToken>>>;

/** What the site office sees after scanning a buyer's visit pass. */
export async function visitByCheckinToken(token: string) {
  if (!/^[\w-]{10,64}$/.test(token)) return null;
  const [row] = await db
    .select({
      id: visits.id,
      code: visits.code,
      status: visits.status,
      startsAt: visits.startsAt,
      checkedInAt: visits.checkedInAt,
      executiveId: visits.executiveId,
      executiveName: staffProfiles.displayName,
      projectName: projects.name,
      leadId: leads.id,
      leadCode: leads.code,
      buyerName: leads.name,
      ownerId: leads.ownerId,
      phone: leads.phone,
      wantsBhk: leads.wantsBhk,
      budgetMaxInr: leads.budgetMaxInr,
      language: leads.language,
    })
    .from(visits)
    .innerJoin(leads, eq(leads.id, visits.leadId))
    .innerJoin(projects, eq(projects.id, visits.projectId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, visits.executiveId))
    .where(eq(visits.checkinToken, token));
  return row ?? null;
}
