import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, count, eq, gt, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  leads,
  projects,
  reminders,
  slots,
  staffProfiles,
  user,
  visitCodeSeq,
  visits,
} from "@/db/schema";
import { recordOutbound } from "@/server/messaging/outbox";
import {
  executiveVisitAlert,
  visitCancelled,
  visitConfirmation,
  visitReminder,
} from "@/server/messaging/templates";
import { planReminders } from "./reminders";

/** Buyers can't book a slot that starts in less than this; the site team needs time to prepare. */
export const MIN_NOTICE_MS = 3 * 60 * 60 * 1000;
/** Whether a slot can still be offered to a buyer right now. */
export function isBookable(
  slot: { blocked: boolean; booked: number; capacity: number; startsAt: Date },
  now = new Date(),
) {
  return (
    !slot.blocked &&
    slot.booked < slot.capacity &&
    slot.startsAt.getTime() > now.getTime() + MIN_NOTICE_MS
  );
}

/** Staff can mark someone as arrived up to this long before the slot starts. */
const EARLY_CHECKIN_MS = 30 * 60 * 1000;

export type BookingErrorCode =
  | "slot_not_found"
  | "slot_full"
  | "slot_unavailable"
  | "too_soon"
  | "already_booked"
  | "lead_not_found"
  | "visit_not_found"
  | "invalid_state";

export type FreeSlot = { id: string; projectId: string; startsAt: Date; remaining: number };

export class BookingError extends Error {
  constructor(
    public code: BookingErrorCode,
    message: string,
    public alternatives: FreeSlot[] = [],
  ) {
    super(message);
    this.name = "BookingError";
  }
}

type Via = "assistant" | "staff" | "buyer_portal";

/* ------------------------------------------------------------------ */
/* Reading free slots                                                 */
/* ------------------------------------------------------------------ */

export async function findFreeSlots(opts: {
  projectId: string;
  from?: Date;
  days?: number;
  limit?: number;
  /** When set, returns the free slots closest to this time instead of the earliest ones. */
  near?: Date;
  now?: Date;
}): Promise<FreeSlot[]> {
  const now = opts.now ?? new Date();
  const earliest = new Date(Math.max((opts.from ?? now).getTime(), now.getTime() + MIN_NOTICE_MS));
  const latest = new Date(earliest.getTime() + (opts.days ?? 14) * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: slots.id,
      projectId: slots.projectId,
      startsAt: slots.startsAt,
      remaining: sql<number>`(${slots.capacity} - ${slots.booked})::int`,
    })
    .from(slots)
    .where(
      and(
        eq(slots.projectId, opts.projectId),
        eq(slots.blocked, false),
        lt(slots.booked, slots.capacity),
        gte(slots.startsAt, earliest),
        lt(slots.startsAt, latest),
      ),
    )
    .orderBy(
      opts.near
        ? sql`abs(extract(epoch from ${slots.startsAt} - ${opts.near.toISOString()}::timestamptz))`
        : asc(slots.startsAt),
    )
    .limit(opts.limit ?? 12);

  return opts.near ? rows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()) : rows;
}

/* ------------------------------------------------------------------ */
/* Booking                                                            */
/* ------------------------------------------------------------------ */

export type BookInput = {
  leadId: string;
  slotId: string;
  via: Via;
  now?: Date;
};

export async function bookVisit(input: BookInput) {
  try {
    return await db.transaction((tx) => bookInTx(tx, input));
  } catch (err) {
    throw await withAlternatives(err, input.slotId, input.now);
  }
}

async function bookInTx(tx: Tx, { leadId, slotId, via, now = new Date() }: BookInput) {
  // Lock order is always lead, then slot. Locking the lead makes a double-tap by the same
  // buyer wait for the first request; locking the slot makes everyone else queue behind it.
  const [lead] = await tx.select().from(leads).where(eq(leads.id, leadId)).for("update");
  if (!lead || lead.mergedIntoId) throw new BookingError("lead_not_found", "Lead not found");

  const [slot] = await tx.select().from(slots).where(eq(slots.id, slotId)).for("update");
  if (!slot) throw new BookingError("slot_not_found", "That slot does not exist");

  const [existing] = await tx
    .select({ id: visits.id, code: visits.code, startsAt: visits.startsAt })
    .from(visits)
    .where(
      and(
        eq(visits.leadId, leadId),
        eq(visits.projectId, slot.projectId),
        eq(visits.status, "booked"),
      ),
    );
  if (existing) {
    throw new BookingError(
      "already_booked",
      `A visit is already booked (${existing.code}). Reschedule it instead.`,
    );
  }
  if (slot.blocked) throw new BookingError("slot_unavailable", "That slot is no longer offered");
  if (slot.startsAt.getTime() < now.getTime() + MIN_NOTICE_MS) {
    throw new BookingError("too_soon", "That slot starts too soon to book");
  }
  if (slot.booked >= slot.capacity) throw new BookingError("slot_full", "That slot was just taken");

  const executive = await chooseExecutive(tx, slot.projectId, slot.startsAt, lead.ownerId);
  if (!executive) throw new BookingError("slot_full", "No executive is free at that time");

  const [{ n }] = await tx.execute<{ n: string }>(
    sql`select nextval(${visitCodeSeq.seqName})::text as n`,
  );
  const [visit] = await tx
    .insert(visits)
    .values({
      code: `VS-${n}`,
      leadId,
      projectId: slot.projectId,
      slotId,
      startsAt: slot.startsAt,
      executiveId: executive.userId,
      status: "booked",
      bookedVia: via,
      checkinToken: randomBytes(18).toString("base64url"),
      createdAt: now,
    })
    .returning();

  await tx
    .update(slots)
    .set({ booked: sql`${slots.booked} + 1` })
    .where(eq(slots.id, slotId));

  await tx
    .insert(reminders)
    .values(planReminders(slot.startsAt, now).map((r) => ({ visitId: visit.id, ...r })));

  await tx
    .update(leads)
    .set({ status: "visit_booked", ownerId: executive.userId, score: "hot", lastActivityAt: now })
    .where(eq(leads.id, leadId));

  const ctx = await messageContext(
    tx,
    slot.projectId,
    slot.startsAt,
    executive.displayName,
    lead.language,
  );
  await recordOutbound(
    {
      channel: "whatsapp",
      template: "visit_confirmation",
      toPhone: lead.phone,
      leadId,
      body: visitConfirmation(ctx),
      transactional: true,
    },
    tx,
  );
  await recordOutbound(
    {
      channel: "staff_alert",
      template: "executive_visit_alert",
      toUserId: executive.userId,
      leadId,
      body: executiveVisitAlert({
        ...ctx,
        lang: "en",
        leadCode: lead.code,
        buyerName: lead.name ?? "A buyer",
      }),
    },
    tx,
  );

  return { ...visit, executiveName: executive.displayName };
}

/**
 * Picks who meets the buyer. The lead's existing owner keeps them if free, so the buyer
 * meets the person they have been talking to; otherwise the executive on that project with
 * the fewest upcoming visits. Runs under the slot lock, so two bookings can't pick the same
 * person for the same time (and a unique index backs that up).
 */
async function chooseExecutive(
  tx: Tx,
  projectId: string,
  startsAt: Date,
  preferredId: string | null,
) {
  const team = await tx
    .select({ userId: staffProfiles.userId, displayName: staffProfiles.displayName })
    .from(staffProfiles)
    .innerJoin(user, eq(user.id, staffProfiles.userId))
    .where(
      and(
        eq(staffProfiles.active, true),
        eq(user.role, "sales_exec"),
        sql`${projectId} = any(${staffProfiles.projectIds})`,
      ),
    );
  if (!team.length) return null;

  const ids = team.map((t) => t.userId);
  const busy = await tx
    .select({ id: visits.executiveId })
    .from(visits)
    .where(
      and(
        inArray(visits.executiveId, ids),
        eq(visits.startsAt, startsAt),
        eq(visits.status, "booked"),
      ),
    );
  const busyIds = new Set(busy.map((b) => b.id));
  const free = team.filter((t) => !busyIds.has(t.userId));
  if (!free.length) return null;

  const preferred = free.find((t) => t.userId === preferredId);
  if (preferred) return preferred;

  const load = await tx
    .select({ id: visits.executiveId, n: count() })
    .from(visits)
    .where(
      and(
        inArray(
          visits.executiveId,
          free.map((f) => f.userId),
        ),
        eq(visits.status, "booked"),
        gt(visits.startsAt, new Date()),
      ),
    )
    .groupBy(visits.executiveId);
  const loadOf = new Map(load.map((l) => [l.id, Number(l.n)]));
  return free.sort((a, b) => (loadOf.get(a.userId) ?? 0) - (loadOf.get(b.userId) ?? 0))[0];
}

/** A failed booking always comes back with nearby free slots, so the buyer never hits a dead end. */
async function withAlternatives(err: unknown, slotId: string, now?: Date) {
  if (!(err instanceof BookingError)) return err;
  if (!["slot_full", "slot_unavailable", "too_soon"].includes(err.code)) return err;
  const [slot] = await db.select().from(slots).where(eq(slots.id, slotId));
  if (slot) {
    err.alternatives = await findFreeSlots({
      projectId: slot.projectId,
      near: slot.startsAt,
      limit: 3,
      now,
      from: now,
    });
  }
  return err;
}

/* ------------------------------------------------------------------ */
/* Cancelling and rescheduling                                        */
/* ------------------------------------------------------------------ */

export async function cancelVisit(opts: { visitId: string; reason: string; now?: Date }) {
  return db.transaction((tx) => cancelInTx(tx, { ...opts, notify: true }));
}

async function cancelInTx(
  tx: Tx,
  {
    visitId,
    reason,
    notify,
    now = new Date(),
  }: { visitId: string; reason: string; notify: boolean; now?: Date },
) {
  const [found] = await tx
    .select({ leadId: visits.leadId })
    .from(visits)
    .where(eq(visits.id, visitId));
  if (!found) throw new BookingError("visit_not_found", "Visit not found");
  // Same lock order as booking (lead, then visit and slot) so the two can never deadlock.
  await tx.select({ id: leads.id }).from(leads).where(eq(leads.id, found.leadId)).for("update");
  const [visit] = await tx.select().from(visits).where(eq(visits.id, visitId)).for("update");
  if (visit.status !== "booked") {
    throw new BookingError(
      "invalid_state",
      `This visit is already ${visit.status.replace("_", " ")}`,
    );
  }

  await tx.select({ id: slots.id }).from(slots).where(eq(slots.id, visit.slotId)).for("update");
  await tx
    .update(visits)
    .set({ status: "cancelled", cancelledAt: now, cancelReason: reason })
    .where(eq(visits.id, visitId));
  await tx
    .update(slots)
    .set({ booked: sql`${slots.booked} - 1` })
    .where(eq(slots.id, visit.slotId));
  await tx
    .update(reminders)
    .set({ status: "cancelled" })
    .where(and(eq(reminders.visitId, visitId), eq(reminders.status, "scheduled")));
  await tx
    .update(leads)
    .set({ status: "engaged", lastActivityAt: now })
    .where(and(eq(leads.id, visit.leadId), eq(leads.status, "visit_booked")));

  if (notify) {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, visit.leadId));
    const [exec] = await tx
      .select({ name: staffProfiles.displayName })
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, visit.executiveId));
    const ctx = await messageContext(
      tx,
      visit.projectId,
      visit.startsAt,
      exec?.name ?? "",
      lead.language,
    );
    await recordOutbound(
      {
        channel: "whatsapp",
        template: "visit_cancelled",
        toPhone: lead.phone,
        leadId: lead.id,
        body: visitCancelled(ctx),
        transactional: true,
      },
      tx,
    );
  }
  return visit;
}

export async function rescheduleVisit(opts: {
  visitId: string;
  newSlotId: string;
  via: Via;
  now?: Date;
}) {
  try {
    return await db.transaction(async (tx) => {
      const [old] = await tx.select().from(visits).where(eq(visits.id, opts.visitId));
      if (!old) throw new BookingError("visit_not_found", "Visit not found");
      // Lead first, matching bookInTx, so a reschedule and a booking for the same buyer can't deadlock.
      await tx.select({ id: leads.id }).from(leads).where(eq(leads.id, old.leadId)).for("update");
      await cancelInTx(tx, {
        visitId: old.id,
        reason: "Rescheduled",
        notify: false,
        now: opts.now,
      });
      const fresh = await bookInTx(tx, {
        leadId: old.leadId,
        slotId: opts.newSlotId,
        via: opts.via,
        now: opts.now,
      });
      await tx.update(visits).set({ rescheduledFromId: old.id }).where(eq(visits.id, fresh.id));
      return { ...fresh, rescheduledFromId: old.id };
    });
  } catch (err) {
    throw await withAlternatives(err, opts.newSlotId, opts.now);
  }
}

/* ------------------------------------------------------------------ */
/* After the visit                                                    */
/* ------------------------------------------------------------------ */

export async function recordOutcome(opts: {
  visitId: string;
  outcome: "visited" | "no_show";
  note?: string;
  now?: Date;
}) {
  const now = opts.now ?? new Date();
  return db.transaction(async (tx) => {
    const [visit] = await tx.select().from(visits).where(eq(visits.id, opts.visitId)).for("update");
    if (!visit) throw new BookingError("visit_not_found", "Visit not found");
    if (visit.status !== "booked") {
      throw new BookingError(
        "invalid_state",
        `This visit is already ${visit.status.replace("_", " ")}`,
      );
    }
    if (visit.startsAt.getTime() - now.getTime() > EARLY_CHECKIN_MS) {
      throw new BookingError("invalid_state", "This visit hasn't started yet");
    }
    await tx
      .update(visits)
      .set({
        status: opts.outcome,
        checkedInAt: opts.outcome === "visited" ? now : null,
        outcomeNote: opts.note ?? null,
      })
      .where(eq(visits.id, visit.id));
    await tx
      .update(leads)
      .set({ status: opts.outcome, lastActivityAt: now })
      .where(eq(leads.id, visit.leadId));
    return { ...visit, status: opts.outcome };
  });
}

/** The QR code on the buyer's confirmation opens this at the site office. */
export async function checkInByToken(token: string, now = new Date()) {
  const [visit] = await db
    .select({ id: visits.id })
    .from(visits)
    .where(eq(visits.checkinToken, token));
  if (!visit) throw new BookingError("visit_not_found", "This check-in code is not valid");
  return recordOutcome({ visitId: visit.id, outcome: "visited", now });
}

/* ------------------------------------------------------------------ */
/* Reminder job                                                       */
/* ------------------------------------------------------------------ */

/**
 * Sends every reminder that has come due. Safe to run as often as you like and from more than
 * one place at once: each reminder row is claimed with SKIP LOCKED and only ever sent once.
 */
export async function processDueReminders(now = new Date(), batch = 100) {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ reminder: reminders, visit: visits })
      .from(reminders)
      .innerJoin(visits, eq(visits.id, reminders.visitId))
      .where(and(eq(reminders.status, "scheduled"), lte(reminders.sendAt, now)))
      .orderBy(asc(reminders.sendAt))
      .limit(batch)
      .for("update", { of: reminders, skipLocked: true });

    const result = { sent: 0, skipped: 0, cancelled: 0 };
    for (const { reminder, visit } of due) {
      if (visit.status !== "booked") {
        await tx
          .update(reminders)
          .set({ status: "cancelled" })
          .where(eq(reminders.id, reminder.id));
        result.cancelled++;
        continue;
      }
      if (visit.startsAt <= now) {
        await tx
          .update(reminders)
          .set({ status: "skipped", skipReason: "The visit had already started" })
          .where(eq(reminders.id, reminder.id));
        result.skipped++;
        continue;
      }
      const [lead] = await tx.select().from(leads).where(eq(leads.id, visit.leadId));
      const [exec] = await tx
        .select({ name: staffProfiles.displayName })
        .from(staffProfiles)
        .where(eq(staffProfiles.userId, visit.executiveId));
      const ctx = await messageContext(
        tx,
        visit.projectId,
        visit.startsAt,
        exec?.name ?? "",
        lead.language,
      );
      const message = await recordOutbound(
        {
          channel: "whatsapp",
          template: reminder.kind === "day_before" ? "reminder_day_before" : "reminder_two_hours",
          toPhone: lead.phone,
          leadId: lead.id,
          body: visitReminder(ctx, reminder.kind),
          transactional: true,
        },
        tx,
      );
      const suppressed = message.status === "suppressed";
      await tx
        .update(reminders)
        .set(
          suppressed
            ? { status: "skipped", skipReason: "Buyer opted out of messages" }
            : { status: "sent", sentAt: now },
        )
        .where(eq(reminders.id, reminder.id));
      if (suppressed) result.skipped++;
      else result.sent++;
    }
    return result;
  });
}

async function messageContext(
  tx: Tx,
  projectId: string,
  startsAt: Date,
  executiveName: string,
  lang: "en" | "hi" | "gu",
) {
  const [p] = await tx.select().from(projects).where(eq(projects.id, projectId));
  return {
    lang,
    projectName: p.name,
    reraNumber: p.reraNumber,
    latitude: p.latitude,
    longitude: p.longitude,
    startsAt,
    executiveName,
  };
}
