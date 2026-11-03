import "server-only";
import { asc, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { leads, projects, reminders, staffProfiles, visits } from "@/db/schema";

type Buyer = { id: string; phoneNumber?: string | null };

// A buyer owns the leads linked to their account, plus any lead with their verified number
// (for example one that came from a portal before they ever signed in).
function ownsLead(buyer: Buyer) {
  return buyer.phoneNumber
    ? or(eq(leads.buyerUserId, buyer.id), eq(leads.phone, buyer.phoneNumber))
    : eq(leads.buyerUserId, buyer.id);
}

const visitColumns = {
  id: visits.id,
  code: visits.code,
  status: visits.status,
  startsAt: visits.startsAt,
  checkinToken: visits.checkinToken,
  projectId: projects.id,
  projectName: projects.name,
  locality: projects.locality,
  address: projects.address,
  latitude: projects.latitude,
  longitude: projects.longitude,
  reraNumber: projects.reraNumber,
  heroImage: projects.heroImage,
  executiveName: staffProfiles.displayName,
  leadId: leads.id,
  optedOutAt: leads.optedOutAt,
};

export async function listBuyerVisits(buyer: Buyer) {
  return db
    .select(visitColumns)
    .from(visits)
    .innerJoin(leads, eq(leads.id, visits.leadId))
    .innerJoin(projects, eq(projects.id, visits.projectId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, visits.executiveId))
    .where(ownsLead(buyer))
    .orderBy(desc(visits.startsAt));
}

/** Returns null both when the visit doesn't exist and when it isn't this buyer's. */
export async function getBuyerVisit(buyer: Buyer, code: string) {
  const rows = await db
    .select(visitColumns)
    .from(visits)
    .innerJoin(leads, eq(leads.id, visits.leadId))
    .innerJoin(projects, eq(projects.id, visits.projectId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, visits.executiveId))
    .where(eq(visits.code, code));
  const visit = rows[0];
  if (!visit) return null;

  const [owned] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(ownsLead(buyer))
    .then((ls) => ls.filter((l) => l.id === visit.leadId));
  if (!owned) return null;

  const visitReminders = await db
    .select({ kind: reminders.kind, sendAt: reminders.sendAt, status: reminders.status })
    .from(reminders)
    .where(eq(reminders.visitId, visit.id))
    .orderBy(asc(reminders.sendAt));
  return { ...visit, reminders: visitReminders };
}

export async function buyerOptedOut(buyer: Buyer) {
  const rows = await db.select({ optedOutAt: leads.optedOutAt }).from(leads).where(ownsLead(buyer));
  return rows.length > 0 && rows.every((r) => r.optedOutAt !== null);
}
