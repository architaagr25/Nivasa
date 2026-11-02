import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { consents, leads, outbox } from "@/db/schema";

type Outbound = {
  channel: "whatsapp" | "sms" | "staff_alert";
  template: string;
  body: string;
  toPhone?: string | null;
  toUserId?: string | null;
  leadId?: string | null;
  /**
   * Transactional messages (OTP, a confirmation the buyer just asked for) go out
   * without a marketing consent check. Everything else needs consent and no opt-out.
   */
  transactional?: boolean;
};

/**
 * Every message the product sends goes through here. Delivery is simulated:
 * the row in `outbox` is the message. Returns whether it was sent or suppressed and why.
 */
export async function recordOutbound(msg: Outbound, tx: Tx | typeof db = db) {
  let suppressedReason: string | null = null;

  if (msg.leadId && msg.channel !== "staff_alert") {
    const [lead] = await tx
      .select({ optedOutAt: leads.optedOutAt })
      .from(leads)
      .where(eq(leads.id, msg.leadId));
    if (lead?.optedOutAt) suppressedReason = "opted_out";
    else if (!msg.transactional && !(await hasConsent(tx, msg.leadId))) {
      suppressedReason = "no_consent";
    }
  }

  const [row] = await tx
    .insert(outbox)
    .values({
      channel: msg.channel,
      template: msg.template,
      body: msg.body,
      toPhone: msg.toPhone ?? null,
      toUserId: msg.toUserId ?? null,
      leadId: msg.leadId ?? null,
      status: suppressedReason ? "suppressed" : "sent",
      suppressedReason,
    })
    .returning();
  return row;
}

// The latest consent row wins, so a later "STOP" overrides an earlier yes.
// Consent given for an enquiry covers WhatsApp and SMS follow-up about that same enquiry.
async function hasConsent(tx: Tx | typeof db, leadId: string) {
  const [latest] = await tx
    .select({ granted: consents.granted })
    .from(consents)
    .where(eq(consents.leadId, leadId))
    .orderBy(desc(consents.createdAt))
    .limit(1);
  return latest?.granted === true;
}
