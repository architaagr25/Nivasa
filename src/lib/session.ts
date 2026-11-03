import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { staffProfiles } from "@/db/schema";
import { auth, type Role } from "@/lib/auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export type StaffViewer = {
  id: string;
  name: string;
  email: string;
  role: "sales_exec" | "sales_head";
  projectIds: string[];
};

/**
 * Server-side guard for every staff page. Hiding a link is never the access control; this is.
 * Buyers and signed-out visitors are sent to the staff sign-in.
 */
export async function requireStaff(...roles: StaffViewer["role"][]): Promise<StaffViewer> {
  const session = await getSession();
  const role = session?.user.role as Role | undefined;
  if (!session || (role !== "sales_exec" && role !== "sales_head")) redirect("/staff/sign-in");
  if (roles.length && !roles.includes(role)) redirect("/staff/leads?denied=1");
  const [profile] = await db
    .select({ projectIds: staffProfiles.projectIds, active: staffProfiles.active })
    .from(staffProfiles)
    .where(eq(staffProfiles.userId, session.user.id));
  if (profile && !profile.active) redirect("/staff/sign-in?inactive=1");
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role,
    projectIds: profile?.projectIds ?? [],
  };
}

/** For server actions: the same check, returning null instead of redirecting. */
export async function staffOrNull(...roles: StaffViewer["role"][]) {
  const session = await getSession();
  const role = session?.user.role as Role | undefined;
  if (!session || (role !== "sales_exec" && role !== "sales_head")) return null;
  if (roles.length && !roles.includes(role)) return null;
  return { id: session.user.id, name: session.user.name, role };
}
