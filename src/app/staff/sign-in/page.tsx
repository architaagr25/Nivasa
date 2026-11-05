import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { staffProfiles, user } from "@/db/schema";
import { StaffSignInForm } from "@/components/staff/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function StaffSignInPage(props: PageProps<"/staff/sign-in">) {
  return (
    <main className="grid min-h-dvh items-start justify-items-center px-5 py-12 sm:items-center">
      <div className="w-full max-w-sm space-y-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to the website
        </Link>
        <div className="space-y-2">
          <p className="font-heading text-3xl">Nivasa</p>
          <p className="text-muted-foreground">Sign in to the sales workspace.</p>
        </div>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <SignIn {...props} />
        </Suspense>
      </div>
    </main>
  );
}

async function SignIn({ searchParams }: PageProps<"/staff/sign-in">) {
  const sp = await searchParams;
  const demo = process.env.DEMO_MODE === "true";
  // Demo builds list the seeded accounts so a reviewer can try each role in one click.
  const accounts = demo
    ? await db
        .select({
          email: user.email,
          name: user.name,
          role: user.role,
          projectIds: staffProfiles.projectIds,
        })
        .from(user)
        .innerJoin(staffProfiles, eq(staffProfiles.userId, user.id))
        .orderBy(asc(user.role), asc(user.name))
    : [];
  return (
    <StaffSignInForm
      next={safeNext(sp.next)}
      notice={sp.inactive ? "This account has been deactivated." : null}
      demo={
        demo
          ? {
              password: "NivasaDemo#2026",
              accounts: accounts
                .filter(
                  (a) =>
                    a.role === "sales_head" ||
                    ["rahul@nivasa.demo", "harsh@nivasa.demo"].includes(a.email),
                )
                .map((a) => ({
                  email: a.email,
                  name: a.name,
                  role:
                    a.role === "sales_head"
                      ? "Sales head"
                      : `Sales executive · ${a.projectIds.map((p) => p.replace("project-", "Project ")).join(", ")}`,
                })),
            }
          : null
      }
    />
  );
}

/** Only ever send people back to a staff page on this site after signing in. */
function safeNext(next: string | string[] | undefined) {
  return typeof next === "string" && /^\/staff\/[\w\-/]*$/.test(next) ? next : null;
}
