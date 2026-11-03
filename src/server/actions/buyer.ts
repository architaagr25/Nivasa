"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { slots, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { slotDay, slotTime } from "@/lib/slot-format";
import { BookingError, bookVisit, cancelVisit, rescheduleVisit } from "@/server/bookings/service";
import { findOrCreateBuyerLead, setMessagingConsent } from "@/server/leads/intake";
import { getBuyerVisit, listBuyerVisits } from "@/server/visits/queries";

type Lang = "en" | "hi" | "gu";

export type BookResult =
  | { ok: true; code: string }
  | {
      ok: false;
      error:
        "auth" | "consent" | "invalid" | "slot_full" | "too_soon" | "already_booked" | "unknown";
      existingCode?: string;
      alternatives?: { id: string; label: string }[];
    };

const bookSchema = z.object({
  slotId: z.uuid(),
  name: z.string().trim().min(2).max(80),
  consent: z.boolean(),
  locale: z.enum(["en", "hi", "gu"]),
  rescheduleCode: z
    .string()
    .regex(/^VS-\d+$/)
    .optional(),
});

async function currentBuyer() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "buyer" || !session.user.phoneNumber) return null;
  return session.user as typeof session.user & { phoneNumber: string };
}

export async function confirmBooking(input: z.input<typeof bookSchema>): Promise<BookResult> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { slotId, name, consent, locale, rescheduleCode } = parsed.data;

  const buyer = await currentBuyer();
  if (!buyer) return { ok: false, error: "auth" };

  const [slot] = await db
    .select({ projectId: slots.projectId })
    .from(slots)
    .where(eq(slots.id, slotId));
  if (!slot) return { ok: false, error: "invalid" };

  try {
    if (rescheduleCode) {
      const existing = await getBuyerVisit(buyer, rescheduleCode);
      if (!existing || existing.status !== "booked") return { ok: false, error: "invalid" };
      const moved = await rescheduleVisit({
        visitId: existing.id,
        newSlotId: slotId,
        via: "buyer_portal",
      });
      return { ok: true, code: moved.code };
    }

    // Confirmations and reminders are messages, so a new booking needs consent first.
    if (!consent) return { ok: false, error: "consent" };

    const lead = await findOrCreateBuyerLead({
      phone: buyer.phoneNumber,
      name,
      projectId: slot.projectId,
      language: locale,
      buyerUserId: buyer.id,
      consentGiven: true,
      capturedVia: "web_booking",
    });
    if (buyer.name !== name) await db.update(user).set({ name }).where(eq(user.id, buyer.id));

    const visit = await bookVisit({ leadId: lead.id, slotId, via: "buyer_portal" });
    return { ok: true, code: visit.code };
  } catch (err) {
    if (!(err instanceof BookingError)) {
      console.error("Booking failed", err);
      return { ok: false, error: "unknown" };
    }
    if (err.code === "already_booked") {
      const mine = await listBuyerVisits(buyer);
      const existing = mine.find((v) => v.projectId === slot.projectId && v.status === "booked");
      return { ok: false, error: "already_booked", existingCode: existing?.code };
    }
    if (err.code === "slot_full" || err.code === "slot_unavailable" || err.code === "too_soon") {
      return {
        ok: false,
        error: err.code === "too_soon" ? "too_soon" : "slot_full",
        alternatives: err.alternatives.map((a) => ({
          id: a.id,
          label: `${slotDay(a.startsAt, locale as Lang)} · ${slotTime(a.startsAt, locale as Lang)}`,
        })),
      };
    }
    return { ok: false, error: "unknown" };
  }
}

export async function cancelMyVisit(code: string): Promise<{ ok: boolean }> {
  const buyer = await currentBuyer();
  if (!buyer || !/^VS-\d+$/.test(code)) return { ok: false };
  const visit = await getBuyerVisit(buyer, code);
  if (!visit || visit.status !== "booked") return { ok: false };
  await cancelVisit({ visitId: visit.id, reason: "Cancelled by the buyer" });
  return { ok: true };
}

export async function setMyMessaging(receive: boolean): Promise<{ ok: boolean }> {
  const buyer = await currentBuyer();
  if (!buyer) return { ok: false };
  await setMessagingConsent(buyer.id, buyer.phoneNumber, z.boolean().parse(receive));
  return { ok: true };
}
