"use server";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  accessLog,
  chatFlags,
  duplicateCandidates,
  leads,
  staffProfiles,
  visits,
} from "@/db/schema";
import { staffOrNull } from "@/lib/session";
import { timeOfDay } from "@/lib/staff-format";
import { BookingError, checkInByToken, recordOutcome } from "@/server/bookings/service";
import { MergeError, mergeLeads } from "@/server/leads/merge";
import { recordOutbound } from "@/server/messaging/outbox";
import { translateLeadConversation } from "./translate";
import { checkInWindow, visitByCheckinToken } from "./visits";

type Result = { ok: true } | { ok: false; error: string };
type Out<T> = ({ ok: true } & T) | { ok: false; error: string };

const leadCode = z.string().regex(/^LD-\d+$/);

/** An executive takes an unassigned lead. Two people claiming at once: only the first wins. */
export async function claimLead(code: string): Promise<Result> {
  const me = await staffOrNull();
  if (!me || !leadCode.safeParse(code).success) return { ok: false, error: "Not allowed" };
  const updated = await db
    .update(leads)
    .set({ ownerId: me.id })
    .where(and(eq(leads.code, code), isNull(leads.ownerId)))
    .returning({ id: leads.id });
  if (!updated.length) return { ok: false, error: "Someone else has just taken this lead." };
  await db
    .insert(accessLog)
    .values({ actorId: me.id, action: "lead.claim", entityId: updated[0].id });
  revalidatePath("/staff/leads");
  return { ok: true };
}

/** The sales head moves a lead to another executive. */
export async function reassignLead(code: string, executiveId: string): Promise<Result> {
  const me = await staffOrNull("sales_head");
  if (!me || !leadCode.safeParse(code).success)
    return { ok: false, error: "Only the sales head can reassign." };
  const [exec] = await db.select().from(staffProfiles).where(eq(staffProfiles.userId, executiveId));
  if (!exec?.active) return { ok: false, error: "That person isn't on the team." };
  const [lead] = await db
    .update(leads)
    .set({ ownerId: executiveId })
    .where(eq(leads.code, code))
    .returning({ id: leads.id });
  if (!lead) return { ok: false, error: "Lead not found." };
  await db
    .insert(accessLog)
    .values({ actorId: me.id, action: `lead.reassign:${exec.displayName}`, entityId: lead.id });
  revalidatePath(`/staff/leads/${code}`);
  return { ok: true };
}

/** Close a lead that isn't going anywhere, or reopen it. */
export async function setLeadClosed(code: string, closed: boolean): Promise<Result> {
  const me = await staffOrNull();
  if (!me || !leadCode.safeParse(code).success) return { ok: false, error: "Not allowed" };
  const [lead] = await db.select().from(leads).where(eq(leads.code, code));
  if (!lead || (me.role !== "sales_head" && lead.ownerId !== me.id)) {
    return { ok: false, error: "Only the lead's owner or the sales head can do that." };
  }
  await db
    .update(leads)
    .set({ status: closed ? "closed_lost" : "engaged", lastActivityAt: new Date() })
    .where(eq(leads.id, lead.id));
  revalidatePath(`/staff/leads/${code}`);
  return { ok: true };
}

export async function markVisit(
  visitCode: string,
  outcome: "visited" | "no_show",
): Promise<Result> {
  const me = await staffOrNull();
  if (!me || !/^VS-\d+$/.test(visitCode)) return { ok: false, error: "Not allowed" };
  const [visit] = await db.select().from(visits).where(eq(visits.code, visitCode));
  if (!visit) return { ok: false, error: "Visit not found." };
  if (me.role !== "sales_head" && visit.executiveId !== me.id) {
    return {
      ok: false,
      error: "Only the executive meeting this buyer, or the sales head, can record the outcome.",
    };
  }
  try {
    await recordOutcome({ visitId: visit.id, outcome });
  } catch (err) {
    if (err instanceof BookingError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/staff");
  return { ok: true };
}

/**
 * Whoever is at the site office scans the buyer's visit pass and confirms they've arrived.
 * If that isn't the executive meeting them, the executive gets told the buyer is here.
 */
export async function checkInVisit(token: string): Promise<Result> {
  const me = await staffOrNull();
  if (!me) return { ok: false, error: "Please sign in again." };
  const visit = await visitByCheckinToken(token);
  if (!visit) return { ok: false, error: "This check-in code is not valid." };
  if (checkInWindow(visit.startsAt) === "past_day") {
    return { ok: false, error: "This pass was for an earlier day. Use the visits calendar." };
  }
  try {
    await checkInByToken(token);
  } catch (err) {
    if (err instanceof BookingError) return { ok: false, error: err.message };
    throw err;
  }
  await db
    .insert(accessLog)
    .values({ actorId: me.id, action: "visit.check_in", entityId: visit.leadId });
  if (visit.executiveId !== me.id) {
    await recordOutbound({
      channel: "staff_alert",
      template: "buyer_arrived",
      toUserId: visit.executiveId,
      leadId: visit.leadId,
      body: `${visit.buyerName ?? "Your buyer"} (${visit.leadCode}) has arrived at ${visit.projectName} for the ${timeOfDay(visit.startsAt)} visit. Checked in by ${me.name}.`,
    });
  }
  revalidatePath("/staff");
  return { ok: true };
}

export async function reviewFlag(flagId: string, note: string): Promise<Result> {
  const me = await staffOrNull("sales_head");
  if (!me || !z.uuid().safeParse(flagId).success)
    return { ok: false, error: "Only the sales head reviews flags." };
  const text = note.trim();
  if (text.length > 300) return { ok: false, error: "Keep the note under 300 characters." };
  const done = await db
    .update(chatFlags)
    .set({ reviewedBy: me.id, reviewedAt: new Date(), reviewNote: text || null })
    .where(and(eq(chatFlags.id, flagId), isNull(chatFlags.reviewedAt)))
    .returning({ id: chatFlags.id });
  if (!done.length) return { ok: false, error: "This flag has already been reviewed." };
  revalidatePath("/staff");
  return { ok: true };
}

/**
 * The sales head confirms two leads are the same buyer. The one that arrived first is kept, so
 * response times and the source that first brought the buyer in stay true.
 */
export async function mergeDuplicate(candidateId: string): Promise<Out<{ keptCode: string }>> {
  const me = await staffOrNull("sales_head");
  if (!me || !z.uuid().safeParse(candidateId).success)
    return { ok: false, error: "Only the sales head merges leads." };
  const [pair] = await db
    .select({ a: duplicateCandidates.leadId, b: duplicateCandidates.candidateLeadId })
    .from(duplicateCandidates)
    .where(and(eq(duplicateCandidates.id, candidateId), eq(duplicateCandidates.status, "open")));
  if (!pair) return { ok: false, error: "This suggestion has already been dealt with." };
  const both = await db
    .select({ id: leads.id, createdAt: leads.createdAt })
    .from(leads)
    .where(inArray(leads.id, [pair.a, pair.b]))
    .orderBy(asc(leads.createdAt));
  if (both.length !== 2) return { ok: false, error: "One of these leads no longer exists." };
  try {
    const r = await mergeLeads({ keepId: both[0].id, dropId: both[1].id, actorId: me.id });
    revalidatePath("/staff");
    return { ok: true, keptCode: r.keptCode };
  } catch (err) {
    if (err instanceof MergeError) return { ok: false, error: err.message };
    throw err;
  }
}

/** Two leads that only look alike: the suggestion is closed and not raised again. */
export async function dismissDuplicate(candidateId: string): Promise<Result> {
  const me = await staffOrNull("sales_head");
  if (!me || !z.uuid().safeParse(candidateId).success)
    return { ok: false, error: "Only the sales head reviews duplicates." };
  const done = await db
    .update(duplicateCandidates)
    .set({ status: "dismissed", resolvedBy: me.id, resolvedAt: new Date() })
    .where(and(eq(duplicateCandidates.id, candidateId), eq(duplicateCandidates.status, "open")))
    .returning({ id: duplicateCandidates.id });
  if (!done.length) return { ok: false, error: "This suggestion has already been dealt with." };
  revalidatePath("/staff");
  return { ok: true };
}

export type TranslateResult =
  { ok: true; translations: Record<string, string>; failed: number } | { ok: false; error: string };

/** Translate a lead's conversation for staff, with the same access rules as opening the lead. */
export async function translateConversation(
  code: string,
  lang: "en" | "hi" | "gu",
): Promise<TranslateResult> {
  const me = await staffOrNull();
  if (!me || !leadCode.safeParse(code).success || !["en", "hi", "gu"].includes(lang)) {
    return { ok: false, error: "Not allowed" };
  }
  const out = await translateLeadConversation({ ...me, email: "", projectIds: [] }, code, lang);
  if (!out) return { ok: false, error: "Not allowed" };
  return { ok: true, ...out };
}
