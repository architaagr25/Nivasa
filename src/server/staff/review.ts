import "server-only";
import { aliasedTable, and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import {
  chatFlags,
  conversations,
  duplicateCandidates,
  leads,
  messages,
  projects,
  staffProfiles,
} from "@/db/schema";

/**
 * Flagged chats, newest first. Each comes with the assistant's flagged reply and the buyer
 * message it was answering, so the sales head can judge it without opening the transcript.
 */
export async function listFlags(reviewed: boolean, limit = 50) {
  const reviewer = aliasedTable(staffProfiles, "reviewer");
  const rows = await db
    .select({
      flag: chatFlags,
      leadCode: leads.code,
      buyerName: leads.name,
      projectName: projects.name,
      projectId: projects.id,
      language: conversations.language,
      reply: messages.content,
      guardrail: messages.guardrail,
      reviewerName: reviewer.displayName,
      // The latest thing the buyer said before the flagged reply.
      asked: sql<string | null>`(
        select b.content from messages b
        where b.conversation_id = chat_flags.conversation_id and b.role = 'buyer'
          and b.created_at <= coalesce(messages.created_at, chat_flags.created_at)
        order by b.created_at desc limit 1
      )`,
    })
    .from(chatFlags)
    .innerJoin(conversations, eq(conversations.id, chatFlags.conversationId))
    .leftJoin(leads, eq(leads.id, conversations.leadId))
    .leftJoin(projects, eq(projects.id, leads.projectId))
    .leftJoin(messages, eq(messages.id, chatFlags.messageId))
    .leftJoin(reviewer, eq(reviewer.userId, chatFlags.reviewedBy))
    .where(reviewed ? isNotNull(chatFlags.reviewedAt) : isNull(chatFlags.reviewedAt))
    .orderBy(desc(reviewed ? chatFlags.reviewedAt : chatFlags.createdAt))
    .limit(limit);
  return rows;
}

export type FlagRow = Awaited<ReturnType<typeof listFlags>>[number];

/** Open duplicate suggestions where both leads are still live, strongest match first. */
export async function listDuplicates(limit = 50) {
  const a = aliasedTable(leads, "a");
  const b = aliasedTable(leads, "b");
  const ownerA = aliasedTable(staffProfiles, "owner_a");
  const ownerB = aliasedTable(staffProfiles, "owner_b");
  const pick = (l: typeof a, o: typeof ownerA) => ({
    id: l.id,
    code: l.code,
    name: l.name,
    phone: l.phone,
    email: l.email,
    projectId: l.projectId,
    wantsBhk: l.wantsBhk,
    budgetMaxInr: l.budgetMaxInr,
    status: l.status,
    firstSource: l.firstSource,
    createdAt: l.createdAt,
    ownerName: o.displayName,
  });
  return db
    .select({
      id: duplicateCandidates.id,
      reason: duplicateCandidates.reason,
      similarity: duplicateCandidates.similarity,
      createdAt: duplicateCandidates.createdAt,
      lead: pick(a, ownerA),
      other: pick(b, ownerB),
    })
    .from(duplicateCandidates)
    .innerJoin(a, eq(a.id, duplicateCandidates.leadId))
    .innerJoin(b, eq(b.id, duplicateCandidates.candidateLeadId))
    .leftJoin(ownerA, eq(ownerA.userId, a.ownerId))
    .leftJoin(ownerB, eq(ownerB.userId, b.ownerId))
    .where(
      and(eq(duplicateCandidates.status, "open"), isNull(a.mergedIntoId), isNull(b.mergedIntoId)),
    )
    .orderBy(desc(duplicateCandidates.similarity), desc(duplicateCandidates.createdAt))
    .limit(limit);
}

export type DuplicateRow = Awaited<ReturnType<typeof listDuplicates>>[number];

/** What's waiting for the sales head, for the menu badge and the tabs. Asked once per request. */
export const reviewCounts = cache(async () => {
  const [[flags], [dups]] = await Promise.all([
    db.select({ n: count() }).from(chatFlags).where(isNull(chatFlags.reviewedAt)),
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from duplicate_candidates d
      join leads a on a.id = d.lead_id join leads b on b.id = d.candidate_lead_id
      where d.status = 'open' and a.merged_into_id is null and b.merged_into_id is null
    `),
  ]);
  return { flags: flags.n, duplicates: Number(dups.n) };
});
