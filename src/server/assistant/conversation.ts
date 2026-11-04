import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  chatFlags,
  consents,
  conversations,
  leadCodeSeq,
  leads,
  leadTouches,
  messages,
  staffProfiles,
  user,
} from "@/db/schema";
import { CONSENT_NOTICE_VERSION } from "@/server/leads/intake";
import { recordOutbound } from "@/server/messaging/outbox";
import { livePhoneMatch } from "@/server/leads/merge";

export type Lang = "en" | "hi" | "gu";
export type FlagReason = (typeof chatFlags.$inferInsert)["reason"];

export type SlotOption = { id: string; label: string; day: string; time: string; left: number };
export type MessagePart =
  | { type: "slots"; projectId: string; projectName: string; slots: SlotOption[] }
  | { type: "booked"; code: string; label: string; projectName: string; executiveName: string }
  | { type: "verify"; purpose: "book" | "handoff"; slotId?: string }
  | { type: "handoff"; executiveName: string }
  | {
      type: "existing";
      code: string;
      label: string;
      projectName: string;
      newSlotId: string;
      newLabel: string;
    }
  | { type: "citations"; facts: { code: string; label: string }[] };

export type ChatMessage = {
  id: string;
  role: "buyer" | "assistant" | "system";
  text: string;
  parts: MessagePart[];
  createdAt: string;
};

/** The conversation behind the chat cookie, or a new one. A lead is created with the first message. */
export async function getConversation(id: string | null | undefined) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  return conv ?? null;
}

export async function startConversation(input: { language: Lang; projectId: string | null }) {
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.execute<{ n: string }>(
      sql`select nextval(${leadCodeSeq.seqName})::text as n`,
    );
    const [lead] = await tx
      .insert(leads)
      .values({
        code: `LD-${n}`,
        language: input.language,
        projectId: input.projectId,
        firstSource: "website",
        status: "engaged",
      })
      .returning();
    await tx.insert(leadTouches).values({
      leadId: lead.id,
      source: "website",
      message: "Started a chat with the assistant",
    });
    const [conv] = await tx
      .insert(conversations)
      .values({ leadId: lead.id, language: input.language, channel: "web" })
      .returning();
    return conv;
  });
}

export async function history(conversationId: string, limit = 40): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), ne(messages.role, "staff")))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse().map(toChatMessage);
}

export function toChatMessage(m: typeof messages.$inferSelect): ChatMessage {
  return {
    id: m.id,
    role: m.role === "staff" ? "assistant" : m.role,
    text: m.content,
    parts: (m.parts as MessagePart[] | null) ?? [],
    createdAt: m.createdAt.toISOString(),
  };
}

export async function saveMessage(input: {
  conversationId: string;
  role: "buyer" | "assistant" | "system";
  text: string;
  parts?: MessagePart[];
  citedFacts?: string[];
  guardrail?: string | null;
  model?: string | null;
  latencyMs?: number | null;
}) {
  const [row] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: input.role,
      content: input.text,
      parts: input.parts?.length ? input.parts : null,
      citedFacts: input.citedFacts?.length ? input.citedFacts : null,
      guardrail: input.guardrail ?? null,
      model: input.model ?? null,
      latencyMs: input.latencyMs ?? null,
    })
    .returning();
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, input.conversationId));
  return row;
}

/** Buyer messages in the last window, for a simple per-conversation rate limit. */
export async function recentBuyerMessages(conversationId: string, minutes: number) {
  const [r] = await db
    .select({ n: count() })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.role, "buyer"),
        sql`${messages.createdAt} > now() - make_interval(mins => ${minutes})`,
      ),
    );
  return Number(r.n);
}

export async function flag(input: {
  conversationId: string;
  messageId?: string | null;
  reason: FlagReason;
  detail?: string;
}) {
  await db.insert(chatFlags).values({
    conversationId: input.conversationId,
    messageId: input.messageId ?? null,
    reason: input.reason,
    detail: input.detail ?? null,
  });
}

export async function leadForConversation(conversationId: string) {
  const [row] = await db
    .select({ lead: leads })
    .from(conversations)
    .innerJoin(leads, eq(leads.id, conversations.leadId))
    .where(eq(conversations.id, conversationId));
  return row?.lead ?? null;
}

/** First reply to a website chat counts as the lead's first response. */
export async function markResponded(leadId: string) {
  await db
    .update(leads)
    .set({ firstResponseAt: new Date(), lastActivityAt: new Date() })
    .where(and(eq(leads.id, leadId), isNull(leads.firstResponseAt)));
}

/**
 * Called once a buyer verifies their mobile number inside the chat. If that number already
 * belongs to a lead (say from a portal last week), the chat joins that lead and the anonymous
 * chat lead is merged into it, so sales sees one person with one history.
 */
export async function linkVerifiedBuyer(input: {
  conversationId: string;
  buyerUserId: string;
  phone: string;
  name: string | null;
  consent: boolean;
}) {
  return db.transaction(async (tx) => {
    const [conv] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, input.conversationId))
      .for("update");
    const [chatLead] = await tx.select().from(leads).where(eq(leads.id, conv.leadId!));
    const [existing] = await tx
      .select()
      .from(leads)
      .where(and(livePhoneMatch(input.phone), ne(leads.id, chatLead.id)))
      .for("update");

    let lead = chatLead;
    if (existing) {
      [lead] = await tx
        .update(leads)
        .set({
          name: existing.name ?? input.name,
          buyerUserId: input.buyerUserId,
          projectId: existing.projectId ?? chatLead.projectId,
          wantsBhk: existing.wantsBhk ?? chatLead.wantsBhk,
          budgetMinInr: existing.budgetMinInr ?? chatLead.budgetMinInr,
          budgetMaxInr: existing.budgetMaxInr ?? chatLead.budgetMaxInr,
          timeline: existing.timeline ?? chatLead.timeline,
          purpose: existing.purpose ?? chatLead.purpose,
          language: chatLead.language,
          firstResponseAt: existing.firstResponseAt ?? chatLead.firstResponseAt,
          lastActivityAt: new Date(),
        })
        .where(eq(leads.id, existing.id))
        .returning();
      await tx.update(leads).set({ mergedIntoId: existing.id }).where(eq(leads.id, chatLead.id));
      await tx
        .update(conversations)
        .set({ leadId: existing.id })
        .where(eq(conversations.leadId, chatLead.id));
      await tx.insert(leadTouches).values({
        leadId: existing.id,
        source: "website",
        message: "Verified their number in the website chat",
      });
    } else if (!chatLead.phone) {
      [lead] = await tx
        .update(leads)
        .set({
          phone: input.phone,
          buyerUserId: input.buyerUserId,
          name: chatLead.name ?? input.name,
        })
        .where(eq(leads.id, chatLead.id))
        .returning();
    }
    if (input.consent) {
      await tx.insert(consents).values({
        leadId: lead.id,
        channel: "whatsapp",
        granted: true,
        capturedVia: "web_chat",
        noticeVersion: CONSENT_NOTICE_VERSION,
      });
    }
    return lead;
  });
}

/** The executive who already owns the lead, or the one on that project with the fewest open leads. */
export async function pickExecutive(projectId: string | null, ownerId: string | null) {
  const team = await db
    .select({
      userId: staffProfiles.userId,
      displayName: staffProfiles.displayName,
      projectIds: staffProfiles.projectIds,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(user.id, staffProfiles.userId))
    .where(and(eq(staffProfiles.active, true), eq(user.role, "sales_exec")));
  const owner = team.find((t) => t.userId === ownerId);
  if (owner) return owner;
  const pool = projectId ? team.filter((t) => t.projectIds.includes(projectId)) : team;
  if (!pool.length) return null;
  const load = await db
    .select({ id: leads.ownerId, n: count() })
    .from(leads)
    .where(
      and(
        inArray(
          leads.ownerId,
          pool.map((p) => p.userId),
        ),
        inArray(leads.status, ["contacted", "engaged", "handed_off", "visit_booked"]),
      ),
    )
    .groupBy(leads.ownerId);
  const loadOf = new Map(load.map((l) => [l.id, Number(l.n)]));
  return pool.sort((a, b) => (loadOf.get(a.userId) ?? 0) - (loadOf.get(b.userId) ?? 0))[0];
}

export async function recordHandoff(input: {
  conversationId: string;
  leadId: string;
  executive: { userId: string; displayName: string };
  reason: string;
  summary: string;
  flagReason: FlagReason;
  leadCode: string;
}) {
  await db.transaction(async (tx) => {
    await tx
      .update(conversations)
      .set({
        status: "handed_off",
        handedOffTo: input.executive.userId,
        handoffReason: input.reason,
        handoffSummary: input.summary,
        handedOffAt: new Date(),
      })
      .where(eq(conversations.id, input.conversationId));
    await tx
      .update(leads)
      .set({
        ownerId: input.executive.userId,
        status: sql`case when ${leads.status} in ('visit_booked','visited') then ${leads.status} else 'handed_off' end`,
        lastActivityAt: new Date(),
      })
      .where(eq(leads.id, input.leadId));
    await tx.insert(chatFlags).values({
      conversationId: input.conversationId,
      reason: input.flagReason,
      detail: input.reason,
    });
    await recordOutbound(
      {
        channel: "staff_alert",
        template: "handoff",
        toUserId: input.executive.userId,
        leadId: input.leadId,
        body: `Handoff ${input.leadCode}: ${input.summary}`,
      },
      tx,
    );
  });
}

export async function transcript(conversationId: string) {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
  return rows;
}
