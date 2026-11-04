"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ChartColumn,
  Flag,
  LogOut,
  MessageSquareText,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export type NavKey = "leads" | "visits" | "dashboard" | "review" | "admin" | "demo";

const ITEMS: Record<
  NavKey,
  { href: string; label: string; short?: string; icon: LucideIcon; headOnly?: boolean }
> = {
  leads: { href: "/staff/leads", label: "Leads", icon: Users },
  visits: { href: "/staff/visits", label: "Visits", icon: CalendarDays },
  dashboard: { href: "/staff/dashboard", label: "Dashboard", icon: ChartColumn },
  review: { href: "/staff/review", label: "Review", icon: Flag, headOnly: true },
  admin: {
    href: "/staff/admin",
    label: "Fact sheet & slots",
    short: "Setup",
    icon: Settings2,
    headOnly: true,
  },
  demo: { href: "/staff/demo", label: "Message outbox", short: "Outbox", icon: MessageSquareText },
};

type Props = {
  items: NavKey[];
  viewer: { name: string; role: "sales_exec" | "sales_head" };
  badges?: Partial<Record<NavKey, number>>;
};

export function StaffNav({ items, viewer, badges = {} }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const visible = items.filter((k) => !ITEMS[k].headOnly || viewer.role === "sales_head");
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/staff/sign-in");
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-card px-4 py-6 md:flex">
        <Link href="/staff/leads" className="px-2 font-heading text-2xl">
          Nivasa
        </Link>
        <p className="mt-0.5 px-2 text-xs text-muted-foreground">Sales workspace</p>
        <nav className="mt-8 flex-1 space-y-1" aria-label="Main">
          {visible.map((k) => {
            const item = ITEMS[k];
            return (
              <Link
                key={k}
                href={item.href}
                aria-current={active(item.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active(item.href)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {badges[k] ? (
                  <span className="tabular rounded-full bg-clay px-1.5 text-[0.7rem] text-white">
                    {badges[k]}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-border px-2 pt-4 text-sm">
          <p className="font-medium">{viewer.name}</p>
          <p className="text-xs text-muted-foreground">
            {viewer.role === "sales_head" ? "Sales head" : "Sales executive"}
          </p>
          <button
            type="button"
            onClick={signOut}
            className="flex min-h-9 items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </aside>

      {/* Phone: top bar and bottom tabs */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur md:hidden">
        <Link href="/staff/leads" className="font-heading text-xl">
          Nivasa
        </Link>
        <button
          type="button"
          onClick={signOut}
          className="flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground"
        >
          <LogOut className="size-4" aria-hidden /> Sign out
        </button>
      </header>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {visible.map((k) => {
          const item = ITEMS[k];
          return (
            <Link
              key={k}
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.68rem]",
                active(item.href) ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-5" aria-hidden />
              <span className="max-w-full truncate px-1">{item.short ?? item.label}</span>
              {badges[k] ? (
                <span
                  className="absolute top-1.5 right-[calc(50%-1.25rem)] size-2 rounded-full bg-clay"
                  aria-hidden
                />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
