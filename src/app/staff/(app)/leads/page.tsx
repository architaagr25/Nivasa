import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, Copy, MessageCircleOff, PhoneCall } from "lucide-react";
import { ScoreDot, SourceBadge, StatusBadge } from "@/components/staff/badges";
import { AutoRefresh, LeadFilters } from "@/components/staff/lead-filters";
import { requireStaff } from "@/lib/session";
import { ago, formatDuration, lakh } from "@/lib/staff-format";
import { cn } from "@/lib/utils";
import { leadCounts, listLeads, type LeadFilters as Filters } from "@/server/staff/leads";
import { SOURCE_LABEL, STATUS_LABEL } from "@/server/staff/labels";
import { listProjects } from "@/server/projects/queries";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage(props: PageProps<"/staff/leads">) {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <Suspense fallback={<ListSkeleton />}>
        <Leads {...props} />
      </Suspense>
    </div>
  );
}

function pick<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

async function Leads({ searchParams }: PageProps<"/staff/leads">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const filters: Filters = {
    q: typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined,
    source: pick(sp.source, Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[]),
    status: pick(sp.status, Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]),
    score: pick(sp.score, ["hot", "warm", "cold"] as const),
    view: pick(sp.view, ["mine", "unassigned", "all", "duplicates", "unreached"] as const),
    project: typeof sp.project === "string" ? sp.project.slice(0, 40) : undefined,
    page: Number(sp.page) || 1,
  };
  const [result, counts, projects] = await Promise.all([
    listLeads(viewer, filters),
    leadCounts(viewer),
    listProjects(),
  ]);
  const head = viewer.role === "sales_head";
  const views = [
    { key: "all", label: head ? "All leads" : "My queue", count: counts.all },
    { key: "mine", label: "Mine", count: counts.mine },
    { key: "unassigned", label: "Unassigned", count: counts.unassigned },
    { key: "duplicates", label: "Possible duplicates", count: counts.duplicates },
    { key: "unreached", label: "Not reached in 48 h" },
  ];
  const pageHref = (n: number) => {
    const next = new URLSearchParams(
      Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][],
    );
    next.set("page", String(n));
    return `/staff/leads?${next}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-light">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {counts.newToday} new in the last 24 hours · {counts.hot} hot
            {!head && " · you see your own leads and the unassigned queue"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <AutoRefresh />
          <Link
            href="/staff/leads/new"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/85"
          >
            <PhoneCall className="size-4" aria-hidden /> Log a call
          </Link>
        </div>
      </div>

      <LeadFilters views={views} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />

      {result.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="font-heading text-xl">No leads match</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try clearing a filter or searching by mobile number.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Wants</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">First reply</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 text-right font-medium">Came in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.rows.map((l) => (
                  <tr key={l.id} className="group relative transition-colors hover:bg-secondary/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/staff/leads/${l.code}`}
                        className="font-medium after:absolute after:inset-0"
                      >
                        {l.name ?? "Unnamed website visitor"}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-mono whitespace-nowrap">{l.code}</span>
                        {l.phone && <span className="tabular whitespace-nowrap">{l.phone}</span>}
                        {l.duplicate && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-ochre-soft px-1.5 text-foreground">
                            <Copy className="size-3" aria-hidden /> Possible duplicate
                          </span>
                        )}
                        {l.optedOut && (
                          <MessageCircleOff
                            className="size-3.5"
                            aria-label="Opted out of messages"
                          />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={l.source} />
                      {l.touches > 1 && (
                        <span className="block text-xs text-muted-foreground">
                          +{l.touches - 1} more
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[
                        l.projectName,
                        l.wantsBhk?.replace("BHK", " BHK"),
                        l.budgetMaxInr && `≤ ${lakh(l.budgetMaxInr)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <ScoreDot score={l.score} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={l.status} />
                    </td>
                    <td
                      className={cn(
                        "tabular px-4 py-3",
                        (l.responseSeconds === null || l.responseSeconds > 300) &&
                          "text-destructive",
                      )}
                    >
                      {formatDuration(l.responseSeconds)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {l.ownerName ?? <span className="text-ochre">Unassigned</span>}
                    </td>
                    <td className="tabular px-4 py-3 text-right text-muted-foreground">
                      {ago(l.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone and tablet cards */}
          <ul className="space-y-3 lg:hidden">
            {result.rows.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/staff/leads/${l.code}`}
                  className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.name ?? "Unnamed website visitor"}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono whitespace-nowrap">{l.code}</span> ·{" "}
                        {ago(l.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={l.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                    <SourceBadge source={l.source} />
                    <ScoreDot score={l.score} />
                    <span
                      className={cn(
                        "tabular",
                        (l.responseSeconds === null || l.responseSeconds > 300) &&
                          "text-destructive",
                      )}
                    >
                      Reply: {formatDuration(l.responseSeconds)}
                    </span>
                    {l.duplicate && (
                      <span className="rounded-full bg-ochre-soft px-1.5">Possible duplicate</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {[l.projectName, l.wantsBhk, l.ownerName ?? "Unassigned"]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <nav className="flex items-center justify-between text-sm" aria-label="Pages">
            <p className="tabular text-muted-foreground">
              {(result.page - 1) * 40 + 1}–{Math.min(result.page * 40, result.total)} of{" "}
              {result.total.toLocaleString("en-IN")}
            </p>
            <div className="flex gap-2">
              {result.page > 1 ? (
                <Link
                  href={pageHref(result.page - 1)}
                  className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border bg-card px-3 hover:bg-secondary"
                >
                  <ChevronLeft className="size-4" aria-hidden /> Newer
                </Link>
              ) : null}
              {result.page < result.pages ? (
                <Link
                  href={pageHref(result.page + 1)}
                  className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border bg-card px-3 hover:bg-secondary"
                >
                  Older <ChevronRight className="size-4" aria-hidden />
                </Link>
              ) : null}
            </div>
          </nav>
        </>
      )}
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-9 w-40 animate-pulse rounded bg-muted" />
      <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
