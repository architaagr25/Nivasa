"use server";

import { eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { accessLog, blackoutDates, projects, slotTemplates } from "@/db/schema";
import { staffOrNull } from "@/lib/session";
import { addDays, istDate } from "@/lib/time";
import { syncSlots, type AffectedVisit } from "@/server/slots/sync";
import {
  discardDraft,
  draftInput,
  FactSheetError,
  publishDraft,
  saveDraft,
  startDraft,
} from "./fact-sheet";

type Out<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const projectIdSchema = z.string().regex(/^[\w-]{1,40}$/);

/** Only the sales head edits what the assistant says and when visits can be booked. */
async function head(projectId: string | null) {
  const me = await staffOrNull("sales_head");
  if (!me) return null;
  if (projectId !== null) {
    if (!projectIdSchema.safeParse(projectId).success) return null;
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!p) return null;
  }
  return me;
}

const denied = { ok: false as const, error: "Only the sales head can change this." };

async function log(actorId: string, action: string, entityId: string) {
  await db.insert(accessLog).values({ actorId, action, entityId });
}

/* ------------------------------------------------------------------ */
/* Fact sheet                                                         */
/* ------------------------------------------------------------------ */

export async function startFactSheetDraft(projectId: string): Promise<Out> {
  const me = await head(projectId);
  if (!me) return denied;
  await startDraft(projectId, me.id);
  revalidatePath("/staff/admin");
  return { ok: true };
}

export async function saveFactSheetDraft(
  projectId: string,
  input: z.input<typeof draftInput>,
): Promise<Out<{ codes: string[] }>> {
  const me = await head(projectId);
  if (!me) return denied;
  let codes: string[];
  try {
    codes = await saveDraft({ projectId, input });
  } catch (err) {
    if (err instanceof FactSheetError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/staff/admin");
  return { ok: true, codes };
}

export async function publishFactSheet(projectId: string): Promise<Out<{ version: number }>> {
  const me = await head(projectId);
  if (!me) return denied;
  let version: number;
  try {
    version = await publishDraft(projectId, me.id);
  } catch (err) {
    if (err instanceof FactSheetError) return { ok: false, error: err.message };
    throw err;
  }
  await log(me.id, `factsheet.publish:v${version}`, projectId);
  // Project pages and the assistant both read the cached sheet; this refreshes it at once.
  updateTag("projects");
  revalidatePath("/staff/admin");
  return { ok: true, version };
}

export async function discardFactSheetDraft(projectId: string): Promise<Out> {
  const me = await head(projectId);
  if (!me) return denied;
  await discardDraft(projectId);
  revalidatePath("/staff/admin");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Visit slots                                                        */
/* ------------------------------------------------------------------ */

type SyncSummary = { added: number; removed: number; closed: number; affected: AffectedVisit[] };

const templateInput = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 11:00"),
      durationMin: z.number().int().min(15).max(240),
      capacity: z.number().int().min(1, "Each time needs room for at least one visit").max(20),
    }),
  )
  .max(100);

/**
 * Replaces a project's weekly visiting times, then brings the next eight weeks of slots in line.
 * Booked visits are never dropped: if their time goes away it's closed to new bookings and the
 * visits are listed so someone can move them.
 */
export async function saveSlotTemplates(
  projectId: string,
  templates: z.input<typeof templateInput>,
): Promise<Out<SyncSummary>> {
  const me = await head(projectId);
  if (!me) return denied;
  const parsed = templateInput.safeParse(templates);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const seen = new Set<string>();
  for (const t of parsed.data) {
    const key = `${t.weekday}|${t.startTime}`;
    if (seen.has(key)) return { ok: false, error: `${t.startTime} appears twice on the same day.` };
    seen.add(key);
  }

  await db.transaction(async (tx) => {
    await tx.delete(slotTemplates).where(eq(slotTemplates.projectId, projectId));
    if (parsed.data.length)
      await tx.insert(slotTemplates).values(parsed.data.map((t) => ({ ...t, projectId })));
  });
  const r = await syncSlots(projectId);
  await log(me.id, "slots.templates", projectId);
  revalidatePath("/staff");
  return { ok: true, ...r };
}

const blackoutInput = z.object({
  projectId: projectIdSchema.nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  reason: z.string().trim().min(2, "Say why the site is closed").max(80),
});

/** Closes the site for a day, for one project or both. */
export async function addBlackout(input: z.input<typeof blackoutInput>): Promise<Out<SyncSummary>> {
  const parsed = blackoutInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { projectId, date, reason } = parsed.data;
  const me = await head(projectId);
  if (!me) return denied;
  if (date <= istDate(new Date()))
    return {
      ok: false,
      error: "Pick a day from tomorrow onwards; today's visits are already set.",
    };
  if (date > addDays(istDate(new Date()), 365))
    return { ok: false, error: "Pick a day within the next year." };

  const inserted = await db
    .insert(blackoutDates)
    .values({ projectId, date, reason })
    .onConflictDoNothing()
    .returning({ id: blackoutDates.id });
  if (!inserted.length) return { ok: false, error: "That day is already closed." };
  await log(me.id, `slots.close:${date}`, projectId ?? "all");
  const summary = await syncProjects(projectId);
  revalidatePath("/staff");
  return { ok: true, ...summary };
}

export async function removeBlackout(id: string): Promise<Out<SyncSummary>> {
  const me = await head(null);
  if (!me || !z.uuid().safeParse(id).success) return denied;
  const [row] = await db.delete(blackoutDates).where(eq(blackoutDates.id, id)).returning();
  if (!row) return { ok: false, error: "That day has already been reopened." };
  await log(me.id, `slots.reopen:${row.date}`, row.projectId ?? "all");
  const summary = await syncProjects(row.projectId);
  revalidatePath("/staff");
  return { ok: true, ...summary };
}

async function syncProjects(projectId: string | null): Promise<SyncSummary> {
  const ids = projectId
    ? [projectId]
    : (await db.select({ id: projects.id }).from(projects)).map((p) => p.id);
  const total: SyncSummary = { added: 0, removed: 0, closed: 0, affected: [] };
  for (const id of ids) {
    const r = await syncSlots(id);
    total.added += r.added;
    total.removed += r.removed;
    total.closed += r.closed;
    total.affected.push(...r.affected);
  }
  return total;
}
