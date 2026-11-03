import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDownRight, ArrowUpRight, CircleAlert, CircleCheck, Minus } from "lucide-react";
import { CostPerVisitChart, WeeklyResponseChart } from "@/components/staff/dashboard-charts";
import { SourceBadge } from "@/components/staff/badges";
import { requireStaff } from "@/lib/session";
import { formatDuration } from "@/lib/staff-format";
import { cn } from "@/lib/utils";
import { dashboard, weeklyResponse, type SourceRow, type Totals } from "@/server/staff/dashboard";
import { SOURCE_LABEL } from "@/server/staff/labels";

export const metadata: Metadata = { title: "Dashboard" };

const PERIODS = [7, 30, 60] as const;

export default function DashboardPage(props: PageProps<"/staff/dashboard">) {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard {...props} />
      </Suspense>
    </div>
  );
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

async function Dashboard({ searchParams }: PageProps<"/staff/dashboard">) {
  await requireStaff();
  const sp = await searchParams;
  const days = PERIODS.find((p) => String(p) === sp.days) ?? 30;
  const project = sp.project === "project-1" || sp.project === "project-2" ? sp.project : null;

  const now = new Date();
  const from = new Date(now.getTime() - days * 86_400_000);
  const prevFrom = new Date(from.getTime() - days * 86_400_000);
  const [current, previous, weeks] = await Promise.all([
    dashboard(from, now, project),
    dashboard(prevFrom, from, project),
    weeklyResponse(9, project),
  ]);
  const t = current.totals;
  const p = previous.totals;

  const href = (next: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { days: String(days), project, ...next };
    for (const [k, v] of Object.entries(merged))
      if (v && !(k === "days" && v === "30")) q.set(k, v);
    return `/staff/dashboard${q.size ? `?${q}` : ""}`;
  };
  const chip = (active: boolean) =>
    cn(
      "min-h-9 rounded-full border px-3.5 py-1.5 text-sm",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card hover:border-foreground/40",
    );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Leads that came in during the last {days} days, compared with the {days} days before.
          </p>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Filters">
          {PERIODS.map((d) => (
            <Link
              key={d}
              href={href({ days: String(d) })}
              className={chip(d === days)}
              aria-current={d === days ? "page" : undefined}
            >
              {d} days
            </Link>
          ))}
          <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
          {[null, "project-1", "project-2"].map((pr) => (
            <Link
              key={pr ?? "both"}
              href={href({ project: pr })}
              className={chip(project === pr)}
              aria-current={project === pr ? "page" : undefined}
            >
              {pr ? pr.replace("project-", "Project ") : "Both projects"}
            </Link>
          ))}
        </nav>
      </div>

      <section
        aria-label="Against the targets"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <Tile
          label="Median first response"
          value={formatDuration(t.medianResponseSeconds)}
          target="Target: under 5 min"
          met={t.medianResponseSeconds !== null && t.medianResponseSeconds < 300}
          change={compare(t.medianResponseSeconds, p.medianResponseSeconds, "lower", (v) =>
            formatDuration(v),
          )}
        />
        <Tile
          label="Not reached in 48 hours"
          value={t.notReached48hPct === null ? "—" : `${t.notReached48hPct}%`}
          target="Target: under 5% (was 35%)"
          met={t.notReached48hPct !== null && t.notReached48hPct < 5}
          change={compare(t.notReached48hPct, p.notReached48hPct, "lower", (v) => `${v}%`)}
        />
        <Tile
          label="Lead-to-visit rate"
          value={`${t.leadToVisitPct}%`}
          target="Target: 8% (was 6%)"
          met={t.leadToVisitPct >= 8}
          change={compare(t.leadToVisitPct, p.leadToVisitPct, "higher", (v) => `${v}%`)}
        />
        <Tile
          label="Show-up rate"
          value={t.showUpPct === null ? "—" : `${t.showUpPct}%`}
          target={`${t.visited} visited · ${t.noShow} missed`}
          change={compare(t.showUpPct, p.showUpPct, "higher", (v) => `${v}%`)}
        />
        <Tile
          label="Cost per completed visit"
          value={t.costPerVisitInr === null ? "—" : inr(t.costPerVisitInr)}
          target={`${inr(t.spendInr)} spend · ${t.leads.toLocaleString("en-IN")} leads`}
          change={compare(t.costPerVisitInr, p.costPerVisitInr, "lower", (v) => inr(v))}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-normal">How fast leads are answered, week by week</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Last 9 weeks · the latest week is still in progress
          </p>
          <WeeklyResponseChart
            weeks={weeks.map((w) => ({
              ...w,
              label: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(
                new Date(`${w.week}T00:00:00+05:30`),
              ),
            }))}
          />
        </section>
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-normal">Cost per completed visit</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Spend in the period ÷ visits that happened
          </p>
          <CostPerVisitChart
            rows={current.bySource.map((r) => ({
              label: SOURCE_LABEL[r.source],
              costPerVisitInr: r.costPerVisitInr,
              visited: r.visited,
            }))}
          />
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <h2 className="px-5 pt-5 text-lg font-normal">By source</h2>
        <p className="px-5 pb-3 text-xs text-muted-foreground">
          Spend is entered per month and spread evenly over the days; it isn&apos;t split by
          project.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-y border-border text-left text-xs text-muted-foreground">
              <tr>
                {[
                  "Source",
                  "Leads",
                  "Median first reply",
                  "Within 5 min",
                  "Not reached 48 h",
                  "Visits booked",
                  "Lead-to-visit",
                  "Show-up",
                  "Spend",
                  "Cost / visit",
                ].map((h, i) => (
                  <th key={h} className={cn("px-4 py-3 font-medium", i > 0 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-border">
              {current.bySource.map((r) => (
                <SourceTableRow key={r.source} r={r} />
              ))}
              <SourceTableRow r={{ ...t, source: null }} />
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SourceTableRow({ r }: { r: SourceRow | (Totals & { source: null }) }) {
  const cell = "px-4 py-3 text-right";
  const off = (bad: boolean) => cn(cell, bad && "text-destructive");
  return (
    <tr className={cn(!r.source && "bg-secondary/50 font-medium")}>
      <td className="px-4 py-3 text-left">
        {r.source ? <SourceBadge source={r.source} /> : "All sources"}
      </td>
      <td className={cell}>{r.leads.toLocaleString("en-IN")}</td>
      <td className={off(r.medianResponseSeconds === null || r.medianResponseSeconds >= 300)}>
        {formatDuration(r.medianResponseSeconds)}
      </td>
      <td className={cell}>{r.within5MinPct}%</td>
      <td className={off(r.notReached48hPct !== null && r.notReached48hPct >= 5)}>
        {r.notReached48hPct === null ? "—" : `${r.notReached48hPct}%`}
      </td>
      <td className={cell}>{r.visitsBooked}</td>
      <td className={cell}>{r.leadToVisitPct}%</td>
      <td className={cell}>{r.showUpPct === null ? "—" : `${r.showUpPct}%`}</td>
      <td className={cell}>{inr(r.spendInr)}</td>
      <td className={cell}>{r.costPerVisitInr === null ? "—" : inr(r.costPerVisitInr)}</td>
    </tr>
  );
}

type Change = { text: string; better: boolean | null; up: boolean } | null;

function compare(
  now: number | null,
  before: number | null,
  good: "higher" | "lower",
  fmt: (v: number) => string,
): Change {
  if (now === null || before === null) return null;
  if (now === before) return { text: "No change", better: null, up: false };
  const better = good === "higher" ? now > before : now < before;
  return { text: `Was ${fmt(before)}`, better, up: now > before };
}

function Tile({
  label,
  value,
  target,
  met,
  change,
}: {
  label: string;
  value: string;
  target: string;
  met?: boolean;
  change: Change;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="tabular font-heading text-3xl font-light">{value}</p>
      <div className="mt-auto space-y-1 text-xs">
        {met !== undefined ? (
          <p
            className={cn(
              "flex items-center gap-1.5",
              met ? "text-accent-foreground" : "text-destructive",
            )}
          >
            {met ? (
              <CircleCheck className="size-3.5" aria-hidden />
            ) : (
              <CircleAlert className="size-3.5" aria-hidden />
            )}
            <span>
              {met ? "On target" : "Off target"} · {target.replace("Target: ", "")}
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground">{target}</p>
        )}
        {change && (
          <p className="flex items-center gap-1 text-muted-foreground">
            {/* The arrow shows which way the number moved; its colour says whether that's good. */}
            {change.better === null ? (
              <Minus className="size-3.5" aria-hidden />
            ) : change.up ? (
              <ArrowUpRight
                className={cn(
                  "size-3.5",
                  change.better ? "text-accent-foreground" : "text-destructive",
                )}
                aria-label={change.better ? "up, better" : "up, worse"}
              />
            ) : (
              <ArrowDownRight
                className={cn(
                  "size-3.5",
                  change.better ? "text-accent-foreground" : "text-destructive",
                )}
                aria-label={change.better ? "down, better" : "down, worse"}
              />
            )}
            {change.text} in the previous period
          </p>
        )}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-9 w-48 animate-pulse rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
