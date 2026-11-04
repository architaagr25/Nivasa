import "server-only";
import { aliasedTable, and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { factCategoryEnum, factSheetVersions, facts, projects, staffProfiles } from "@/db/schema";
import { parsePriceInr } from "@/server/projects/present";

export type Category = (typeof factCategoryEnum.enumValues)[number];
export const CATEGORIES = factCategoryEnum.enumValues;

export type EditableFact = {
  code: string | null;
  category: Category;
  label: string;
  value: string;
};
type Fact = { code: string; category: Category; label: string; value: string };

export class FactSheetError extends Error {}

export const factInput = z.object({
  code: z.string().max(40).nullable(),
  category: z.enum(CATEGORIES),
  label: z
    .string()
    .trim()
    .min(1, "Every fact needs a label")
    .max(80, "Keep labels under 80 characters"),
  value: z
    .string()
    .trim()
    .min(1, "Every fact needs a value")
    .max(600, "Keep each fact under 600 characters"),
});
export const draftInput = z.object({
  facts: z.array(factInput).min(1, "A fact sheet needs at least one fact").max(60),
  changeNote: z.string().trim().max(200).default(""),
});

/** Published version, the draft if there is one, and the history, for the editor. */
export async function getFactSheet(projectId: string) {
  const creator = aliasedTable(staffProfiles, "creator");
  const publisher = aliasedTable(staffProfiles, "publisher");
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return null;
  const versions = await db
    .select({
      id: factSheetVersions.id,
      version: factSheetVersions.version,
      status: factSheetVersions.status,
      changeNote: factSheetVersions.changeNote,
      createdAt: factSheetVersions.createdAt,
      publishedAt: factSheetVersions.publishedAt,
      createdBy: creator.displayName,
      publishedBy: publisher.displayName,
    })
    .from(factSheetVersions)
    .leftJoin(creator, eq(creator.userId, factSheetVersions.createdBy))
    .leftJoin(publisher, eq(publisher.userId, factSheetVersions.publishedBy))
    .where(eq(factSheetVersions.projectId, projectId))
    .orderBy(desc(factSheetVersions.version));

  const published = versions.find((v) => v.status === "published") ?? null;
  const draft = versions.find((v) => v.status === "draft") ?? null;
  const [publishedFacts, draftFacts] = await Promise.all([
    published ? factsOf(published.id) : [],
    draft ? factsOf(draft.id) : [],
  ]);
  return {
    project,
    published: published && { ...published, facts: publishedFacts },
    draft: draft && { ...draft, facts: draftFacts },
    history: versions.filter((v) => v.status !== "draft"),
  };
}

function factsOf(versionId: string): Promise<Fact[]> {
  return db
    .select({ code: facts.code, category: facts.category, label: facts.label, value: facts.value })
    .from(facts)
    .where(eq(facts.versionId, versionId))
    .orderBy(asc(facts.sortOrder));
}

/** Opens a draft that starts as a copy of what's live. Returns the existing draft if there is one. */
export async function startDraft(projectId: string, actorId: string) {
  return db.transaction(async (tx) => {
    // One project's versions at a time, so two people pressing "edit" get the same draft.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`factsheet:${projectId}`}))`);
    const [existing] = await tx
      .select({ id: factSheetVersions.id })
      .from(factSheetVersions)
      .where(
        and(eq(factSheetVersions.projectId, projectId), eq(factSheetVersions.status, "draft")),
      );
    if (existing) return existing.id;

    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${factSheetVersions.version}), 0)::int + 1` })
      .from(factSheetVersions)
      .where(eq(factSheetVersions.projectId, projectId));
    const [live] = await tx
      .select({ id: factSheetVersions.id })
      .from(factSheetVersions)
      .where(
        and(eq(factSheetVersions.projectId, projectId), eq(factSheetVersions.status, "published")),
      );
    const [draft] = await tx
      .insert(factSheetVersions)
      .values({ projectId, version: next, status: "draft", createdBy: actorId })
      .returning({ id: factSheetVersions.id });
    if (live) {
      await tx.execute(sql`
        insert into facts (version_id, code, category, label, value, sort_order)
        select ${draft.id}, code, category, label, value, sort_order from facts
        where version_id = ${live.id}
      `);
    }
    return draft.id;
  });
}

const CATEGORY_CODE: Record<Category, string> = {
  overview: "OVR",
  configuration: "CFG",
  pricing: "PRC",
  amenities: "AMN",
  location: "LOC",
  possession: "POS",
  legal: "LGL",
  payment: "PAY",
};

/**
 * Replaces the draft's facts. Existing facts keep their citation codes, so a chat that cited
 * "P1-POS" still points at the possession fact after an edit. New facts get a fresh code that
 * has never been used on this project, so an old citation can't come to mean something else.
 */
export async function saveDraft(opts: { projectId: string; input: z.input<typeof draftInput> }) {
  const parsed = draftInput.safeParse(opts.input);
  if (!parsed.success) throw new FactSheetError(parsed.error.issues[0].message);
  const { facts: rows, changeNote } = parsed.data;

  return db.transaction(async (tx) => {
    const [draft] = await tx
      .select()
      .from(factSheetVersions)
      .where(
        and(eq(factSheetVersions.projectId, opts.projectId), eq(factSheetVersions.status, "draft")),
      )
      .for("update");
    if (!draft) throw new FactSheetError("This draft has been published or discarded meanwhile.");

    const used = new Set(
      (
        await tx.execute<{ code: string }>(sql`
          select distinct f.code from facts f join fact_sheet_versions v on v.id = f.version_id
          where v.project_id = ${opts.projectId}
        `)
      ).map((r) => r.code),
    );
    const prefix = opts.projectId.replace(/^project-(\d+)$/, "P$1").toUpperCase();
    const seen = new Set<string>();
    const withCodes = rows.map((f) => {
      let code = f.code && used.has(f.code) && !seen.has(f.code) ? f.code : null;
      if (!code) {
        const base = `${prefix}-${CATEGORY_CODE[f.category]}`;
        for (let n = 1; !code; n++) {
          const candidate = `${base}-${n}`;
          if (!used.has(candidate) && !seen.has(candidate)) code = candidate;
        }
        used.add(code);
      }
      seen.add(code);
      return { ...f, code };
    });

    await tx.delete(facts).where(eq(facts.versionId, draft.id));
    await tx.insert(facts).values(
      withCodes.map((f, i) => ({
        versionId: draft.id,
        code: f.code,
        category: f.category,
        label: f.label,
        value: f.value,
        sortOrder: i,
      })),
    );
    await tx
      .update(factSheetVersions)
      .set({ changeNote: changeNote || null })
      .where(eq(factSheetVersions.id, draft.id));
    return withCodes.map((f) => f.code);
  });
}

/**
 * Makes the draft the live fact sheet in one step: the old version is archived, the draft goes
 * live, and the project's "from" price is re-read from the new pricing facts.
 */
export async function publishDraft(projectId: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [draft] = await tx
      .select()
      .from(factSheetVersions)
      .where(and(eq(factSheetVersions.projectId, projectId), eq(factSheetVersions.status, "draft")))
      .for("update");
    if (!draft) throw new FactSheetError("There's no draft to publish.");
    const draftFacts = await tx
      .select({ category: facts.category, value: facts.value })
      .from(facts)
      .where(eq(facts.versionId, draft.id));
    if (!draftFacts.length) throw new FactSheetError("A fact sheet needs at least one fact.");

    await tx
      .update(factSheetVersions)
      .set({ status: "archived" })
      .where(
        and(eq(factSheetVersions.projectId, projectId), eq(factSheetVersions.status, "published")),
      );
    await tx
      .update(factSheetVersions)
      .set({ status: "published", publishedBy: actorId, publishedAt: new Date() })
      .where(eq(factSheetVersions.id, draft.id));

    const prices = draftFacts
      .filter((f) => f.category === "pricing")
      .map((f) => parsePriceInr(f.value))
      .filter((p): p is number => p !== null);
    if (prices.length) {
      await tx
        .update(projects)
        .set({ startingPriceInr: Math.min(...prices) })
        .where(eq(projects.id, projectId));
    }
    return draft.version;
  });
}

export async function discardDraft(projectId: string) {
  await db
    .delete(factSheetVersions)
    .where(and(eq(factSheetVersions.projectId, projectId), eq(factSheetVersions.status, "draft")));
}
