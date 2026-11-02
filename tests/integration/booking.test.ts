import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, outbox, reminders, slots, visits } from "@/db/schema";
import {
  BookingError,
  bookVisit,
  cancelVisit,
  processDueReminders,
  recordOutcome,
  rescheduleVisit,
} from "@/server/bookings/service";
import { makeFixture } from "./fixtures";

const HOUR = 60 * 60 * 1000;
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

const codeOf = (r: PromiseSettledResult<unknown>) =>
  r.status === "rejected" ? (r.reason as BookingError).code : "ok";

describe("booking under concurrency", () => {
  it("lets exactly one of 20 simultaneous buyers take the last seat", async () => {
    const f = await makeFixture({ capacity: 1, leadCount: 20 });
    cleanup = f.cleanup;

    const results = await Promise.allSettled(
      f.leadIds.map((leadId) => bookVisit({ leadId, slotId: f.slotId, via: "assistant" })),
    );

    const codes = results.map(codeOf);
    expect(codes.filter((c) => c === "ok")).toHaveLength(1);
    expect(codes.filter((c) => c === "slot_full")).toHaveLength(19);

    const [slot] = await db.select().from(slots).where(eq(slots.id, f.slotId));
    expect(slot.booked).toBe(1);
    const booked = await db.select().from(visits).where(eq(visits.slotId, f.slotId));
    expect(booked).toHaveLength(1);

    // Everyone who missed out is offered the next free time instead of a dead end.
    const missed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((missed.reason as BookingError).alternatives.map((a) => a.id)).toContain(f.slots[1].id);
  });

  it("fills a 3-seat slot with exactly 3 visits, each with a different executive", async () => {
    const f = await makeFixture({ capacity: 3, executives: 3, leadCount: 20 });
    cleanup = f.cleanup;

    const results = await Promise.allSettled(
      f.leadIds.map((leadId) => bookVisit({ leadId, slotId: f.slotId, via: "assistant" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);

    const booked = await db.select().from(visits).where(eq(visits.slotId, f.slotId));
    expect(new Set(booked.map((v) => v.executiveId)).size).toBe(3);
  });

  it("books once when the same buyer taps twice", async () => {
    const f = await makeFixture({ capacity: 5 });
    cleanup = f.cleanup;
    const [leadId] = f.leadIds;

    const results = await Promise.allSettled([
      bookVisit({ leadId, slotId: f.slotId, via: "buyer_portal" }),
      bookVisit({ leadId, slotId: f.slotId, via: "buyer_portal" }),
    ]);
    expect(results.map(codeOf).sort()).toEqual(["already_booked", "ok"]);
  });
});

describe("booking rules", () => {
  it("refuses a slot that starts in less than three hours", async () => {
    const f = await makeFixture({ slotHours: [2, 26] });
    cleanup = f.cleanup;
    await expect(
      bookVisit({ leadId: f.leadIds[0], slotId: f.slotId, via: "assistant" }),
    ).rejects.toMatchObject({ code: "too_soon" });
  });

  it("refuses a slot the sales head has blocked", async () => {
    const f = await makeFixture({});
    cleanup = f.cleanup;
    await db.update(slots).set({ blocked: true }).where(eq(slots.id, f.slotId));
    await expect(
      bookVisit({ leadId: f.leadIds[0], slotId: f.slotId, via: "assistant" }),
    ).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  it("marks the lead hot and owned, schedules both reminders and tells buyer and executive", async () => {
    const f = await makeFixture({});
    cleanup = f.cleanup;
    const visit = await bookVisit({ leadId: f.leadIds[0], slotId: f.slotId, via: "assistant" });

    expect(visit.code).toMatch(/^VS-\d+$/);
    const [lead] = await db.select().from(leads).where(eq(leads.id, f.leadIds[0]));
    expect(lead).toMatchObject({
      status: "visit_booked",
      score: "hot",
      ownerId: visit.executiveId,
    });

    const rs = await db.select().from(reminders).where(eq(reminders.visitId, visit.id));
    expect(rs.map((r) => [r.kind, r.status]).sort()).toEqual([
      ["day_before", "scheduled"],
      ["two_hours_before", "scheduled"],
    ]);

    const sent = await db.select().from(outbox).where(eq(outbox.leadId, f.leadIds[0]));
    expect(sent.map((m) => m.template).sort()).toEqual([
      "executive_visit_alert",
      "visit_confirmation",
    ]);
    expect(sent.find((m) => m.template === "visit_confirmation")!.body).toContain("RERA TEST/");
  });

  it("frees the seat and cancels pending reminders when a visit is cancelled", async () => {
    const f = await makeFixture({ leadCount: 2 });
    cleanup = f.cleanup;
    const visit = await bookVisit({ leadId: f.leadIds[0], slotId: f.slotId, via: "assistant" });

    await cancelVisit({ visitId: visit.id, reason: "Buyer travelling" });

    const [slot] = await db.select().from(slots).where(eq(slots.id, f.slotId));
    expect(slot.booked).toBe(0);
    const rs = await db.select().from(reminders).where(eq(reminders.visitId, visit.id));
    expect(rs.every((r) => r.status === "cancelled")).toBe(true);
    await expect(
      bookVisit({ leadId: f.leadIds[1], slotId: f.slotId, via: "assistant" }),
    ).resolves.toBeTruthy();
    await expect(cancelVisit({ visitId: visit.id, reason: "again" })).rejects.toMatchObject({
      code: "invalid_state",
    });
  });

  it("moves a visit in one step when rescheduling", async () => {
    const f = await makeFixture({});
    cleanup = f.cleanup;
    const first = await bookVisit({ leadId: f.leadIds[0], slotId: f.slotId, via: "assistant" });
    const moved = await rescheduleVisit({
      visitId: first.id,
      newSlotId: f.slots[1].id,
      via: "buyer_portal",
    });

    expect(moved.rescheduledFromId).toBe(first.id);
    const all = await db.select().from(slots).where(eq(slots.projectId, f.projectId));
    expect(Object.fromEntries(all.map((s) => [s.id, s.booked]))).toEqual({
      [f.slots[0].id]: 0,
      [f.slots[1].id]: 1,
    });
  });

  it("keeps the original visit if the new slot is taken", async () => {
    const f = await makeFixture({ leadCount: 2 });
    cleanup = f.cleanup;
    const mine = await bookVisit({ leadId: f.leadIds[0], slotId: f.slotId, via: "assistant" });
    await bookVisit({ leadId: f.leadIds[1], slotId: f.slots[1].id, via: "assistant" });

    await expect(
      rescheduleVisit({ visitId: mine.id, newSlotId: f.slots[1].id, via: "buyer_portal" }),
    ).rejects.toMatchObject({ code: "slot_full" });
    const [still] = await db.select().from(visits).where(eq(visits.id, mine.id));
    expect(still.status).toBe("booked");
  });

  it("won't record an outcome before the visit has started", async () => {
    const f = await makeFixture({});
    cleanup = f.cleanup;
    const visit = await bookVisit({ leadId: f.leadIds[0], slotId: f.slotId, via: "assistant" });
    await expect(recordOutcome({ visitId: visit.id, outcome: "visited" })).rejects.toMatchObject({
      code: "invalid_state",
    });
    const done = await recordOutcome({
      visitId: visit.id,
      outcome: "visited",
      now: new Date(visit.startsAt.getTime() + 10 * 60 * 1000),
    });
    expect(done.status).toBe("visited");
  });
});

describe("reminder job", () => {
  it("sends each reminder once, at the right time, even when two runs overlap", async () => {
    const f = await makeFixture({});
    cleanup = f.cleanup;
    const visit = await bookVisit({ leadId: f.leadIds[0], slotId: f.slotId, via: "assistant" });
    const start = visit.startsAt.getTime();
    const mine = () => db.select().from(reminders).where(eq(reminders.visitId, visit.id));

    await processDueReminders(new Date(start - 30 * HOUR));
    expect((await mine()).every((r) => r.status === "scheduled")).toBe(true);

    await processDueReminders(new Date(start - 23 * HOUR));
    const afterDay = await mine();
    expect(afterDay.find((r) => r.kind === "day_before")!.status).toBe("sent");
    expect(afterDay.find((r) => r.kind === "two_hours_before")!.status).toBe("scheduled");

    const at = new Date(start - 1 * HOUR);
    await Promise.all([processDueReminders(at), processDueReminders(at)]);
    expect((await mine()).every((r) => r.status === "sent")).toBe(true);

    const messages = await db
      .select()
      .from(outbox)
      .where(and(eq(outbox.leadId, f.leadIds[0]), eq(outbox.channel, "whatsapp")));
    expect(messages.filter((m) => m.template.startsWith("reminder_"))).toHaveLength(2);
  });

  it("does not remind a buyer who has opted out", async () => {
    const f = await makeFixture({});
    cleanup = f.cleanup;
    const visit = await bookVisit({ leadId: f.leadIds[0], slotId: f.slotId, via: "assistant" });
    await db.update(leads).set({ optedOutAt: new Date() }).where(eq(leads.id, f.leadIds[0]));

    await processDueReminders(new Date(visit.startsAt.getTime() - 23 * HOUR));
    const [day] = await db
      .select()
      .from(reminders)
      .where(and(eq(reminders.visitId, visit.id), eq(reminders.kind, "day_before")));
    expect(day).toMatchObject({ status: "skipped", skipReason: "Buyer opted out of messages" });
  });
});
