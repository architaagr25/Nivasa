import { Suspense } from "react";
import { StaffNav, type NavKey } from "@/components/staff/staff-nav";
import { requireStaff } from "@/lib/session";
import { reviewCounts } from "@/server/staff/review";

// Screens appear in the menu as they exist, so nothing in it leads nowhere.
const NAV: NavKey[] = ["leads", "visits", "dashboard", "review", "admin", "demo"];

export default function StaffAppLayout({ children }: LayoutProps<"/staff">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff();
  const waiting = viewer.role === "sales_head" ? await reviewCounts() : null;
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <StaffNav
        items={NAV}
        viewer={viewer}
        badges={waiting ? { review: waiting.flags + waiting.duplicates } : {}}
      />
      <main className="min-w-0 pb-20 md:pb-0">{children}</main>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]" aria-busy="true">
      <div className="hidden border-r border-border bg-card md:block" />
      <div className="space-y-4 p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
