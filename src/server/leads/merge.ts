import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accessLog,
  consents,
  conversations,
  duplicateCandidates,
  leads,
  leadTouches,
  outbox,
  projects,
  visits,
} from "@/db/schema";
import { scoreLead } from "./score";

/**
 * The live lead for a phone number: the one holding it, or the one a lead with that number was
 * merged into. Without the second half, a buyer whose duplicate was merged away would become a
 * brand-new lead the next time they wrote from that number.
 */
export function livePhoneMatch(phone: string) {
  return and(
    isNull(leads.mergedIntoId),
    or(
      eq(leads.phone, phone),
      sql`${leads.id} in (select m.merged_into_id from leads m where m.phone = ${phone} and m.merged_into_id is not null)`,
    ),
  );
}

/** For old links: where a merged lead lives now. */
export async function mergedInto(code: string) {
  const [row] = await db.execute<{ code: string }>(sql`
    select k.code from leads d join leads k on k.id = d.merged_into_id where d.code = ${code}
  `);
  return row?.code ?? null;
}

export class MergeError extends Error {}

// How far along a lead is, so a merge never moves a buyer backwards.
const PROGRESS = {
  closed_lost: 0,
  new: 1,
  contacted: 2,
  engaged: 3,
  handed_off: 4,
  no_show: 5,
  visit_booked: 6,
  visited: 7,
} as const;

/**
 * Folds one lead into another. The kept lead takes over everything the other one had: touches,
 * consents, conversations, visits and messages. Details it lacks are filled from the other, an
 * opt-out on either side is kept, and the merged lead stays behind as a pointer for history.
 */
export async function mergeLeads(opts: { keepId: string; dropId: string; actorId: string }) {
  const { keepId, dropId, actorId } = opts;
  if (keepId === dropId) throw new MergeError("A lead can't be merged into itself.");

  return db.transaction(async (tx) => {
    // Both rows locked in a fixed order, so two merges touching the same leads can't deadlock.
    const locked = await tx
      .select()
      .from(leads)
      .where(inArray(leads.id, [keepId, dropId]))
      .orderBy(leads.id)
      .for("update");
    const keep = locked.find((l) => l.id === keepId);
    const drop = locked.find((l) => l.id === dropId);
    if (!keep || !drop) throw new MergeError("One of these leads no longer exists.");
    if (keep.mergedIntoId || drop.mergedIntoId) {
      throw new MergeError("One of these leads has already been merged.");
    }

    // A buyer can hold one upcoming visit per project; two of them can't both survive.
    const clash = await tx.execute(sql`
      select 1 from visits a join visits b on a.project_id = b.project_id
      where a.lead_id = ${keepId} and b.lead_id = ${dropId}
        and a.status = 'booked' and b.status = 'booked'
      limit 1
    `);
    if (clash.length) {
      throw new MergeError(
        "Both leads have an upcoming visit to the same project. Cancel one of them first.",
      );
    }

    for (const table of [leadTouches, consents, conversations, visits, outbox]) {
      await tx.update(table).set({ leadId: keepId }).where(eq(table.leadId, dropId));
    }

    // Other duplicate suggestions involving the merged lead now concern the kept one, unless
    // that pair is already on file; the pair being merged is closed.
    await tx
      .update(duplicateCandidates)
      .set({ status: "merged", resolvedBy: actorId, resolvedAt: new Date() })
      .where(
        or(
          and(
            eq(duplicateCandidates.leadId, keepId),
            eq(duplicateCandidates.candidateLeadId, dropId),
          ),
          and(
            eq(duplicateCandidates.leadId, dropId),
            eq(duplicateCandidates.candidateLeadId, keepId),
          ),
        ),
      );
    await tx.execute(sql`
      update duplicate_candidates d set lead_id = ${keepId}
      where d.lead_id = ${dropId} and d.candidate_lead_id <> ${keepId}
        and not exists (select 1 from duplicate_candidates x
          where x.lead_id = ${keepId} and x.candidate_lead_id = d.candidate_lead_id)
    `);
    await tx.execute(sql`
      update duplicate_candidates d set candidate_lead_id = ${keepId}
      where d.candidate_lead_id = ${dropId} and d.lead_id <> ${keepId}
        and not exists (select 1 from duplicate_candidates x
          where x.lead_id = d.lead_id and x.candidate_lead_id = ${keepId})
    `);
    await tx
      .update(duplicateCandidates)
      .set({ status: "dismissed", resolvedBy: actorId, resolvedAt: new Date() })
      .where(
        and(
          eq(duplicateCandidates.status, "open"),
          or(
            eq(duplicateCandidates.leadId, dropId),
            eq(duplicateCandidates.candidateLeadId, dropId),
          ),
        ),
      );

    const earliest = (a: Date | null, b: Date | null) => (a && b ? (a < b ? a : b) : (a ?? b));
    const status = PROGRESS[drop.status] > PROGRESS[keep.status] ? drop.status : keep.status;
    const merged = {
      name: keep.name ?? drop.name,
      email: keep.email ?? drop.email,
      phone: keep.phone ?? drop.phone,
      projectId: keep.projectId ?? drop.projectId,
      wantsBhk: keep.wantsBhk ?? drop.wantsBhk,
      budgetMinInr: keep.budgetMinInr ?? drop.budgetMinInr,
      budgetMaxInr: keep.budgetMaxInr ?? drop.budgetMaxInr,
      timeline: keep.timeline ?? drop.timeline,
      purpose: keep.purpose ?? drop.purpose,
      loanNeeded: keep.loanNeeded ?? drop.loanNeeded,
      ownerId: keep.ownerId ?? drop.ownerId,
      buyerUserId: keep.buyerUserId ?? drop.buyerUserId,
      firstResponseAt: keep.firstResponseAt ?? drop.firstResponseAt,
      optedOutAt: earliest(keep.optedOutAt, drop.optedOutAt),
      status,
      lastActivityAt:
        keep.lastActivityAt > drop.lastActivityAt ? keep.lastActivityAt : drop.lastActivityAt,
    };

    // The merged lead lets go of its number first if the kept one takes it, so the
    // one-live-lead-per-number rule holds at every step.
    await tx
      .update(leads)
      .set({ mergedIntoId: keepId, ...(keep.phone ? {} : { phone: null }) })
      .where(eq(leads.id, dropId));
    // Anything already merged into the dropped lead now points straight at the kept one.
    await tx.update(leads).set({ mergedIntoId: keepId }).where(eq(leads.mergedIntoId, dropId));

    const [project] = merged.projectId
      ? await tx.select().from(projects).where(eq(projects.id, merged.projectId))
      : [];
    const { score } = scoreLead({
      budgetMaxInr: merged.budgetMaxInr,
      timeline: merged.timeline,
      wantsBhk: merged.wantsBhk,
      hasPhone: Boolean(merged.phone),
      hasUpcomingVisit: merged.status === "visit_booked",
      projectMinPriceInr: project?.startingPriceInr ?? null,
    });
    const [kept] = await tx
      .update(leads)
      .set({ ...merged, score })
      .where(eq(leads.id, keepId))
      .returning({ code: leads.code });

    await tx
      .insert(accessLog)
      .values({ actorId, action: `lead.merge:${drop.code}`, entityId: keepId });
    return { keptCode: kept.code, droppedCode: drop.code };
  });
}
