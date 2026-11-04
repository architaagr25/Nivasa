import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { consents, leadCodeSeq, leads, leadTouches } from "@/db/schema";
import { livePhoneMatch } from "./merge";

export const CONSENT_NOTICE_VERSION = "2026-10";

type BuyerIntake = {
  phone: string; // E.164
  name: string | null;
  projectId: string;
  language: "en" | "hi" | "gu";
  buyerUserId: string;
  consentGiven: boolean;
  capturedVia: string;
};

/**
 * A buyer who books on the website is matched to their existing lead by mobile number
 * (they may have come in through a portal or an ad earlier), or becomes a new lead.
 * Either way the website visit is recorded as a touch and their consent is logged.
 */
export async function findOrCreateBuyerLead(input: BuyerIntake) {
  return db.transaction(async (tx) => {
    const now = new Date();
    let [lead] = await tx.select().from(leads).where(livePhoneMatch(input.phone)).for("update");

    if (lead) {
      [lead] = await tx
        .update(leads)
        .set({
          name: lead.name ?? input.name,
          buyerUserId: input.buyerUserId,
          projectId: lead.projectId ?? input.projectId,
          language: input.language,
          lastActivityAt: now,
        })
        .where(eq(leads.id, lead.id))
        .returning();
    } else {
      const [{ n }] = await tx.execute<{ n: string }>(
        sql`select nextval(${leadCodeSeq.seqName})::text as n`,
      );
      [lead] = await tx
        .insert(leads)
        .values({
          code: `LD-${n}`,
          name: input.name,
          phone: input.phone,
          language: input.language,
          projectId: input.projectId,
          firstSource: "website",
          buyerUserId: input.buyerUserId,
          status: "engaged",
          createdAt: now,
          lastActivityAt: now,
        })
        .returning();
    }

    await tx.insert(leadTouches).values({
      leadId: lead.id,
      source: "website",
      message: "Booked a site visit on the website",
    });
    if (input.consentGiven) {
      await tx.insert(consents).values({
        leadId: lead.id,
        channel: "whatsapp",
        granted: true,
        capturedVia: input.capturedVia,
        noticeVersion: CONSENT_NOTICE_VERSION,
      });
    }
    return lead;
  });
}

/** Opt out of (or back into) WhatsApp and SMS for every lead tied to this buyer. */
export async function setMessagingConsent(
  buyerUserId: string,
  phone: string | null,
  granted: boolean,
) {
  return db.transaction(async (tx) => {
    const mine = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(
        phone
          ? sql`${leads.buyerUserId} = ${buyerUserId} or ${leads.phone} = ${phone}`
          : eq(leads.buyerUserId, buyerUserId),
      );
    for (const l of mine) {
      await tx
        .update(leads)
        .set({ optedOutAt: granted ? null : new Date() })
        .where(eq(leads.id, l.id));
      await tx.insert(consents).values({
        leadId: l.id,
        channel: "whatsapp",
        granted,
        capturedVia: granted ? "buyer_portal_opt_in" : "buyer_portal_opt_out",
        noticeVersion: CONSENT_NOTICE_VERSION,
      });
    }
    return mine.length;
  });
}

/** "STOP" (or its Hindi/Gujarati equivalent) in a reply opts that number out of all messages. */
export const STOP_WORDS = /^\s*(stop|unsubscribe|रोकें|बंद करें|બંધ કરો|બંધ)\s*[.!]?\s*$/i;

export async function optOutByPhone(phone: string) {
  return db.transaction(async (tx) => {
    const mine = await tx.select({ id: leads.id }).from(leads).where(livePhoneMatch(phone));
    for (const l of mine) {
      await tx.update(leads).set({ optedOutAt: new Date() }).where(eq(leads.id, l.id));
      await tx.insert(consents).values({
        leadId: l.id,
        channel: "whatsapp",
        granted: false,
        capturedVia: "stop_keyword",
        noticeVersion: CONSENT_NOTICE_VERSION,
      });
    }
    return mine.length;
  });
}
