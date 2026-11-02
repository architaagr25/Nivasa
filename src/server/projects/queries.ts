import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { factSheetVersions, facts, projects } from "@/db/schema";

export type ProjectFact = {
  code: string;
  category: (typeof facts.$inferSelect)["category"];
  label: string;
  value: string;
};

export type Project = typeof projects.$inferSelect & { facts: ProjectFact[] };

// Project pages and the assistant read the same published fact sheet. Publishing a new
// version invalidates the "projects" tag, so neither can show a stale fact for long.
export async function listProjects(): Promise<Project[]> {
  "use cache";
  cacheTag("projects");
  cacheLife("hours");

  const rows = await db.select().from(projects).orderBy(asc(projects.id));
  return Promise.all(rows.map(async (p) => ({ ...p, facts: await publishedFacts(p.id) })));
}

export async function getProject(id: string): Promise<Project | null> {
  "use cache";
  cacheTag("projects", `project:${id}`);
  cacheLife("hours");

  const [p] = await db.select().from(projects).where(eq(projects.id, id));
  if (!p) return null;
  return { ...p, facts: await publishedFacts(p.id) };
}

async function publishedFacts(projectId: string): Promise<ProjectFact[]> {
  return db
    .select({
      code: facts.code,
      category: facts.category,
      label: facts.label,
      value: facts.value,
    })
    .from(facts)
    .innerJoin(factSheetVersions, eq(factSheetVersions.id, facts.versionId))
    .where(
      and(eq(factSheetVersions.projectId, projectId), eq(factSheetVersions.status, "published")),
    )
    .orderBy(asc(facts.sortOrder));
}
