import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { duplicateCandidates, leads, leadTouches, outbox } from "@/db/schema";
import { ingestLead } from "@/server/leads/ingest";
import { optOutByPhone } from "@/server/leads/intake";

// Numbers outside the seeded 70000xxxxx range, so tests never touch seeded leads.
const mobile = () => `68${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const created: string[] = [];
const ingest = async (...args: Parameters<typeof ingestLead>) => {
  const r = await ingestLead(...args);
  created.push(r.leadId);
  return r;
};

afterAll(async () => {
  await db.delete(outbox).where(inArray(outbox.leadId, created));
  await db.delete(leads).where(inArray(leads.id, created));
});

const leadById = async (id: string) => (await db.select().from(leads).where(eq(leads.id, id)))[0];

describe("lead intake", () => {
  it("answers a consented portal lead at once, with the project's RERA number", async () => {
    const r = await ingest({
      source: "property_portal",
      name: "Test Portal",
      phone: mobile(),
      projectId: "project-1",
      consent: true,
    });
    expect(r).toMatchObject({ outcome: "created", firstReply: "sent" });

    const lead = await leadById(r.leadId);
    expect(lead.status).toBe("contacted");
    expect(lead.firstResponseAt!.getTime() - lead.createdAt.getTime()).toBeLessThan(120_000);
    const [msg] = await db.select().from(outbox).where(eq(outbox.leadId, r.leadId));
    expect(msg).toMatchObject({ template: "first_response", status: "sent" });
    expect(msg.body).toContain("RERA PR/GJ/AHMEDABAD/DEMO/P1-0001");
    expect(msg.body).toContain("STOP");
  });

  it("merges a repeat enquiry with the same number and doesn't greet twice", async () => {
    const phone = mobile();
    const first = await ingest({
      source: "property_portal",
      name: "Repeat Buyer",
      phone,
      consent: true,
    });
    const again = await ingest({
      source: "social_ad",
      phone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
      consent: true,
    });

    expect(again).toMatchObject({
      outcome: "merged",
      leadId: first.leadId,
      firstReply: "not_sent",
    });
    const touches = await db.select().from(leadTouches).where(eq(leadTouches.leadId, first.leadId));
    expect(touches.map((t) => t.source).sort()).toEqual(["property_portal", "social_ad"]);
    const greetings = await db
      .select()
      .from(outbox)
      .where(and(eq(outbox.leadId, first.leadId), eq(outbox.template, "first_response")));
    expect(greetings).toHaveLength(1);
  });

  it("sends nothing without consent and leaves the lead for a person to call", async () => {
    const r = await ingest({
      source: "social_ad",
      name: "No Consent",
      phone: mobile(),
      consent: false,
    });
    expect(r.firstReply).toBe("not_sent");
    expect((await leadById(r.leadId)).firstResponseAt).toBeNull();
    expect(await db.select().from(outbox).where(eq(outbox.leadId, r.leadId))).toHaveLength(0);
  });

  it("counts a hoarding call as answered the moment it was taken", async () => {
    const at = new Date(Date.now() - 5 * 60_000);
    const r = await ingest({
      source: "hoarding_call",
      name: "Caller",
      phone: mobile(),
      consent: true,
      receivedAt: at,
    });
    expect((await leadById(r.leadId)).firstResponseAt).toEqual(at);
  });

  it("never messages someone who replied STOP", async () => {
    const phone = mobile();
    const r = await ingest({ source: "property_portal", phone, consent: false });
    await optOutByPhone(`+91${phone}`);
    const again = await ingest({ source: "social_ad", phone, consent: true });
    expect(again.leadId).toBe(r.leadId);
    expect(again.firstReply).toBe("suppressed");
  });

  it("suggests, but doesn't merge, a lead with the same email and a different number", async () => {
    const email = `dup-${Date.now()}@example.com`;
    const a = await ingest({
      source: "property_portal",
      name: "Asha Mehta",
      phone: mobile(),
      email,
      consent: true,
    });
    const b = await ingest({
      source: "website",
      name: "A Mehta",
      phone: mobile(),
      email: email.toUpperCase(),
      consent: true,
    });
    expect(b.outcome).toBe("created");
    const [dup] = await db
      .select()
      .from(duplicateCandidates)
      .where(eq(duplicateCandidates.leadId, b.leadId));
    expect(dup).toMatchObject({
      candidateLeadId: a.leadId,
      reason: "Same email address",
      status: "open",
    });
  });

  it("suggests a likely duplicate for a very similar name on the same project", async () => {
    const name = `Zarvanya Kothiwala ${Date.now() % 1000}`;
    const a = await ingest({
      source: "property_portal",
      name,
      phone: mobile(),
      projectId: "project-2",
      consent: true,
    });
    const b = await ingest({
      source: "social_ad",
      name: name.replace("Kothiwala", "Kothiwalla"),
      phone: mobile(),
      projectId: "project-2",
      consent: true,
    });
    const [dup] = await db
      .select()
      .from(duplicateCandidates)
      .where(eq(duplicateCandidates.leadId, b.leadId));
    expect(dup).toMatchObject({ candidateLeadId: a.leadId, reason: "Similar name, same project" });
  });

  it("makes one lead when the same buyer arrives five times at once", async () => {
    const phone = mobile();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => ingest({ source: "property_portal", phone, consent: true })),
    );
    expect(new Set(results.map((r) => r.leadId)).size).toBe(1);
    expect(results.filter((r) => r.outcome === "created")).toHaveLength(1);
    const greetings = await db
      .select()
      .from(outbox)
      .where(and(eq(outbox.leadId, results[0].leadId), eq(outbox.template, "first_response")));
    expect(greetings).toHaveLength(1);
  });
});
