import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { duplicateCandidates, leads, leadTouches, outbox, user } from "@/db/schema";
import { bookVisit } from "@/server/bookings/service";
import { ingestLead } from "@/server/leads/ingest";
import { optOutByPhone } from "@/server/leads/intake";
import { MergeError, mergeLeads } from "@/server/leads/merge";
import { makeFixture } from "./fixtures";

const mobile = () => `68${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const created: string[] = [];
const ingest = async (...args: Parameters<typeof ingestLead>) => {
  const r = await ingestLead(...args);
  created.push(r.leadId);
  return r;
};
const leadById = async (id: string) => (await db.select().from(leads).where(eq(leads.id, id)))[0];

let actorId: string;
beforeAll(async () => {
  [{ id: actorId }] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "sales_head"))
    .limit(1);
});
afterAll(async () => {
  await db.delete(outbox).where(inArray(outbox.leadId, created));
  await db.delete(leads).where(inArray(leads.id, created));
});
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("merging duplicate leads", () => {
  it("moves everything to the kept lead, fills gaps and keeps an opt-out", async () => {
    const older = await ingest({
      source: "property_portal",
      name: "Merge Kumar",
      phone: mobile(),
      projectId: "project-1",
      consent: true,
    });
    const newerPhone = mobile();
    const newer = await ingest({
      source: "social_ad",
      name: "Merge Kumarr",
      phone: newerPhone,
      email: `merge${Date.now()}@example.com`,
      projectId: "project-1",
      wantsBhk: "3BHK",
      consent: true,
    });
    await optOutByPhone(`+91${newerPhone}`);
    await db
      .insert(duplicateCandidates)
      .values({
        leadId: newer.leadId,
        candidateLeadId: older.leadId,
        reason: "Similar name, same project",
        similarity: 80,
      })
      .onConflictDoNothing();

    const r = await mergeLeads({ keepId: older.leadId, dropId: newer.leadId, actorId });
    expect(r.droppedCode).toBe(newer.code);

    const kept = await leadById(older.leadId);
    expect(kept.mergedIntoId).toBeNull();
    expect(kept.wantsBhk).toBe("3BHK");
    expect(kept.email).toMatch(/^merge\d+@example\.com$/);
    expect(kept.optedOutAt).not.toBeNull();
    expect((await leadById(newer.leadId)).mergedIntoId).toBe(older.leadId);

    const touches = await db.select().from(leadTouches).where(eq(leadTouches.leadId, older.leadId));
    expect(touches.map((t) => t.source).sort()).toEqual(["property_portal", "social_ad"]);
    const [pair] = await db
      .select()
      .from(duplicateCandidates)
      .where(eq(duplicateCandidates.leadId, newer.leadId));
    expect(pair.status).toBe("merged");
  });

  it("routes a later enquiry from the merged lead's number to the kept lead", async () => {
    const older = await ingest({
      source: "website",
      name: "Route One",
      phone: mobile(),
      consent: true,
    });
    const oldNumber = mobile();
    const newer = await ingest({
      source: "property_portal",
      name: "Route One",
      phone: oldNumber,
      consent: true,
    });
    await mergeLeads({ keepId: older.leadId, dropId: newer.leadId, actorId });

    const again = await ingest({ source: "social_ad", phone: oldNumber, consent: true });
    expect(again).toMatchObject({ outcome: "merged", leadId: older.leadId });
  });

  it("refuses to merge two leads that each hold an upcoming visit to the same project", async () => {
    const f = await makeFixture({ capacity: 1, leadCount: 2, slotHours: [48, 50] });
    cleanup = f.cleanup;
    await bookVisit({ leadId: f.leadIds[0], slotId: f.slots[0].id, via: "assistant" });
    await bookVisit({ leadId: f.leadIds[1], slotId: f.slots[1].id, via: "assistant" });

    await expect(
      mergeLeads({ keepId: f.leadIds[0], dropId: f.leadIds[1], actorId }),
    ).rejects.toBeInstanceOf(MergeError);
    expect((await leadById(f.leadIds[1])).mergedIntoId).toBeNull();
  });
});
