import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Role } from "@/lib/auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Server-side guard for pages and actions. Hiding a button is never the access control. */
export async function requireRole(...roles: Role[]) {
  const session = await getSession();
  if (!session) redirect("/staff/sign-in");
  if (!roles.includes(session.user.role as Role)) redirect("/forbidden");
  return session;
}

export const STAFF_ROLES: Role[] = ["sales_exec", "sales_head"];
