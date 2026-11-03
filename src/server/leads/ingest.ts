import "server-only";
import { and, desc, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  consents,
  duplicateCandidates,
  leadCodeSeq,
  leads,
  leadTouches,
  projects,
} from "@/db/schema";
import { normalisePhone } from "@/lib/phone";
import { recordOutbound } from "@/server/messaging/outbox";
import { firstResponse } from "@/server/messaging/templates";
import { CONSENT_NOTICE_VERSION } from "./intake";
import { scoreLead } from "./score";

export type IncomingLead = {
  source: "property_portal" | "social_ad" | "website" | "hoarding_call";
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  projectId?: string | null;
  wantsBhk?: "2BHK" | "3BHK" | null;
  budgetMaxInr?: number | null;
  language?: "en" | "hi" | "gu";
  message?: string | null;
  campaign?: string | null;
  externalRef?: string | null;
  /** The form or call included consent to be contacted about this enquiry. */
  consent: boolean;
  receivedAt?: Date;
};

export type IngestResult = {
  leadId: string;
  code: string;
  outcome: "created" | "merged";
  firstReply: "sent" | "suppressed" | "not_sent";
  possibleDuplicates: number;
};

/**
 * Every lead, from every source, comes in here. A known mobile number becomes another touch on
 * the existing lead; anything else becomes a new lead, checked for likely duplicates that a
 * person should look at. If the buyer agreed to be contacted, the first reply goes out at once.
 */
export async function ingestLead(input: IncomingLead): Promise<IngestResult> {
  const phone = normalisePhone(input.phone);
  const email = input.email?.trim().toLowerCase() || null;
  const name = input.name?.trim().replace(/\s+/g, " ") || null;
  const receivedAt = input.receivedAt ?? new Date();

  return db.transaction(async (tx) => {
    // Serialise intake per number, so the same buyer arriving twice at once can't become two leads.
    if (phone) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${phone}))`);

    const [existing] = phone
      ? await tx
          .select()
          .from(leads)
          .where(and(eq(leads.phone, phone), isNull(leads.mergedIntoId)))
          .for("update")
      : [];

    let lead: typeof leads.$inferSelect;
    let outcome: IngestResult["outcome"];
    if (existing) {
      outcome = "merged";
      [lead] = await tx
        .update(leads)
        .set({
          name: existing.name ?? name,
          email: existing.email ?? email,
          projectId: existing.projectId ?? input.projectId ?? null,
          wantsBhk: existing.wantsBhk ?? input.wantsBhk ?? null,
          budgetMaxInr: existing.budgetMaxInr ?? input.budgetMaxInr ?? null,
          lastActivityAt: receivedAt,
        })
        .where(eq(leads.id, existing.id))
        .returning();
    } else {
      outcome = "created";
      const [{ n }] = await tx.execute<{ n: string }>(
        sql`select nextval(${leadCodeSeq.seqName})::text as n`,
      );
      [lead] = await tx
        .insert(leads)
        .values({
          code: `LD-${n}`,
          name,
          phone,
          email,
          language: input.language ?? "en",
          projectId: input.projectId ?? null,
          wantsBhk: input.wantsBhk ?? null,
          budgetMaxInr: input.budgetMaxInr ?? null,
          firstSource: input.source,
          status: "new",
          createdAt: receivedAt,
          lastActivityAt: receivedAt,
        })
        .returning();
    }

    await tx.insert(leadTouches).values({
      leadId: lead.id,
      source: input.source,
      campaign: input.campaign ?? null,
      externalRef: input.externalRef ?? null,
      message:
        outcome === "merged"
          ? `Repeat enquiry with the same mobile number${input.message ? `: ${input.message}` : ""}`
          : (input.message ?? null),
      receivedAt,
    });

    if (input.consent) {
      await tx.insert(consents).values({
        leadId: lead.id,
        channel: "whatsapp",
        granted: true,
        capturedVia: CAPTURED_VIA[input.source],
        noticeVersion: CONSENT_NOTICE_VERSION,
        createdAt: receivedAt,
      });
    }

    const possibleDuplicates = outcome === "created" ? await flagLikelyDuplicates(tx, lead) : 0;
    const firstReply = await sendFirstReply(tx, lead, input, outcome, receivedAt);

    const [project] = lead.projectId
      ? await tx.select().from(projects).where(eq(projects.id, lead.projectId))
      : [];
    const { score } = scoreLead({
      budgetMaxInr: lead.budgetMaxInr,
      timeline: lead.timeline,
      wantsBhk: lead.wantsBhk,
      hasPhone: Boolean(lead.phone),
      hasUpcomingVisit: lead.status === "visit_booked",
      projectMinPriceInr: project?.startingPriceInr ?? null,
    });
    await tx.update(leads).set({ score }).where(eq(leads.id, lead.id));

    return { leadId: lead.id, code: lead.code, outcome, firstReply, possibleDuplicates };
  });
}

const CAPTURED_VIA: Record<IncomingLead["source"], string> = {
  property_portal: "portal_form",
  social_ad: "ad_form",
  website: "web_form",
  hoarding_call: "staff_call",
};

/**
 * A hoarding call is answered by a person, so the call itself is the first response. Everyone
 * else gets the opt-in WhatsApp template straight away, but only with consent and only if they
 * haven't opted out. A repeat enquiry from someone already contacted gets no second greeting.
 */
async function sendFirstReply(
  tx: Tx,
  lead: typeof leads.$inferSelect,
  input: IncomingLead,
  outcome: IngestResult["outcome"],
  receivedAt: Date,
): Promise<IngestResult["firstReply"]> {
  if (input.source === "hoarding_call") {
    if (!lead.firstResponseAt) {
      await tx
        .update(leads)
        .set({ firstResponseAt: receivedAt, status: "contacted" })
        .where(eq(leads.id, lead.id));
    }
    return "not_sent";
  }
  if (outcome === "merged" && lead.firstResponseAt) return "not_sent";
  if (!lead.phone || !input.consent) return "not_sent";

  const [project] = lead.projectId
    ? await tx.select().from(projects).where(eq(projects.id, lead.projectId))
    : [];
  const base = process.env.BETTER_AUTH_URL ?? "";
  const prefix = lead.language === "en" ? "" : `/${lead.language}`;
  const message = await recordOutbound(
    {
      channel: "whatsapp",
      template: "first_response",
      toPhone: lead.phone,
      leadId: lead.id,
      body: firstResponse({
        lang: lead.language,
        name: lead.name?.split(" ")[0] ?? null,
        projectName: project?.name ?? null,
        reraNumber: project?.reraNumber ?? null,
        link: `${base}${prefix}/chat${project ? `?project=${project.id}` : ""}`,
      }),
    },
    tx,
  );
  if (message.status !== "sent") return "suppressed";
  await tx
    .update(leads)
    .set({
      firstResponseAt: message.createdAt,
      status: lead.status === "new" ? "contacted" : lead.status,
    })
    .where(eq(leads.id, lead.id));
  return "sent";
}

/**
 * Same email with a different number, or a very similar name for the same project in the last
 * 30 days. These are only suggestions: a person decides whether to merge.
 */
async function flagLikelyDuplicates(tx: Tx, lead: typeof leads.$inferSelect) {
  const since = new Date(lead.createdAt.getTime() - 30 * 24 * 60 * 60 * 1000);
  const matches = await tx
    .select({
      id: leads.id,
      email: leads.email,
      similarity: lead.name ? sql<number>`similarity(${leads.name}, ${lead.name})` : sql<number>`0`,
    })
    .from(leads)
    .where(
      and(
        ne(leads.id, lead.id),
        isNull(leads.mergedIntoId),
        or(
          lead.email ? eq(leads.email, lead.email) : undefined,
          lead.name && lead.projectId
            ? and(
                eq(leads.projectId, lead.projectId),
                gt(leads.createdAt, since),
                sql`similarity(${leads.name}, ${lead.name}) > 0.6`,
              )
            : undefined,
        ),
      ),
    )
    .orderBy(desc(sql`similarity(${leads.name}, ${lead.name ?? ""})`))
    .limit(3);

  for (const m of matches) {
    const sameEmail = Boolean(lead.email && m.email === lead.email);
    await tx
      .insert(duplicateCandidates)
      .values({
        leadId: lead.id,
        candidateLeadId: m.id,
        reason: sameEmail ? "Same email address" : "Similar name, same project",
        similarity: sameEmail ? 95 : Math.round(Number(m.similarity) * 100),
      })
      .onConflictDoNothing();
  }
  return matches.length;
}
