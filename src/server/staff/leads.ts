import "server-only";
import {
  aliasedTable,
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import {
  accessLog,
  chatFlags,
  consents,
  conversations,
  duplicateCandidates,
  leads,
  leadTouches,
  messages,
  outbox,
  projects,
  reminders,
  staffProfiles,
  visits,
} from "@/db/schema";
import { formatPhone, maskPhone, normalisePhone } from "@/lib/phone";
import type { StaffViewer } from "@/lib/session";
import { FLAG_LABEL, SOURCE_LABEL } from "./labels";

export const PAGE_SIZE = 40;

export type LeadFilters = {
  q?: string;
  source?: (typeof leads.$inferSelect)["firstSource"];
  status?: (typeof leads.$inferSelect)["status"];
  score?: "hot" | "warm" | "cold";
  view?: "mine" | "unassigned" | "all" | "duplicates" | "unreached";
  project?: string;
  page?: number;
};

/** Executives work their own leads and the unassigned queue; the sales head sees everything. */
export function visibleTo(viewer: StaffViewer): SQL | undefined {
  if (viewer.role === "sales_head") return undefined;
  return or(eq(leads.ownerId, viewer.id), isNull(leads.ownerId));
}

/** Only the owner and the sales head see a buyer's full number. */
export function canSeePhone(viewer: StaffViewer, ownerId: string | null) {
  return viewer.role === "sales_head" || ownerId === viewer.id;
}

export async function listLeads(viewer: StaffViewer, f: LeadFilters) {
  const owner = aliasedTable(staffProfiles, "owner");
  // Correlated subqueries name the outer table explicitly: an unqualified "id" here would
  // silently resolve to the inner table's own id and never match.
  const openDuplicate = sql<boolean>`exists (select 1 from duplicate_candidates d where d.lead_id = leads.id and d.status = 'open')`;
  const conds: (SQL | undefined)[] = [isNull(leads.mergedIntoId), visibleTo(viewer)];

  if (f.q) {
    const phone = normalisePhone(f.q);
    const term = `%${f.q.trim()}%`;
    conds.push(
      or(
        ilike(leads.name, term),
        ilike(leads.code, term),
        ilike(leads.email, term),
        phone ? eq(leads.phone, phone) : undefined,
      ),
    );
  }
  if (f.source) conds.push(eq(leads.firstSource, f.source));
  if (f.status) conds.push(eq(leads.status, f.status));
  if (f.score) conds.push(eq(leads.score, f.score));
  if (f.project) conds.push(eq(leads.projectId, f.project));
  if (f.view === "mine") conds.push(eq(leads.ownerId, viewer.id));
  if (f.view === "unassigned") conds.push(isNull(leads.ownerId));
  if (f.view === "duplicates") conds.push(openDuplicate);
  if (f.view === "unreached") {
    conds.push(
      sql`(${leads.firstResponseAt} is null or ${leads.firstResponseAt} - ${leads.createdAt} > interval '48 hours')`,
    );
  }
  const where = and(...conds);
  const page = Math.max(1, f.page ?? 1);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: leads.id,
        code: leads.code,
        name: leads.name,
        phone: leads.phone,
        source: leads.firstSource,
        status: leads.status,
        score: leads.score,
        language: leads.language,
        wantsBhk: leads.wantsBhk,
        budgetMaxInr: leads.budgetMaxInr,
        projectName: projects.name,
        ownerId: leads.ownerId,
        ownerName: owner.displayName,
        createdAt: leads.createdAt,
        firstResponseAt: leads.firstResponseAt,
        lastActivityAt: leads.lastActivityAt,
        optedOut: sql<boolean>`${leads.optedOutAt} is not null`,
        duplicate: openDuplicate,
        touches: sql<number>`(select count(*)::int from lead_touches t where t.lead_id = leads.id)`,
      })
      .from(leads)
      .leftJoin(projects, eq(projects.id, leads.projectId))
      .leftJoin(owner, eq(owner.userId, leads.ownerId))
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(leads).where(where),
  ]);

  return {
    total: Number(total),
    page,
    pages: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)),
    rows: rows.map((r) => ({
      ...r,
      phone: r.phone
        ? canSeePhone(viewer, r.ownerId)
          ? formatPhone(r.phone)
          : maskPhone(r.phone)
        : null,
      responseSeconds: r.firstResponseAt
        ? Math.round((r.firstResponseAt.getTime() - r.createdAt.getTime()) / 1000)
        : null,
    })),
  };
}

/** Counts for the quick views at the top of the list. */
export async function leadCounts(viewer: StaffViewer) {
  const base = and(isNull(leads.mergedIntoId), visibleTo(viewer));
  const [row] = await db
    .select({
      all: count(),
      mine: sql<number>`count(*) filter (where ${leads.ownerId} = ${viewer.id})::int`,
      unassigned: sql<number>`count(*) filter (where ${leads.ownerId} is null)::int`,
      hot: sql<number>`count(*) filter (where ${leads.score} = 'hot')::int`,
      duplicates: sql<number>`count(*) filter (where exists (select 1 from duplicate_candidates d where d.lead_id = leads.id and d.status = 'open'))::int`,
      newToday: sql<number>`count(*) filter (where ${leads.createdAt} > now() - interval '24 hours')::int`,
    })
    .from(leads)
    .where(base);
  return { ...row, all: Number(row.all) };
}

export type TimelineEvent = {
  at: Date;
  kind: "touch" | "message" | "visit" | "consent" | "outbox" | "flag" | "handoff";
  title: string;
  detail?: string;
  tone?: "default" | "good" | "warn" | "bad";
};

/**
 * Everything about one lead. Returns null when the lead doesn't exist or the viewer may not
 * see it. Each successful view is written to the access log.
 */
export async function getLead(viewer: StaffViewer, code: string) {
  const owner = aliasedTable(staffProfiles, "owner");
  const [lead] = await db
    .select({
      lead: leads,
      projectName: projects.name,
      projectId: projects.id,
      ownerName: owner.displayName,
    })
    .from(leads)
    .leftJoin(projects, eq(projects.id, leads.projectId))
    .leftJoin(owner, eq(owner.userId, leads.ownerId))
    .where(and(eq(leads.code, code), visibleTo(viewer)));
  if (!lead) return null;
  const id = lead.lead.id;

  await db.insert(accessLog).values({ actorId: viewer.id, action: "lead.view", entityId: id });

  const [touches, consentRows, convs, visitRows, sent, flags, dups, team] = await Promise.all([
    db
      .select()
      .from(leadTouches)
      .where(eq(leadTouches.leadId, id))
      .orderBy(desc(leadTouches.receivedAt)),
    db.select().from(consents).where(eq(consents.leadId, id)).orderBy(desc(consents.createdAt)),
    db
      .select()
      .from(conversations)
      .where(eq(conversations.leadId, id))
      .orderBy(desc(conversations.createdAt)),
    db
      .select({ visit: visits, exec: staffProfiles.displayName, project: projects.name })
      .from(visits)
      .innerJoin(staffProfiles, eq(staffProfiles.userId, visits.executiveId))
      .innerJoin(projects, eq(projects.id, visits.projectId))
      .where(eq(visits.leadId, id))
      .orderBy(desc(visits.startsAt)),
    db.select().from(outbox).where(eq(outbox.leadId, id)).orderBy(desc(outbox.createdAt)).limit(30),
    db
      .select({ flag: chatFlags })
      .from(chatFlags)
      .innerJoin(conversations, eq(conversations.id, chatFlags.conversationId))
      .where(eq(conversations.leadId, id))
      .orderBy(desc(chatFlags.createdAt)),
    db
      .select({
        dup: duplicateCandidates,
        other: {
          code: leads.code,
          name: leads.name,
          phone: leads.phone,
          email: leads.email,
          source: leads.firstSource,
          createdAt: leads.createdAt,
        },
      })
      .from(duplicateCandidates)
      .innerJoin(leads, eq(leads.id, duplicateCandidates.candidateLeadId))
      .where(
        and(
          eq(duplicateCandidates.leadId, id),
          eq(duplicateCandidates.status, "open"),
          isNull(leads.mergedIntoId),
        ),
      ),
    db
      .select({
        userId: staffProfiles.userId,
        name: staffProfiles.displayName,
        projectIds: staffProfiles.projectIds,
      })
      .from(staffProfiles)
      .where(eq(staffProfiles.active, true))
      .orderBy(asc(staffProfiles.displayName)),
  ]);

  const convIds = convs.map((c) => c.id);
  const transcript = convIds.length
    ? await db
        .select()
        .from(messages)
        .where(inArray(messages.conversationId, convIds))
        .orderBy(asc(messages.createdAt))
    : [];
  const visitReminders = visitRows.length
    ? await db
        .select()
        .from(reminders)
        .where(
          inArray(
            reminders.visitId,
            visitRows.map((v) => v.visit.id),
          ),
        )
    : [];

  const timeline: TimelineEvent[] = [
    ...touches.map((t) => ({
      at: t.receivedAt,
      kind: "touch" as const,
      title: `Enquiry via ${SOURCE_LABEL[t.source]}${t.campaign ? ` · ${t.campaign}` : ""}`,
      detail: t.message ?? undefined,
    })),
    ...consentRows.map((c) => ({
      at: c.createdAt,
      kind: "consent" as const,
      title: c.granted ? "Agreed to be contacted" : "Opted out of messages",
      detail: `${c.capturedVia.replace(/_/g, " ")} · notice ${c.noticeVersion}`,
      tone: c.granted ? ("good" as const) : ("warn" as const),
    })),
    ...visitRows.map((v) => ({
      at: v.visit.createdAt,
      kind: "visit" as const,
      title: `Site visit booked for ${v.project}`,
      detail: `${v.visit.code} · with ${v.exec} · booked via ${v.visit.bookedVia.replace("_", " ")}`,
      tone: "good" as const,
    })),
    ...sent.map((m) => ({
      at: m.createdAt,
      kind: "outbox" as const,
      title: `${m.channel === "staff_alert" ? "Staff alert" : m.channel === "sms" ? "SMS" : "WhatsApp"}: ${m.template.replace(/_/g, " ")}${m.status === "suppressed" ? " (not sent)" : ""}`,
      detail:
        m.status === "suppressed" ? `Suppressed: ${m.suppressedReason?.replace("_", " ")}` : m.body,
      tone: m.status === "suppressed" ? ("warn" as const) : undefined,
    })),
    ...flags.map(({ flag }) => ({
      at: flag.createdAt,
      kind: "flag" as const,
      title: `Flagged: ${FLAG_LABEL[flag.reason]}`,
      detail: flag.detail ?? undefined,
      tone: flag.reviewedAt ? undefined : ("bad" as const),
    })),
    ...convs
      .filter((c) => c.handedOffAt)
      .map((c) => ({
        at: c.handedOffAt!,
        kind: "handoff" as const,
        title: "Handed to a person",
        detail: c.handoffReason ?? undefined,
        tone: "warn" as const,
      })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const l = lead.lead;
  const fullPhone = canSeePhone(viewer, l.ownerId);
  return {
    lead: {
      ...l,
      phone: l.phone ? (fullPhone ? formatPhone(l.phone) : maskPhone(l.phone)) : null,
      phoneHref: l.phone && fullPhone ? `tel:${l.phone}` : null,
      projectName: lead.projectName,
      ownerName: lead.ownerName,
      responseSeconds: l.firstResponseAt
        ? Math.round((l.firstResponseAt.getTime() - l.createdAt.getTime()) / 1000)
        : null,
    },
    canSeePhone: fullPhone,
    handoff: convs.find((c) => c.handoffSummary) ?? null,
    transcript: transcript.filter((m) => m.role !== "system"),
    visits: visitRows.map((v) => ({
      ...v.visit,
      exec: v.exec,
      project: v.project,
      reminders: visitReminders.filter((r) => r.visitId === v.visit.id),
    })),
    openFlags: flags.filter((f) => !f.flag.reviewedAt).map((f) => f.flag),
    duplicates: dups.map((d) => ({
      ...d.dup,
      other: { ...d.other, phone: d.other.phone ? maskPhone(d.other.phone) : null },
    })),
    team: team.filter((t) => !lead.projectId || t.projectIds.includes(lead.projectId)),
    timeline,
  };
}
