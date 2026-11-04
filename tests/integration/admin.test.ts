import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  blackoutDates,
  factSheetVersions,
  facts,
  leads,
  outbox,
  projects,
  slots,
  slotTemplates,
  staffProfiles,
  user,
} from "@/db/schema";
import { addDays, istDate } from "@/lib/time";
import {
  discardDraft,
  publishDraft,
  saveDraft,
  startDraft,
  getFactSheet,
} from "@/server/admin/fact-sheet";
import { bookVisit } from "@/server/bookings/service";
import { syncSlots } from "@/server/slots/sync";

let actorId: string;
beforeAll(async () => {
  [{ id: actorId }] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "sales_head"))
    .limit(1);
});

let projectId: string;
let execId: string;
const leadIds: string[] = [];

async function makeProject() {
  const tag = randomUUID().slice(0, 8);
  projectId = `test-${tag}`;
  await db.insert(projects).values({
    id: projectId,
    name: `Test ${tag}`,
    reraNumber: `TEST/${tag}`,
    locality: "Test",
    address: "Test",
    latitude: "23.0",
    longitude: "72.5",
    heroImage: "/x.webp",
  });
  execId = randomUUID();
  await db
    .insert(user)
    .values({ id: execId, name: "Exec", email: `${tag}@test.invalid`, role: "sales_exec" });
  await db.insert(staffProfiles).values({
    userId: execId,
    displayName: "Exec",
    phone: "+917000199999",
    projectIds: [projectId],
  });
}

afterEach(async () => {
  await db.delete(outbox).where(inArray(outbox.leadId, leadIds.length ? leadIds : [randomUUID()]));
  if (leadIds.length) await db.delete(leads).where(inArray(leads.id, leadIds));
  leadIds.length = 0;
  await db.delete(slots).where(eq(slots.projectId, projectId));
  await db.delete(slotTemplates).where(eq(slotTemplates.projectId, projectId));
  await db.delete(blackoutDates).where(eq(blackoutDates.projectId, projectId));
  await db.delete(factSheetVersions).where(eq(factSheetVersions.projectId, projectId));
  await db.delete(user).where(eq(user.id, execId));
  await db.delete(projects).where(eq(projects.id, projectId));
});

const draftFacts = async () => {
  const sheet = await getFactSheet(projectId);
  return sheet!.draft!.facts;
};

describe("fact sheet versions", () => {
  it("keeps citation codes across edits, never reuses one, and publishes atomically", async () => {
    await makeProject();
    await startDraft(projectId, actorId);
    await saveDraft({
      projectId,
      input: {
        facts: [
          { code: null, category: "possession", label: "Possession", value: "December 2028." },
          {
            code: null,
            category: "pricing",
            label: "2 BHK",
            value: "Indicative starting price ₹64 lakh.",
          },
        ],
      },
    });
    const [pos, price] = await draftFacts();
    expect(pos.code).toMatch(/-POS-1$/);
    await publishDraft(projectId, actorId);
    expect((await db.select().from(projects).where(eq(projects.id, projectId)))[0]).toMatchObject({
      startingPriceInr: 6_400_000,
    });

    // v2: change the possession text, drop the price, add a new pricing fact.
    const draftId = await startDraft(projectId, actorId);
    expect(await startDraft(projectId, actorId)).toBe(draftId);
    await saveDraft({
      projectId,
      input: {
        facts: [
          { ...pos, value: "March 2029." },
          { code: null, category: "pricing", label: "3 BHK", value: "From ₹88 lakh." },
        ],
        changeNote: "Possession moved",
      },
    });
    const v2 = await draftFacts();
    expect(v2[0]).toMatchObject({ code: pos.code, value: "March 2029." });
    expect(v2[1].code).not.toBe(price.code);

    await publishDraft(projectId, actorId);
    const versions = await db
      .select({ version: factSheetVersions.version, status: factSheetVersions.status })
      .from(factSheetVersions)
      .where(eq(factSheetVersions.projectId, projectId))
      .orderBy(asc(factSheetVersions.version));
    expect(versions).toEqual([
      { version: 1, status: "archived" },
      { version: 2, status: "published" },
    ]);
    // The archived version is untouched, so old chats can still be checked against it.
    const v1Facts = await db
      .select({ code: facts.code, value: facts.value })
      .from(facts)
      .innerJoin(factSheetVersions, eq(factSheetVersions.id, facts.versionId))
      .where(and(eq(factSheetVersions.projectId, projectId), eq(factSheetVersions.version, 1)));
    expect(v1Facts.find((f) => f.code === pos.code)?.value).toBe("December 2028.");
  });

  it("discards a draft without touching what's live", async () => {
    await makeProject();
    await startDraft(projectId, actorId);
    await saveDraft({
      projectId,
      input: { facts: [{ code: null, category: "overview", label: "Project", value: "Live." }] },
    });
    await publishDraft(projectId, actorId);
    await startDraft(projectId, actorId);
    await discardDraft(projectId);
    const sheet = await getFactSheet(projectId);
    expect(sheet!.draft).toBeNull();
    expect(sheet!.published!.facts.map((f) => f.value)).toEqual(["Live."]);
  });
});

describe("slot sync", () => {
  const tomorrow = () => addDays(istDate(new Date()), 1);
  // Days in the window that aren't already closed for every project (the seed has festivals).
  const openDays = async () => {
    const closed = new Set(
      (await db.select().from(blackoutDates).where(isNull(blackoutDates.projectId))).map(
        (b) => b.date,
      ),
    );
    return Array.from({ length: 56 }, (_, i) => addDays(tomorrow(), i)).filter(
      (d) => !closed.has(d),
    );
  };
  const weekdayOfDate = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

  it("creates slots from templates, follows capacity changes and keeps booked visits", async () => {
    await makeProject();
    // Every day at 11:00 and 15:00, two buyers each.
    const rows = await db
      .insert(slotTemplates)
      .values(
        [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => [
          { projectId, weekday, startTime: "11:00", capacity: 2 },
          { projectId, weekday, startTime: "15:00", capacity: 2 },
        ]),
      )
      .returning();
    const first = await syncSlots(projectId);
    const open = await openDays();
    expect(first.added).toBe(open.length * 2);
    expect((await syncSlots(projectId)).added).toBe(0); // idempotent

    // Book a buyer into the 15:00 slot on an open day a little ahead.
    const day = open[1];
    const [slot] = await db
      .select()
      .from(slots)
      .where(
        and(eq(slots.projectId, projectId), eq(slots.startsAt, new Date(`${day}T15:00:00+05:30`))),
      );
    const [lead] = await db
      .insert(leads)
      .values({ code: `T-${randomUUID().slice(0, 8)}`, projectId, firstSource: "website" })
      .returning();
    leadIds.push(lead.id);
    await bookVisit({ leadId: lead.id, slotId: slot.id, via: "staff" });

    // Drop the 15:00 template for that weekday and cut capacity everywhere to 1.
    const gone = rows.find(
      (r) => r.weekday === weekdayOfDate(day) && r.startTime.startsWith("15"),
    )!;
    await db.delete(slotTemplates).where(eq(slotTemplates.id, gone.id));
    await db
      .update(slotTemplates)
      .set({ capacity: 1 })
      .where(eq(slotTemplates.projectId, projectId));
    const r = await syncSlots(projectId);

    expect(r.closed).toBe(1);
    expect(r.affected).toHaveLength(1);
    const [after] = await db.select().from(slots).where(eq(slots.id, slot.id));
    expect(after).toMatchObject({ blocked: true, booked: 1 });
    const [otherDay] = await db
      .select()
      .from(slots)
      .where(
        and(eq(slots.projectId, projectId), eq(slots.startsAt, new Date(`${day}T11:00:00+05:30`))),
      );
    expect(otherDay.capacity).toBe(1);
  });

  it("removes a closed day's free slots", async () => {
    await makeProject();
    await db.insert(slotTemplates).values(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        projectId,
        weekday,
        startTime: "10:00",
        capacity: 1,
      })),
    );
    await syncSlots(projectId);
    const day = (await openDays())[3];
    await db.insert(blackoutDates).values({ projectId, date: day, reason: "Festival" });
    const r = await syncSlots(projectId);
    expect(r.removed).toBe(1);
    const left = await db
      .select()
      .from(slots)
      .where(
        and(eq(slots.projectId, projectId), eq(slots.startsAt, new Date(`${day}T10:00:00+05:30`))),
      );
    expect(left).toHaveLength(0);
  });
});
