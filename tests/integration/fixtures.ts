import { randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { leads, outbox, projects, slots, staffProfiles, user } from "@/db/schema";

const HOUR = 60 * 60 * 1000;

/** A throwaway project with its own executives, slots and leads, removed again by cleanup(). */
export async function makeFixture(opts: {
  capacity?: number;
  executives?: number;
  leadCount?: number;
  /** Hours from now for each slot; the first one is the slot under test. */
  slotHours?: number[];
}) {
  const tag = randomUUID().slice(0, 8);
  const projectId = `test-${tag}`;
  await db.insert(projects).values({
    id: projectId,
    name: `Test ${tag}`,
    reraNumber: `TEST/${tag}`,
    locality: "Test",
    address: "Test",
    latitude: "23.0",
    longitude: "72.5",
    heroImage: "/x.webp",
  });

  const execIds = Array.from({ length: opts.executives ?? 2 }, () => randomUUID());
  await db.insert(user).values(
    execIds.map((id, i) => ({
      id,
      name: `Exec ${i}`,
      email: `${tag}-${i}@test.invalid`,
      role: "sales_exec" as const,
    })),
  );
  await db.insert(staffProfiles).values(
    execIds.map((userId, i) => ({
      userId,
      displayName: `Exec ${i}`,
      phone: "+917000199999",
      projectIds: [projectId],
    })),
  );

  const base = Math.ceil(Date.now() / HOUR) * HOUR;
  const slotRows = await db
    .insert(slots)
    .values(
      (opts.slotHours ?? [48, 50]).map((h) => ({
        projectId,
        startsAt: new Date(base + h * HOUR),
        endsAt: new Date(base + (h + 1) * HOUR),
        capacity: opts.capacity ?? 1,
      })),
    )
    .returning();

  const leadRows = await db
    .insert(leads)
    .values(
      Array.from({ length: opts.leadCount ?? 1 }, (_, i) => ({
        code: `T-${tag}-${i}`,
        name: `Buyer ${i}`,
        projectId,
        firstSource: "website" as const,
      })),
    )
    .returning();

  return {
    projectId,
    execIds,
    slots: slotRows,
    slotId: slotRows[0].id,
    leadIds: leadRows.map((l) => l.id),
    async cleanup() {
      const ids = leadRows.map((l) => l.id);
      await db
        .delete(outbox)
        .where(or(inArray(outbox.leadId, ids), inArray(outbox.toUserId, execIds)));
      await db.delete(leads).where(inArray(leads.id, ids));
      await db.delete(slots).where(eq(slots.projectId, projectId));
      await db.delete(user).where(inArray(user.id, execIds));
      await db.delete(projects).where(eq(projects.id, projectId));
    },
  };
}
